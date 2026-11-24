import { getHermidataViaKey, getSettings, saveHermidata } from "../shared/db/Storage";
import type { NotificationTypes } from "../shared/types/index";
import { ext } from "../shared/utils/BrowserCompat";
import { logConsoleError } from "../shared/utils/ErrorMessage";
import { describeUnread, getUnread, markSeen, type UnreadInfo } from "../shared/utils/Unread";

/*
Badge: the unread count on the toolbar icon, for every notification type except "None".
Notifications: only for items that *became* unread in one check.
    one item  → "rss:<itemId>", click opens the chapter and clears it
    several   → "rss:summary", click only dismisses it ( the notification list page doesn't exist yet )
*/

const ITEM_PREFIX = 'rss:';
const SUMMARY_ID = 'rss:summary';
const SUMMARY_MAX_TITLES = 5;
const DEFAULT_ICON = 'assets/icon/icon128.png';

async function notificationType(): Promise<NotificationTypes> {
    const settings = await getSettings();
    return settings?.ExtensionBehaviour?.EnableNotification ?? 'None';
}

/** Shows the unread count on the toolbar icon; empty at 0 or when notifications are off */
export async function updateUnreadBadge(unreadCount: number): Promise<void> {
    try {
        const type = await notificationType();
        const text = type !== 'None' && unreadCount > 0 ? String(Math.min(unreadCount, 99)) : '';
        await ext.action.setBadgeText({ text });
        if (text) await ext.action.setBadgeBackgroundColor({ color: '#01af76' });
    } catch (error) {
        logConsoleError('[RSS] could not update the badge:', error);
    }
}

/** Notifies about the items that just got a new chapter ( the badge is updated separately ) */
export async function notifyNewReleases(newlyUnread: UnreadInfo[]): Promise<void> {
    if (!newlyUnread.length) return;
    const type = await notificationType();
    if (type === 'None' || type === 'Badge') return;

    try {
        if (newlyUnread.length === 1) await createItemNotification(newlyUnread[0], type === 'MessageFull');
        else await createSummaryNotification(newlyUnread);
    } catch (error) {
        logConsoleError('[RSS] could not show a notification:', error);
    }
}

export function itemNotificationText(info: UnreadInfo, full: boolean): { title: string; message: string } {
    const title = info.item.title;
    if (!full) {
        return { title, message: info.latestChapter !== null ? `Chapter ${info.latestChapter}` : 'New chapter' };
    }
    const lines = [describeUnread(info), info.feed.latestItem.rawTitle || info.feed.latestItem.title, info.feed.domain];
    return { title, message: lines.filter(Boolean).join('\n') };
}

export function summaryNotificationText(infos: UnreadInfo[]): { title: string; message: string } {
    const titles = infos.slice(0, SUMMARY_MAX_TITLES).map(info => `• ${info.item.title}`);
    const more = infos.length - SUMMARY_MAX_TITLES;
    if (more > 0) titles.push(`and ${more} more`);
    titles.push('Open the popup to see them.');
    return { title: `${infos.length} series have new chapters`, message: titles.join('\n') };
}

async function createItemNotification(info: UnreadInfo, full: boolean): Promise<void> {
    const { title, message } = itemNotificationText(info, full);
    const id = `${ITEM_PREFIX}${info.item.id}`;
    const base = { type: 'basic' as const, title, message };
    const metaImage = info.item.meta?.image;
    const image = info.feed.image || (metaImage?.kind === 'url' ? metaImage.url : undefined);
    try {
        await ext.notifications.create(id, { ...base, iconUrl: image || ext.runtime.getURL(DEFAULT_ICON) });
    } catch {
        // a remote image the browser can't load: fall back to the extension icon
        await ext.notifications.create(id, { ...base, iconUrl: ext.runtime.getURL(DEFAULT_ICON) });
    }
}

async function createSummaryNotification(infos: UnreadInfo[]): Promise<void> {
    const { title, message } = summaryNotificationText(infos);
    await ext.notifications.create(SUMMARY_ID, { type: 'basic', title, message, iconUrl: ext.runtime.getURL(DEFAULT_ICON) });
}

/** Call in the first tick of the background script */
export function initRssNotificationClicks(onSeen: () => void): void {
    ext.notifications?.onClicked.addListener(id => {
        if (!id.startsWith(ITEM_PREFIX)) return;
        void ext.notifications.clear(id);
        if (id === SUMMARY_ID) return; // TODO: open the notification list page once it exists
        void openAndClear(id.slice(ITEM_PREFIX.length)).then(onSeen);
    });
}

/** Opens the newest unread chapter of an item and marks the item seen */
async function openAndClear(itemId: string): Promise<void> {
    try {
        const item = await getHermidataViaKey(itemId);
        if (!item) return;
        const info = getUnread(item);
        const link = info?.link ?? item.chapter.bookmarks[item.chapter.bookmarkInUse]?.url;
        if (link) await ext.tabs.create({ url: link });
        if (info) await saveHermidata(item.id, markSeen(item));
    } catch (error) {
        logConsoleError('[RSS] could not open the notification item:', error);
    }
}
