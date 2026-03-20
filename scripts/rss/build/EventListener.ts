import { customConfirm, customPrompt } from "../../popup/frontend/confirm";
import { ext } from "../../shared/BrowserCompat";
import { returnHashedTitle, TrimTitle } from "../../shared/StringOutput";
import type { MenuOption } from "../../shared/types/rssBuildType";
import { getHermidataViaKey, removeKeysFromSync, setNotificationList } from "../../shared/types/Storage";
import type { Hermidata } from "../../shared/types/type";
import { getElement } from "../../utils/Selection";
import { RssBuild } from "../build";
import { loadSavedFeeds } from "../load";

export class EventListener extends RssBuild {
    

    public async attachEventListeners(): Promise<void> {
        // parents
        const notificationFeed = document.querySelectorAll<HTMLDivElement>('.RSS-Notification-item');
        const allItems = document.querySelectorAll<HTMLDivElement>('.RSS-entries-item');

        const feedListLocalReload = await loadSavedFeeds();

        for (let feed of notificationFeed) {
            feed.addEventListener('contextmenu', (e) => this.rightmouseclickonItem(e, false));
            const hashItem = feed.className.split('TitleHash-')[1].replace(' seachable','');
            feed.onclick = () => this.clickOnItem(feedListLocalReload[hashItem], false);
        }
        for (let items of allItems) {
            items.addEventListener('contextmenu', (e) => this.rightmouseclickonItem(e, true));
            const hashItem = items.className.split('TitleHash-')[1].replace(' seachable','');
            items.onclick = () => this.clickOnItem(this.AllHermidata[hashItem], true);
        }
    }
    private clickOnItem(value: Hermidata, isRSSItem: boolean) {
        if (getElement('.feed-header-symbol')?.dataset.feedState === 'up' && !isRSSItem) return;
        ext.tabs.create({ url: value?.rss?.latestItem?.link || value.url });
    }
    private async rightmouseclickonItem(e: MouseEvent, isRSSItem: boolean) {
        e.preventDefault(); // stop the browser’s default context menu
        if (getElement('.feed-header-symbol')?.dataset.feedState === 'up' && !isRSSItem) return;

        // Remove any existing custom menu first
        document.querySelectorAll(".custom-context-menu").forEach(el => el.remove());

        // Create the menu container
        const menu = document.createElement("div");
        menu.className = "custom-context-menu";
        menu.style.top = `${e.clientY}px`;
        if (e.clientY > 400) {
            menu.style.bottom = `${15}px`;
            menu.style.top = `${e.clientY - 150}px`;
        }
        menu.style.left = `${e.clientX}px`;

        // Define your menu options
        const optionsNotification: (MenuOption | "separator")[] = [
            { label: "Copy title", action: () => this.copyTitle(e.target as HTMLDivElement) },
            { label: "Open in page", action: () => this.openInPage(e.target as HTMLDivElement) },
            { label: "Open in new window", action: () => this.openInNewWindow(e.target as HTMLDivElement) },
            "separator",
            { label: "Clear notification", action: () => this.clearNotification(e.target as HTMLDivElement) },
            "separator",
            { label: "Unsubscribe", action: () => this.unsubscribe(e.target as HTMLDivElement) },
        ];
        const optionsAllItems: (MenuOption | "separator")[] = [
            { label: "Copy title", action: () => this.copyTitle(e.target as HTMLDivElement) },
            { label: "Open in page", action: () => this.openInPage(e.target as HTMLDivElement) },
            { label: "Open in new window", action: () => this.openInNewWindow(e.target as HTMLDivElement) },
            "separator",
            { label: "add alt title", action: async () => await this.addAltTitle(e.target as HTMLDivElement) },
            { label: "Rename", action: async () => await this.RenameItem(e.target as HTMLDivElement) },
            "separator",
            { label: "delete", action: async () => await this.remove(e.target as HTMLDivElement) },
        ];
        const itemLocation = this.getNotificationItem(e.target as HTMLDivElement) ? 'notification' :  'entries'
        
        const options = itemLocation == 'notification' ? optionsNotification : optionsAllItems;
        // Build the menu content
        for (const opt of options) {
            if (opt === "separator") {
            const hr = document.createElement("hr");
            hr.className = "menu-separator";
            menu.appendChild(hr);
            continue;
            }
            const itemContainer = document.createElement('div');
            itemContainer.className = "context-menu-item-container";

            const item = document.createElement("div");
            item.className = "menu-item";
            item.textContent = opt.label;
            item.addEventListener("click", () => {
            opt.action();
            menu.remove();
            });
            itemContainer.appendChild(item);
            menu.appendChild(itemContainer);
        }

        document.body.appendChild(menu);

        // Remove when clicking elsewhere
        document.addEventListener("click", () => { menu.remove(); }, { once: true });
    }
    private copyTitle(target: HTMLDivElement | null) {
        const item = this.getEntriesItem(target) || this.getNotificationItem(target);
        if (!item || !target) return;
        const nameClass = item.className.split(' ')[0] == 'RSS-entries-item' 
            ? 'RSS-entries-item-title'
            : 'RSS-Notification-item-title';
        // RSS-entries-item hasRSS TitleHash--1692575891 seachable
        console.log('seachable',item.className.split(' ')[item.className.split(' ').length -1])
        if (item.className.split(' ')[item.className.split(' ').length -1] == 'seachable') {
            const title0 = item.querySelector(`.${nameClass}`)
            const title1 = getElement(`.RSS-Notification-item-title.${target.className}`);
            const title2 = getElement(`.RSS-entries-item-title.${target.className}`);
            const title = title0 || ( title1 || title2 )
            if (!title) throw new Error('title not found');
            navigator.clipboard.writeText(title.textContent.trim());
            console.log("Copied:", title.textContent.trim());
        }
    }
    
