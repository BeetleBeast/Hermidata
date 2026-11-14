import { ext } from "../shared/utils/BrowserCompat"
import { getSettings } from "../shared/db/Storage"
import { updateCurrentBookmarkAndIcon } from "./bookmarks"
import { checkFeedsForUpdates } from "./feeds"
import { handleBuildAndSaveRawFeeds, handleDbOperation, handleGetAllPossiblePaths, handleGetLastSync, handleGetRSS, handleInvalidateRSS, handleLocalFilterReset, handleReloadRss, handleSaveNovel, handleSyncOperation } from "./rssCache"
import { handleStartPickingFlow } from "./picking"
import { ready, whenReady } from "./ready"


type Respond = (response?: unknown) => void;
interface Route {
    run: (msg: any, respond: Respond) => unknown;
    respondsAsync: boolean; // false = fire and forget
};

const routes: Record<string, Route> = {
    SAVE_NOVEL: { run: (m, r) => handleSaveNovel(m.data, m.args, r), respondsAsync: true },
    RELOAD_RSS_SYNC: { run: () => handleReloadRss(), respondsAsync: false },
    GET_LAST_SYNC: { run: (_, r) => handleGetLastSync(r), respondsAsync: true },
    GET_RSS: { run: (_, r) => handleGetRSS(r), respondsAsync: true },
    INVALIDATE_RSS: { run: (_, r) => handleInvalidateRSS(r), respondsAsync: true },
    BUILD_AND_SAVE_FEEDS: { run: (m, r) => handleBuildAndSaveRawFeeds(m.data, r), respondsAsync: true },
    GET_ALL_POSSIBLE_PATHS: { run: (m, r) => handleGetAllPossiblePaths(r, m.data), respondsAsync: true },
    DB_OPERATION: { run: (m, r) => handleDbOperation(m.store, m.call, r), respondsAsync: true },
    SYNC_OPERATION: { run: (m, r) => handleSyncOperation(m.call, r), respondsAsync: true },
    RESET_LOCAL_FILTERS: { run: (_, r) => handleLocalFilterReset(r), respondsAsync: true },
    START_PICKING_FLOW: { run: (m) => handleStartPickingFlow(m.entry, m.tabID), respondsAsync: false },
};

export function initMessaging() {
    ext.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        const route = routes[msg?.type];
        if (!route) return false; // not ours, don't hold the channel open

        ready.then(() => route.run(msg, sendResponse)).catch((error) => {
            console.error(`[Hermidata] ${msg.type} failed`, error);
            if (route.respondsAsync) sendResponse({ error: String(error) });
        });

        return route.respondsAsync; // synchronous, so the channel stays open
    });
}

export function initInstalled() {
    ext.runtime.onInstalled.addListener(whenReady(async details => {
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

        if (settings?.ExtensionBehaviour.AllowContextMenu) {
            ext.contextMenus.create({
                id: "Hermidata",
                title: "Save to Hermidata",
                contexts: ["link"]
            });
        }
    }));
    ext.runtime.onStartup.addListener(whenReady(() => {
        updateCurrentBookmarkAndIcon();
        checkFeedsForUpdates();
    }));
}