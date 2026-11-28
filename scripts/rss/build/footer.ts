import { ext } from "../../shared/utils/BrowserCompat";
import { getElement, setElement } from "../../shared/utils/Selection";
import { openLink } from "../../shared/utils/StringOutput";
import { RssBuild } from "../build";
import { clearNotifications, getHermidataNotification } from "../load";
import { refreshNotificationSection } from "./feed";
import { renewListeners } from "../../shared/utils/Listeners";

/** One handler for the life of the page, so building the footer again never registers a second one */
function showJustSynced(msg: { type?: string }): void {
    if (msg?.type === "SYNC_COMPLETED") setElement("#lastSync", el => el.textContent = "Just synced");
}

    
    
export class Footer extends RssBuild {

    public makeFooterSection(): void {
        // every reload builds the footer again over the same buttons: replace their listeners, never add to them
        const signal = renewListeners(Footer, "footer");

        // clear notification
        this.ClearNotification(signal);
        // open RSS full page
        this.openRSSPage(signal);
        // sync text & button
        this.SyncTextAndButtonOfRSS(signal);
        // manifest version
        this.setVersion();
    }
    private ClearNotification(signal: AbortSignal): void {
        const clearNotification = getElement("#clear-notifications");
        if (!clearNotification) throw new Error('Element not found');

        clearNotification.addEventListener('click', async () => {
            const rssNotificationContainer = getElement<HTMLDivElement>("#RSS-Notification");
            if (!rssNotificationContainer) throw new Error('Element not found');

            // front-end: drop the rows, keep the header
            rssNotificationContainer.querySelectorAll('.hermidata-item[data-is-notification-item="true"]').forEach(row => row.remove());
            refreshNotificationSection();
            await this.removeNotificationFromBackEnd(); // back-end
        }, { signal });
    }
    private openRSSPage(signal: AbortSignal): void {
        const LibraryButton = getElement(".library-btn");
        if (!LibraryButton) throw new Error('Element not found');
        LibraryButton.addEventListener('click', () => openLink('./Library.html', 'newTab'), { signal })
    }
    private setVersion(): void {
        setElement("#version", el => el.innerHTML = chrome.runtime.getManifest().version);
    }

    private async removeNotificationFromBackEnd() {
        const unread = await getHermidataNotification();
        await clearNotifications(Object.values(unread));
    }
    private SyncTextAndButtonOfRSS(signal: AbortSignal): void {
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
        }, { signal });
        if (!ext.runtime.onMessage.hasListener(showJustSynced)) ext.runtime.onMessage.addListener(showJustSynced);
    }
}