import { ext } from "../shared/BrowserCompat";
import type { SettingsInput } from "../shared/types/settings";
import type { InputArrayType } from "../shared/types/popupType";
import { getCurrentDate } from "./feeds";
import { handleSaveNovel } from "./rssCache";
import { getTitleAndChapterFromUrl } from "../shared/StringOutput";

export function initContextMenus() {
    ext.contextMenus.onClicked.addListener((info) => {
        if (info.menuItemId === "Hermidata") {
                ext.storage.sync.get<Record<string, SettingsInput>>([ "Settings" ], (result) => {
                    if (result.AllowContextMenu) {
                        createContextMenu(info, result.Settings);
                    }
                });
            }
    })
}

function createContextMenu(info: chrome.contextMenus.OnClickData, Settings: SettingsInput) {
    // Send tab info to your saving logic
    if (!info.linkUrl) return
    fetch(info.linkUrl, { method: "HEAD" })
    .then(response => {
        const finalUrl = response.url;
        let { title, chapter } = getTitleAndChapterFromUrl(finalUrl);
        let url = finalUrl;
        let date = getCurrentDate(); // yyyy-mm-dd
        let type = Settings.DefaultChoiceText_Menu.Type;
        let status = Settings.DefaultChoiceText_Menu.status;
        let tags = Settings.DefaultChoiceText_Menu.tags;
        let notes = Settings.DefaultChoiceText_Menu.notes;
        const data: InputArrayType = [title ?? "", type, chapter, url, status, date, tags, notes];
        handleSaveNovel(data);
    })
    .catch(err => console.error("Failed to resolve redirect:", err));
}