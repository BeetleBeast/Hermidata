import { logConsoleError } from "../shared/utils/ErrorMessage";
import { getHermidataWithRss } from "../rss/load"
import { ext } from "../shared/utils/BrowserCompat"
import { dbUpdateImageKey, getAllRawFeeds, getDb, putRawFeed } from "../shared/db/db"
import type { DbCall, DbStore, Filters, Hermidata, RawFeed, RawScrapedItem, RawScrappedFeed, SyncCall } from "../shared/types"
import { getToken } from "./auth"
import { updateCurrentBookmarkAndIcon, writeToBookmarks } from "./bookmarks"
import { writeToSheet } from "./sheets"
import { HermidataModel } from "../shared/utils/HermidataSelector"
import { getAllUnread } from "../shared/utils/Unread"
import { PastHermidata } from "../popup/core/Past"
import { updateUnreadBadge } from "./rssNotify"
import { getChapterFromTitle, generateRssFeedId, TrimTitle } from "../shared/utils/StringOutput"
import { pushToSync, removeFromSync } from "../shared/sync/sync.engine"
import { scheduleAltTitleLookup, storedKeyOf } from "./altTitles"

let rssCache: Record<string, Hermidata> | null = null
let rssCachePromise: Promise<Record<string, Hermidata>> | null = null
type SaveNovelResponse = true | { success: false; errors: string[] }
const pendingNovelSaves = new Map<string, Promise<SaveNovelResponse>>()

export function initRssCache() {
    void rebuildRssCache().then(refreshBadgeFrom);
}

/** Rebuilds the cache from storage; a newer rebuild started meanwhile wins */
export function rebuildRssCache(): Promise<Record<string, Hermidata>> {
    // the popup and the background each keep their own copy of all items: re-read what the popup saved
    PastHermidata.invalidateCache();
    const promise: Promise<Record<string, Hermidata>> = getHermidataWithRss().then(result => {
        if (rssCachePromise === promise) rssCache = structuredClone(result); // deep copy into cache
        return result;
    });
    rssCache = null;
    rssCachePromise = promise;
    return promise;
}

/** The items with RSS as the popup sees them ( stored items merged with the raw feeds ) */
export function getRssData(): Promise<Record<string, Hermidata>> {
    if (rssCache) return Promise.resolve(rssCache);
    return rssCachePromise ?? rebuildRssCache();
}

function refreshBadgeFrom(data: Record<string, Hermidata>): Promise<void> {
    return updateUnreadBadge(getAllUnread(data).length);
}

/** From the popup when it opens: the badge follows what the popup will show */
export function handleRefreshRssBadge(): void {
    void getRssData().then(refreshBadgeFrom).catch(error => logConsoleError('[RSS] badge refresh failed:', error));
}

export function handleGetRSS(sendResponse: (r: unknown) => void): true {
    getRssData()
        .then(data => sendResponse({ status: 'ready', data }))
        .catch(error => sendResponse({ status: 'failed', error: String(error) }));
    return true
}

export function handleInvalidateRSS(sendResponse: (r: unknown) => void): true {
    const rebuilt = rebuildRssCache();
    rebuilt.then(refreshBadgeFrom).catch(error => logConsoleError('[RSS] cache rebuild failed:', error));
    // answer once the new data is there, so a GET_RSS right after sees it
    rebuilt.then(() => sendResponse({ status: 'ok' }), () => sendResponse({ status: 'failed' }));
    return true
}

export function handleSaveNovel(data: Hermidata, args: { allowedSendSHeet: boolean, allowedSendBookmark: boolean }, sendResponse: (r: unknown) => void): true {
    void saveNovelDirect(data, args).then(sendResponse);
    return true;
}

export async function saveNovelDirect(data: Hermidata, args: { allowedSendSHeet: boolean, allowedSendBookmark: boolean }): Promise<SaveNovelResponse> {
    const pendingSave = pendingNovelSaves.get(data.id);
    if (pendingSave) return pendingSave;

    const savePromise = saveNovel(data, args);
    pendingNovelSaves.set(data.id, savePromise);
    try {
        return await savePromise;
    } catch (error) {
        logConsoleError('[Background] Save failed:', error);
        return { success: false, errors: [error instanceof Error ? error.message : String(error)] };
    } finally {
        if (pendingNovelSaves.get(data.id) === savePromise) pendingNovelSaves.delete(data.id);
    }
}

