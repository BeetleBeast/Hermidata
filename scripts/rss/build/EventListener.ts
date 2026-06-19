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
    
    private activeSubMenu: HTMLDivElement | null = null;

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
        // Create the menu container
        const menu = document.createElement("div");
        menu.className = "custom-context-menu";

        // Define your menu options
        const optionsNotification: MenuOptions[] = [
            { label: "Copy title", action: () => this.copyTitle(e.target as HTMLDivElement) },
            { label: "Open latest bookmark in page", action: () => this.openInPage(e.target as HTMLDivElement) },
            { label: "Open latest bookmark in new window", action: () => this.openInNewWindow(e.target as HTMLDivElement) },
            "separator",
            { label: "Open bookmark in page", options: this.setAllBookmarksMenuOptions(e.target as HTMLDivElement, "InPage" ) },
            { label: "Open bookmark in new window", options: this.setAllBookmarksMenuOptions(e.target as HTMLDivElement, "InNewWindow") },
            "separator",
            { label: "Clear notification", action: () => this.clearNotification(e.target as HTMLDivElement) },
            "separator",
            { label: "Unsubscribe", action: () => this.unsubscribe(e.target as HTMLDivElement) },
        ];
        const optionsAllItems: MenuOptions[] = [
            { label: "Copy title", action: () => this.copyTitle(e.target as HTMLDivElement) },
            { label: "Open latest bookmark in page", action: () => this.openInPage(e.target as HTMLDivElement) },
            { label: "Open latest bookmark in new window", action: () => this.openInNewWindow(e.target as HTMLDivElement) },
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

        this.activeSubMenu = null;

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
                subMenuContainer.className = "context-menu-item-container";

                const subMenu = document.createElement("div");
                subMenu.className = "menu-item";
                subMenu.textContent = opt.label;
                
                const subMenuContainerContextMenu = this.createSubMenu(menu, opt.options);
                let isAllowedToExit = true;

                const closeSubMenu = () => {
                    subMenuContainerContextMenu.style.display = "none";
                    if (this.activeSubMenu === subMenuContainerContextMenu) this.activeSubMenu = null;
                };

                const openSubMenu = () => {
                    // Close whatever sibling submenu is currently open, if it's a different one
                    if (this.activeSubMenu && this.activeSubMenu !== subMenuContainerContextMenu) this.activeSubMenu.style.display = "none";

                    this.activeSubMenu = subMenuContainerContextMenu;
                    isAllowedToExit = false;
                    this.setSubMenuPosition(subMenu, subMenuContainerContextMenu, menu);
                    subMenuContainerContextMenu.style.display = "block";
                };

                
                subMenu.addEventListener("mouseover", () => {
                    openSubMenu();
                });

                subMenu.addEventListener("mouseout", () => {
                    isAllowedToExit = true;
                    setTimeout(() => {
                        if (isAllowedToExit) closeSubMenu();
                    }, 150);
                });

                subMenuContainerContextMenu.addEventListener("mouseover", () => {
                    isAllowedToExit = false;
                });

                subMenuContainerContextMenu.addEventListener("mouseleave", () => {
                    isAllowedToExit = true;
                    setTimeout(() => {
                        if (isAllowedToExit) closeSubMenu();
                    }, 150);
                });

                this.setSubMenuDirection(subMenu, menu, subMenuContainerContextMenu);
                
                subMenuContainer.appendChild(subMenu);
                menu.appendChild(subMenuContainer);

                
                continue;
            }
            const itemContainer = document.createElement('span');
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

        this.calculateMenuPosition(menu, e);

        // Remove when clicking elsewhere
        document.addEventListener("click", () => { menu.remove(); }, { once: true });
    }
    private setSubMenuDirection(subMenu: HTMLDivElement, menu: HTMLDivElement, subMenuContainer: HTMLDivElement) {

        const { rightSpace } = this.getSubMenuPostion(menu, subMenuContainer);

        const enoughSpaceRight = (Number(rightSpace) >= Number(subMenu.offsetWidth));

        const isRight = enoughSpaceRight ? "right" : "left";

        const subMenuDirectionDiv = document.createElement("span");
        subMenuDirectionDiv.className = "sub-menu-direction";

        subMenuDirectionDiv.textContent = isRight ? ">" : "<";
        subMenuDirectionDiv.style.right = isRight ? "0%" : "90%";

        subMenuDirectionDiv.style.paddingRight = '10px';
        subMenuDirectionDiv.style.paddingLeft = '10px';
        subMenuDirectionDiv.style.cursor = "pointer";
        subMenuDirectionDiv.style.position = "absolute";

        subMenu.appendChild(subMenuDirectionDiv);
    }
    private calculateMenuPosition(menu: HTMLDivElement, e: MouseEvent) {
        const menuRect = menu.getBoundingClientRect();
        const menuWidth = menuRect.width;
        const menuHeight = menuRect.height;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Vertical positioning
        let top = e.clientY;
        if (e.clientY + menuHeight > viewportHeight) {
            top = e.clientY- (menuHeight / 2);
            
            if (top < 0) top = e.clientY - menuHeight;
            if (top < 0) top = 0 + menuHeight;
            if (top < 0) top = viewportHeight - menuHeight - 10; // clamp if menu is taller than viewport
        }

        // Horizontal positioning (same idea, for completeness)
        let left = e.clientX;
        if (e.clientX + menuWidth > viewportWidth) {
            left = e.clientX - menuWidth;
            if (left < 0) left = viewportWidth - menuWidth - 10;
        }

        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;
    }
    private setSubMenuPosition(subMenuContainer: HTMLDivElement, subMenu: HTMLDivElement, menu: HTMLDivElement) {
        // calcualte if enaught space right
        // if not place it to the left
        subMenu.style.display = "block";

        const { rightSpace, topSpace } = this.getSubMenuPostion(menu, subMenuContainer);

        const enoughSpaceRight = (Number(rightSpace) >= Number(subMenu.offsetWidth));
        
        subMenu.style.top = `${topSpace}px`;

        const isRight = enoughSpaceRight ? "right" : "left";

        subMenu.style[isRight] = "-50%";

        // subMenu.style.top = `${topSpace}px`;
    }
    private getSubMenuPostion(menu: HTMLDivElement, subMenuContainer: HTMLDivElement) {
        const rectMenu = menu.getBoundingClientRect();

        const rect = subMenuContainer.getBoundingClientRect();
        const rightSpace = window.innerWidth - rect.right;
        const leftSpace = rect.left;
        const topSpace = rect.top - rectMenu.top;
        const bottomSpace = window.innerHeight - rect.bottom;

        return { rightSpace, leftSpace, topSpace, bottomSpace };
    }
    private createSubMenu(menu: HTMLDivElement, options: subMenu["options"]) {
        const subMenuContainer = document.createElement("div");
        subMenuContainer.classList.add(`sub-menu-container`, `sub-menu-${menu.id}`);
        for (const opt of options) {
            const item = document.createElement("div");
            item.classList.add("menu-item", "sub-menu-item");
            item.textContent = opt.label;
            item.addEventListener("click", () => {
                opt.action();
                menu.remove();
            });
            subMenuContainer.appendChild(item);
        }
        menu.appendChild(subMenuContainer);
        return subMenuContainer;
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
