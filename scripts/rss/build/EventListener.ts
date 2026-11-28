import { customConfirm, customPrompt } from "../../popup/frontend/confirm";
import { ext } from "../../shared/utils/BrowserCompat";
import { getMultipleTitles, openLink, generateHermidataHash, getFreeKey, TrimTitle } from "../../shared/utils/StringOutput";
import type { Hermidata, MenuOption, MenuOptions } from "../../shared/types/index";
import { isMangaUpdatesFeedUrl } from "../../shared/lookup/mangaUpdatesFeeds";
import { makeButtonLike } from "../../shared/utils/Accessibility";
import { getElement } from "../../shared/utils/Selection";
import { RssBuild } from "../build";
import { clearNotifications, getHermidataWithRssFromBackground } from "../load";
import { refreshNotificationSection } from "./feed";
import { HermidataModel } from "../../shared/utils/HermidataSelector";
import type { PickedElementData } from "../../shared/types/rss";
import { openContextMenu } from "./ContextMenu";

type OpenLocation = 'sameTab' | 'newTab' | 'newWindow';

const OPEN_LOCATIONS: { label: string; location: OpenLocation }[] = [
    { label: "In this tab", location: 'sameTab' },
    { label: "In new tab", location: 'newTab' },
    { label: "In new window", location: 'newWindow' },
];

export class EventListener extends RssBuild {
    