async function saveNovel(data: Hermidata, args: { allowedSendSHeet: boolean, allowedSendBookmark: boolean }): Promise<SaveNovelResponse> {
    const hermidata = new HermidataModel(data);
    const errors: string[] = [];
    
    if (args.allowedSendSHeet) {
        try {
            const token = await getToken();
            await writeToSheet(token, hermidata);
        } catch (err) {
            logConsoleError('[Background] Sheet write failed:', err);
            errors.push(`Sheet sync failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    if (args.allowedSendBookmark) {
        try {
            await writeToBookmarks(hermidata);
        } catch (err) {
            logConsoleError('[Background] Bookmark write failed:', err);
            errors.push(`Bookmark save failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    try {
        await updateCurrentBookmarkAndIcon(hermidata.getBookmark().color, hermidata.GetUrl());
    } catch (err) {
        logConsoleError('[Background] Icon update failed:', err);
    }

    console.log('[Background] SAVE_NOVEL complete', errors.length ? { errors } : '');
    scheduleAltTitleLookup(storedKeyOf(data)); // in the background; does nothing unless the user switched the lookup on
    return errors.length === 0 ? true : { success: false, errors };
}

async function handleSaveRawFeeds(incomingFeeds: RawScrappedFeed[]): Promise<true> {
    const existing = await getAllRawFeeds()
    
    for (const feed of incomingFeeds) {
        const existingFeed = existing[feed.url]
        // Only update if newer or not yet stored
        if (!existingFeed || feed.lastFetched > existingFeed.lastFetched) {
            const enriched = buildFeedItem(feed)
            await putRawFeed(enriched)
        }
    }
    return true
}

export async function handleBuildAndSaveRawFeeds(partials: Partial<RawScrappedFeed>[], sendResponse: (r: unknown) => void): Promise<true> {
    const results = await Promise.allSettled( partials.map(f => buildFullFeed(f)) );

    const feeds: RawScrappedFeed[] = results
        .filter((r): r is PromiseFulfilledResult<RawScrappedFeed> => 
            r.status === 'fulfilled' && r.value !== null
        )
        .map(r => r.value);

    if (feeds.length) {
        console.log(`[Hermidata] Successfully built ${feeds.length} feed(s)`);
        // Save to IndexedDB here
        handleSaveRawFeeds(feeds);
        sendResponse({ status: 'ok' })
    } else sendResponse({ status: 'failed' })
    return true
}

async function buildFullFeed(partial: Partial<RawScrappedFeed>): Promise<RawScrappedFeed | null> {
    if (!partial.url) return null;
    try {
        const [items, lastBuildDate, image] = await fetchAndParseRSS(partial.url);

        if (items.length === 0) {
            console.warn(`[Hermidata] Feed ${partial.url} has no items`);
            return null; // or return a default object
        }

        return {
            title: partial.title ?? "",
            url: partial.url,
            domain: partial.domain ?? new URL(partial.url).hostname.replace(/^www\./, ''),
            latestItem: items[0],
            lastBuildDateStr: lastBuildDate ?? new Date().toISOString(),
            image: image ?? '',
            lastFetched: new Date().toISOString(),
            lastToken: null,
        };
    } catch (err) {
        console.warn(`[Hermidata] Failed to fetch feed ${partial.url}:`, err);
        return null;
    }
}

async function fetchAndParseRSS(feedUrl: string): Promise<[RawScrapedItem[], string | null, string | null]> {
    const response = await fetch(feedUrl);
    if (!response.ok) throw new Error(`Feed fetch failed: ${feedUrl} (${response.status})`);

    const contentType = (response.headers.get('Content-Type') || '').toLowerCase();
    if (contentType.includes('html')) throw new Error(`Not a feed (HTML content-type): ${feedUrl}`);

    const text = await response.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'text/xml');

    if (xml.querySelector('parsererror')) {
        throw new Error(`XML parse error for feed: ${feedUrl}`);
    }

    // Must be a real feed document (RSS / Atom / RDF), not an XHTML page
    const root = xml.documentElement?.localName?.toLowerCase();
    if (!root || !['rss', 'feed', 'rdf'].includes(root)) throw new Error(`Not a feed (root <${root}>): ${feedUrl}`);

    const items: RawScrapedItem[] = [...xml.querySelectorAll('item, entry')].slice(0, 10).map(item => ({
        title: item.querySelector('title')?.textContent?.trim() ?? '',
        link: (
            item.querySelector('link')?.getAttribute('href') ??
            item.querySelector('link')?.textContent ??
            ''
        ).trim(),
        pubDate: new Date(item.querySelector('pubDate, updated, published')?.textContent ?? Date.now()),
        guid: (
            item.querySelector('guid')?.textContent ??
            item.querySelector('id')?.textContent ??
            item.querySelector('link')?.textContent ??
            ''
        )
    }));

    const lastBuildDate = xml.querySelector('lastBuildDate, updated')?.textContent ?? null;
    const image = xml.querySelector('image > url')?.textContent ?? null;

    return [items, lastBuildDate, image];
}

function buildFeedItem(raw: RawScrappedFeed): RawFeed {
    const url = raw.latestItem.link;
    const rawTitle = raw.latestItem.title;
    const trimmedTitle = TrimTitle.trimTitle(rawTitle, url).title;
    return {
        id: generateRssFeedId(trimmedTitle, raw.url),
        title: trimmedTitle,
        url,
        domain: raw.domain ?? new URL(url).hostname.replace(/^www\./, ''),
        latestItem: {
            id: generateRssFeedId(trimmedTitle, url),
            title: trimmedTitle,
            rawTitle: rawTitle,
            link: raw.latestItem.link,
            chapter: getChapterFromTitle(rawTitle, url),
            pubDate: new Date(raw.latestItem.pubDate ?? new Date().toISOString()),
            guid: raw.latestItem.guid,
        },
        image: raw.image ?? null,
        lastFetched: raw.lastFetched,
        lastBuildDate: new Date(raw.lastBuildDateStr),
        lastToken: raw.lastToken,
    };
}

const settingsListeners = new Set<() => void>();
/** Called after a page saved the settings through DB_OPERATION */
export function onSettingsSaved(listener: () => void): void {
    settingsListeners.add(listener);
}

export async function handleDbOperation( store: DbStore, call: DbCall, sendResponse: (r: unknown) => void): Promise<true> {
    try {
        const db = await getDb();
        let result: any;

        switch (call.operation) {
            case 'getAll':
                result = await db.getAll(store);
                break;
            case 'putAll':
                result = await putAll(store, call.payload.data);
                break;
            case 'update':
                result = await db.put(store, call.payload.data);
                break;
            case 'get':
                result = await db.get(store, call.payload.id); 
                break;
            case 'put':
                result = await db.put(store, call.payload.data, call.payload.id);
                break;
            case 'updateImageKey':
                result = await dbUpdateImageKey(call.payload.oldId, call.payload.newId);
                break;
            case 'delete':
                result = await db.delete(store, call.payload.id);
                break;
            case 'clear':
                result = await db.clear(store);
                break;
            default:
                sendResponse({ success: false, error: `Unknown operation: ${call}` });
                break;
        }
        sendResponse({ success: true, result });
        if (store === 'settings' && (call.operation === 'put' || call.operation === 'update')) {
            for (const listener of settingsListeners) listener();
        }
    } catch (err) {
        sendResponse({ success: false, error: String(err) });
    }
    return true;
}
export async function handleSyncOperation(call: SyncCall, sendResponse: (r: unknown) => void): Promise<true> {
    try {
        switch (call.operation) {
            case 'pushToSync':
                pushToSync(call.payload.data);
                break;
            case 'removeFromSync':
                removeFromSync(call.payload.id);
                break;
        }
        sendResponse({ success: true });
    } catch (err) {
        sendResponse({ success: false, error: String(err) });
    }
    return true;
}

async function putAll(store: DbStore, data: Record<string, Hermidata> | RawFeed[]) {
    try {
        const db = await getDb();
        const tx = db.transaction(store, 'readwrite');
        if (store === 'hermidata') {
            await Promise.all([
                ...Object.values(data).map(d => tx.store.put(d)),
                tx.done,
            ]);
        } else {
            const feedData = data as RawFeed[]
            await Promise.all([
                ...feedData.map(d => tx.store.put(d)),
                tx.done,
            ]);
        }
    } catch (err) {
        logConsoleError(`[DB] put${store.at(0)?.toUpperCase()}All:`, err);
    }
}

export async function handleGetAllPossiblePaths(sendResponse: (r: unknown) => void, searchStart?: string): Promise<true> {
    // Immediately start the async work
    const results = await ext.bookmarks.search({ title: searchStart || '' });
    const searchStartID = (results.length > 0) ? results[0].id : null;
    
    let bookmarkTreeNodes;
    if (searchStartID) bookmarkTreeNodes = await ext.bookmarks.getSubTree(searchStartID)
    else bookmarkTreeNodes = await ext.bookmarks.getTree();
    
    const paths = new Set<string>();
    for (const node of bookmarkTreeNodes || []) {
        if (!node.id && !node.title || node.url) continue; // skip if no id/title or if it's a bookmark (has url)
        paths.add(node.title);
        findPaths(node).forEach(path => paths.add(path));
    }
    
    sendResponse({ status: 'ready', data: [...paths] }); // Match your expected response format
    
    return true; // Keep the message channel open
}

function findPaths(node: chrome.bookmarks.BookmarkTreeNode, currentPath = ''): string[] {
    if (!node.id && !node.title || node.url) return [currentPath]; // skip if no id/title or if it's a bookmark (has url)
    const newPath = currentPath ? `${currentPath}/${node.title}` : node.title;
    if (!node.children) return [newPath];
    return node.children.flatMap(child => findPaths(child, newPath));
}
export function handleLocalFilterReset(sendResponse: (r: unknown) => void): true {
    ext.storage.local.get('lastFilter', (result: { lastFilter: Filters }) => {
        if (ext.runtime.lastError) return logConsoleError(ext.runtime.lastError.message);
        if (result.lastFilter) ext.storage.local.remove('lastFilter');
    })
    sendResponse({ status: 'ok' });
    return true;
}