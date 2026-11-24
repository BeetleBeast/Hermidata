import { ext } from "../../shared/utils/BrowserCompat";
import { getElement, setElement } from "../../shared/utils/Selection";
import { openLink } from "../../shared/utils/StringOutput";
import { RssBuild } from "../build";
import { clearNotifications, getHermidataNotification } from "../load";
import { refreshNotificationSection } from "./feed";

    
    
export class Footer extends RssBuild {

    public makeFooterSection(): void {
        
        // clear notification
        this.ClearNotification();
        // open RSS full page
        this.openRSSPage();
        // sync text & button
        this.SyncTextAndButtonOfRSS();
        // manifest version
        this.setVersion();
    }
    private ClearNotification(): void {
        const clearNotification = getElement("#clear-notifications");
        if (!clearNotification) throw new Error('Element not found');

        clearNotification.addEventListener('click', async () => {
            const rssNotificationContainer = getElement<HTMLDivElement>("#RSS-Notification");
            if (!rssNotificationContainer) throw new Error('Element not found');

            // front-end: drop the rows, keep the header
            rssNotificationContainer.querySelectorAll('.hermidata-item[data-is-notification-item="true"]').forEach(row => row.remove());
            refreshNotificationSection();
            await this.removeNotificationFromBackEnd(); // back-end
        });
    }
    private openRSSPage(): void {
        const LibraryButton = getElement(".library-btn");
        if (!LibraryButton) throw new Error('Element not found');
        LibraryButton.addEventListener('click', () => openLink('./Library.html', 'newTab'))
    }
    private setVersion(): void {
        setElement("#version", el => el.innerHTML = chrome.runtime.getManifest().version);
    }

    private async removeNotificationFromBackEnd() {
        const unread = await getHermidataNotification();
        await clearNotifications(Object.values(unread));
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