    public async attachEventListeners(): Promise<void> {
        // parents
        const notificationFeed = document.querySelectorAll<HTMLDivElement>('.hermidata-item[data-is-notification-item="true"]');
        const allItems = document.querySelectorAll<HTMLDivElement>('.hermidata-item[data-is-notification-item="false"]');

        const feedListLocalReload = await getHermidataWithRssFromBackground();

        for (let feed of notificationFeed) {
            feed.addEventListener('contextmenu', (e) => this.rightMouseClickOnItem(e, true, true));
            const hashItem = this.GetHashItem(feed);
            makeButtonLike(feed, this.describeItem(feedListLocalReload[hashItem]), 'link');
            feed.onclick = () => this.clickOnItem(feedListLocalReload[hashItem], true, feed);
        }
        for (let items of allItems) {
            const item = this.getEntriesItem(items) || this.getNotificationItem(items);
            if (!item) {
                console.log('isn\'t a item');
                return;
            }
            const hashItem = this.GetHashItem(item);
            const entry = new HermidataModel(this.AllHermidata[hashItem]);
            items.addEventListener('contextmenu', (e) => this.rightMouseClickOnItem(e, false, entry.hasRSS()));
            makeButtonLike(items, this.describeItem(this.AllHermidata[hashItem]), 'link');
            items.onclick = () => this.clickOnItem(this.AllHermidata[hashItem], false);
        }
    }
    /** Spoken name of a saved item: its title and what activating it does */
    private describeItem(value: Hermidata | undefined): string {
        if (!value) return 'Saved item';
        const hermidata = new HermidataModel(value);
        const linked = hermidata.hasRSS() ? 'linked to an RSS feed' : 'not linked to an RSS feed';
        return `${hermidata.title}, ${linked}. Open the latest saved chapter, or press the context menu key for more actions`;
    }
    private async clickOnItem(value: Hermidata, isNotificationItem: boolean, element: HTMLDivElement | null = null) {
        if (getElement('.feed-header-symbol')?.dataset.feedState === 'up' && isNotificationItem) return;

        const hermidata = new HermidataModel(value);

        await this.clearIfNotification(element);
        await openLink(hermidata.GetUrl(), 'newTab', hermidata.GetScrollPosition());
    }
    private async rightMouseClickOnItem(e: MouseEvent, isNotificationItem: boolean, isRSSItem: boolean) {
        e.preventDefault(); // stop the browser’s default context menu
        if (getElement('.feed-header-symbol')?.dataset.feedState === 'up' && isNotificationItem) return;

        const target = e.target as HTMLDivElement;
        const unsubscribe: MenuOption = { label: "Unsubscribe", action: () => this.unsubscribe(target), danger: true };

        const optionsNotification: MenuOptions[] = [
            { label: "Copy title", action: () => this.copyTitle(target) },
            ...this.openMenuOptions(target),
            "separator",
            { label: "Clear notification", action: () => this.clearNotification(target) },
            "separator",
            unsubscribe,
        ];
        const optionsAllItems: MenuOptions[] = [
            { label: "Copy title", action: () => this.copyTitle(target) },
            ...this.openMenuOptions(target),
            "separator",
            { label: "pick element(s) to add as alt title", action: async () => await this.pickElement(target) },
            { label: "add alt title", action: async () => await this.addAltTitle(target) },
            { label: "Rename", action: async () => await this.RenameItem(target) },
            ...(isRSSItem ? ["separator" as const, unsubscribe] : []),
            "separator",
            { label: "delete", action: async () => await this.remove(target), danger: true },
        ];
        const isNotification = this.getNotificationItem(target) !== undefined;

        openContextMenu(isNotification ? optionsNotification : optionsAllItems, e);
    }
    /** The ways to open an item, grouped so the menu stays short: its latest marker, a marker of choice, its overview page */
    private openMenuOptions(target: HTMLDivElement): MenuOptions[] {
        return [
            { label: "Open latest marker", options: OPEN_LOCATIONS.map(({ label, location }) => ({ label, action: () => this.openMarker(target, location) })) },
            { label: "Choose marker", options: OPEN_LOCATIONS.map(({ label, location }) => ({ label, options: this.markerOptions(target, location) })) },
            { label: "Open overview page", options: OPEN_LOCATIONS.map(({ label, location }) => ({ label, action: () => this.openOverview(target, location) })) },
        ];
    }
    private getEntryFromTarget(target: HTMLDivElement | null): Hermidata | undefined {
        const item = this.getEntriesItem(target) || this.getNotificationItem(target);
        if (!item || !target) return;

        const hashItem = this.GetHashItem(item);
        const entry = this.AllHermidata[hashItem];
        if (!entry) {
            console.warn("Entry not found for hash:", hashItem);
            return;
        }
        return entry
    }
    /** One entry per marker of the item, each opening that marker at `location` */
    private markerOptions(target: HTMLDivElement, location: OpenLocation): MenuOption[] {
        const entry = this.getEntryFromTarget(target);
        if (!entry) return [];
        return Object.values(entry.chapter.bookmarks).map(marker => ({ label: marker.label, action: () => this.openMarker(target, location, marker.id) }));
    }
    private copyTitle(target: HTMLDivElement | null) {
        const item = this.getEntriesItem(target) || this.getNotificationItem(target);
        if (!item || !target) return;
        const nameClass = 'hermidata-item-title';
        if (item.dataset.searchable == 'true') {
            const title = item.querySelector(`.${nameClass}`)
            if (!title) throw new Error('title not found');
            navigator.clipboard.writeText(title.textContent.trim());
            console.log("Copied:", title.textContent.trim());
        }
    }
    
    /** Opens a marker of the item ( its latest one when no `id` is given ) */
    private async openMarker(target: HTMLDivElement | null, location: OpenLocation, id: string | null = null) {
        const entry = this.getModelFromTarget(target);
        if (!entry) return;
        const currentUrl = id ? entry.GetUrl(id) : entry.GetUrl();
        const currentScrollPosition = id ? entry.GetScrollPosition(id) : entry.GetScrollPosition();
        if (!currentUrl || !this.isNumber(currentScrollPosition)) return;

        await this.clearIfNotification(target);
        await openLink(currentUrl, location, currentScrollPosition);
    }
    private async openOverview(target: HTMLDivElement | null, location: OpenLocation) {
        const entry = this.getModelFromTarget(target);
        if (!entry) return;

        await this.clearIfNotification(target);
        await openLink(`./Overview.html#/id/${entry.id}`, location, 0, true); // "this tab": the popup can't navigate itself
    }
    private getModelFromTarget(target: HTMLDivElement | null): HermidataModel | undefined {
        const item = this.getEntriesItem(target) || this.getNotificationItem(target);
        if (!item || !target) return;
        const hashItem = this.GetHashItem(item);
        if (!this.AllHermidata[hashItem]) {
            console.warn("Entry not found for hash:", hashItem);
            return;
        }
        return new HermidataModel(this.AllHermidata[hashItem]);
    }
    private isNumber(number: number) {
        return !isNaN(number) && number !== undefined;
    }
    
