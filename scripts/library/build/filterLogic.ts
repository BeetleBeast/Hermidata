import { getLastLibraryFilters, setLastLibraryFilters, setLastLibrarySortOption } from "../../shared/db/Storage";
import type { Hermidata, Settings } from "../../shared/types";
import { HermidataModel } from "../../shared/utils/HermidataSelector";
import { getElement, setElement } from "../../shared/utils/Selection";
import { Sort, type AllSortsType, type BasicSortsType } from "./filter";



export type Filters = {
    include: Record<string, string[]>; // { type: ['Manga'], status: ['Ongoing'] }
    exclude: Record<string, string[]>;
    sort: AllSortsType;
}
export type FilterName = {
    novelType: string;
    readStatus: string;
    source: string;
    novelStatus: string;
    tags: string[];
    dateFilter: string;
    starRating: number;
    contentRating: string;
}

export class FilterLogic extends Sort {


    private readonly libraryEntriesContainer = document.querySelector<HTMLDivElement>('#filter-container');

    private readonly searchInput = document.querySelector<HTMLInputElement>('#search'); // Hermidata search bar
    private readonly autocompleteContainer = document.querySelector<HTMLDivElement>('#search-suggestions'); // Hermidata search-suggestions

    private get tagsSearchInput(): HTMLInputElement | null { return document.querySelector<HTMLInputElement>('#tag-search-input'); }

    private get AuthorSearchInput(): HTMLInputElement | null { return document.querySelector<HTMLInputElement>('#Author-filter-input'); }

    /** Returns true if tags search mode is set to "all" */
    private get tagsSearchModeIsSetToAll(): boolean { return this.tagSearchMode[1]?.dataset.state === 'true'; }

    private get tagSearchMode(): (HTMLDivElement | null)[] {
        return [document.querySelector<HTMLDivElement>('#search-mode-radio-any'), document.querySelector<HTMLDivElement>('#search-mode-radio-all') ]
    }

    private readonly filterReset = document.querySelector<HTMLButtonElement>('#resetFilters');

    private readonly ChapterCompletionFilter = document.querySelector<HTMLInputElement>('#ChapterCompletion-filter');


    private readonly allSearchableItems = new Set<HTMLDivElement>();

    private selectedIndex: number = -1;


    public build(): void {
        if (!this.libraryEntriesContainer || !this.searchInput || !this.autocompleteContainer) {
            throw new Error('One or more required elements not found');
        }

        this.generalFilterOptionLogic(this.libraryEntriesContainer);

        // on tag search inclusion mode change, update filters
        this.tagSearchMode.forEach(mode => mode?.addEventListener('click', async () => {
            const filters = await getLastLibraryFilters();
            if (!filters) return;
            this.applyFilterToEntries(filters);
        }));

        // Hermidata  bar
        this.searchInput.addEventListener('input', (e) => this.handleSearchInput(e, this.autocompleteContainer!));
        this.searchInput.addEventListener('keydown', (e) => this.setupSearchBar(e, this.autocompleteContainer!, '.autocomplete-item'));
        // tags search bar
        this.tagsSearchInput?.addEventListener('input', (e) => this.handleTagsSearchInput(e));
        // Author search bar
        this.AuthorSearchInput?.addEventListener('input', (e) => this.handleAuthorSearchInput(e));
        this.AuthorSearchInput?.addEventListener('keydown', (e) => this.setupSearchBar(e, this.autocompleteContainer!, '#Author-filter-suggestions'));
        // ChapterCompletionFilter
        this.ChapterCompletionFilter?.addEventListener('input', (e) => this.applyChapterCompletionFilter(e));

        // update highlighted suggestion on hover
        this.autocompleteContainer.addEventListener('mouseover', (e) => {
            this.selectedIndex = Array.from(this.autocompleteContainer!.children).indexOf(e.target as HTMLDivElement);
            const array = this.autocompleteContainer!.querySelectorAll('div') as NodeListOf<HTMLDivElement>;
            this.updateHighlightedSuggestion(array, this.selectedIndex);
        });

        this.filterReset?.addEventListener('click', () => {
            this.resetFilters();
        });

        this.countVisibleEntries();
    }
    protected reload(): void {
        throw new Error("Method not implemented.");
    }
    constructor(AllHermidata: Record<string, Hermidata>, settings: Settings) {
        super(AllHermidata, settings);
    }
    /** Count the amount of Elements are visible in the DOM, then write inside the counter and return it */
    private countVisibleEntries(hidden: boolean = false): number {
        // get visible elements
        const visibleElements = hidden ? 
            Array.from(document?.querySelectorAll<HTMLDivElement>('.hermidata-item')).filter(el => el.style.display !== 'none')
            : document?.querySelectorAll('.hermidata-item[data-searchable="true"]');

        // count elements
        const count = visibleElements?.length || 0;

        // write to counter
        setElement<HTMLSpanElement>('#library-entries-info-amount', el => el.textContent = count.toString());

        // return
        return count;
    }

