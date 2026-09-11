import { ext } from "../shared/utils/BrowserCompat"
import { getAllHermidata } from "../shared/db/Storage"
import { updateCurrentBookmarkAndIcon } from "./bookmarks";
import { allHermidataCashed, currentBookmark, currentTab, setState } from "./state";
import { setDynamicIcon } from "../shared/utils/StringOutput";

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


export async function updateIcon(Url: string | null = null, colour?: string, currentTabParameter: chrome.tabs.Tab | null = null): Promise<boolean> {

    const currentTabId = currentTabParameter?.id ?? currentTab?.id;

    if (Url && currentTabParameter?.id) {
        await setIconAndTitle(currentTabParameter.id, colour);
        return true;
    }
    else if (Url) {
        const tabs = await ext.tabs.query({active : true, currentWindow: true});
        const matchedTab = tabs.find(t => t.url === Url);

        if (!matchedTab?.id) {
            console.warn("No matching tab found for icon update");
            return false;
        }
        await setIconAndTitle(matchedTab.id, colour);
        return true;
    } else if (currentTabId) {
        await setIconAndTitle(currentTabId, colour);
        return true;
    } else {
        console.warn("No valid tab to set icon");
        return false;
    }
}

async function setIconAndTitle(tabId: number, colour?: string) {

    const title = currentBookmark  ? 'Already bookmarked!' : 'Bookmark it!';

    await setDynamicIcon(currentBookmark !== null, colour, tabId);
    await ext.action.setTitle({ title, tabId })
    
}