    /** Opening a notification item clears it; cleared before opening, since a new tab or window closes the popup */
    private async clearIfNotification(target: HTMLDivElement | null) {
        if (target && this.getNotificationItem(target)) await this.clearNotification(target);
    }
    private async clearNotification(target: HTMLDivElement | null) {
        if (!target) return;
        // find id of list item
        const item = this.getNotificationItem(target);
        if (!item) {
            console.log('isn\'t a notification item');
            return;
        }
        item.remove();
        refreshNotificationSection();
        const hashItem = this.GetHashItem(item);

        // the RSS view's copy has the newest fetched item; the stored one may not
        const rssItems = await getHermidataWithRssFromBackground();
        const entry = rssItems[hashItem] ?? this.AllHermidata[hashItem];
        if (entry) await clearNotifications([entry]);
    }
    private async pickElement(target: HTMLDivElement | null) {
        if (!target) return;
        const item = this.getEntriesItem(target)
        if (!item) {
            console.log('isn\'t a entries item');
            return;
        }
        const hashItem = this.GetHashItem(item);
        const entry = new HermidataModel(this.AllHermidata[hashItem]);
        if (!entry) {
            console.warn("Entry not found for hash:", hashItem);
            return;
        }
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
            console.warn("No active tab found.");
            return;
        }

        await ext.runtime.sendMessage({ 
            type: 'START_PICKING_FLOW',
            entry: entry.toJSON(),
            tabID: tab.id
        })

