import { logConsoleError } from "../shared/utils/ErrorMessage";
import { ext } from "../shared/utils/BrowserCompat";
import type { FeedItem, FeedExtras, RawFeed, Hermidata } from "../shared/types/index";
import { getAllHermidata, getAllRawFeeds, getSettings, setAllHermidata, setAllRawFeeds } from "../shared/db/Storage";
import { resolveRssCheckInterval } from "../shared/constants";
import { backgroundAlarms } from "../shared/sync/syncAlarms";
import { generateRssFeedId, normalizeTag, TrimTitle } from "../shared/utils/StringOutput";
import { applyLatestItem, getAllUnread } from "../shared/utils/Unread";
import { XMLParser } from 'fast-xml-parser';
import { getLatestToken, parseItems, parseFeedExtras } from "./parseXML";
import { getRssData, onSettingsSaved, rebuildRssCache } from "./rssCache";
import { initRssNotificationClicks, notifyNewReleases, updateUnreadBadge } from "./rssNotify";
import { lastAutoFeedCheck, lastFeedCheck, setState } from "./state";

/*
One pass per check:
1. what is unread now ( from the RSS cache, the same data the popup shows )
2. fetch every linked feed once, put a newer latest item on the items that link it
3. rebuild the cache, what is unread now
4. notify about the difference, set the badge to the count
Runs on the `rss-check` alarm ( interval from settings ), on startup, and from the popup's "Manual sync".
*/

export const RSS_CHECK_ALARM = 'hermidata-rss-check';
const LAST_CHECK_KEY = 'rssLastCheck';
const MANUAL_COOLDOWN_MS = 2 * 60 * 1000;

type Meta = {
    etag: string | null;
    lastModified: string | null;
}
type FetchResult =
    | { status: 'unchanged' }
    | { status: 'failed' }
    | { status: 'ok'; text: string; meta: Meta };

let inFlight: Promise<void> | null = null;

/** Call in the first tick: alarm, notification clicks and settings changes */
export function initFeedListeners(): void {
    backgroundAlarms()?.onAlarm.addListener(alarm => {
        if (alarm.name === RSS_CHECK_ALARM) void checkFeedsForUpdates();
    });
    initRssNotificationClicks(() => void rebuildRssCache().then(data => updateUnreadBadge(getAllUnread(data).length)));
    // a new interval or notification type: from the settings page, or synced from another device
    const settingsChanged = () => {
        void ensureRssAlarm();
        void getRssData().then(data => updateUnreadBadge(getAllUnread(data).length));
    };
    onSettingsSaved(settingsChanged);
    ext.storage?.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.Settings) settingsChanged();
    });
}

/** Call once the data is ready */
export function initFeeds(): void {
    void ensureRssAlarm();
    void ext.storage.local.get(LAST_CHECK_KEY).then(stored => {
        const last = Number((stored as Record<string, unknown>)?.[LAST_CHECK_KEY]) || 0;
        if (last) setState.lastAutoFeedCheck(last);
    }).catch(() => {});
}

/** Creates the alarm, or recreates it when the interval changed ( keeps it otherwise, so its period isn't reset ) */
export async function ensureRssAlarm(): Promise<void> {
    const alarms = backgroundAlarms();
    if (!alarms) return;
    try {
        const settings = await getSettings();
        const minutes = resolveRssCheckInterval(settings?.ExtensionBehaviour?.RssCheckIntervalMinutes);
        const existing = await Promise.resolve(alarms.get?.(RSS_CHECK_ALARM)).catch(() => undefined);
        if (existing?.periodInMinutes === minutes) return;
        await alarms.create(RSS_CHECK_ALARM, { periodInMinutes: minutes });
    } catch (error) {
        logConsoleError('[RSS] could not set the check alarm:', error);
    }
}

/** A check while one runs gets that check, so two never run at once */
export function checkFeedsForUpdates(): Promise<void> {
    inFlight ??= runCheck().finally(() => { inFlight = null; });
    return inFlight;
}

