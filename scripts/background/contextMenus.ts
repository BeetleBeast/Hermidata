import { ext } from "../shared/utils/BrowserCompat";
import type { Settings, InputArrayType } from "../shared/types/index";
import { getCurrentDate } from "./feeds";
import { handleSaveNovel } from "./rssCache";
import { getTitleAndChapterFromUrl } from "../shared/utils/StringOutput";
import { HermidataModel } from "../shared/utils/HermidataSelector";

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
        let readStatus = Settings.DefaultBookmarkSettings.DefaultChoiceText_Menu.readStatus;
        let tags = Settings.DefaultBookmarkSettings.DefaultChoiceText_Menu.tags;
        let notes = Settings.DefaultBookmarkSettings.DefaultChoiceText_Menu.notes;

        const spreadSheetTarget =  Settings.ExtensionBehaviour.SaveTarget.GoogleSpreadsheet;
        const bookmarkTarget = Settings.ExtensionBehaviour.SaveTarget.BrowserBookmark;

        const Hermidata = new HermidataModel(HermidataModel.from(type, readStatus, status));
            // set the values from the tab
        Hermidata.SetFromTab({ currentChapter: chapter, pageTitle: title ?? "", url: url });
        Hermidata.SetDefaultContextMenuValues(date, tags, notes);
        handleSaveNovel(Hermidata, { allowedSendSHeet: spreadSheetTarget, allowedSendBookmark: bookmarkTarget }, () => console.log("[Background - Context Menu]: Saved"));
    })
    .catch(err => console.error("Failed to resolve redirect:", err));
}