        window.close();
    }
    private async addAltTitle(target: HTMLDivElement | null) {
        if (!target) return;
        const item = this.getEntriesItem(target)
        if (!item) {
            console.log('isn\'t a entries item');
            return;
        }
        const hashItem = this.GetHashItem(item);
        const entry = new HermidataModel(this.AllHermidata[hashItem]);
        if (!entry) {
            console.warn("Entry not found for hash:", hashItem);
            return;
        }
        const newTitle = await customPrompt("Add alternate:");
        if (!newTitle) return;
    
        // Normalize and deduplicate
        const trimmed = TrimTitle.trimTitle(newTitle, entry.GetUrl()).title;
        entry.meta = entry.meta || {};
        entry.meta.altTitles = Array.from(
            new Set([...(entry.meta.altTitles || []), trimmed])
        );
    
        // Save to storage
        await this.db.saveHermidata(hashItem, entry.toJSON());
    
        console.log(`[Hermidata] Added alt title "${trimmed}" for ${entry.title}`);
    }
    private async RenameItem(target: HTMLDivElement | null): Promise<void> {
        if (!target) return;
        const item = this.getEntriesItem(target)
        if (!item) {
            console.log('isn\'t a entries item');
            return;
        }
        const oldKey = this.GetHashItem(item);
        const oldData = new HermidataModel(this.AllHermidata[oldKey]);
        if (!oldData) {
            console.warn("No data found for this item");
            return;
        }
        const newTitle = await customPrompt(`Renaming to:`, {defaultValue: oldData.title});
        if (!newTitle || newTitle.trim() === oldData.title.trim()) {
            console.log("Rename canceled or unchanged");
            return;
        }
        // Generate new key and object
        // never move onto a key another item holds ( a separate same-titled item keeps its own id )
        const newKey = getFreeKey(oldKey, generateHermidataHash(newTitle, oldData.novelType, oldData.GetUrl(), false), this.AllHermidata);
        const TrimmedTitle = TrimTitle.trimTitle(newTitle, oldData.GetUrl()).title;

        const newData: HermidataModel = oldData.Copy();
        newData.title = newTitle;
        newData.id = newKey;
    
        // Add the old title as an altTitle
        if (TrimmedTitle === newTitle) newData.meta.altTitles = Array.from( new Set([...(newData.meta.altTitles || []), TrimmedTitle]) );
        else newData.meta.altTitles = Array.from( new Set([...(newData.meta.altTitles || []), oldData.title, TrimmedTitle]) );
    
        // Save and clean up ( same key: only saved, nothing is removed )
        await this.db.moveHermidata(oldKey, newKey, newData.toJSON());
    
        //  update your in-memory list
        delete this.AllHermidata[oldKey];
        this.AllHermidata[newKey] = newData;
    
        // update UI
        const titleEl = item.querySelector(".hermidata-item-title");
        if (titleEl) titleEl.textContent = newTitle;
        item.className = item.className.replace(oldKey, newKey);
    
        console.log(`[Hermidata] Renamed "${oldData.title}" → "${newTitle}"`);
        await this.reloadContent(getElement<HTMLDivElement>("#RSS-Notification")!, getElement<HTMLDivElement>("#All-RSS-entries")!)
    }
    
    private async remove(target: HTMLDivElement | null) {
        if (!target) return;
        const item = this.getEntriesItem(target)
        if (!item) {
            console.log('isn\'t a entries item');
            return;
        }
        const hashItem = this.GetHashItem(item);
        const toBeRemovedItem = this.AllHermidata[hashItem]
        const confirmation = await customConfirm(`are you sure you want to remove ${toBeRemovedItem.title}`, {accept: 'Remove', reject: 'Cancel'});
        if ( confirmation) {
            console.warn(`Removing item ${Object.values(toBeRemovedItem)}`)
            delete this.AllHermidata[hashItem]
            await this.db.removeHermidata(hashItem)
        }
        await this.reloadContent(getElement<HTMLDivElement>("#RSS-Notification")!, getElement<HTMLDivElement>("#All-RSS-entries")!)
    }
    
    private async unsubscribe(target: HTMLDivElement | null) {
        if (!target) return;
        console.log("Unsubscribed from", target);
        const item = this.getEntriesItem(target) || this.getNotificationItem(target);
        if (!item || !target) return;
        const hashItem = this.GetHashItem(item);
        const entry = new HermidataModel(this.AllHermidata[hashItem]);
        
        const NotificationSection = getElement<HTMLDivElement>("#RSS-Notification");
        const AllItemSection = getElement<HTMLDivElement>("#All-RSS-entries");

        if (!NotificationSection || !AllItemSection) throw new Error('Element not found');

        const confirmation = await customConfirm(`are you sure you want to Unsubscribe to ${entry.title}`, {accept: 'Unsubscribe', reject: 'Cancel'});
        if ( !confirmation) return;

        console.log('un-link RSS to extension')
        await this.unLinkRSSFeed(entry);
        console.log('reloading notification')
        await this.reloadContent(NotificationSection, AllItemSection)
    }
    private async unLinkRSSFeed(entry: HermidataModel) {
        if (!entry) return;

        const mangaUpdatesFeed = entry.rss.find(feed => isMangaUpdatesFeedUrl(feed.url));
        entry.rss = [];

        await this.db.saveHermidata(entry.id, entry.toJSON());
        if (mangaUpdatesFeed) await this.keepUnlinked(entry.id, mangaUpdatesFeed.id);
    }
    /** Without this the next feed check would link the MangaUpdates feed again */
    private async keepUnlinked(itemId: string, feedId: string) {
        const settings = await this.db.getSettings();
        const autoSubscribe = settings.ExtensionBehaviour.AutoSubscribe;
        autoSubscribe.HermidataNotLinkedToRSS = { ...autoSubscribe.HermidataNotLinkedToRSS, [itemId]: feedId };
        await this.db.setSettings(settings);
    }
    private getEntriesItem(el: HTMLElement | null): HTMLElement | undefined {
        if (!el) return undefined
    
        if (el.parentElement?.id === 'All-RSS-entries' &&  el.dataset.isNotificationItem === 'false' ) return el
    
        return this.getEntriesItem(el.parentElement)
    }
    private getNotificationItem(el: HTMLElement | null): HTMLElement | undefined {
        if (!el) return undefined
    
        if (el.parentElement?.id === 'RSS-Notification' &&  el.dataset.isNotificationItem === 'true' ) return el
    
        return this.getNotificationItem(el.parentElement)
    }
}