/** "Manual sync" in the popup: at most once every 2 minutes */
export function handleReloadRss(): true {
    const now = Date.now();
    if (now - lastFeedCheck < MANUAL_COOLDOWN_MS) {
        console.log('[RSS] Skipping - already checked recently');
        return true;
    }
    setState.lastFeedCheck(now);
    void checkFeedsForUpdates().then(() => ext.runtime.sendMessage({ type: "SYNC_COMPLETED" }).catch(() => {}));
    return true;
}

export function handleGetLastSync(sendResponse: (r: unknown) => void): true {
    // Send the age in minutes (max 2 digits)
    const diffMinutes = lastAutoFeedCheck
        ? Math.min(99, Math.floor((Date.now() - lastAutoFeedCheck) / 60000))
        : null;

    sendResponse({ minutesAgo: diffMinutes });
    return true
}

async function runCheck(): Promise<void> {
    try {
        const before = new Set(getAllUnread(await getRssData()).map(info => info.item.id));

        const changed = await fetchAllFeeds();

        const after = getAllUnread(changed ? await rebuildRssCache() : await getRssData());
        const newlyUnread = after.filter(info => !before.has(info.item.id));

        await notifyNewReleases(newlyUnread);
        await updateUnreadBadge(after.length);

        const now = Date.now();
        setState.lastAutoFeedCheck(now);
        void ext.storage.local.set({ [LAST_CHECK_KEY]: now }).catch(() => {});
    } catch (err) {
        logConsoleError(`[Hermidata] [✕] Failed to check feeds:`, err);
    }
}

/** Fetches every linked feed once. Returns true when a stored item changed. */
async function fetchAllFeeds(): Promise<boolean> {
    const allHermidata = await getAllHermidata();
    const rawFeeds = await getAllRawFeeds();

    // feed url → the items that link it
    const linkedBy = new Map<string, Hermidata[]>();
    for (const item of Object.values(allHermidata)) {
        for (const feed of item.rss ?? []) {
            if (!feed?.url) continue;
            if (!linkedBy.has(feed.url)) linkedBy.set(feed.url, []);
            linkedBy.get(feed.url)!.push(item);
        }
    }
    if (linkedBy.size === 0) return false;

    console.groupCollapsed(`[Hermidata] RSS check - ${linkedBy.size} feeds`);
    const changedItems = new Map<string, Hermidata>();
    const changedRawFeeds: RawFeed[] = [];

    for (const [url, items] of linkedBy) {
        try {
            const saved = rawFeeds[url];
            const result = await fetchFeedText(url, { etag: saved?.etag ?? null, lastModified: saved?.lastModified ?? null });
            if (result.status !== 'ok') continue;
            if (looksLikeHtml(result.text)) {
                console.warn(`[Hermidata] ${url} returned HTML, not a feed. Skipping.`);
                continue;
            }

            const doc = new XMLParser({ ignoreAttributes: false }).parse(result.text);
            const linkedFeed = items[0].rss.find(f => f.url === url);
            const item = parseItems(doc, linkedFeed?.latestItem?.title ?? items[0].title);
            if (!item) continue;

            changedRawFeeds.push(toRawFeed(url, item, result.meta, getLatestToken(doc, result.text), saved, linkedFeed?.domain, linkedFeed?.image));

            const extras = parseFeedExtras(doc);
            for (const hermidata of items) {
                if (applyToItem(hermidata, url, item)) changedItems.set(hermidata.id, hermidata);
                if (applyFeedExtras(hermidata, extras)) changedItems.set(hermidata.id, hermidata);
            }
        } catch (err) {
            logConsoleError(`[Hermidata] [✕] Failed to check feed ${url}:`, err);
        }
    }
    console.groupEnd();

    if (changedRawFeeds.length) await setAllRawFeeds(changedRawFeeds);
    // a cache refresh, not a user edit: not pushed to sync and meta.updated is left alone
    if (changedItems.size) await setAllHermidata([...changedItems.values()]);
    return changedItems.size > 0;
}

