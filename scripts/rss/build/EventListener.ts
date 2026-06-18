import { customConfirm, customPrompt } from "../../popup/frontend/confirm";
import { ext } from "../../shared/utils/BrowserCompat";
import { returnHashedTitle, TrimTitle } from "../../shared/utils/StringOutput";
import type { MenuOption, Hermidata, MenuOptions, subMenu } from "../../shared/types/index";
import { getHermidataViaKey, saveHermidata, setNotificationList, updateHermidata } from "../../shared/db/Storage";
import { getElement } from "../../shared/utils/Selection";
import { RssBuild } from "../build";
import { getHermidataWithRssFromBackground } from "../load";
import { deleteHermidata } from "../../shared/db/db";
import { getUrlFromCurrentBookmark } from "../../shared/utils/HermidataSelector";

export class EventListener extends RssBuild {
    

    public async attachEventListeners(): Promise<void> {
        // parents
        const notificationFeed = document.querySelectorAll<HTMLDivElement>('.hermidata-item[data-is-notification-item="true"]');
        const allItems = document.querySelectorAll<HTMLDivElement>('.hermidata-item[data-is-notification-item="false"]');

        const feedListLocalReload = await getHermidataWithRssFromBackground();

        for (let feed of notificationFeed) {
            feed.addEventListener('contextmenu', (e) => this.rightmouseclickonItem(e, false));
            const hashItem = this.GetHashItem(feed);
            feed.onclick = () => this.clickOnItem(feedListLocalReload[hashItem], false);
        }
        for (let items of allItems) {
            items.addEventListener('contextmenu', (e) => this.rightmouseclickonItem(e, true));
            const hashItem = this.GetHashItem(items);
            items.onclick = () => this.clickOnItem(this.AllHermidata[hashItem], true);
        }
    }
    private clickOnItem(value: Hermidata, isRSSItem: boolean) {
        if (getElement('.feed-header-symbol')?.dataset.feedState === 'up' && !isRSSItem) return;
        this.openNewTab(value?.rss?.latestItem?.link || getUrlFromCurrentBookmark(value), value.chapter.bookmarks[value.chapter.bookmarkInUse].scrollPosition);
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
        const optionsNotification: MenuOptions[] = [
            { label: "Copy title", action: () => this.copyTitle(e.target as HTMLDivElement) },
            { label: "Open Latest in page", action: () => this.openInPage(e.target as HTMLDivElement) },
            { label: "Open Latest in new window", action: () => this.openInNewWindow(e.target as HTMLDivElement) },
            "separator",
            { label: "Open Bookmark in page", options: this.setAllBookmarksMenuOptions(e.target as HTMLDivElement, "InPage" ) },
            { label: "Open Bookmark in new window", options: this.setAllBookmarksMenuOptions(e.target as HTMLDivElement, "InNewWindow") },
            "separator",
            { label: "Clear notification", action: () => this.clearNotification(e.target as HTMLDivElement) },
            "separator",
            { label: "Unsubscribe", action: () => this.unsubscribe(e.target as HTMLDivElement) },
        ];
        const optionsAllItems: MenuOptions[] = [
            { label: "Copy title", action: () => this.copyTitle(e.target as HTMLDivElement) },
            { label: "Open Latest in page", action: () => this.openInPage(e.target as HTMLDivElement) },
            { label: "Open Latest in new window", action: () => this.openInNewWindow(e.target as HTMLDivElement) },
            "separator",
            { label: "Open Bookmark in page", options: this.setAllBookmarksMenuOptions(e.target as HTMLDivElement, "InPage" ) },
            { label: "Open Bookmark in new window", options: this.setAllBookmarksMenuOptions(e.target as HTMLDivElement, "InNewWindow") },
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
            if ( "options" in opt ) {
                const subMenuContainer = document.createElement("div");
                subMenuContainer.className = "context-sub-menu-label";
                subMenuContainer.textContent = opt.label;

                const subMenu = document.createElement("div");
                subMenu.className = "context-sub-menu";
                menu.appendChild(subMenu);

                subMenuContainer.addEventListener('hover', (e) => {
                    // TODO: make sure this works well
                    this.createSubMenu(subMenu, opt.options)
                })
                
                menu.appendChild(subMenuContainer);
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
    private createSubMenu(menu: HTMLDivElement, options: subMenu["options"]) {
        for (const opt of options) {
            const item = document.createElement("div");
            item.classList.add("menu-item", "sub-menu-item");
            item.textContent = opt.label;
            item.addEventListener("click", () => {
                opt.action();
                menu.remove();
            });
            menu.appendChild(item);
        }
    }
    private getEntrieFromTarget(target: HTMLDivElement | null): Hermidata | undefined {
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
    private setAllBookmarksMenuOptions(target: HTMLDivElement | null, pageTypeOpener: "InPage" | "InNewWindow"): subMenu["options"] {
        const entry = this.getEntrieFromTarget(target);
        if (!entry || !target) return [];

        const bookmarkMenu: subMenu["options"] = [];

        for (const value of Object.values(entry.chapter.bookmarks)) {
            bookmarkMenu.push({ label: value.label, action: () => pageTypeOpener == 'InPage' ?  this.openInPage(target, value.url) : this.openInNewWindow(target, value.url) });
        }
        return bookmarkMenu
    }
    private copyTitle(target: HTMLDivElement | null) {
        const item = this.getEntriesItem(target) || this.getNotificationItem(target);
        if (!item || !target) return;
        const nameClass = 'hermidata-item-title';
        if (item.dataset.seachable == 'true') {
            const title = item.querySelector(`.${nameClass}`)
            if (!title) throw new Error('title not found');
            navigator.clipboard.writeText(title.textContent.trim());
            console.log("Copied:", title.textContent.trim());
        }
    }
    
    private async openInPage(target: HTMLDivElement | null, url: string | null = null) {
        if (!target) return;
        const item = this.getEntriesItem(target) || this.getNotificationItem(target);
        if (!item || !target) return;
        const hashItem = this.GetHashItem(item);
        const entry = this.AllHermidata[hashItem];
        if (!entry) {
            console.warn("Entry not found for hash:", hashItem);
            return;
        }
        const currentUrl = url ?? getUrlFromCurrentBookmark(entry);
        if (!currentUrl) return;
        // Get the current active tab and update its URL
        const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) this.updateTab(tab, currentUrl, entry.chapter.bookmarks[entry.chapter.bookmarkInUse].scrollPosition);
    }
    
    private async openInNewWindow(target: HTMLDivElement | null, url: string | null = null) {
        if (!target) return;
        const item = this.getEntriesItem(target) || this.getNotificationItem(target);
        if (!item || !target) return;
        const hashItem = this.GetHashItem(item);
        const entry = this.AllHermidata[hashItem];
        if (!entry) {
            console.warn("Entry not found for hash:", hashItem);
            return;
        }
        const currentUrl = url ?? getUrlFromCurrentBookmark(entry);
        if (currentUrl) this.openNewTab(currentUrl, entry.chapter.bookmarks[entry.chapter.bookmarkInUse].scrollPosition);
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
        const hashItem = this.GetHashItem(item);
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
        const hashItem = this.GetHashItem(item);
        const entry = this.AllHermidata[hashItem];
        if (!entry) {
            console.warn("Entry not found for hash:", hashItem);
            return;
        }
        const newTitle = await customPrompt("Add alternate:", '');
        if (!newTitle) return;
    
        // Normalize and deduplicate
        const trimmed = TrimTitle.trimTitle(newTitle, getUrlFromCurrentBookmark(entry)).title;
        entry.meta = entry.meta || {};
        entry.meta.altTitles = Array.from(
            new Set([...(entry.meta.altTitles || []), trimmed])
        );
    
        // Save to storage
        await saveHermidata(hashItem, entry);
    
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
        const newKey = returnHashedTitle(newTitle, oldData.novelType, getUrlFromCurrentBookmark(oldData), false);
        const TrimmedTitle = TrimTitle.trimTitle(newTitle, getUrlFromCurrentBookmark(oldData)).title
        const newData = { ...oldData, title: newTitle, id: newKey };
    
        // Add the old title as an altTitle
        if (TrimmedTitle === newTitle) newData.meta.altTitles = Array.from( new Set([...(newData.meta.altTitles || []), TrimmedTitle]) );
        else newData.meta.altTitles = Array.from( new Set([...(newData.meta.altTitles || []), oldData.title, TrimmedTitle]) );
    
        // Save and clean up
        await updateHermidata(oldKey, newKey, newData);
    
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
            deleteHermidata(hashItem)
        }
        await this.reloadContent(getElement<HTMLDivElement>("#RSS-Notification")!, getElement<HTMLDivElement>("#All-RSS-entries")!)
    }
    
    private async unsubscribe(target: HTMLDivElement | null) {
        if (!target) return;
        console.log("Unsubscribed from", target);
        const item = this.getNotificationItem(target);
        if (!item) {
            console.log('isn\'t a notification item');
            return;
        }
        const hashItem = this.GetHashItem(item);
        
        const NotificationSection = getElement<HTMLDivElement>("#RSS-Notification");
        const AllItemSection = getElement<HTMLDivElement>("#All-RSS-entries");

        if (!NotificationSection || !AllItemSection) throw new Error('Element not found');

        await this.unLinkRSSFeed({hash:hashItem });
        console.log('un-link RSS to extention')
        this.reloadContent(NotificationSection, AllItemSection)
        console.log('reloading notification')
        await this.reloadContent(getElement<HTMLDivElement>("#RSS-Notification")!, getElement<HTMLDivElement>("#All-RSS-entries")!)
    }
    private async unLinkRSSFeed({hash, title = '', type = '', }: { hash?: string; title?: string; type?: string; }) {
        const key = hash || returnHashedTitle(title, type);
        const stored = await getHermidataViaKey(key);
        const entry = stored
        if (!entry) return;

        entry.rss = null;

        await saveHermidata(key, entry);
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
