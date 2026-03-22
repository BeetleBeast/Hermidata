import { ext } from "../shared/BrowserCompat"
import { getAllHermidata } from "../shared/Storage"
import { updateCurrentBookmarkAndIcon } from "./bookmarks";
import { allHermidataCashed, setState } from "./state";


let currentBookmark: chrome.bookmarks.BookmarkTreeNode | null = null;
let currentTab: chrome.tabs.Tab | null = null;

type ActionApi = typeof ext.action | typeof ext.browserAction;

export function initTabs() {
    ext.tabs.onActivated.addListener(() => updateCurrentBookmarkAndIcon())
    ext.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
        if (changeInfo.status !== 'complete') return
        if (allHermidataCashed === null) setState.allHermidataCashed(await getAllHermidata())
        ext.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length && tabs[0].id === tabId) updateCurrentBookmarkAndIcon()
        })
    })
}


export function updateIcon(Url: string | null = null, currentTabParameter: chrome.tabs.Tab | null = null) {
    const actionApi = ext.action || ext.browserAction;

    const currentTabId = currentTab?.id || currentTabParameter?.id;

    if (Url) {
        ext.tabs.query({active : true}, (tabs) => {
            const matchedTab = tabs.find(t => t.url === Url);
            if (!matchedTab) {
                console.warn("No tab found with matching URL");
                return;
            }
            if (!matchedTab.id) {
                console.warn("Tab id not found");
                return;
            }
            setIconAndTitle(actionApi, matchedTab.id);
        });
    } else if (currentTabId) {
        setIconAndTitle(actionApi, currentTabId);
    } else {
        console.warn("No valid tab to set icon");
    }
}

function setIconAndTitle(actionApi: ActionApi, tabId: number) {
    const path = currentBookmark ? "assets/icon/icon_red48.png" : "assets/icon/icon48.png";
    const title = currentBookmark ? 'Already bookmarkt!' : 'Bookmark it!';

    actionApi.setIcon({ path, tabId }, () => {
        if (ext.runtime.lastError) console.warn("setIcon error:", ext.runtime.lastError.message);
    });
    actionApi.setTitle({ title, tabId }, () => {
        if (ext.runtime.lastError) console.warn("setTitle error:", ext.runtime.lastError.message);
    });
}