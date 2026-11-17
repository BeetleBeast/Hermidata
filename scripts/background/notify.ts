import { ext } from "../shared/utils/BrowserCompat";


export async function showNotice(message: string, closeAfterMs: number = 4_000) {
    const tab = await getCurrentTab();

    if (tab?.id != null) {
        try {
            return await ext.tabs.sendMessage(tab.id, { action: 'SHOW_TOAST', message, closeAfterMs });
        } catch {
            // No content script: chrome:// page, Web Store, a tab opened before install, or a discarded tab. Fall through.
        }
    }

    const id = await ext.notifications.create({
        type: 'basic',
        iconUrl: ext.runtime.getURL('../../assets/icon/icon128.png'),
        title: 'Hermidata',
        message,
    });
    setTimeout(() => ext.notifications.clear(id), closeAfterMs);
}

async function getCurrentTab(): Promise<chrome.tabs.Tab | undefined> {
    const currentTab = await ext.tabs.query({ active: true, currentWindow: true });
    return currentTab.at(0);
}