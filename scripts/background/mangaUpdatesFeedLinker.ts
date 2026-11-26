import { getAllHermidata, getSettings, setAllRawFeeds } from "../shared/db/Storage";
import { backgroundAlarms } from "../shared/sync/syncAlarms";
import { ext } from "../shared/utils/BrowserCompat";
import { logConsoleError } from "../shared/utils/ErrorMessage";
import { getAllUnread } from "../shared/utils/Unread";
import { fetchMangaUpdatesCover, LookupError, LookupTimeoutError } from "../shared/lookup/sources";
import { hasRealImage } from "../shared/utils/ImageSource";
import {
    findMangaUpdatesSeriesId, isMangaUpdatesFeedsEnabled, mangaUpdatesFeedUrl, MANGAUPDATES_BATCH_SIZE, MANGAUPDATES_DOMAIN,
    MANGAUPDATES_FAILED_WAIT_MS, MANGAUPDATES_NO_MATCH_WAIT_MS, MANGAUPDATES_PROGRESS_KEY, MANGAUPDATES_RETRY_KEY, MANGAUPDATES_TIMEOUT_WAIT_MS, scanForMangaUpdatesFeeds,
} from "../shared/lookup/mangaUpdatesFeeds";
import { estimateRemainingMs, formatDuration, MAX_THROTTLE_STREAK, nextSlowdown, throttlePauseMs } from "../shared/lookup/mangaUpdatesPace";
import { linkRSSFeed } from "../rss/load";
import type { FeedFetchResult, MangaUpdatesCoverResult, MangaUpdatesFeedCandidate, MangaUpdatesFeedProgress, MangaUpdatesLinkLog, MangaUpdatesLinkOutcome, RawFeed } from "../shared/types/index";
import { fetchFeedText } from "./feedFetch";
import { withFeedLock } from "./feedLock";
import { getLatestToken, parseChannelInfo, parseFeedXml, parseItems } from "./parseXML";
import { toRawFeed } from "./rawFeed";
import { rebuildRssCache } from "./rssCache";
import { updateUnreadBadge } from "./rssNotify";

/*
Links a MangaUpdates release feed to the items the alt-title lookup matched ( setting, off by default ).
A sub-option of the lookup: it runs only while the lookup is on too. Items matched on AniList are searched on
MangaUpdates by title first.
The feed's current release counts as seen, so linking never notifies.

Paced like the alt-title backfill: while items are left, an alarm fires once a minute and each tick
links one batch of MANGAUPDATES_BATCH_SIZE. The alarm is created when there is work ( at startup, after a
feed check, when the setting changes ) and removed when there is none, or when MangaUpdates does not answer.
Every link is stored right away, so a stopped background worker loses nothing.

A title without an image of its own also gets its MangaUpdates cover ( one more request ); a title with an image keeps it.

The progress also carries a countdown ( etaAt ) that follows what really happens ( mangaUpdatesPace.ts ):
a slow batch or a 429 makes it grow. A 429 pauses the clock for what MangaUpdates asked ( at most 10 minutes,
longer for each one in a row ); after 5 in a row the clock stops and the next feed check tries again.
*/

export const MANGAUPDATES_ALARM = 'hermidata-mangaupdates-feeds';

let inFlight: Promise<boolean> | null = null;

/** Call in the first tick: subscribes to the shared alarm listener */
export function initMangaUpdatesFeedAlarm(): void {
    backgroundAlarms()?.onAlarm.addListener(alarm => {
        if (alarm.name === MANGAUPDATES_ALARM) {
            void runMangaUpdatesFeedBatch().then(more => { if (!more) clearAlarm(); });
        }
    });
}

/**
 * Starts the minute clock when items are left, stops it when none are: one batch now, the rest follow.
 * Call it when something may have changed: startup ( Firefox keeps no alarms over a restart ),
 * the setting, and after every feed check ( newly matched titles, ended waits ).
 */
export async function kickMangaUpdatesFeeds(): Promise<void> {
    const more = await runMangaUpdatesFeedBatch();
    if (more) await ensureAlarm();
    else clearAlarm();
}

async function ensureAlarm(): Promise<void> {
    const alarms = backgroundAlarms();
    if (!alarms) return;
    try {
        const existing = await Promise.resolve(alarms.get?.(MANGAUPDATES_ALARM)).catch(() => undefined);
        if (!existing) await alarms.create(MANGAUPDATES_ALARM, { periodInMinutes: 1 });
    } catch (error) {
        logConsoleError('[Hermidata] could not set the MangaUpdates feed alarm:', error);
    }
}