    private openInPage(target: HTMLDivElement | null) {
        if (!target) return;
        const url = target.dataset.url;
        if (url) window.open(url, "_self");
    }
    
    private openInNewWindow(target: HTMLDivElement | null) {
        if (!target) return;
        const url = target.dataset.url;
        if (url) window.open(url, "_blank");
    }
    
    private clearNotification(target: HTMLDivElement | null) {
        if (!target) return;
        console.log("Cleared notification for", target);
        // find id of list item
        const item = this.getNotificationItem(target);
        if (!item) {
            console.log('isn\'t a notification item');
            return;
        }
        item.remove()
        const hashItem = item.className.split('TitleHash-')[1].replace(' seachable','');
        setNotificationList(hashItem)
        // remove from back-end
    }
    private async addAltTitle(target: HTMLDivElement | null) {
        if (!target) return;
        const item = this.getEntriesItem(target)
        if (!item) {
            console.log('isn\'t a entries item');
            return;
        }
        const hashItem = item.className.split('TitleHash-')[1].replace(' seachable','');
        const entry = this.AllHermidata[hashItem];
        if (!entry) {
            console.warn("Entry not found for hash:", hashItem);
            return;
        }
        const newTitle = await customPrompt("Add alternate title for this entry:", '');
        if (!newTitle) return;
    
        // Normalize and deduplicate
        const trimmed = TrimTitle.trimTitle(newTitle, entry.url).title;
        entry.meta = entry.meta || {};
        entry.meta.altTitles = Array.from(
            new Set([...(entry.meta.altTitles || []), trimmed])
        );
    
        // Save to storage
        await ext.storage.sync.set({ [hashItem]: entry });
    
        console.log(`[Hermidata] Added alt title "${trimmed}" for ${entry.title}`);
    }
    private async RenameItem(target: HTMLDivElement | null): Promise<void> {
        if (!target) return;
        const item = this.getEntriesItem(target)
        if (!item) {
            console.log('isn\'t a entries item');
            return;
        }
        const oldKey = item.className.split('TitleHash-')[1].replace(' seachable','');
        const oldData = this.AllHermidata[oldKey]
        if (!oldData) {
            console.warn("No data found for this item");
            return;
        }
        const newTitle = await customPrompt(`Renaming "${oldData.title}" to:`, oldData.title);
        if (!newTitle || newTitle.trim() === oldData.title.trim()) {
            console.log("Rename canceled or unchanged");
            return;
        }
        // Generate new key and object
        const newKey = returnHashedTitle(newTitle, oldData.type);
        const newData = { ...oldData, title: TrimTitle.trimTitle(newTitle, oldData.url).title, id: newKey };
    
        // Add the old title as an altTitle
        newData.meta = newData.meta || {};
        newData.meta.altTitles = Array.from(
            new Set([...(newData.meta.altTitles || []), oldData.title])
        );
    
        // Save and clean up
        await ext.storage.sync.set({ [newKey]: newData });
        await ext.storage.sync.remove(oldKey);
    
        //  update your in-memory list
        delete this.AllHermidata[oldKey];
        this.AllHermidata[newKey] = newData;
    
        // update UI
        const titleEl = item.querySelector(".RSS-entries-item-title");
        if (titleEl) titleEl.textContent = newTitle;
        item.className = item.className.replace(oldKey, newKey);
    
        console.log(`[Hermidata] Renamed "${oldData.title}" → "${newTitle}"`);
    }
    
