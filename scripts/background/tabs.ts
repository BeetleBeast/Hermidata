import { ext } from "../shared/utils/BrowserCompat"
import { getAllHermidata } from "../shared/db/Storage"
import { updateCurrentBookmarkAndIcon } from "./bookmarks";
import { allHermidataCashed, currentBookmark, currentTab, setState } from "./state";

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


export async function updateIcon(Url: string | null = null, currentTabParameter: chrome.tabs.Tab | null = null): Promise<boolean> {
    const actionApi = ext.action || ext.browserAction;

    const currentTabId = currentTabParameter?.id ?? currentTab?.id;

    if (Url && currentTabParameter?.id) {
        await setIconAndTitle(actionApi, currentTabParameter.id);
        return true;
    }
    else if (Url) {
        const tabs = await ext.tabs.query({active : true, currentWindow: true});
        const matchedTab = tabs.find(t => t.url === Url);

        if (!matchedTab?.id) {
            console.warn("No matching tab found for icon update");
            return false;
        }
        await setIconAndTitle(actionApi, matchedTab.id);
        return true;
    } else if (currentTabId) {
        await setIconAndTitle(actionApi, currentTabId);
        return true;
    } else {
        console.warn("No valid tab to set icon");
        return false;
    }
}

async function setIconAndTitle(actionApi: ActionApi, tabId: number) {

    const path =  currentBookmark  ? "assets/icon/icon_red48.png" : "assets/icon/icon48.png";
    const title = currentBookmark  ? 'Already bookmarkt!' : 'Bookmark it!';

    actionApi.setIcon({ path, tabId }, () => {
        if (ext.runtime.lastError) console.warn("setIcon error:", ext.runtime.lastError.message);
    });
    actionApi.setTitle({ title, tabId }, () => {
        if (ext.runtime.lastError) console.warn("setTitle error:", ext.runtime.lastError.message);
    });
}