    private resetFilters() {
        // Reset all checkboxes
        const checkboxes = document.querySelectorAll<HTMLDivElement>(".custom-checkbox");
        for (const cb of checkboxes) {
            cb.dataset.state = "0";
        }
        const filters: Filters = {
            include: {}, // { type: ['Manga'], status: ['Ongoing'] }
            exclude: {},
            sort: 'Alphabetical'
        };
        this.applyFilterToEntries(filters);
        this.applySortToEntries(filters.sort);
        
        // reset search input
        this.searchInput!.value = '';
        this.autocompleteContainer!.innerHTML = '';

        // reset tags search input
        this.tagsSearchInput!.value = '';

        // reset chapter completion filter
        this.ChapterCompletionFilter!.value = '';

        // 

        // set sort to default
        const sortCheckboxAlphabetical = getElement<HTMLDivElement>('#sort-checkbox-Alphabetical');
        if (!sortCheckboxAlphabetical) return
        sortCheckboxAlphabetical.dataset.state = '1';

        // persist the reset state to local storage
        setLastLibraryFilters(filters);
    }




    public async generalFilterOptionLogic(parent_section: HTMLElement): Promise<void> {
        // state object for filters
        const lastSort: Filters | undefined = await getLastLibraryFilters() as Filters | undefined;
        const filters: Filters = lastSort ?? {
            include: {}, // { type: ['Manga'], status: ['Ongoing'] }
            exclude: {},
            sort: 'Alphabetical'
        };
    
        // find all custom checkboxes
        const checkboxes = parent_section.querySelectorAll<HTMLDivElement>(".custom-checkbox");

        const checkboxesWithLabels = parent_section.querySelectorAll<HTMLDivElement>(".filter-item-list");
    
        for (const cbWithLabel of checkboxesWithLabels) {
            cbWithLabel.removeEventListener("click", () => this.eventOnClick(cbWithLabel, filters));
            cbWithLabel.addEventListener("click", () => this.eventOnClick(cbWithLabel, filters));
        };
        const makeActiveState = (cb: HTMLDivElement) => {
            const label = cb.nextElementSibling?.textContent?.trim();
            const section = cb.dataset.filterType?.trim();
            let state = 0;
    
            if (!label || !section) return state;
    
            const includeSelection = filters?.include?.[section] || [];
            const excludeSelection = filters?.exclude?.[section] || [];
            if ( includeSelection.length === 0 && excludeSelection.length === 0 && filters?.sort === undefined) return state;
            
            if ( includeSelection.includes(label) ) state = 1;
            else if ( excludeSelection.includes(label) ) state = 2;
            else if ( filters?.sort === label ) state = 1;
            else if ( filters?.sort === `Reverse-${label}` ) state = 2;
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
                }
            }
        }, 300);
    
    }

    private eventOnClick(cbWithLabel: HTMLDivElement, filters: Filters) {
        const cb = cbWithLabel.querySelector<HTMLDivElement>(".custom-checkbox");
        if (!cb) return;
        let state = Number.parseInt(cb.dataset.state || "0");

        // If the checkbox is disabled, do nothing
        if( cb.dataset.disabled === 'true') return;

        // cycle 0→1→2→0
        state = (state + 1 ) % 3;
        cb.dataset.state = state.toString();

        // get contents of the checkbox
        const contentValue = cb.dataset.value?.trim();
        // find which section it belongs to (Type, Status, etc.)
        const section = cb.dataset.filterType?.trim();
        if (!section || !contentValue) return;

        if (section === "Sort") {
            // Reset all sort checkboxes first
            filters.sort = 'Alphabetical';
            const sortCheckboxes = document.querySelectorAll<HTMLDivElement>(".sort-checkbox-item");
            if (!sortCheckboxes) return
            for (const otherCb of sortCheckboxes) otherCb.dataset.state = "0";

            // Enable current one
            if (state === 1) {
                cb.dataset.state = "1" 
                filters.sort = contentValue as BasicSortsType;
            } else if (state === 2) {
                cb.dataset.state = "2";
                filters.sort = `Reverse-${contentValue as BasicSortsType}`
            } else if (state === 0) {
                // If the user force the state back to 1, as with sort checkboxes, we will reset the sort to default
                cb.dataset.state = "1";
                state = 1;
                filters.sort = contentValue as BasicSortsType;

            }

            // apply and persist
            if (filters.sort) {
                setLastLibrarySortOption(filters.sort);
                this.applySortToEntries(filters.sort);
            }
            return;
        }

        // init arrays if not exist
        if (!filters.include[section]) filters.include[section] = [];
        if (!filters.exclude[section]) filters.exclude[section] = [];

        // reset previous state
        filters.include[section] = filters.include[section].filter(v => v !== contentValue);
        filters.exclude[section] = filters.exclude[section].filter(v => v !== contentValue);

        // apply new state
        if (state === 1) filters.include[section].push(contentValue);
        else if (state === 2) filters.exclude[section].push(contentValue);
        // trigger filtering logic here
        this.applyFilterToEntries(filters);
        setLastLibraryFilters(filters);
    };

    private applyFilterToEntries(filters: Filters) {
        const entries = document.querySelectorAll<HTMLDivElement>(`.hermidata-item`);

        for (const entry of entries) {
            this.applyIndividualFilterToEntries(entry, filters);
        }

        this.setAllFilterLabels(filters);

        this.countVisibleEntries();
    }
    private setAllFilterLabels(filters: Filters) {
        const filterButtons = document.querySelectorAll<HTMLDivElement>(".filter-button:not(#resetFilters, #Sort-filter)");

        for (const filterButton of filterButtons) {
            let titleList: string[] = []
            if (filterButton.dataset.filterType === "Genres & Themes") {
                const Demographic = this.firstNonEmpty(filters.include["Demographic"], filters.exclude["Demographic"]);
                const genresThemes = this.firstNonEmpty(filters.include["genres-themes"], filters.exclude["genres-themes"]);
                const result = this.firstNonEmpty(Demographic, genresThemes);
                if (result) titleList.push(...result);
            }
            const possibleTitles = this.firstNonEmpty(filters.include[filterButton.dataset.filterType || ""], filters.exclude[filterButton.dataset.filterType || ""]);
            if (possibleTitles) titleList.push(...(possibleTitles));

            const title = (titleList.length >= 2)  ? `${titleList[0]} +[${titleList.length-1}]` : titleList[0] || "Any";
            filterButton.textContent = title;
        }
    }
    private firstNonEmpty<T>(...arrays: (T[] | undefined)[]): T[] | undefined {
        return arrays.find(arr => arr && arr.length > 0);
    }

    private applyIndividualFilterToEntries(entry: HTMLDivElement, filters: Filters): void {
        const hashItem = this.GetHashItem(entry);
        const entryData = this.AllHermidata[hashItem];
        const Type = entryData.novelType;
        const ReadStatus = entryData.chapter.bookmarks[entryData.chapter.bookmarkInUse].readStatus;
        const NovelStatus = entryData.meta?.novelStatus
        const Source = entryData.source;
        const Tag = entryData.meta.tags || [];
        const starRating = entryData.meta.starRating || 5;
        const contentRating = entryData.meta.contentRating;
        const DateFilter = this.getYearBucket(entryData.meta.added);

        const inputs: FilterName = {
            novelType: Type,
            readStatus: ReadStatus,
            source: Source,
            novelStatus: NovelStatus,
            tags: Tag,
            dateFilter: DateFilter,
            starRating: starRating,
            contentRating: contentRating
        }

        let visible = true;

        // Check all include filters — must match at least one in each group
        visible = this.matchingFilter(filters, inputs, 'include');

        // Check exclude filters — hide if matches any
        if (visible) {
            visible = this.matchingFilter(filters, inputs, 'exclude');
        }

        entry.style.display = visible ? "" : "none";
        entry.dataset.searchable = visible ? 'true' : 'false';
    };

    private matchingFilter(filters: Filters, inputs: FilterName, filterType: 'include' | 'exclude'): boolean {
        const isInclude = filterType === 'include';
        const loopEntries = isInclude ? filters.include : filters.exclude;

        let visible = true;

        for (const [key, values] of Object.entries(loopEntries)) {
            if (values.length === 0) continue;

            const val = this.setState(values, inputs) ?? 'none'; // error here
            
            if (typeof val === 'number') {
                
                const match = values.some(v => Number(v) === val);
                if ((!match && isInclude) || (match && !isInclude)) {
                    visible = false;
                    break;
                }
                continue;
            }
            if (key === 'genres-themes' || key === 'Demographic') {
                const hasMatchAny = values.some(v => val.includes(v));
                const hasMatchAll = values.every(v => val.includes(v));
                const match = this.tagsSearchModeIsSetToAll ? hasMatchAll : hasMatchAny;

                if ((!match && isInclude) || (match && !isInclude)) { 
                    visible = false; 
                    break;
                }
                continue;
            }

            const match = Array.isArray(val)
                ? val.some(v => values.includes(v))
                : values.includes(val);

            if ((!match && isInclude) ||( match && !isInclude)) {
                visible = false;
                break;
            }
        }
        return visible
    }
    private setState(values: string[], input: FilterName ): string | string[] | number | void {
        for (const value of values) { // value is the filter value
            for (const [key, type] of Object.entries(input)) {
                if (value === type) {
                    // if only one value, return it
                    return type
                } else if (Array.isArray(type) && type.includes(value)) {
                    // if more than one value, return the whole array
                    return type
                    // TEMP: temporary measure
                } else if (key === 'starRating') {
                    const trimmedValue = value.replace('star', '').replace('s', '').trim();
                    // if a number, return the number
                    if (type === Number(trimmedValue)) return type
                }
            }
        }
    }

    private handleSearchInput(e: KeyboardEvent | Event, suggestionBox: HTMLDivElement) {
        const target = e.target as HTMLInputElement;
        const query = target.value.trim().toLowerCase();
        suggestionBox.innerHTML = '';

        if (!query || query == '') {
            this.filterEntries('');
            return;
        }

        const visibleItems = document.querySelectorAll<HTMLDivElement>(`.hermidata-item[data-searchable="true"]`);
        for (const item of visibleItems) this.allSearchableItems.add(item);
        const visibleHashes = Array.from(visibleItems).map(item => this.GetHashItem(item));
    
        const filtered = Object.entries(this.AllHermidata).filter(([hash, item]) => {
            // Only include if item is currently visible
            if (!visibleHashes.includes(hash)) return false;
            
            return [item.title, ...(item.meta?.altTitles || [])].some(t => t.toLowerCase().includes(query));
        }).map(([, item]) => item);


        this.filterEntries(query, 'title');

        // Autocomplete suggestions
        const suggestions = [...new Set(filtered.flatMap(f => f.meta.altTitles))].slice(0, 7);

        // Build suggestion elements
        for (const alTitle of suggestions) {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.textContent = alTitle;
            div.addEventListener('click', () => {
                const target = e.target as HTMLInputElement;
            this.applySearchSelection(target, suggestionBox, alTitle);
            });
            suggestionBox.appendChild(div);
        }
    }
    private filterEntries(query: string, queryType: 'title' | 'chapter' | 'author' = 'title'): Hermidata[] {
        const allItems = document.querySelectorAll<HTMLDivElement>(`.hermidata-item`);

        // If no query, restore all items to their filter-determined state
        if (!query) {
            allItems.forEach(item => {
                // Restore visibility based on what filters decided
                const isFilteredIn = item.dataset.searchable === 'true';
                item.style.display = isFilteredIn ? '' : 'none';
                item.dataset.searchable = String(isFilteredIn);
            });
            this.countVisibleEntries(true);
            return Object.values(this.AllHermidata);
        }

        // With a query: check both filter state AND search match
        for (const item of allItems) {        
            // First check: Is this item allowed by current filters?
            const isFilteredIn = item.dataset.searchable === 'true';
            if (!isFilteredIn) {
                // Filters say NO - keep it hidden, don't even check search
                item.style.display = 'none';
                continue;
            }

            // Second check: Item passed filters, now check if it matches search

            const hashItem = this.GetHashItem(item);
            const hermidata = new HermidataModel(this.AllHermidata[hashItem]);

            const matchFilter = this.getQueryItem(hermidata, query.toLowerCase(), queryType);

            // Show only if it passes BOTH filters AND search
            item.style.display = matchFilter ? '' : 'none';
        };

        this.countVisibleEntries(true);

        const visibleItems = [...allItems].filter(item => item.style.display !== 'none').map(item => {
            const hashItem = this.GetHashItem(item);
            const hermidata = this.AllHermidata[hashItem];
            return hermidata;
        });

        return visibleItems;
    }
    /** - get all items that match the query */
    private getQueryItem(item: HermidataModel, query: string, queryType: 'title' | 'chapter' | 'author' = 'title'): boolean {
        if (queryType === 'title') return [item.title, ...(item.meta?.altTitles || [])].some(t => t.toLowerCase().includes(query));
        if (queryType === 'chapter') {
            const percentageCompleted = item.rss?.latestItem.chapter ?? item.chapter.latest / item.GetChapter();
            
            return percentageCompleted >= Number(query);
        }
        if (queryType === 'author') {
            const author = item.meta.author;
            if (!author) return false;
            const inclusion = author?.toLowerCase().includes(query);
            return inclusion ?? false;
            }
        return false
        
    }
    private applySearchSelection(input: HTMLInputElement, suggestionBox: HTMLDivElement, value: string) {
        input.value = value;
        this.filterEntries(value);
        suggestionBox.innerHTML = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        suggestionBox.innerHTML = '';
        input.focus();
    }

    private setupSearchBar(e_: KeyboardEvent, suggestionBox: HTMLDivElement, suggestionsClassName: string) {
        const searchInput = getElement<HTMLInputElement>('#search');

        if (!searchInput) throw new Error('Element not found');

        // const items = suggestionBox.querySelectorAll<HTMLDivElement>(`.hermidata-item[data-searchable="true"]`);
        const items = suggestionBox.querySelectorAll<HTMLDivElement>(`${suggestionsClassName}`);
        if (!items.length) {
            suggestionBox.innerHTML = '';
            return;
        }

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
    private updateHighlightedSuggestion(items: NodeListOf<HTMLDivElement>, selectedIndex: number) {
        items.forEach((el, i) => {
            el.classList.toggle('highlighted', i === selectedIndex);
        });
    }
    private applyChapterCompletionFilter(e: Event) {
        const target = e.target as HTMLInputElement;
        const value = target.value;
        this.filterEntries(value, 'chapter');
    }
    private handleTagsSearchInput(e: Event) {
        const target = e.target as HTMLInputElement;
        const value = target.value;
        this.filterTags(value);
    
    }
    private handleAuthorSearchInput(e: Event) {
        const target = e.target as HTMLInputElement;
        const value = target.value;
        const filtered = this.filterEntries(value, 'author');
        
        const authorSuggestionBox = document.querySelector<HTMLDivElement>('#Author-filter-suggestions');
        if (!authorSuggestionBox) return;
        authorSuggestionBox.innerHTML = '';
        
        // Autocomplete suggestions
        const suggestions = [...new Set(filtered.flatMap(f => f.meta.author))].slice(0, 3);

        // Build suggestion elements
        for (const author of suggestions) {
            if (!author) continue;
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.textContent = author;
            div.addEventListener('click', () => {
                const target = e.target as HTMLInputElement;
                this.applySearchSelection(target, authorSuggestionBox, author);
            });
            authorSuggestionBox.appendChild(div);
        }
    }
    private filterTags(query: string) {
        const allItems = getElement('#Genres-dialog')?.querySelectorAll<HTMLDivElement>(('.genres-themes-demographic-item-list'));
        const allDemographicCheckboxes = document.querySelectorAll<HTMLDivElement>('.demographic-item-list');
        const allGenresCheckboxes = document.querySelectorAll<HTMLDivElement>('.genres-themes-item-list');
        if (!allItems) return
        // If no query, restore all items to their filter-determined state
        if (!query) {
            allItems.forEach(item => {
                // Restore visibility based on what filters decided
                
                item.style.display = 'flex';
            });
            this.updateFilterLabels(allDemographicCheckboxes, allGenresCheckboxes);
            return;
        }

        // With a query: check both filter state AND search match
        allItems.forEach(parent => {
            const item = parent.children[0] as HTMLDivElement;
            const value = (item.dataset.value ?? item.textContent).toLocaleLowerCase();
            const queryLower = query.toLocaleLowerCase();



            const matchFilter = value.includes(queryLower);

            // Show only if it passes BOTH filters AND search
            parent.style.display = matchFilter ? 'flex' : 'none';
        });

        // if empty
        this.updateFilterLabels(allDemographicCheckboxes, allGenresCheckboxes);
    }
    private updateFilterLabels(allDemographicCheckboxes: NodeListOf<HTMLDivElement>, allGenresCheckboxes: NodeListOf<HTMLDivElement>) {
        const allHidden = (checkboxes: NodeListOf<HTMLDivElement>) => Array.from(checkboxes).every(el => el.style.display === "none");
        
        document.querySelector<HTMLDivElement>('.Demographic-container-label')!.style.display = allHidden(allDemographicCheckboxes)  ? "none" : "flex";
        document.querySelector<HTMLDivElement>('.genres-themes-container-label')!.style.display = allHidden(allGenresCheckboxes) ? "none" : "flex";
    }

}