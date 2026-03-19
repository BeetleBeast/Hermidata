import { ext } from "../shared/BrowserCompat";
import { novelStatus, novelTypes, readStatus, 
    type AllHermidata, type Hermidata, type HermidataDateType, type HermidataSortType, 
    type NovelType, type ReadStatus } from "../shared/types/type";
import { getElement, setElement } from "../utils/Selection";
import { linkRSSFeed, loadSavedFeeds, loadSavedFeedsViaSavedFeeds } from "./load";
import { findByTitleOrAltV2, getChapterFromTitleReturn, returnHashedTitle, TrimTitle } from "../shared/StringOutput";
import { getAllHermidata, getHermidataViaKey, getLocalNotificationItem, removeKeysFromSync, getSettings } from "../shared/types/Storage";
import { PastHermidata } from "../popup/core/Past";
import { AllSorts, type AllsortsType, type MenuOption } from "../shared/types/rssBuildType";
import { customConfirm, customPrompt } from "../popup/frontend/confirm";

export type Filters = {
    include: Record<string, string[]>; // { type: ['Manga'], status: ['Ongoing'] }
    exclude: Record<string, string[]>;
    sort: string;
}

export class BuildRSS {
    private readonly hermidata: Hermidata;

    private AllHermidata: AllHermidata;

    private selectedIndex = -1;


    constructor(hermidata: Hermidata) {
        this.hermidata = hermidata;
        this.AllHermidata = PastHermidata.AllHermidata ?? {};
    }
    public async init() {
        this.AllHermidata = PastHermidata.AllHermidata ?? await getAllHermidata();
    }


