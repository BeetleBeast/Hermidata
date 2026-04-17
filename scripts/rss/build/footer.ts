import { ext } from "../../shared/BrowserCompat";
import { getElement, setElement } from "../../utils/Selection";
import { RssBuild } from "../build";

    
    
export class Footer extends RssBuild {

    public makeFooterSection(): void {
        
        // clear notification
        const clearNotification = getElement("#clear-notifications");
        if (!clearNotification) throw new Error('Element not found');
        clearNotification.addEventListener('click', () => {
            const rssNotificationContainer = getElement("#RSS-Notification") as HTMLDivElement;
            if (!rssNotificationContainer) throw new Error('Element not found');
            this.removeAllChildNodes(rssNotificationContainer) // clear front-end
            this.setNotificationListAllToNull(null) // clear back-end
        });
        // open RSS full page
        const FullpageRSSButton = getElement(".fullpage-RSS-btn");
        if (!FullpageRSSButton) throw new Error('Element not found');
        FullpageRSSButton.addEventListener('click', () => open('./RSSFullpage.html'))
        
        // sync text & button
        this.SyncTextAndButtonOfRSS()

        // manifest version
        setElement("#version", el => el.innerHTML = chrome.runtime.getManifest().version);
    }

    private async setNotificationListAllToNull(value: any = null): Promise<Record<string, boolean>> {
        return new Promise<Record<string, boolean>>((_resolve, reject) => {
            ext.storage.local.set({"clearedNotification": value}, () => {
                if (ext.runtime.lastError) return reject(new Error(ext.runtime.lastError.message));
            });
        }).catch(error => {
            console.error('Extention error: Failed Premise getHermidata: ',error);
            return {};
        });
    }
    private SyncTextAndButtonOfRSS(): void {
        const latestRSSSync = getElement("#RSS-latest-sync-div");
        const latestSyncSpan = getElement("#lastSync");

        if (!latestRSSSync || !latestSyncSpan) throw new Error('Element not found');
        
        chrome.runtime.sendMessage({ type: "GET_LAST_SYNC" }, (response) => {
            latestSyncSpan.textContent = "hasn't sync yet";
            if ( !response || response.minutesAgo === null) return;
            const languageSuffix = response.minutesAgo >= 2 ? 's' : ''
            if (response.minutesAgo < 1) latestSyncSpan.textContent = "Just synced";
            else latestSyncSpan.textContent = `synced: ${response.minutesAgo} minute${languageSuffix} ago`
        });
        const ManualSyncBtn = getElement("#RSS-sync-Manual");
        if (!ManualSyncBtn) throw new Error('Element not found');
        ManualSyncBtn.addEventListener("click", () => {
            ext.runtime.sendMessage({ type: "RELOAD_RSS_SYNC" });
        });
        chrome.runtime.onMessage.addListener((msg) => {
            if ( msg.type === "SYNC_COMPLETED") latestSyncSpan.textContent = "Just synced";
        });
    }
}