import { getHermidataWithRss } from "../rss/load"
import { ext } from "../shared/BrowserCompat"
import type { Hermidata, InputArrayType } from "../shared/types/type"
import { getToken } from "./auth"
import { updateCurrentBookmarkAndIcon, writeToBookmarks } from "./bookmarks"
import { checkFeedsForUpdates } from "./feeds"
import { writeToSheet } from "./sheets"
import { lastAutoFeedCkeck, lastFeedCkeck, setState } from "./state"

let rssCache: Record<string, Hermidata> | null = null
let rssCachePromise: Promise<Record<string, Hermidata>> | null = null

export function initRssCache() {
    rssCachePromise = getHermidataWithRss().then(result => {
        rssCache = result
        return result
    })
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