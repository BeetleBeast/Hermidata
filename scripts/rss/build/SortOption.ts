import { type Hermidata, type Settings } from "../../shared/types/index";
import { getSettings } from "../../shared/db/Storage";
import { getElement, setElement } from "../../shared/utils/Selection";
import { Sort } from "./Sort";
import { AllSorts, filterClassName, filterName } from "../../shared/constants";
export class SortOption extends Sort {

    private allSearchableItems: Set<HTMLDivElement> = new Set();

    private selectedIndex: number = -1;
    
    public async makeSortOptions(parent_section: HTMLElement): Promise<void> {
        if (getElement('.mainContainerHeader')) return;

        const settings = await getSettings();
        
        const mainContainer = this.CreateMainContainer(settings);
        parent_section.appendChild(mainContainer);

        this.setAutocompleteWidth();
    }
    private CreateSearchBar(): HTMLDivElement {
        const searchContainerWrapper = document.createElement('div');
        searchContainerWrapper.className = 'search-container-wrapper';
        searchContainerWrapper.style.position = 'relative';

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
        document.addEventListener('click', e => {
            const target = e.target;
            if (target !== searchInput && !(target instanceof Node && autocompleteContainer.contains(target))) {
                autocompleteContainer.innerHTML = '';
            }
        });
        // update highlighted suggestion on hover
        autocompleteContainer.addEventListener('mouseover', (e) => {
            this.selectedIndex = Array.from(autocompleteContainer.children).indexOf(e.target as HTMLDivElement);
            const array = autocompleteContainer.querySelectorAll('div') as NodeListOf<HTMLDivElement>;
            this.updateHighlightedSuggestion(array, this.selectedIndex);
        });

        searchContainer.append(searchInput, autocompleteContainer);

        searchContainerWrapper.append(searchContainer);
        return searchContainerWrapper;
    }
    private CreateFilter(settings: Settings): HTMLDivElement {
        const filterSection = document.createElement('div');
        filterSection.className = 'filter-section-container';

        // 1. sort
        const SortSection = this.createFilterSection(filterName.Sort, AllSorts, filterClassName.Sort);

        // 2. Type
        const typeSection = this.createFilterSection(filterName.Type, settings.ContentTypesAndStatuses.TYPE_OPTIONS, filterClassName.Type);

        // 3. Status
        const statusSection = this.createFilterSection(filterName.Status, settings.ContentTypesAndStatuses.STATUS_OPTIONS, filterClassName.Status);
        
        // 3.5. novels Status filter
        const novelStatusSection = this.createFilterSection(filterName.NovelStatus, settings.ContentTypesAndStatuses.NOVEL_STATUS_OPTIONS, filterClassName.NovelStatus);
    
        // 4. Source
        const allSources = Array.from(new Set(Object.values(this.AllHermidata || {}).flatMap(item => item.meta.altSources).filter(Boolean)))
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        const sourceSection = this.createFilterSection(filterName.Source, allSources, filterClassName.Source);

        // 5. Tags
        const allTags = Array.from(new Set(Object.values(this.AllHermidata || {}).flatMap(item => item.meta?.tags || [])))
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        const tagSection = this.createFilterSection(filterName.Tag, allTags, filterClassName.Tag);

        // 6. Dates
        const allDates = this.generateDateFilterSection()
        const dateSection = this.createFilterSection(filterName.Date, allDates, filterClassName.Date);
        
        const firstRow = document.createElement('div');
        firstRow.className = 'filter-row-1';
        firstRow.append(SortSection, typeSection, statusSection, novelStatusSection);

        const secondRow = document.createElement('div');
        secondRow.className = 'filter-row-2';
        secondRow.append(sourceSection, tagSection, dateSection);

        filterSection.append(firstRow, secondRow);

        return filterSection
    }
    private createFilterSection(title: string, items: string[], className: string): HTMLDivElement {
        const section = document.createElement('div');
        section.className = `filter-section ${className}`;

        const header = document.createElement('h4');
        header.textContent = title;
        header.className = 'filter-header-text';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'filter-button Btn';
        button.textContent = title === filterName.Sort ? 'Alphabet' : 'Any';
        button.setAttribute('aria-label', `Filter by ${title}`);

        const popover = document.createElement('div');
        popover.id = `rss-${className}-dialog`;
        popover.className = 'filter-dialog rss-filter-dialog';
        const filterItems = items.filter(item => item !== '');
        button.dataset.optionCount = String(filterItems.length);
        if (title !== filterName.Sort) button.textContent = `Any · ${filterItems.length}`;
        const useLargePopover = filterItems.length > 8;
        if (className === filterClassName.Tag && useLargePopover) popover.classList.add('rss-filter-dialog-tags');
        if (useLargePopover) popover.classList.add('rss-filter-dialog-large');
        popover.setAttribute('popover', 'auto');
        button.setAttribute('popovertarget', popover.id);
        button.setAttribute('popovertargetaction', 'toggle');
        const longestItem = Math.max(title.length, ...filterItems.map(item => item.length));
        button.style.setProperty('--rss-filter-content-width', `${longestItem + 3}ch`);

        const innerList = document.createElement('div');
        innerList.className = 'rss-filter-list';
        innerList.dataset.filterItems = JSON.stringify(filterItems);
        popover.appendChild(innerList);
        section.append(header, button, popover);
        return section;
    };
    private CreateMainContainer(settings: Settings): HTMLDivElement {
        const mainContainer = document.createElement('div');

        mainContainer.className = 'mainContainerHeader';

        // 1. Search bar
        const searchContainer = this.CreateSearchBar();
        
        // 2. filters & sort
        const filterSection = this.CreateFilter(settings);

        mainContainer.append(searchContainer, filterSection);

        return mainContainer
    }
    private setAutocompleteWidth(): void {
        const searchInput = getElement<HTMLInputElement>('.search-input');
        const boundingBox = searchInput?.getBoundingClientRect();
        if (!boundingBox) return

        setElement('.autocompleteContainer', el => {
            el.style.top = `calc(100% - 0rem)`; // position at the bottom
            el.style.width = `${boundingBox?.width}px`;
        })
    }

