import { ext } from "../shared/BrowserCompat";
import type { Settings, InputArrayType } from "../shared/types/index";
import { getCurrentDate } from "./feeds";
import { handleSaveNovel } from "./rssCache";
import { getTitleAndChapterFromUrl } from "../shared/StringOutput";

export function initContextMenus() {
    ext.contextMenus.onClicked.addListener((info) => {
        if (info.menuItemId === "Hermidata") {
                ext.storage.sync.get<Record<string, Settings>>([ "Settings" ], (result) => {
                    if (result.AllowContextMenu) {
                        createContextMenu(info, result.Settings);
                    }
                });
            }
    })
}

function createContextMenu(info: chrome.contextMenus.OnClickData, Settings: Settings) {
    // Send tab info to your saving logic
    
    if (!info.linkUrl) return
    fetch(info.linkUrl, { method: "HEAD" })
    .then(response => {
        const finalUrl = response.url;
        let { title, chapter } = getTitleAndChapterFromUrl(finalUrl);
        let url = finalUrl;
        let date = getCurrentDate(); // yyyy-mm-dd
        let type = Settings.DefaultBookmarkSettings.DefaultChoiceText_Menu.novelType;
        let status = Settings.DefaultBookmarkSettings.DefaultChoiceText_Menu.novelStatus;
        let tags = Settings.DefaultBookmarkSettings.DefaultChoiceText_Menu.tags;
        let notes = Settings.DefaultBookmarkSettings.DefaultChoiceText_Menu.notes;
        const data: InputArrayType = [title ?? "", type, chapter, url, status, date, tags, notes];
        handleSaveNovel(data, { allowedSendSHeet: Settings.ExtensionBehaviour.SaveTarget.GoogleSpreadsheet, allowedSendBookmark: Settings.ExtensionBehaviour.SaveTarget.BrowserBookmark }, () => {});
    })
    .catch(err => console.error("Failed to resolve redirect:", err));
}