function clearAlarm(): void {
    backgroundAlarms()?.clear(MANGAUPDATES_ALARM);
}

/**
 * One batch. True when more items are left for the next one.
 * A call while a batch runs gets that batch, so two never run at once.
 */
export function runMangaUpdatesFeedBatch(): Promise<boolean> {
    inFlight ??= withFeedLock(runBatch).catch(error => {
        logConsoleError('[Hermidata] MangaUpdates feed batch failed:', error);
        return false;
    }).finally(() => { inFlight = null; });
    return inFlight;
}

async function runBatch(): Promise<boolean> {
    const settings = await getSettings();
    if (!isMangaUpdatesFeedsEnabled(settings)) {
        console.log('[Hermidata] MangaUpdates feeds: off ( needs this setting and "Look up alt titles online" ), nothing linked');
        await ext.storage.local.remove(MANGAUPDATES_PROGRESS_KEY).catch(() => {}); // hides the progress bar
        return false;
    }

    const startedAt = Date.now();
    const previous = await readProgress();
    // MangaUpdates is throttling or slow: the ticks until then do nothing, a later one goes on
    if (previous?.pausedUntil && previous.pausedUntil > startedAt) return true;

    const notLinked = settings?.ExtensionBehaviour?.AutoSubscribe?.HermidataNotLinkedToRSS ?? {};
    const retryAfter = await getRetryAfter();
    const scan = scanForMangaUpdatesFeeds(Object.values(await getAllHermidata()), notLinked, retryAfter);
    const batch = scan.candidates.slice(0, MANGAUPDATES_BATCH_SIZE);
    const total = scan.linked + scan.candidates.length + scan.waiting;

    const counts = `${scan.linked} have the feed, ${scan.unsubscribed} unsubscribed, ${scan.notMatched} not matched by the alt-title lookup, ${scan.waiting} waiting to be tried again ( no MangaUpdates match, or a feed that would not link )`;
    if (!batch.length) {
        console.log(`[Hermidata] MangaUpdates feeds: nothing to link. ${counts}`);
        await storeProgress({ ...idleProgress, total, done: scan.linked, waiting: scan.waiting }, retryAfter);
        return false;
    }

    const rawFeeds: RawFeed[] = [];
    const results: MangaUpdatesLinkLog[] = [];
    let skipped = 0;
    let unavailable: string | null = null;
    let throttled: Extract<MangaUpdatesLinkOutcome, { kind: 'throttled' }> | null = null;
    for (const candidate of batch) {
        const outcome = await linkOne(candidate, retryAfter);
        if (outcome.kind === 'linked') rawFeeds.push(outcome.rawFeed);
        if (outcome.kind === 'skipped' || (outcome.kind === 'throttled' && outcome.itemWaits)) skipped++;
        results.push({
            title: candidate.item.title,
            result: outcome.kind === 'linked' ? 'linked' : `not linked: ${outcome.reason}`,
            latest: outcome.kind === 'linked' ? outcome.rawFeed.latestItem.rawTitle : '',
            cover: outcome.kind === 'linked' ? outcome.cover : '',
            url: outcome.kind === 'linked' ? outcome.rawFeed.url : '',
        });
        // MangaUpdates does not answer, or wants us to slow down: asking again right away only makes it worse
        if (outcome.kind === 'unavailable') {
            unavailable = outcome.reason;
            break;
        }
        if (outcome.kind === 'throttled') {
            throttled = outcome;
            break;
        }
    }
    if (rawFeeds.length) {
        await setAllRawFeeds(rawFeeds);
        // the popup and the badge read the background's cache: it has to see the new feeds
        await rebuildRssCache().then(data => updateUnreadBadge(getAllUnread(data).length));
    }

    // how the pace went: 429s in a row, how much slower than planned, how long to pause
    const batchMs = Date.now() - startedAt;
    const streak = throttled ? (previous?.throttleStreak ?? 0) + 1 : 0;
    if (throttled && streak > MAX_THROTTLE_STREAK) unavailable = `${throttled.reason} ( ${streak} times in a row )`;
    const slowdown = nextSlowdown(previous?.slowdown ?? 1, !!throttled, batchMs);
    const pauseMs = throttled && !unavailable ? throttlePauseMs(throttled.retryAfterMs, streak) : 0;

    const left = scan.candidates.length - results.length;
    const more = left > 0 && !unavailable;
    const estimate = more ? estimateRemainingMs({ remaining: left, batchSize: MANGAUPDATES_BATCH_SIZE, lastBatchMs: batchMs, slowdown, pauseMs }) : null;
    const finishedAt = Date.now();
    await storeProgress({
        running: more,
        total,
        done: scan.linked + rawFeeds.length,
        waiting: scan.waiting + skipped,
        unavailable: !!unavailable,
        etaAt: estimate ? finishedAt + estimate.ms : null,
        etaCapped: estimate?.capped ?? false,
        slowdown,
        pausedUntil: pauseMs ? finishedAt + pauseMs : null,
        throttleStreak: streak,
    }, retryAfter);

    console.groupCollapsed(`[Hermidata] MangaUpdates feeds - linked ${rawFeeds.length} of ${results.length}${more ? ` ( ${left} more, a batch every minute )` : ''}`);
    console.log(`Left out: ${counts}`);
    if (throttled && !unavailable) console.warn(`MangaUpdates is throttling or slow ( ${streak} in a row ), continuing in ${formatDuration(pauseMs)}: ${throttled.reason}`);
    if (unavailable) console.warn(`MangaUpdates did not answer, the feed check retries in the next hour: ${unavailable}`);
    console.table(results);
    console.groupEnd();
    return more;
}