    private async remove(target: HTMLDivElement | null) {
        if (!target) return;
        const item = this.getEntriesItem(target)
        if (!item) {
            console.log('isn\'t a entries item');
            return;
        }
        const hashItem = item.className.split('TitleHash-')[1].replace(' seachable','');
        const toBeRemovedItem = this.AllHermidata[hashItem]
        const confirmation = await customConfirm(`are you sure you want to remove ${toBeRemovedItem.title}`)
        if ( confirmation) {
            console.warn(`Removing item ${Object.values(toBeRemovedItem)}`)
            removeKeysFromSync(hashItem)
        }
    }
    
    private async unsubscribe(target: HTMLDivElement | null) {
        if (!target) return;
        console.log("Unsubscribed from", target);
        const item = this.getNotificationItem(target);
        if (!item) {
            console.log('isn\'t a notification item');
            return;
        }
        const hashItem = item.className.split('TitleHash-')[1].replace(' seachable','');
        
        const NotificationSection = getElement("#RSS-Notification")
        const AllItemSection = getElement("#All-RSS-entries")

        if (!NotificationSection || !AllItemSection) throw new Error('Element not found');

        await this.unLinkRSSFeed({hash:hashItem });
        console.log('un-link RSS to extention')
        this.reloadContent(NotificationSection, AllItemSection)
        console.log('reloading notification')
    }
    private async unLinkRSSFeed({hash, title = '', type = '', }: { hash?: string; title?: string; type?: string; }) {
        const key = hash || returnHashedTitle(title, type);
        const stored = await getHermidataViaKey(key);
        const entry = stored
        if (!entry) return;

        entry.rss = null;

        await ext.storage.sync.set({ [key]: entry });
    }
    private getEntriesItem(el: HTMLElement | null): HTMLElement | undefined {
        if (!el) return undefined
    
        if (el.parentElement?.id === 'All-RSS-entries' &&  el.className?.split(' ')[0] === 'RSS-entries-item' ) return el
    
        return this.getEntriesItem(el.parentElement)
    }
    private getNotificationItem(el: HTMLElement | null): HTMLElement | undefined {
        if (!el) return undefined
    
        if (el.parentElement?.id === 'RSS-Notification' &&  el.className?.split(' ')[0] === 'RSS-Notification-item' ) return el
    
        return this.getNotificationItem(el.parentElement)
    }
}