/** Puts the fetched item on the item's feed. True when something stored changed. */
function applyToItem(hermidata: Hermidata, url: string, item: FeedItem): boolean {
    const feed = hermidata.rss.find(f => f.url === url);
    if (!feed) return false;
    const hadSeen = !!feed.seen;
    const isNewer = applyLatestItem(feed, item);
    feed.lastFetched = new Date().toISOString();
    if (isNewer) {
        console.log(`[Hermidata] New release for ${hermidata.title}: ${item.title}`);
        if (Number.isFinite(item.chapter) && item.chapter > (hermidata.chapter.latest || 0)) hermidata.chapter.latest = item.chapter;
    }
    return isNewer || !hadSeen;
}

function toRawFeed(url: string, item: FeedItem, meta: Meta, token: string | null, saved: RawFeed | undefined, domain?: string, image?: string | null): RawFeed {
    return {
        id: saved?.id ?? generateRssFeedId(item.title, url),
        title: saved?.title ?? TrimTitle.trimTitle(item.title, url).title,
        url,
        domain: saved?.domain ?? domain ?? new URL(url).hostname.replace(/^www\./, ''),
        lastFetched: new Date().toISOString(),
        lastBuildDate: meta.lastModified ? new Date(meta.lastModified) : (saved?.lastBuildDate ?? new Date()),
        image: saved?.image || image || "",
        latestItem: item,
        lastToken: token,
        etag: meta.etag,
        lastModified: meta.lastModified,
    };
}

/** Fill gaps in the Hermidata meta from feed info; never overwrites what the user already set. True when it changed. */
function applyFeedExtras(hermidata: Hermidata, extras?: FeedExtras): boolean {
    if (!extras) return false;
    const meta = hermidata.meta;
    let changed = false;
    if (extras.author && !meta.author) {
        meta.author = extras.author;
        changed = true;
    }
    if (extras.categories?.length) {
        const known = new Set(meta.tags.map(t => t.toLowerCase()));
        for (const category of extras.categories) {
            const tag = normalizeTag(category);
            if (tag && !known.has(tag.toLowerCase())) {
                meta.tags.push(tag);
                known.add(tag.toLowerCase());
                changed = true;
            }
        }
    }
    const hasRealImage = meta.image.kind === 'stored' || (meta.image.url && !meta.image.url.endsWith('icon48.png'));
    if (extras.image && !hasRealImage) {
        meta.image = { kind: 'url', url: extras.image };
        changed = true;
    }
    return changed;
}

export function getCurrentDate() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${day}/${month}/${year}`;
}

// ==== fetch helpers ====

async function fetchWithRetry(url: string, headers: HeadersInit = {}, retries = 3): Promise<Response | null> {
    for (let i = 0; i < retries; i++) {
        const res = await fetch(url, { headers });
        if (res.status === 429) {
            const wait = parseInt(res.headers.get("Retry-After") ?? "60") * 1000;
            console.warn(`[Hermidata] 429 on ${url}, waiting ${wait}ms`);
            await new Promise(r => setTimeout(r, wait));
            continue;
        }
        return res;
    }
    return null;
}

function looksLikeHtml(text: string): boolean {
    return /^\s*(<!doctype\s+html|<html[\s>])/i.test(text);
}

async function fetchFeedText(url: string, savedMeta: Meta): Promise<FetchResult> {
    const headers: Record<string, string> = {};
    if (savedMeta.etag) headers["If-None-Match"] = savedMeta.etag;
    else if (savedMeta.lastModified) headers["If-Modified-Since"] = savedMeta.lastModified;

    const response = await fetchWithRetry(url, headers, 3);
    if (!response) return { status: 'failed' };
    if (response.status === 304) return { status: 'unchanged' };
    if (!response.ok) {
        console.warn(`[Hermidata] Feed GET failed: ${url} (${response.status})`);
        return { status: 'failed' };
    }
    return {
        status: 'ok',
        text: await response.text(),
        meta: {
            etag: response.headers.get("etag"),
            lastModified: response.headers.get("last-modified"),
        },
    };
}