    public makeFooterSection(): void {
        
        // clear notification
        const clearNotification = getElement("#clear-notifications");
        if (!clearNotification) throw new Error('Element not found');
        clearNotification.addEventListener('click', () => {
            const rssNotificationContainer = getElement("#RSS-Notification");
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


    public async makeSubscibeBtn() {
        const feedListGLobal = await loadSavedFeedsViaSavedFeeds();
        const subscribeBtn = document.querySelector("#subscribeBtn") as HTMLButtonElement;
        const NotificationSection = getElement("#RSS-Notification");
        const AllItemSection = getElement("#All-RSS-entries");

        if (!subscribeBtn || !NotificationSection || !AllItemSection) throw new Error('Element not found');

        subscribeBtn.className = "Btn";
        subscribeBtn.textContent = "Subscribe to RSS Feed";
        subscribeBtn.disabled = true;
        subscribeBtn.title = "this site doesn't have a RSS link";
        subscribeBtn.ariaLabel = "this site doesn't have a RSS link";

        let feedItemTitle;
        const currentTitle = getElement<HTMLInputElement>("#title_HDRSS")?.value || this.hermidata.title;

        Object.values(feedListGLobal).forEach(feed => {
            feedItemTitle = TrimTitle.trimTitle(feed?.items?.[0]?.title || feed.title, feed.url).title
            if (currentTitle == feedItemTitle) {
                subscribeBtn.disabled = false
                subscribeBtn.title = "subscribe to recieve notifications"
                subscribeBtn.ariaLabel = "subscribe to recieve notifications"
                console.log("current page is a feed page \n", currentTitle)
            }
        });
        subscribeBtn.onclick = () => {
            Object.values(feedListGLobal).forEach(feed => {
                feedItemTitle = TrimTitle.trimTitle(feed?.items?.[0]?.title || feed.title, feed.url).title
                if (currentTitle == feedItemTitle) {
                    const currentType = getElement<HTMLInputElement>("#Type_HDRSS")?.value as NovelType || this.hermidata.type;
                    linkRSSFeed(feedItemTitle, currentType, this.hermidata.url,  feed);
                    this.reloadContent(NotificationSection, AllItemSection)
                    console.log('linked RSS to extention')
                }
            });
        }
    }

    public makeSortSection(sortSection: HTMLElement) {
        // makeSortHeader(sortSection);
        this.makeSortOptions(sortSection);
        this.sortOptionLogic(sortSection);
    }

    public makeFeedHeader(parent_section: HTMLElement) {
        if (getElement('.containerHeader-feed')) return
        const lastDirection = JSON.parse(localStorage.getItem('notificationLastDirection') ?? '"down"');
        const container = document.createElement('div');
        container.className = 'containerHeader-feed'
        container.style.cursor = 'pointer';
        const title = document.createElement('div');
        title.className = "titleHeader";
        title.textContent = 'Notifications'
        container.appendChild(title);
        const feedHeadersymbol = document.createElement('div');
            feedHeadersymbol.className = 'feed-header-symbol';
            feedHeadersymbol.dataset.feedState = lastDirection;
        container.addEventListener('click', () => {
                feedHeadersymbol.dataset.feedState = feedHeadersymbol.dataset.feedState === 'down' ? 'up' : 'down';
                localStorage.setItem('notificationLastDirection', JSON.stringify(feedHeadersymbol.dataset.feedState));
            });
        title.appendChild(feedHeadersymbol);

        parent_section.appendChild(container)
    }
    public makeItemHeader(): Node {
        const containerAlreadyExist = getElement('.containerHeader-item')
        if (containerAlreadyExist) return containerAlreadyExist;

        const container = document.createElement('div');
        container.className = 'containerHeader-item'
        const title = document.createElement('div');
        title.className = "titleHeader";
        title.textContent = 'All saved items'
        container.appendChild(title);
        return container
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

    private removeAllChildNodes(parent: HTMLElement) {
        while (parent.firstChild) parent.lastChild!.remove();
    }

    private async reloadContent(NotificationSection: HTMLElement,AllItemSection: HTMLElement) {
        this.removeAllChildNodes(NotificationSection) // clear front-end
        this.removeAllChildNodes(AllItemSection) // clear front-end

        this.makeFeedHeader(NotificationSection)

        const feedListLocalReload = await loadSavedFeeds();
        NotificationSection.appendChild(await this.makefeedItem(feedListLocalReload, false));
        AllItemSection.appendChild(this.makeItemHeader());
        AllItemSection.appendChild(await this.makefeedItem(feedListLocalReload, true));
    }

    private setupSearchBar(e_: KeyboardEvent, suggestionBox: HTMLDivElement) {
        const searchInput = getElement<HTMLInputElement>('.search-input');

        if (!searchInput) throw new Error('Element not found');

        const items = suggestionBox.querySelectorAll<HTMLDivElement>('.autocomplete-item');
        if (!items.length) return;

        if (e_.key === 'ArrowDown') {
            e_.preventDefault();
            this.selectedIndex = (this.selectedIndex + 1) % items.length;
            this.updateHighlightedSuggestion(items, this.selectedIndex);
        } else if (e_.key === 'ArrowUp') {
            e_.preventDefault();
            this.selectedIndex = (this.selectedIndex - 1 + items.length) % items.length;
            this.updateHighlightedSuggestion(items, this.selectedIndex);
        } else if (e_.key === 'Enter') {
            e_.preventDefault();
            if (this.selectedIndex >= 0 && items[this.selectedIndex]) {
                // use selected suggestion
                const chosen = items[this.selectedIndex].textContent;
                this.applySearchSelection(searchInput, suggestionBox, chosen);
            } else if (items.length > 0) {
                // autocomplete to first suggestion
                const chosen = items[0].textContent;
                this.applySearchSelection(searchInput, suggestionBox, chosen);
            }
        }

        // Hide autocomplete when clicking elsewhere
        document.addEventListener('click', (e) => {
            const target = e.target as HTMLInputElement;
            if (target !== searchInput && !suggestionBox.contains(target)) {
                suggestionBox.innerHTML = '';
            }
        });
    }
    private handleSearchInput(e: KeyboardEvent | Event, suggestionBox: HTMLDivElement) {
        const target = e.target as HTMLInputElement;
        const query = target.value.trim().toLowerCase();
        suggestionBox.innerHTML = '';

        if (!query) {
            this.filterEntries('');
            return;
        }

        const filtered = Object.values(this.AllHermidata).filter(item =>
            [item.title, ...(item.meta?.altTitles || [])]
            .some(t => t.toLowerCase().includes(query))
        );

        this.filterEntries(query, filtered);

        // Autocomplete suggestions
        const suggestions = filtered
            .map(f => f.title)
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .slice(0, 7);

        // Build suggestion elements
        suggestions.forEach((s, idx) => {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.textContent = s;
            div.addEventListener('click', () => {
                const target = e.target as HTMLInputElement;
            this.applySearchSelection(target, suggestionBox, s);
            });
            suggestionBox.appendChild(div);
        });
    }
    private applySearchSelection(input: HTMLInputElement, suggestionBox: HTMLDivElement, value: string) {
        input.value = value;
        this.filterEntries(value);
        suggestionBox.innerHTML = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        suggestionBox.innerHTML = '';
        input.focus();
    }

    private updateHighlightedSuggestion(items: NodeListOf<HTMLDivElement>, selectedIndex: number) {
        items.forEach((el, i) => {
            el.classList.toggle('highlighted', i === selectedIndex);
        });
    }
    private filterEntries(query: string, filtered: Hermidata[] | null = null) {
        const allItems = document.querySelectorAll<HTMLDivElement>('.RSS-entries-item');

        allItems.forEach(item => {
            const titleEl = getElement('.RSS-entries-item-title', item);
            const ItemTitleText = titleEl?.textContent?.toLowerCase() || '';

            const hashItem = item.className.split('TitleHash-')[1].replace(' seachable','');
            const titleText = this.AllHermidata[hashItem]?.title?.toLowerCase() || ItemTitleText;

            const match = ( filtered
            ? filtered.some(f => f.title.toLowerCase() === titleText)
            : !query ) || titleText.includes(query);

            item.style.display = match ? '' : 'none';
            if (match) item.classList.add('seachable')
            else item.classList.remove('seachable');
        });
    }
    private async sortOptionLogic(parent_section: HTMLElement) {
        // state object for filters
        const lastSort = JSON.parse(localStorage.getItem("lastFilter") || "{}");
        const filters: Filters = lastSort || {
            include: {}, // { type: ['Manga'], status: ['Ongoing'] }
            exclude: {},
            sort: ''
        };
    
        // find all custom checkboxes
        const checkboxes = parent_section.querySelectorAll<HTMLInputElement>(".custom-checkbox");
    
        for (const cb of checkboxes) {
            cb.removeEventListener("click", () => this.eventOnClick(cb, filters));
            cb.addEventListener("click", () => this.eventOnClick(cb, filters));
        };
        const makeActiveState = (cb: HTMLInputElement) => {
            const label = cb.nextElementSibling?.textContent?.trim();
            const section = cb.closest(".filter-section")?.firstChild?.textContent?.trim();
            let state = 0;
    
            if (!label || !section) return state;
    
            const includeSelection = filters?.include?.[section] || [];
            const excludeSelection = filters?.exclude?.[section] || [];
            if ( includeSelection.length === 0 && excludeSelection.length === 0 && filters?.sort === undefined) return state;
            
            if ( includeSelection.includes(label) ) state = 1;
            else if ( excludeSelection.includes(label) ) state = 2;
            else if ( filters?.sort === label ) state = 1;
            return state;
        }
        // apply filters from local storage Visually
        for (const cb of checkboxes) {
            cb.dataset.state = String(makeActiveState(cb));
        };
        const hasAnyFilters = (filters: Filters) => {
            return (
                Object.values(filters.include || {}).some(v => v.length > 0) ||
                Object.values(filters.exclude || {}).some(v => v.length > 0) ||
                !!filters.sort
            );
        }
    
        // apply filters from local storage Logically
        setTimeout(() => {
            if (hasAnyFilters(filters)) {
                this.applyFilterToEntries(filters);
                if (filters.sort) {
                    this.applySortToEntries(filters.sort);
                    this.applySortToNotification()
                }
            }
        }, 300);
    
    }
    private eventOnClick(cb: HTMLInputElement, filters: Filters) {
        let state = Number.parseInt(cb.dataset.state || "0");

        // cycle 0→1→2→0
        state = (state + 1 ) % 3;
        cb.dataset.state = state.toString();

        // find its label text (filter name)
        const label = cb.nextElementSibling?.textContent?.trim();
        // find which section it belongs to (Type, Status, etc.)
        const section = cb.closest(".filter-section")?.firstChild?.textContent?.trim();
        if (!label || !section) return;

        if (section === "Sort") {
            // Reset all sort checkboxes first
            filters.sort = ''
            const sortCheckboxes = cb.closest(".filter-section")!.querySelectorAll<HTMLInputElement>(".custom-checkbox");
            sortCheckboxes.forEach(otherCb => otherCb.dataset.state = "0");

            // Enable current one
            if (state === 1) {
                cb.dataset.state = "1" 
                filters.sort = label
            } else if (state === 2) {
                cb.dataset.state = "2";
                filters.sort = `Reverse-${label}`
            }

            // apply and persist
            if (filters.sort) {
                this.applySortToEntries(filters.sort);
                this.applySortToNotification();
            }
            return;
        }

        // init arrays if not exist
        if (!filters.include[section]) filters.include[section] = [];
        if (!filters.exclude[section]) filters.exclude[section] = [];

        // reset previous state
        filters.include[section] = filters.include[section].filter(v => v !== label);
        filters.exclude[section] = filters.exclude[section].filter(v => v !== label);

        // apply new state
        if (state === 1) filters.include[section].push(label);
        else if (state === 2) filters.exclude[section].push(label);
        // trigger filtering logic here
        this.applyFilterToEntries(filters);
        localStorage.setItem("lastFilter", JSON.stringify(filters));
    };
    private applySortToEntries(sortType: string) {
        const container = getElement('#All-RSS-entries');
        if (!container) return;

        // Always sort all entries (even hidden), to keep global order consistent
        const entries = Array.from(container.querySelectorAll<HTMLDivElement>('.RSS-entries-item'));
        if (!entries.length) return;

        const getData = (entry: HTMLDivElement) => {
            const hash = entry.className.split('TitleHash-')[1]?.replace(' seachable','');
            return this.AllHermidata[hash] || {};
        };

        const compareAlphabet = (a: HTMLDivElement, b: HTMLDivElement, reverse = false) => {
            const titleA = getData(a).title?.toLowerCase() || '';
            const titleB = getData(b).title?.toLowerCase() || '';
            return reverse ? titleB.localeCompare(titleA) : titleA.localeCompare(titleB);
        };

        const compareDate = (a: HTMLDivElement, b: HTMLDivElement, key: HermidataDateType, reverse: boolean = false) => {
            const dateA = new Date(getData(a).meta[key] || 0);
            const dateB = new Date(getData(b).meta[key] || 0);
            return reverse ? dateA.getDate() - dateB.getDate() : dateB.getDate() - dateA.getDate();
        };

        // Normalize sort type
        const reverse = sortType.startsWith("Reverse-");
        const baseType = sortType.replace("Reverse-", "");

        switch (baseType) {
            case "Alphabet":
                entries.sort((a, b) => compareAlphabet(a, b, reverse));
                break;
            case "Recently-Added":
                entries.sort((a, b) => compareDate(a, b, "added", reverse));
                break;
            case "Latest-Updates":
                entries.sort((a, b) => compareDate(a, b, "updated", reverse));
                break;
            default:
                return;
        }

        // Force DOM reflow even if order is same
        const frag = document.createDocumentFragment();
        entries.forEach(entry => frag.appendChild(entry));
        container.appendChild(frag);
    }
    private applySortToNotification(sortType = "Latest-Updates") {
        const container = getElement('#RSS-Notification');
        if (!container) return;
        // Always sort all entries (even hidden), to keep global order consistent
        const entries = Array.from(container.querySelectorAll<HTMLDivElement>('.RSS-Notification-item'));
        if (!entries.length) return;

        const getData = (entry: HTMLDivElement) => {
            const hash = entry.className.split('TitleHash-')[1]?.replace(' seachable','');
            return this.AllHermidata[hash] || {};
        };

        const compareDate = (a: HTMLDivElement, b: HTMLDivElement, key: HermidataSortType, reverse = false) => {
            const dateA = new Date(getData(a).rss?.latestItem[key] || 0);
            const dateB = new Date(getData(b).rss?.latestItem[key] || 0);
            return reverse ? dateA.getDate() - dateB.getDate() : dateB.getDate() - dateA.getDate();
        };

        // Normalize sort type
        const reverse = sortType.startsWith("Reverse-");
        const baseType = sortType.replace("Reverse-", "");

        if (baseType === "Latest-Updates") entries.sort((a, b) => compareDate(a, b, "pubDate", reverse));
        // Force DOM reflow even if order is same
        const frag = document.createDocumentFragment();
        entries.forEach(entry => frag.appendChild(entry));
        container.appendChild(frag);
    }
    private getYearNumber(dateInput: string): string {
        const isISOString = !!new Date(dateInput)?.getHours();
        const splitDatum = dateInput.split('/')[2]
        return isISOString ? dateInput.split('-')[0] : splitDatum || new Date()?.toISOString().split('-')[0];


    }
    private applyFilterToEntries(filters: Filters) {
        const entries = document.querySelectorAll<HTMLDivElement>(".RSS-entries-item");

        for (const entry of entries) {
            this.applyInividualFilterToEntries(entry, filters);
        }
    }
    private setState(section: string, input: (NovelType | string | string[] | ReadStatus | number)[] ): string | void {
        for (const type of input) {
            if (section === type) {
                return type
            }
        }
    }
    private matchingFilter(filters: Filters, inputs: (NovelType | string | string[] | ReadStatus | number)[], filterType: 'include' | 'exclude'): boolean {
        const isInclude = filterType === 'include';
        const loopEntries = isInclude ? filters.include : filters.exclude;

        let visible = true;

        for (const [section, values] of Object.entries(loopEntries)) {
            if (values.length === 0) continue;

                    
            const val = this.setState(section, inputs) ?? 'Manga';
            
            const match = Array.isArray(val)
                ? val.some(v => values.includes(v))
                : values.includes(val);

            if (!match) {
                visible = !isInclude;
                break;
            }
        }
        return visible
    }
    private applyInividualFilterToEntries(entry: HTMLDivElement, filters: Filters): void {
        const hashItem = entry.className.split('TitleHash-')[1].replace(' seachable','');
        const entryData = this.AllHermidata[hashItem];
        const Type = entryData.type;
        const Status = entryData.status;
        const Source = entryData.source;
        const Tag = entryData.meta.tags || "";
        const Date = this.getYearNumber(entryData.meta.added);

        const inputs = [Type, Status, Source, Tag, Date];


        let visible = true;

        // Check all include filters — must match at least one in each group
        visible = this.matchingFilter(filters, inputs, 'include');

        // Check exclude filters — hide if matches any
        if (visible) {
            visible = this.matchingFilter(filters, inputs, 'exclude');
        }

        entry.style.display = visible ? "" : "none";
        visible ? entry.classList.add('seachable') : entry.classList.remove('seachable');
    };

    private makeSortOptions(parent_section: HTMLElement) {
        if (getElement('.mainContainerHeader')) return;

        const mainContainer = document.createElement('div');
        mainContainer.className = 'mainContainerHeader';

        // 0. Search bar
        const searchContainer = document.createElement('div');
        searchContainer.className = 'search-container';
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search...';
        searchInput.className = 'search-input';
        
        const autocompleteContainer = document.createElement('div');
        autocompleteContainer.className = 'autocompleteContainer';

        searchInput.addEventListener('input', (e) => this.handleSearchInput(e, autocompleteContainer));
        searchInput.addEventListener('keydown', (e) => this.setupSearchBar(e, autocompleteContainer));

        searchContainer.appendChild(searchInput);
        searchContainer.appendChild(autocompleteContainer);
        mainContainer.appendChild(searchContainer);

        // Helper to create a filter section
        const createFilterSection = (title: string, items: string[], className: string) => {
            const section = document.createElement('div');
            section.className = `filter-section ${className}`;
            section.style.width = 'fit-content';
            const headerContainer = document.createElement('div');
            headerContainer.className = 'filter-header-container';
            headerContainer.style.cursor = 'pointer';

            const headersymbol = document.createElement('div');
            headersymbol.className = 'filter-header-symbol';
            headersymbol.dataset.filterState = 'down';

            const header = document.createElement('h4');
            header.textContent = title;
            header.className = 'filter-header-text'
            
            
            
            const list = document.createElement('div');
            list.className = 'filter-list';
            
            headerContainer.addEventListener('click', () => {
                headersymbol.dataset.filterState = headersymbol.dataset.filterState === 'down' ? 'up' : 'down';
            });
            headerContainer.append(header,headersymbol);
            section.appendChild(headerContainer)

            items.forEach(itemText => {
                const itemContainer = document.createElement('div');
                itemContainer.className = 'filter-item-container';

                // Custom checkbox div
                const checkbox = document.createElement('div');
                checkbox.className = 'custom-checkbox';
                checkbox.dataset.state = '0'; // 0=neutral, 1=include, 2=exclude

                // Label
                const label = document.createElement('label');
                label.textContent = itemText;

                itemContainer.appendChild(checkbox);
                itemContainer.appendChild(label);
                list.appendChild(itemContainer);
            });

            section.appendChild(list);
            return section;
        };
        const filterSection = document.createElement('div');
        filterSection.className = 'filter-section-container';

        const filterSectionTitle = document.createElement('h4');
        filterSectionTitle.className = 'filterSectionTitle';
        filterSectionTitle.classList.add('Btn');
        filterSectionTitle.textContent = "filter";
        filterSectionTitle.dataset.filterDisplay = 'none';
        filterSectionTitle.addEventListener('click', () => {
            filterSectionTitle.dataset.filterDisplay = filterSectionTitle.dataset.filterDisplay === 'none' ? 'flex' : 'none';
        });
        searchContainer.appendChild(filterSectionTitle);
        mainContainer.appendChild(filterSection);

        // 1. Sort
        const Allsorts: AllsortsType[] = AllSorts
        const SortSection = createFilterSection('Sort', Allsorts, 'filter-sort');
        filterSection.appendChild(SortSection);
        // Add click listeners for sort options
        SortSection.querySelectorAll('.filter-item-container').forEach(container => {
            const label = container.querySelector('label')!;
            this.applySortToEntries(localStorage.getItem('lastSort') || 'Alphabet');
            label.addEventListener('click', () => {
                const sortType = label.textContent.trim();
                localStorage.setItem('lastSort', sortType);
                // Apply sorting immediately
                this.applySortToEntries(sortType);
                this.applySortToNotification();
            });
        });


        // 2. Type
        const typeSection = createFilterSection('Type', novelTypes, 'filter-type');
        filterSection.appendChild(typeSection);

        // 3. Status
        const statusSection = createFilterSection('Status', readStatus, 'filter-status');
        filterSection.appendChild(statusSection);

        // 3.5. novels Status filter
        const novelStatusSection = createFilterSection('Novel-Status', novelStatus, 'filter-novel-status');
        filterSection.appendChild(novelStatusSection);

        // 4. Source
        const allSources = Array.from(new Set(Object.values(this.AllHermidata || {}).map(item => item.source).filter(Boolean)));
        const sourceSection = createFilterSection('Source', allSources, 'filter-source');
        filterSection.appendChild(sourceSection);

        // 5. Tags
        const allTags = Array.from(new Set(Object.values(this.AllHermidata || {}).flatMap(item => item.meta?.tags || [])));
        const tagSection = createFilterSection('Tag', allTags, 'filter-tag');
        filterSection.appendChild(tagSection);

        // 6. Dates
        const allDates = this.generateDateFilterSection()
        const dateSection = createFilterSection('Date', allDates, 'filter-date');
        filterSection.appendChild(dateSection);

        parent_section.appendChild(mainContainer);
        const element = ['Type', 'Status', 'Novel-Status', 'Source', 'Tag', 'Date'];
        for (let index = 0; index < element.length; index++) {
            const elFilterClassName = ['filter-type', 'filter-status', 'filter-novel-status', 'filter-source', 'filter-tag', 'filter-date']
            const elFilter = mainContainer.querySelector<HTMLDivElement>(`.${elFilterClassName[index]}`)
            const calcWidth = elFilter?.clientWidth || '';
            if (calcWidth && elFilter) elFilter.style.minWidth = `${calcWidth}px`;
            else console.log('mimnimum width not added for: ',elFilter,'\n', 'calcWidth is: ',calcWidth)
        }
        setElement('.autocompleteContainer', el => el.style.width = `${  getElement('.search-input')?.offsetWidth}px`);
        const lastSort = localStorage.getItem("lastSort");
        if (lastSort) { 
            this.applySortToEntries(lastSort);
            this.applySortToNotification();
        }
    }
    private betweenRange(min: number, max: number, value: number) {
        return value >= min && value <= max;
    }
    /**
     * Converts a date (string, Date, or number) into a decade label bucket.
     * @param {string|Date|number} dateInput
     * @returns {string} decadeLabel
     */
    private getYearBucket(dateInput: string): string {
        if (!dateInput) return "Unknown";
        const year = this.getYearNumber(dateInput)
        if (Number.isNaN(year)) return "Unknown";

        const yearNumber = Number(year);

        const dacade = this.createYearBucket(dateInput) ?? '';

        return dacade;

        if (this.betweenRange(2016, 2020, yearNumber)) return "2020s";
        else if (this.betweenRange(2011, 2015, yearNumber)) return "2015s";
        else if (this.betweenRange(2000, 2010, yearNumber)) return "2010s";
        else if (this.betweenRange(1990, 1999, yearNumber)) return "90s";
        else if (yearNumber <= 1989) return "80s & older";
        else return String(year)
    }
    private createYearBucket(dateInput: string): string | void {
        const year = this.getYearNumber(dateInput)
        if (Number.isNaN(year)) return;

        const dacade = year.at(-1)?.concat('0s');

        return dacade;
    }

    private generateDateFilterSection() {
        const allEntries = Object.values(this.AllHermidata || {});
        const yearBuckets = allEntries.map(entry => {
            const dateStr = entry.meta?.originalRelease || entry.meta?.added || entry.meta?.updated;
            return this.getYearBucket(dateStr);
        });

        const uniqueBuckets = Array.from(new Set(yearBuckets)).filter(Boolean);

        const thisYeay = new Date().getFullYear()
        const everySingleYear = thisYeay - 2020
        const sortOrderOldType = ["2020s", "2015s", "2010s", "90s", "80s & older"];
        const sortOrderEveryYearType = []
        for (let index = 0; index < everySingleYear; index++) {
            sortOrderEveryYearType.push(String(thisYeay - index))
        }
        const sortOrder = sortOrderEveryYearType.concat(sortOrderOldType)
        uniqueBuckets.sort((a, b) => sortOrder.indexOf(a) - sortOrder.indexOf(b));
        // FIXME: remove this later
        return uniqueBuckets;
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

    private async setNotificationList(key: string, value = true): Promise<Record<string, boolean>> {
        return new Promise<Record<string, boolean>>((_resolve, reject) => {
            ext.storage.local.get("clearedNotification", (result: { clearedNotification: Record<string, boolean> }) => {
            const conbined = {...result?.clearedNotification};
            conbined[key] = value;
            ext.storage.local.set({clearedNotification: conbined}, () => {
                if (ext.runtime.lastError) return reject(new Error(ext.runtime.lastError.message));
            });
        });
        }).catch(error => {
            console.error('Extention error: Failed Premise getHermidata: ',error);
            return {};
        });
    }

    public async makefeedItem(hermidataList: Record<string, Hermidata>, isRSSItem = false) {
        // FIXME: make it smaller
        const fragment = document.createDocumentFragment();
        for (const [key, value] of Object.entries(hermidataList)) {

            const title = findByTitleOrAltV2(value.title, this.AllHermidata)?.title || value.title;
            const url = value.rss?.latestItem.link || value.url;

            const useAutoDetectedChapter = getChapterFromTitleReturn(title, value?.title, undefined, url);
            const chapter = value?.chapter?.latest || useAutoDetectedChapter || value?.chapter?.current;

            const currentHermidata =this.AllHermidata?.[key]
            const currentChapter = currentHermidata?.chapter?.current
            const clearedNotification = await getLocalNotificationItem(key);
            const isRead = !isRSSItem && (currentChapter === chapter)

            const settings = await getSettings();
            // removed && ( seachable || (chapter !== currentChapter ))
            if ( !getElement(`.TitleHash-${key}`) && !isRead && !clearedNotification) {
                const li = document.createElement("li");
                li.className = isRSSItem ? "RSS-entries-item" : "RSS-Notification-item";
                li.classList.add("hasRSS", `TitleHash-${key}`, 'seachable');

                const ElImage = document.createElement("img");
                ElImage.className = isRSSItem ? "RSS-entries-item-image" : "RSS-Notification-item-image";
                ElImage.src = value?.rss?.image || 'icons/icon48.png';
                ElImage.sizes = "48x48";
                ElImage.style.width = "48px";
                ElImage.style.height = "48px";
                ElImage.style.objectFit = "contain";
                ElImage.style.borderRadius = "8px";

                ElImage.alt = "Feed Image";
                const ElInfo = document.createElement("div");
                ElInfo.className =  isRSSItem ? "RSS-entries-item-info" : "RSS-Notification-item-info";

                const ElTagContainer = document.createElement("div");
                ElTagContainer.className =  isRSSItem ? "RSS-entries-item-tag-container" : "RSS-Notification-item-tag-container";
                if ( currentHermidata.meta?.tags.length > 0 ) {
                    const tags = currentHermidata.meta?.tags as (string[] | string);
                    const allTags = Array.isArray(tags) ? tags : tags?.split(',');
                    for (let index in allTags) {
                        const tagName = allTags[index]
                        const tagDiv = document.createElement('div');
                        tagDiv.classList = `tag-div tag-div-${tagName}`;
                        tagDiv.textContent = `[${tagName}]`;
                        tagDiv.style.color = settings.tagColoring?.[tagName] || 'white';
                        tagDiv.dataset.TagColor = settings.tagColoring?.[tagName] || 'white';
                        ElTagContainer.append(tagDiv)
                    }
                }

                const chapterText = chapter ? `latest Chapter: ${chapter}` : 'No chapter info';
                const AllItemChapterText = currentChapter == chapter ?  `up-to-date (${chapter})` : `read ${currentChapter} of ${chapter}`;
                const titleV1 = title;
                const titleV2 = TrimTitle.trimTitle(title, url).title;
                const titleV3 = TrimTitle.trimTitle(value?.rss?.latestItem.title || value.title, value?.rss?.latestItem.link || value.url).title;
                const titleText = titleV2;
                const maxTitleCharLangth = 50;
                const titleTextTrunacted = titleText.length > maxTitleCharLangth ? titleText.slice(0, maxTitleCharLangth - 3) + '...' : titleText;

                console.log('Title: ', titleV1, 'Trimmed title V1: ', titleV2, 'What i had before: ', titleV3);
                
                const lastRead = this.AllHermidata[key]?.chapter?.current || null;
                const progress = lastRead ? ((lastRead / chapter) * 100 ).toPrecision(3) : '0';

                const ELTitle = document.createElement("div");
                const ELchapter = document.createElement("div");
                const ELprogress = document.createElement("div");
                
                ELTitle.className = isRSSItem ? "RSS-entries-item-title" : "RSS-Notification-item-title";
                ELchapter.className = isRSSItem ? "RSS-entries-item-chapter" : "RSS-Notification-item-chapter";
                ELprogress.className = isRSSItem ? "RSS-entries-item-progress" : "RSS-Notification-item-progress";
                


                ELTitle.textContent = `${titleTextTrunacted}`;
                ELchapter.textContent = isRSSItem ? `${AllItemChapterText}` : `${chapterText}`;
                ELprogress.textContent = `${progress}%`;


                ElInfo.append(ElImage,ELTitle, ELchapter, ELprogress);


                const Elfooter = document.createElement("div");

                const status = '';
                if ( currentHermidata?.meta?.tags?.length > 0) {
                    const tagDicContainer = document.createElement('div')
                    tagDicContainer.className = "tag-div-container"
                    for (const tag in currentHermidata?.meta?.tags) {
                        const tagDiv = document.createElement('div');
                        tagDiv.textContent = tag;
                        tagDiv.className = 'tag-div';
                        tagDicContainer.appendChild(tagDiv)
                    }
                    Elfooter.appendChild(tagDicContainer)
                }
                Elfooter.className =  isRSSItem ? "RSS-entries-item-footer" :"RSS-Notification-item-footer";
                const domain = value.source || value.url.replace(/^https?:\/\/(www\.)?/,'').split('/')[0]
                Elfooter.textContent = `${domain}`;
                
                // const pubDate = document.createElement("p");
                // pubDate.textContent = `Published: ${feed?.items?.[0]?.pubDate ? new Date(feed.items[0].pubDate).toLocaleString() : 'N/A'}`;
                li.append(ElTagContainer)
                li.appendChild(ElInfo);
                li.appendChild(Elfooter);
                // li.appendChild(pubDate);
                fragment.appendChild(li);
            }
        }
        return fragment

    }
    public async attachEventListeners() {
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
        this.setNotificationList(hashItem)
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
    private async appendAltTitle(newTitle: string, entry: Hermidata): Promise<void> {
        // Normalize and deduplicate
        const trimmed = TrimTitle.trimTitle(newTitle, entry.url).title;
        entry.meta = entry.meta || {};
        entry.meta.altTitles = Array.from(
            new Set([...(entry.meta.altTitles || []), trimmed])
        );
    
        const entryKey = entry.id || returnHashedTitle(entry.title, entry.type);
    
        await ext.storage.sync.set({ [entryKey]: entry });
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