    private handleSearchInput(e: KeyboardEvent | Event, suggestionBox: HTMLDivElement) {
        const target = e.target as HTMLInputElement;
        const query = target.value.trim().toLowerCase();
        suggestionBox.innerHTML = '';

        if (!query || query == '') {
            this.filterEntries('');
            return;
        }

        const visibleItems = document.querySelectorAll<HTMLDivElement>(`.hermidata-item[data-is-notification-item="false"][data-searchable="true"]`);
        for (const item of visibleItems) this.allSearchableItems.add(item);
        const visibleHashes = Array.from(visibleItems).map(item => this.GetHashItem(item));
    
        const filtered = Object.entries(this.AllHermidata).filter(([hash, item]) => {
            // Only include if item is currently visible
            if (!visibleHashes.includes(hash)) return false;
            
            return [item.title, ...(item.meta?.altTitles || [])].some(t => t.toLowerCase().includes(query));
        }).map(([, item]) => item);


        this.filterEntries(query, filtered);

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

    private filterEntries(query: string, filtered: Hermidata[] | null = null) {
        const allItems = document.querySelectorAll<HTMLDivElement>(`.hermidata-item[data-is-notification-item="false"]`);

        // If no query, restore all items to their filter-determined state
        if (!query) {
            allItems.forEach(item => {
                // Restore visibility based on what filters decided
                const isFilteredIn = item.dataset.searchable=== 'true';
                item.style.display = isFilteredIn ? '' : 'none';
            });
            return;
        }

        // With a query: check both filter state AND search match
        allItems.forEach(item => {
            // First check: Is this item allowed by current filters?
            const isFilteredIn = item.dataset.searchable=== 'true';
            if (!isFilteredIn) {
                // Filters say NO - keep it hidden, don't even check search
                item.style.display = 'none';
                return;
            }

            // Second check: Item passed filters, now check if it matches search
            const titleEl = getElement('.hermidata-item-title', item);
            const ItemTitleText = titleEl?.textContent?.toLowerCase() || '';

            const hashItem = this.GetHashItem(item);
            const titleText = this.AllHermidata[hashItem]?.title?.toLowerCase() || ItemTitleText;

            const match = filtered
            ? filtered.some(f => f.title.toLowerCase() === titleText)
            : titleText.includes(query);

            // Show only if it passes BOTH filters AND search
            item.style.display = match ? '' : 'none';
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

    private setupSearchBar(e_: KeyboardEvent, suggestionBox: HTMLDivElement) {
        const searchInput = getElement<HTMLInputElement>('.search-input');

        if (!searchInput) throw new Error('Element not found');

        // const items = suggestionBox.querySelectorAll<HTMLDivElement>(`.hermidata-item[data-is-notification-item="false"][data-searchable="true"]`);
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

    }
    private updateHighlightedSuggestion(items: NodeListOf<HTMLDivElement>, selectedIndex: number) {
        items.forEach((el, i) => {
            el.classList.toggle('highlighted', i === selectedIndex);
        });
    }

    private generateDateFilterSection() {
            const allEntries = Object.values(this.AllHermidata || {});
            const yearBuckets = allEntries.map(entry => {
                const dateStr = entry.meta?.originalRelease || entry.meta?.added || entry.meta?.updated;
                return this.getYearBucket(dateStr);
            });
    
            const uniqueBuckets = Array.from(new Set(yearBuckets)).filter(Boolean);
            this.amountOfYearBuckets = uniqueBuckets.length
    
            const thisYear = new Date().getFullYear()
            const everySingleYear = thisYear - 2020
            const sortOrderOldType = ["2020s", "2010s", "2000s", "1990s", "1980s", "Unknown"];
            const sortOrderEveryYearType = []
            for (let index = 0; index < everySingleYear; index++) {
                sortOrderEveryYearType.push(String(thisYear - index))
            }
            const sortOrder = sortOrderEveryYearType.concat(sortOrderOldType)
            uniqueBuckets.sort((a, b) => sortOrder.indexOf(a) - sortOrder.indexOf(b));
            return uniqueBuckets;
        }
}