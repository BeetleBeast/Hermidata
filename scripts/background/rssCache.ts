import { getHermidataWithRss } from "../rss/load"
import { ext } from "../shared/BrowserCompat"
import { getAllRawFeeds, getDb, putRawFeed } from "../shared/db/db"
import type { Hermidata, InputArrayType, RawFeed } from "../shared/types/index"
import { getToken } from "./auth"
import { updateCurrentBookmarkAndIcon, writeToBookmarks } from "./bookmarks"
import { checkFeedsForUpdates } from "./feeds"
import { writeToSheet } from "./sheets"
import { lastAutoFeedCkeck, lastFeedCkeck, setState } from "./state"

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

export function handleSaveNovel(data: InputArrayType): true {
    getToken((token: number) => {
        writeToSheet(token, data);
        writeToBookmarks(data);
    });
    updateCurrentBookmarkAndIcon(data[3]);
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

export async function handleSaveRawFeeds(incomingFeeds: RawFeed[], sendResponse: (r: unknown) => void): Promise<true> {
    const existing = await getAllRawFeeds()
    
    for (const feed of incomingFeeds) {
        const existingFeed = existing[feed.url]
        // Only update if newer or not yet stored
        if (!existingFeed || feed.lastFetched > existingFeed.lastFetched) {
            await putRawFeed(feed)
        }
    }
    sendResponse({ status: 'ok' })
    return true
}

export async function handleDbOperation( store: 'hermidata' | 'feeds' | 'settings', 
    operation: string, sendResponse: (r: unknown) => void, payload?: { id: string, data: any} ): Promise<true> {
    try {
        const db = await getDb();
        let result: any;

        switch (operation) {
            case 'getAll':  result = await db.getAll(store); break;
            case 'putAll':  result = await putAll(store, payload!.data); break;
            case 'get':     result = await db.get(store, payload!.id); break;
            case 'put':     result = await db.put(store, payload!.data, payload!.id); break;
            case 'delete':  result = await db.delete(store, payload!.id); break;
            case 'clear':   result = await db.clear(store); break;
            default:
                sendResponse({ success: false, error: `Unknown operation: ${operation}` }); break;
        }
        sendResponse({ success: true, result });
    } catch (err) {
        sendResponse({ success: false, error: String(err) });
    }
    return true;
}
async function putAll(store: 'hermidata' | 'feeds' | 'settings', data: Hermidata[] | RawFeed[]) {
    try {
        const db = await getDb();
        const tx = db.transaction(store, 'readwrite');
        await Promise.all([
            ...data.map(d => tx.store.put(d)),
            tx.done,
        ]);
    } catch (err) {
        console.error(`[DB] put${store.at(0)?.toUpperCase()}All:`, err);
    }
}