/** Nothing is running: no countdown, no pause, the pace back to normal */
const idleProgress: Omit<MangaUpdatesFeedProgress, 'total' | 'done' | 'waiting'> = {
    running: false, unavailable: false, etaAt: null, etaCapped: false, slowdown: 1, pausedUntil: null, throttleStreak: 0,
};

async function readProgress(): Promise<MangaUpdatesFeedProgress | undefined> {
    const stored = await ext.storage.local.get(MANGAUPDATES_PROGRESS_KEY).catch(() => ({}));
    return (stored as Record<string, MangaUpdatesFeedProgress | undefined>)?.[MANGAUPDATES_PROGRESS_KEY];
}

/** The waits and the progress for the settings page, in one write */
async function storeProgress(progress: MangaUpdatesFeedProgress, retryAfter: Record<string, string>): Promise<void> {
    await ext.storage.local.set({ [MANGAUPDATES_RETRY_KEY]: retryAfter, [MANGAUPDATES_PROGRESS_KEY]: progress }).catch(() => {});
}

async function getRetryAfter(): Promise<Record<string, string>> {
    const stored = await ext.storage.local.get(MANGAUPDATES_RETRY_KEY).catch(() => ({}));
    const retryAfter = (stored as Record<string, Record<string, string> | undefined>)?.[MANGAUPDATES_RETRY_KEY] ?? {};
    const now = Date.now();
    // only what is still waiting is kept, so the record doesn't grow for ever
    return Object.fromEntries(Object.entries(retryAfter).filter(([, until]) => Date.parse(until) > now));
}

/**
 * What a failed MangaUpdates request means for the whole batch; null when only this item is affected.
 * A timeout puts the title on a wait too, so one that always times out doesn't hold up the rest.
 */
function batchFailure(err: unknown, what: string, itemId: string, retryAfter: Record<string, string>): MangaUpdatesLinkOutcome | null {
    const reason = `${what} failed: ${err instanceof Error ? err.message : String(err)}`;
    if (err instanceof LookupTimeoutError) {
        // slow, not down: the clock pauses and tries again; this title waits an hour, so the ones behind it get their turn
        retryAfter[itemId] = new Date(Date.now() + MANGAUPDATES_TIMEOUT_WAIT_MS).toISOString();
        return { kind: 'throttled', reason, itemWaits: true };
    }
    const status = err instanceof LookupError ? err.status : undefined;
    if (status === 429) return { kind: 'throttled', reason, retryAfterMs: err instanceof LookupError ? err.retryAfterMs : undefined };
    return isUnavailable(status) ? { kind: 'unavailable', reason } : null;
}

/**
 * Fills in the title's cover from its MangaUpdates series, when it has no image of its own.
 * Returns what became of it, or the outcome that ends the batch ( MangaUpdates throttling or not answering ).
 * A cover that can't be had for another reason ( the series has none, a bad answer ) only leaves this title without one.
 */
