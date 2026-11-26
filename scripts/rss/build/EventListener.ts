import { customConfirm, customPrompt } from "../../popup/frontend/confirm";
import { ext } from "../../shared/utils/BrowserCompat";
import { getMultipleTitles, openLink, generateHermidataHash, getFreeKey, TrimTitle } from "../../shared/utils/StringOutput";
import type { Hermidata, MenuOptions, subMenu } from "../../shared/types/index";
import { saveHermidata, updateHermidata, removeHermidata, getSettings, setSettings } from "../../shared/db/Storage";
import { isMangaUpdatesFeedUrl } from "../../shared/lookup/mangaUpdatesFeeds";
import { makeButtonLike } from "../../shared/utils/Accessibility";
import { getElement } from "../../shared/utils/Selection";
import { RssBuild } from "../build";
import { clearNotifications, getHermidataWithRssFromBackground } from "../load";
import { refreshNotificationSection } from "./feed";
import { HermidataModel } from "../../shared/utils/HermidataSelector";
import type { PickedElementData } from "../../shared/types/rss";

/** Smallest gap kept between a context menu and the viewport edge, in px */
const MENU_EDGE_MARGIN = 8;

export class EventListener extends RssBuild {
    
    private activeSubMenu: HTMLDivElement | null = null;

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
        return `${hermidata.title}, ${linked}. Open the latest chapter, or press the context menu key for more actions`;
    }
    private async clickOnItem(value: Hermidata, isNotificationItem: boolean, element: HTMLDivElement | null = null) {
        if (getElement('.feed-header-symbol')?.dataset.feedState === 'up' && isNotificationItem) return;

        const hermidata = new HermidataModel(value);

        await this.clearIfNotification(element);
        await openLink(hermidata.GetLatestRssFeed()?.latestItem?.link ?? hermidata.GetUrl(), 'newTab', hermidata.GetScrollPosition());
    }
    private async rightMouseClickOnItem(e: MouseEvent, isNotificationItem: boolean, isRSSItem: boolean) {
        e.preventDefault(); // stop the browser’s default context menu
        if (getElement('.feed-header-symbol')?.dataset.feedState === 'up' && isNotificationItem) return;

        // Remove any existing custom menu first
        document.querySelectorAll(".custom-context-menu").forEach(el => el.remove());

        // Create the menu container
        // Create the menu container
        const menu = document.createElement("div");
        menu.className = "custom-context-menu";
        menu.setAttribute("role", "menu");
        menu.setAttribute("aria-label", "Item actions");
        const returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const closeMenu = () => {
            menu.remove();
            if (returnFocusTo?.isConnected) returnFocusTo.focus();
        };

        // Define your menu options
        const optionsNotification: MenuOptions[] = [
            { label: "Copy title", action: () => this.copyTitle(e.target as HTMLDivElement) },
            { label: "Open latest marker in this tab", action: () => this.openInPage(e.target as HTMLDivElement) },
            { label: "Open latest marker in new tab", action: () => this.openInNewTab(e.target as HTMLDivElement) },
            { label: "Open latest marker in new window", action: () => this.openInNewWindow(e.target as HTMLDivElement) },
            "separator",
            { label: "Open marker in this tab", options: this.setAllBookmarksMenuOptions(e.target as HTMLDivElement, "InPage" ) },
            { label: "Open marker in new tab", options: this.setAllBookmarksMenuOptions(e.target as HTMLDivElement, "InNewTab") },
            { label: "Open marker in new window", options: this.setAllBookmarksMenuOptions(e.target as HTMLDivElement, "InNewWindow") },
            "separator",
            { label: "Clear notification", action: () => this.clearNotification(e.target as HTMLDivElement) },
            "separator",
            { label: "Unsubscribe", action: () => this.unsubscribe(e.target as HTMLDivElement), danger: true },
        ];
        const optionalMenuOption: MenuOptions[] = isRSSItem ? [
            "separator",
            { label: "Unsubscribe", action: () => this.unsubscribe(e.target as HTMLDivElement), danger: true },
        ] : [];

        const optionsAllItems: MenuOptions[] = [
            { label: "Copy title", action: () => this.copyTitle(e.target as HTMLDivElement) },
            { label: "Open latest marker in this tab", action: () => this.openInPage(e.target as HTMLDivElement) },
            { label: "Open latest marker in new tab", action: () => this.openInNewTab(e.target as HTMLDivElement) },
            { label: "Open latest marker in new window", action: () => this.openInNewWindow(e.target as HTMLDivElement) },
            "separator",
            { label: "Open marker in this tab", options: this.setAllBookmarksMenuOptions(e.target as HTMLDivElement, "InPage" ) },
            { label: "Open marker in new tab", options: this.setAllBookmarksMenuOptions(e.target as HTMLDivElement, "InNewTab") },
            { label: "Open marker in new window", options: this.setAllBookmarksMenuOptions(e.target as HTMLDivElement, "InNewWindow") },
            "separator",
            { label: "pick element(s) to add as alt title", action: async () => await this.pickElement(e.target as HTMLDivElement) },
            { label: "add alt title", action: async () => await this.addAltTitle(e.target as HTMLDivElement) },
            { label: "Rename", action: async () => await this.RenameItem(e.target as HTMLDivElement) },
            ...optionalMenuOption,
            "separator",
            { label: "delete", action: async () => await this.remove(e.target as HTMLDivElement), danger: true },
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
                subMenu.setAttribute("role", "menuitem");
                subMenu.setAttribute("tabindex", "-1");
                subMenu.setAttribute("aria-haspopup", "menu");
                subMenu.setAttribute("aria-expanded", "false");
                subMenuContainer.setAttribute("role", "none");
                
                const subMenuContainerContextMenu = this.createSubMenu(menu, opt.options);
                let isAllowedToExit = true;

                const closeSubMenu = () => {
                    subMenu.setAttribute("aria-expanded", "false");
                    subMenuContainerContextMenu.style.display = "none";
                    if (this.activeSubMenu === subMenuContainerContextMenu) this.activeSubMenu = null;
                };

                const openSubMenu = () => {
                    // Close whatever sibling submenu is currently open, if it's a different one
                    if (this.activeSubMenu && this.activeSubMenu !== subMenuContainerContextMenu) this.activeSubMenu.style.display = "none";

                    this.activeSubMenu = subMenuContainerContextMenu;
                    subMenu.setAttribute("aria-expanded", "true");
                    isAllowedToExit = false;
                    this.setSubMenuPosition(subMenu, subMenuContainerContextMenu, menu);
                    subMenuContainerContextMenu.style.display = "block";
                };

                
                subMenu.addEventListener("mouseover", () => {
                    openSubMenu();
                });
                subMenu.addEventListener("keydown", (event) => {
                    if (event.key !== "ArrowRight" && event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    event.stopPropagation();
                    openSubMenu();
                    subMenuContainerContextMenu.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
                });
                subMenuContainerContextMenu.addEventListener("keydown", (event) => {
                    if (event.key !== "ArrowLeft" && event.key !== "Escape") return;
                    event.preventDefault();
                    event.stopPropagation();
                    closeSubMenu();
                    subMenu.focus();
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
            itemContainer.setAttribute("role", "none");

            const item = document.createElement("div");
            item.className = "menu-item";
            item.setAttribute("role", "menuitem");
            item.setAttribute("tabindex", "-1");
            item.dataset.danger = opt.danger === true ? "true" : "false";
            item.textContent = opt.label;
            item.addEventListener("click", () => {
            opt.action();
            closeMenu();
            });
            itemContainer.appendChild(item);
            menu.appendChild(itemContainer);
        }

        document.body.appendChild(menu);

        this.calculateMenuPosition(menu, e);

        // keyboard: arrows move through the items, Escape closes and gives the focus back
        const topLevelItems = () => Array.from(menu.querySelectorAll<HTMLElement>(':scope > .context-menu-item-container > [role="menuitem"]'));
        menu.addEventListener("keydown", (event) => {
            const items = topLevelItems();
            const current = items.indexOf(document.activeElement as HTMLElement);
            if (event.key === "ArrowDown") items[(current + 1) % items.length]?.focus();
            else if (event.key === "ArrowUp") items[(current - 1 + items.length) % items.length]?.focus();
            else if (event.key === "Home") items[0]?.focus();
            else if (event.key === "End") items.at(-1)?.focus();
            else if (event.key === "Escape") closeMenu();
            else if (event.key === "Enter" || event.key === " ") (document.activeElement as HTMLElement | null)?.click();
            else return;
            event.preventDefault();
        });
        topLevelItems()[0]?.focus();

        // Remove when clicking elsewhere
        document.addEventListener("click", () => { menu.remove(); }, { once: true });
    }
    private setSubMenuDirection(subMenu: HTMLDivElement, menu: HTMLDivElement, subMenuContainer: HTMLDivElement) {

        const { rightSpace } = this.getSubMenuPosition(menu, subMenuContainer);

        const enoughSpaceRight = (Number(rightSpace) >= Number(subMenu.offsetWidth));

        const isRight = enoughSpaceRight ? "right" : "left";

        const subMenuDirectionDiv = document.createElement("span");
        subMenuDirectionDiv.className = "sub-menu-direction";
        subMenuDirectionDiv.setAttribute("aria-hidden", "true");

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

        const top = this.placeAlongAxis(e.clientY, menuHeight, viewportHeight);
        const left = this.placeAlongAxis(e.clientX, menuWidth, viewportWidth);

        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;
    }
    /** Start of a box of `size` opened at `cursor`: below/after the cursor, flipped before it, or pinned inside the viewport edge */
    private placeAlongAxis(cursor: number, size: number, viewportSize: number): number {
        if (cursor + size <= viewportSize - MENU_EDGE_MARGIN) return cursor;
        if (cursor - size >= MENU_EDGE_MARGIN) return cursor - size;
        return Math.max(MENU_EDGE_MARGIN, viewportSize - size - MENU_EDGE_MARGIN);
    }
    private setSubMenuPosition(subMenuContainer: HTMLDivElement, subMenu: HTMLDivElement, menu: HTMLDivElement) {
        // calculate if enough space right
        // if not place it to the left
        subMenu.style.display = "block";

        const { rightSpace, topSpace } = this.getSubMenuPosition(menu, subMenuContainer);

        const enoughSpaceRight = (Number(rightSpace) >= Number(subMenu.offsetWidth));
        
        // keep the submenu inside the viewport vertically, shifting it up when it would run off the bottom
        const menuTop = menu.getBoundingClientRect().top;
        const maxTop = window.innerHeight - MENU_EDGE_MARGIN - subMenu.offsetHeight - menuTop;
        subMenu.style.top = `${Math.max(MENU_EDGE_MARGIN - menuTop, Math.min(topSpace, maxTop))}px`;

        const isRight = enoughSpaceRight ? "right" : "left";

        subMenu.style[isRight] = "-50%";

        // subMenu.style.top = `${topSpace}px`;
    }
    private getSubMenuPosition(menu: HTMLDivElement, subMenuContainer: HTMLDivElement) {
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
        subMenuContainer.setAttribute("role", "menu");
        for (const opt of options) {
            const item = document.createElement("div");
            item.classList.add("menu-item", "sub-menu-item");
            item.textContent = opt.label;
            item.setAttribute("role", "menuitem");
            item.setAttribute("tabindex", "-1");
            item.addEventListener("click", () => {
                opt.action();
                menu.remove();
            });
            subMenuContainer.appendChild(item);
        }
        menu.appendChild(subMenuContainer);
        return subMenuContainer;
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
    private setAllBookmarksMenuOptions(target: HTMLDivElement | null, pageTypeOpener: "InPage" | "InNewWindow" | "InNewTab"): subMenu["options"] {
        const entry = this.getEntryFromTarget(target);
        if (!entry || !target) return [];

        const bookmarkMenu: subMenu["options"] = [];

        for (const value of Object.values(entry.chapter.bookmarks)) {
            bookmarkMenu.push({ label: value.label, action: () => {
                if (pageTypeOpener == 'InPage') this.openInPage(target, value.id)
                else if (pageTypeOpener == 'InNewWindow') this.openInNewWindow(target, value.id)
                else this.openInNewTab(target, value.id)
            }});
        }
        return bookmarkMenu
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
    
    private async openInPage(target: HTMLDivElement | null, id: string | null = null) {
        if (!target) return;
        const item = this.getEntriesItem(target) || this.getNotificationItem(target);
        if (!item || !target) return;
        const hashItem = this.GetHashItem(item);
        const entry = new HermidataModel(this.AllHermidata[hashItem]);
        if (!entry) {
            console.warn("Entry not found for hash:", hashItem);
            return;
        }
        const currentUrl = id ? entry.GetUrl(id) : entry.GetUrl();
        const currentScrollPosition = id ? entry.GetScrollPosition(id) : entry.GetScrollPosition();
        if (!currentUrl || !this.isNumber(currentScrollPosition)) return; 
        
        await this.clearIfNotification(target);
        await openLink(currentUrl, 'sameTab', currentScrollPosition);
    }

    private async openInNewTab(target: HTMLDivElement | null, id: string | null = null) {
        if (!target) return;
        const item = this.getEntriesItem(target) || this.getNotificationItem(target);
        if (!item || !target) return;
        const hashItem = this.GetHashItem(item);
        const entry = new HermidataModel(this.AllHermidata[hashItem]);
        if (!entry) {
            console.warn("Entry not found for hash:", hashItem);
            return;
        }
        const currentUrl = id ? entry.GetUrl(id) : entry.GetUrl();
        const currentScrollPosition = id ? entry.GetScrollPosition(id) : entry.GetScrollPosition();
        if (!currentUrl || !this.isNumber(currentScrollPosition)) return; 
        
        await this.clearIfNotification(target);
        await openLink(currentUrl, 'newTab', currentScrollPosition);
    }
    
    private async openInNewWindow(target: HTMLDivElement | null, id: string | null = null) {
        if (!target) return;
        const item = this.getEntriesItem(target) || this.getNotificationItem(target);
        if (!item || !target) return;
        const hashItem = this.GetHashItem(item);
        const entry = new HermidataModel(this.AllHermidata[hashItem]);
        if (!entry) {
            console.warn("Entry not found for hash:", hashItem);
            return;
        }
        const currentUrl = id ? entry.GetUrl(id) : entry.GetUrl();
        const currentScrollPosition = id ? entry.GetScrollPosition(id) : entry.GetScrollPosition();
        if (!currentUrl || !this.isNumber(currentScrollPosition)) return; 
        
        await this.clearIfNotification(target);
        await openLink(currentUrl, 'newWindow', currentScrollPosition);
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
        await saveHermidata(hashItem, entry.toJSON());
    
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
    
        // Save and clean up ( same key: a plain save, since a re-key deletes the old key after writing the new one )
        if (newKey === oldKey) await saveHermidata(oldKey, newData.toJSON());
        else await updateHermidata(oldKey, newKey, newData.toJSON());
    
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
            removeHermidata(hashItem)
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

        await saveHermidata(entry.id, entry.toJSON());
        if (mangaUpdatesFeed) await this.keepUnlinked(entry.id, mangaUpdatesFeed.id);
    }
    /** Without this the next feed check would link the MangaUpdates feed again */
    private async keepUnlinked(itemId: string, feedId: string) {
        const settings = await getSettings();
        const autoSubscribe = settings.ExtensionBehaviour.AutoSubscribe;
        autoSubscribe.HermidataNotLinkedToRSS = { ...autoSubscribe.HermidataNotLinkedToRSS, [itemId]: feedId };
        await setSettings(settings);
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
