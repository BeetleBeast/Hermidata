import { AllSorts, filterClassName, filterName, type Hermidata, type Settings } from "../../shared/types/index";
import { getLastSortOption, getSettings } from "../../shared/db/Storage";
import { getElement, setElement } from "../../utils/Selection";
import { Sort } from "./Sort";
export class SortOption extends Sort {

    private selectedIndex: number = -1;
    
    public async makeSortOptions(parent_section: HTMLElement): Promise<void> {
        if (getElement('.mainContainerHeader')) return;

        const settings = await getSettings();
        
        // --- 1. Search bar & filter ---
        const [mainContainer, lastSort] = await Promise.all([
            Promise.resolve(this.CreateMainContainer(settings)),
            getLastSortOption()
        ]);

        parent_section.appendChild(mainContainer);

        this.setMinimumWidthOfFilter(mainContainer);

        
        // --- 2. apply sort last, after DOM is stable ---
        if (lastSort) { 
            this.applySortToEntries(lastSort);
            this.applySortToNotification();
        }
    }
    private CreateSearchBar(): HTMLDivElement {
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

        const filterSectionTitle = this.CreateFilterButtonTitle();

        searchContainer.append(searchInput, autocompleteContainer, filterSectionTitle);

        return searchContainer
    }
    private CreateFilter(settings: Settings): HTMLDivElement {
        const filterSection = document.createElement('div');
        filterSection.className = 'filter-section-container';

        // 1. sort
        const SortSection = this.createFilterSection(filterName.Sort, AllSorts, filterClassName.Sort);

        // 2. Type
        const typeSection = this.createFilterSection(filterName.Type, settings.TYPE_OPTIONS, filterClassName.Type);

        // 3. Status
        const statusSection = this.createFilterSection(filterName.Status, settings.STATUS_OPTIONS, filterClassName.Status);
        
        // 3.5. novels Status filter
        const novelStatusSection = this.createFilterSection(filterName.NovelStatus, settings.NOVEL_STATUS_OPTIONS, filterClassName.NovelStatus);
    
        // 4. Source
        const allSources = Array.from(new Set(Object.values(this.AllHermidata || {}).map(item => item.source).filter(Boolean)));
        const sourceSection = this.createFilterSection(filterName.Source, allSources, filterClassName.Source);

        // 5. Tags
        const allTags = Array.from(new Set(Object.values(this.AllHermidata || {}).flatMap(item => item.meta?.tags || [])));
        const tagSection = this.createFilterSection(filterName.Tag, allTags, filterClassName.Tag);

        // 6. Dates
        const allDates = this.generateDateFilterSection()
        const dateSection = this.createFilterSection(filterName.Date, allDates, filterClassName.Date);
        
        filterSection.append(SortSection, typeSection, statusSection, novelStatusSection, sourceSection, tagSection, dateSection);

        return filterSection
    }
    private CreateFilterButtonTitle(): HTMLDivElement {
        const filterSectionTitle = document.createElement('h4');
        filterSectionTitle.className = 'filterSectionTitle';
        filterSectionTitle.classList.add('Btn');
        filterSectionTitle.textContent = "filter";
        filterSectionTitle.dataset.filterDisplay = 'none';
        filterSectionTitle.addEventListener('click', () => {
            filterSectionTitle.dataset.filterDisplay = filterSectionTitle.dataset.filterDisplay === 'none' ? 'flex' : 'none';
        });
        return filterSectionTitle
    }
    private createFilterSection(title: string, items: string[], className: string): HTMLDivElement {
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

        for (const item of items) {
            if (item === '') continue;
            const itemContainer = document.createElement('div');
            itemContainer.className = 'filter-item-container';

            // Custom checkbox div
            const checkbox = document.createElement('div');
            checkbox.className = 'custom-checkbox';
            checkbox.dataset.state = '0'; // 0=neutral, 1=include, 2=exclude

            // Label
            const label = document.createElement('label');
            label.className = 'filter-item-label';
            label.textContent = item;

            itemContainer.appendChild(checkbox);
            itemContainer.appendChild(label);
            list.appendChild(itemContainer);
        }

        section.appendChild(list);
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
    private setMinimumWidthOfFilter(mainContainer: HTMLDivElement): void {
        // First pass — read all widths (browser calculates layout once)
        const measurements = Object.keys(filterName).map(index => {
            const elFilter = mainContainer.querySelector<HTMLDivElement>(`.${filterClassName[index]}`)
            return { elFilter, width: elFilter?.clientWidth || 0 }
        })
        // Second pass — write all widths (browser paints once)
        measurements.forEach(({ elFilter, width }) => {
            if (elFilter && width) elFilter.style.minWidth = `${width}px`;
        })
        const searchInput = getElement<HTMLInputElement>('.search-input');
        setElement('.autocompleteContainer', el => el.style.width = `${searchInput?.offsetWidth}px`);
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
        suggestions.forEach((s) => {
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

    private filterEntries(query: string, filtered: Hermidata[] | null = null) {
        const allItems = document.querySelectorAll<HTMLDivElement>(`.hermidata-item[data-is-notification-item="false"]`);

        allItems.forEach(item => {
            const titleEl = getElement('.hermidata-item-title', item);
            const ItemTitleText = titleEl?.textContent?.toLowerCase() || '';

            const hashItem = this.GetHashItem(item);
            const titleText = this.AllHermidata[hashItem]?.title?.toLowerCase() || ItemTitleText;

            const match = ( filtered
            ? filtered.some(f => f.title.toLowerCase() === titleText)
            : !query ) || titleText.includes(query);

            item.style.display = match ? '' : 'none';
            item.dataset.seachable = match ? 'true' : 'false';
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
    
            const thisYeay = new Date().getFullYear()
            const everySingleYear = thisYeay - 2020
            const sortOrderOldType = ["2020s", "2015s", "2010s", "90s", "80s & older"];
            const sortOrderEveryYearType = []
            for (let index = 0; index < everySingleYear; index++) {
                sortOrderEveryYearType.push(String(thisYeay - index))
            }
            const sortOrder = sortOrderEveryYearType.concat(sortOrderOldType)
            uniqueBuckets.sort((a, b) => sortOrder.indexOf(a) - sortOrder.indexOf(b));
            return uniqueBuckets;
        }
}