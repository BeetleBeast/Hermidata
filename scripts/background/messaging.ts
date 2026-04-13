import { ext } from "../shared/BrowserCompat"
import { getSettings } from "../shared/db/Storage"
import { updateCurrentBookmarkAndIcon } from "./bookmarks"
import { checkFeedsForUpdates } from "./feeds"
import { handleDbOperation, handleGetLastSync, handleGetRSS, handleInvalidateRSS, handleReloadRss, handleSaveNovel, handleSaveRawFeeds } from "./rssCache"

export function initMessaging() {
    ext.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        switch (msg.type) {
            case 'SAVE_NOVEL':    return handleSaveNovel(msg.data);
            case 'RELOAD_RSS_SYNC': return handleReloadRss();
            case 'GET_LAST_SYNC': return handleGetLastSync(sendResponse)
            case 'GET_RSS':       return handleGetRSS(sendResponse)
            case 'INVALIDATE_RSS': return handleInvalidateRSS(sendResponse)
            case 'SAVE_RAW_FEEDS': return handleSaveRawFeeds(msg.data, sendResponse);
            case 'DB_OPERATION' : handleDbOperation(msg.store, msg.operation, sendResponse, msg.payload); return true;
        }
        return true
    })
}

export function initInstalled() {
    ext.runtime.onInstalled.addListener(async details => {
        checkFeedsForUpdates();

        const settings = await getSettings();

        if (details.reason === "install") {
            // Open settings on first install to fix bug from V?
            if (!settings) ext.runtime.openOptionsPage();
        } else if (details.reason === "update") {
            const thisVersion = ext.runtime.getManifest().version;
            console.log(`Updated to version ${thisVersion}`);
            // open settings after an update to fix bug from V?
            if (!settings) ext.runtime.openOptionsPage();
        }

        if (settings?.AllowContextMenu) {
            ext.contextMenus.create({
                id: "Hermidata",
                title: "Save to Hermidata",
                contexts: ["link"]
            });
        }
    });
    ext.runtime.onStartup.addListener(() => {
        updateCurrentBookmarkAndIcon()
        checkFeedsForUpdates();
    });
}