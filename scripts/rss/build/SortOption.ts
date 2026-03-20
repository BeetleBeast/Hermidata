import { AllSorts, type AllsortsType } from "../../shared/types/rssBuildType";
import { novelStatus, novelTypes, readStatus, type Hermidata } from "../../shared/types/type";
import { getElement, setElement } from "../../utils/Selection";
import { Sort } from "./Sort";

export class SortOption extends Sort {

    private selectedIndex: number = -1;

    public makeSortOptions(parent_section: HTMLElement): void {

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
        SortSection.querySelectorAll<HTMLDivElement>('.filter-item-container').forEach(container => {
            const label = getElement('label', container);
            if (!label) return;
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


    /**
     * Converts a date (string, Date, or number) into a decade label bucket.
     * @param {string|Date|number} dateInput
     * @returns {string} decadeLabel
    */
    private getYearBucket(dateInput: string): string {
        if (!dateInput) return "Unknown";
        
        const dacade = this.createYearBucket(dateInput) ?? '';
        
        return dacade;
    }
    private createYearBucket(dateInput: string): string | void {
        const year = this.getYearNumber(dateInput)
        if (Number.isNaN(year)) return;

        const dacade = year.slice(0, -1).concat('0s');

        return dacade;
    }
}