async function findCover(item: MangaUpdatesFeedCandidate['item'], seriesId: string, retryAfter: Record<string, string>): Promise<{ cover: MangaUpdatesCoverResult; coverUrl?: string } | MangaUpdatesLinkOutcome> {
    if (hasRealImage(item.meta.image)) return { cover: 'kept' };
    try {
        const coverUrl = await fetchMangaUpdatesCover(seriesId);
        return coverUrl ? { cover: 'set', coverUrl } : { cover: 'none' };
    } catch (err) {
        // only an answer from the server ( a status ), or a timeout, says something about MangaUpdates itself; a body that can't be read does not
        const failure = err instanceof LookupError && (err instanceof LookupTimeoutError || err.status !== undefined)
            ? batchFailure(err, 'fetching the cover', item.id, retryAfter)
            : null;
        if (failure) return failure;
        console.warn(`[Hermidata] No MangaUpdates cover for ${item.title}:`, err instanceof Error ? err.message : err);
        return { cover: 'none' };
    }
}

/**
 * Links one item's MangaUpdates feed, searching its series first when only AniList matched it.
 * An item that fails is noted in `retryAfter`, so the next batches go on with the items behind it.
 */
async function linkOne({ item, seriesId }: MangaUpdatesFeedCandidate, retryAfter: Record<string, string>): Promise<MangaUpdatesLinkOutcome> {
    const skip = (reason: string, waitMs: number = MANGAUPDATES_FAILED_WAIT_MS): MangaUpdatesLinkOutcome => {
        retryAfter[item.id] = new Date(Date.now() + waitMs).toISOString();
        return { kind: 'skipped', reason };
    };

    let id: string | null = seriesId;
    try {
        id ??= await findMangaUpdatesSeriesId(item);
    } catch (err) {
        return batchFailure(err, 'searching MangaUpdates', item.id, retryAfter)
            ?? skip(`searching MangaUpdates failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!id) return skip('no single close match when searching MangaUpdates ( tries again in 30 days )', MANGAUPDATES_NO_MATCH_WAIT_MS);

    // before the feed is linked: if MangaUpdates throttles here, the title is simply tried again later
    const found = await findCover(item, id, retryAfter);
    if ('kind' in found) return found;

    const url = mangaUpdatesFeedUrl(id);
    let result: FeedFetchResult;
    try {
        // a 429 is not waited out here: the batch ends and the clock pauses for what it asked
        result = await fetchFeedText(url, { etag: null, lastModified: null }, { waitOnRateLimit: false });
    } catch (err) { // fetch itself threw: offline, DNS, a blocked connection
        return { kind: 'unavailable', reason: `no answer from MangaUpdates: ${err instanceof Error ? err.message : String(err)}` };
    }
    try {
        if (result.status === 'failed') {
            const reason = `the feed request failed ( ${result.httpStatus ? `HTTP ${result.httpStatus}` : 'no answer'} ) ${url}`;
            if (result.httpStatus === 429) return { kind: 'throttled', reason, retryAfterMs: result.retryAfterMs };
            return isUnavailable(result.httpStatus) ? { kind: 'unavailable', reason } : skip(reason);
        }
        if (result.status !== 'ok') return skip(`the feed did not answer ${url}`);
        const doc = parseFeedXml(result.text);
        if (!doc) return skip(`the answer is not a feed ${url}`);
        const latest = parseItems(doc, item.title);
        if (!latest) return skip(`the feed has no releases yet ${url}`);

        const rawFeed = toRawFeed(url, latest, result.meta, getLatestToken(doc, result.text), undefined, MANGAUPDATES_DOMAIN, parseChannelInfo(doc).image || null);
        rawFeed.title = item.title; // the feed title is "<series> - Releases on MangaUpdates"
        await linkRSSFeed(item.title, item.novelType, url, rawFeed, item.id, found.coverUrl);
        delete retryAfter[item.id];
        return { kind: 'linked', rawFeed, cover: found.cover };
    } catch (err) {
        logConsoleError(`[Hermidata] [✕] Could not link the MangaUpdates feed of ${item.title}:`, err);
        return skip(err instanceof Error ? err.message : String(err));
    }
}

/** MangaUpdates itself is the problem, not this item: no answer at all, forbidden, or a server error ( a 429 pauses instead ) */
function isUnavailable(httpStatus: number | undefined): boolean {
    return httpStatus === undefined || httpStatus === 403 || httpStatus >= 500;
}
