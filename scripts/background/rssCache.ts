import { getHermidataWithRss } from "../rss/load"
import { ext } from "../shared/utils/BrowserCompat"
import { dbUpdateImageKey, getAllRawFeeds, getDb, putRawFeed } from "../shared/db/db"
import type { DbCall, DbStore, Filters, Hermidata, RawFeed, RawScrappedFeed, SyncCall } from "../shared/types/index"
import { getToken } from "./auth"
import { updateCurrentBookmarkAndIcon, writeToBookmarks } from "./bookmarks"
import { checkFeedsForUpdates } from "./feeds"
import { writeToSheet } from "./sheets"
import { lastAutoFeedCkeck, lastFeedCkeck, setState } from "./state"
import { HermidataModel } from "../shared/utils/HermidataSelector"
import { getChapterFromTitle, returnHashedFeedId, TrimTitle } from "../shared/utils/StringOutput"
import { pushToSync, removeFromSync } from "../shared/db/sync"

let rssCache: Record<string, Hermidata> | null = null
let rssCachePromise: Promise<Record<string, Hermidata>> | null = null

export function initRssCache() {
    rssCachePromise = getHermidataWithRss().then(result => {
        rssCache = structuredClone(result); // deep copy into cache
        return result;
    });
}

export function handleGetRSS(sendResponse: (r: unknown) => void): true {
    if (rssCache) {
        sendResponse({ status: 'ready', data: rssCache })
    } else {
        rssCachePromise?.then(data => sendResponse({ status: 'ready', data }))
    }
    return true
}

export function handleInvalidateRSS(sendResponse: (r: unknown) => void): true {
    rssCache = null
    initRssCache()
    sendResponse({ status: 'ok' })
    return true
}

export function handleSaveNovel(data: HermidataModel | Hermidata, args: { allowedSendSHeet: boolean, allowedSendBookmark: boolean }, sendResponse: (r: unknown) => void): true {
    try {
        const hermidata = new HermidataModel(data);
        getToken((token: number) => {
            if (args.allowedSendSHeet) writeToSheet(token, hermidata);
            if (args.allowedSendBookmark) writeToBookmarks(hermidata);
        });
        updateCurrentBookmarkAndIcon(hermidata.GetUrl());
        console.log('[Background] SAVE_NOVEL complete');
        sendResponse(true);
    } catch (error) {
        console.error('[Background] SAVE_NOVEL error:', error);
        sendResponse(false);
    }
    return true
}

export function handleReloadRss(): true {
    const now = Date.now()
    if (now - lastFeedCkeck >= 1000 *60 * 2) { // 2min passed
        setState.lastFeedCkeck(now);
        checkFeedsForUpdates();
        ext.runtime.sendMessage({ type: "SYNC_COMPLETED" });
    } else {
        console.log('Skipping - already checked recently')
    }
    return true
}

export function handleGetLastSync(sendResponse: (r: unknown) => void): true {
    // Send the age in minutes (max 2 digits)
    const diffMinutes = lastAutoFeedCkeck
    ? Math.min(99, Math.floor((Date.now() - lastAutoFeedCkeck) / 60000))
    : null;

    sendResponse({ minutesAgo: diffMinutes });
    return true
}

export async function handleSaveRawFeeds(incomingFeeds: RawScrappedFeed[], sendResponse: (r: unknown) => void): Promise<true> {
    const existing = await getAllRawFeeds()
    
    for (const feed of incomingFeeds) {
        const existingFeed = existing[feed.url]
        // Only update if newer or not yet stored
        if (!existingFeed || feed.lastFetched > existingFeed.lastFetched) {
            const enriched = buildFeedItem(feed)
            await putRawFeed(enriched)
        }
    }
    sendResponse({ status: 'ok' })
    return true
}

function buildFeedItem(raw: RawScrappedFeed): RawFeed {
    const url = raw.latestItem.link;
    const rawTitle = raw.latestItem.title;
    const trimmedTitle = TrimTitle.trimTitle(rawTitle, url).title;
    return {
        id: returnHashedFeedId(trimmedTitle, raw.url),
        title: trimmedTitle,
        url,
        domain: raw.domain ?? new URL(url).hostname.replace(/^www\./, ''),
        latestItem: {
            id: returnHashedFeedId(trimmedTitle, url),
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
    } catch (err) {
        sendResponse({ success: false, error: String(err) });
    }
    return true;
}
export async function handleSyncOperation(call: SyncCall, sendResponse: (r: unknown) => void): Promise<true> {
    try {
        switch (call.operation) {
            case 'pushToSync':
                await pushToSync(call.payload.data);
                break;
            case 'removeFromSync':
                await removeFromSync(call.payload.id);
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
        console.error(`[DB] put${store.at(0)?.toUpperCase()}All:`, err);
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
        if (ext.runtime.lastError) return console.error(ext.runtime.lastError.message);
        if (result.lastFilter) ext.storage.local.remove('lastFilter');
    })
    sendResponse({ status: 'ok' });
    return true;
}