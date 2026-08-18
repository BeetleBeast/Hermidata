import { CONTENT_RATING_MAP, DEMOGRAPHIC_TAGS } from "../../shared/constants";
import { getAllTags } from "../../shared/db/Storage";
import type { Hermidata, Settings } from "../../shared/types";
import { HermidataModel } from "../../shared/utils/HermidataSelector";
import { getElement } from "../../shared/utils/Selection";
import { Sort } from "./filter";

export class filter extends Sort {

    private readonly starRatingDialog: HTMLElement | null = getElement('#StarRating-dialog');

    private readonly contentRatingDialog: HTMLElement | null = getElement('#ContentRating-dialog');
    
    private readonly novelTypeDialog: HTMLElement | null = getElement('#NovelType-dialog');
    
    private readonly genresDialog: HTMLElement | null = getElement('#Genres-dialog');

    private readonly NovelStatusDialog: HTMLElement | null = getElement('#NovelStatus-dialog');
    
    private readonly SiteDialog: HTMLElement | null = getElement('#Site-dialog');

    private readonly ReleaseDateDialog: HTMLElement | null = getElement('#ReleaseDate-dialog');

    private readonly SortDialog: HTMLElement | null = getElement('#Sort-dialog');

    /*
    Most checkboxes will be custom made and will be made with simple divs here but with data attributes for state
    most will have a 3 state solution
        state 0: unchecked,
        state 1: checked include,
        state 2: checked exclude
    */

    constructor(AllHermidata: Record<string, Hermidata>, settings: Settings) {
        super(AllHermidata, settings);
    }


    public build(): void {
        
        this.setFilterContent();

    }
    protected reload(): void {
        throw new Error("Method not implemented.");
    }

    // set filter content
    private setFilterContent() {
        
        // NEW:
        // star rating
        this.setStarRatingFilter();

        // NEW:
        // content rating ( G, PG, R, NR )
        this.setContentRatingFilter();


        // novel type
        this.setFilterNovelTypeFilter();

        // RENAMED: from tags with 4 less options
        // Genres & themes, Demographic with search bar and inclusion mode (all, any)
        this.setGenresThemesFilter();

        // Novel Status
        this.setNovelStatusFilter();

        // Site
        this.setSiteFilter();

        // Author
        // this.setAuthorFilter();

        // Release Date
        this.setReleaseDateFilter();

        // Chapter completion level
        // this.setChapterCompletionFilter();

        // Sort
        this.setSortFilter();
        
    }


    private setStarRatingFilter(): void {
        const container = this.starRatingDialog;
        if (!container) return;

        container.innerHTML = '';

        const starRatingCheckbox = this.buildStarRatingCheckbox(1,5);

        container.append(starRatingCheckbox);
    }
    private setContentRatingFilter() {
        const container = this.contentRatingDialog;
        if (!container) return;

        container.innerHTML = '';

        const contentRatingCheckbox = this.buildContentRatingCheckbox();

        container.append(contentRatingCheckbox);
    }
    private setFilterNovelTypeFilter() {
        const container = this.novelTypeDialog;
        if (!container) return;

        container.innerHTML = '';

        const novelTypeCheckbox = this.buildNovelTypeCheckbox();

        container.append(novelTypeCheckbox);
    }
    private setGenresThemesFilter() {
        const container = this.genresDialog;
        if (!container) return;

        container.innerHTML = '';

        const searchMode = this.buildSearchMode();

        const searchInput = this.buildSearchInput();

        const demographicLabel = this.buildDemographicLabel();

        const demographicCheckbox = this.buildDemographicCheckbox();
        
        const themesLabel = this.buildThemeLabel();

        const genresThemesCheckbox = this.buildGenresThemesCheckbox();

        container.append(searchMode, searchInput, demographicLabel, demographicCheckbox, themesLabel, genresThemesCheckbox);
    }
    private buildSearchMode(): HTMLDivElement {
        // container for search mode
        const container = document.createElement('div');
        container.classList.add('search-mode-container');

        // label for search mode
        const label = document.createElement('h4');
        label.textContent = 'Inclusion mode';
        label.classList.add('search-mode-label');

        // radio container for search mode
        const radioContainer = document.createElement('div');
        
        radioContainer.id = 'search-mode-checkbox';
        radioContainer.classList.add('search-mode-radio-container');

        // radio button for search mode | all
        const radioAll = document.createElement('div');
        radioAll.id = 'search-mode-radio-all';
        radioAll.classList.add('search-mode-radio-item', 'custom-radio');
        radioAll.dataset.value = 'all';
        radioAll.dataset.state = 'false'; // default state is "all" selected | set as boolean to distinguish from the other state values (0, 1, 2) 
        // radio button for search mode | any
        const radioAny = document.createElement('div');
        radioAny.id = 'search-mode-radio-any';
        radioAny.classList.add('search-mode-radio-item', 'custom-radio');
        radioAny.dataset.value = 'any';
        radioAny.dataset.state = 'true'; // default state is "any" selected
        // label for radio button | all
        const labelAll = document.createElement('div');
        labelAll.id = 'search-mode-label-all';
        labelAll.classList.add('search-mode-radio-label');
        labelAll.textContent = 'All';
        // label for radio button | any
        const labelAny = document.createElement('div');
        labelAny.id = 'search-mode-label-any';
        labelAny.classList.add('search-mode-radio-label');
        labelAny.textContent = 'Any';

        // include / exclude tags logic
        radioAll?.addEventListener('click', () => {
            radioAll!.dataset.state = 'true';
            radioAny!.dataset.state = 'false';
        })
        radioAny?.addEventListener('click', () => {
            radioAll!.dataset.state = 'false';
            radioAny!.dataset.state = 'true';
        })

        radioContainer.append(radioAll, labelAll, radioAny, labelAny);

        container.append(label, radioContainer);

        return container;
    }
    private buildSearchInput(): HTMLDivElement {
        const searchContainer = document.createElement('div');
        searchContainer.classList.add('genres-themes-search-container');

        const searchInputContainer = document.createElement('div');
        searchInputContainer.classList.add('genres-themes-search-input-container');

        const searchIcon = document.createElement('div');
        searchIcon.classList.add('search-icon');

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search genres & themes...';
        searchInput.id = 'tag-search-input';
        searchInput.classList.add('genres-themes-search-input');

        searchInputContainer.append(searchIcon, searchInput);

        searchContainer.append(searchInput);

        return searchContainer;
    }
    private buildThemeLabel(): HTMLDivElement {
        const label = document.createElement('h4');
        label.textContent = 'Genres & Themes';
        label.classList.add('genres-themes-container-label');

        return label;
    }
    private buildDemographicLabel(): HTMLDivElement {
        const label = document.createElement('h4');
        label.textContent = 'Demographic';
        label.classList.add('Demographic-container-label');

        return label;
    }
    private buildGenericListItem({id, classes}: { id: string, classes: string[] }): HTMLDivElement {
        const container = document.createElement('div');
        container.id = id;
        container.classList.add(...classes, 'filter-item-list');

        return container;
    }
    private setNovelStatusFilter() {
        const container = this.NovelStatusDialog;
        if (!container) return;

        container.innerHTML = '';

        const novelStatusCheckbox = this.buildNovelStatusCheckbox();

        container.append(novelStatusCheckbox);
    }
    private setSiteFilter() {
        const container = this.SiteDialog;
        if (!container) return;

        container.innerHTML = '';

        const siteCheckbox = this.buildSiteCheckbox();

        container.append(siteCheckbox);
    }
    private setReleaseDateFilter() {
        const container = this.ReleaseDateDialog;
        if (!container) return;

        container.innerHTML = '';

        const releaseDateCheckbox = this.buildReleaseDateCheckbox();

        container.append(releaseDateCheckbox);
    }
    private setSortFilter() {
        const container = this.SortDialog;
        if (!container) return;

        container.innerHTML = '';

        const sortCheckbox = this.buildSortCheckbox();

        container.append(sortCheckbox);
    }
    private buildStarRatingCheckbox(min: number, max: number): HTMLDivElement {
        const container = document.createElement('div');

        container.classList.add('star-rating-checkbox-container', 'filter-checkbox-container');

        for (let i = min; i <= max; i++) {
            // create a generic list item for each dataset entry
            const listItem = this.buildGenericListItem({id: `generic-list-checkbox-${i}`, classes: ['star-rating-item-list']});

            // build checkbox to list item
            const checkbox = document.createElement('div');
            checkbox.id = `star-rating-checkbox-${i}`;
            checkbox.classList.add('star-rating-checkbox-item', 'filter-item-checkbox', 'custom-checkbox');
            checkbox.dataset.value = String(i);
            checkbox.dataset.state = '0';
            checkbox.dataset.filterType = 'star-rating';

            // build label to list item
            const label = document.createElement('div');
            label.id = `star-rating-label-${i}`;
            label.classList.add('star-rating-label-item', 'filter-item-label', 'custom-checkbox');
            label.textContent = i === 1 ? '1 star' : `${i} stars`;
            label.dataset.value = String(i);

            // append checkbox & label to list item
            listItem.append(checkbox, label);
            container.appendChild(listItem);
        }
        return container;
    }
    

    private buildContentRatingCheckbox(): HTMLDivElement {
        const container = document.createElement('div');
        container.classList.add('content-rating-checkbox', 'filter-checkbox-container');

        for (const [i, name, defaultCheckConfig] of CONTENT_RATING_MAP) {
            // create a generic list item for each dataset entry
            const listItem = this.buildGenericListItem({id: `generic-list-checkbox-${i}`, classes: ['content-rating-item-list']});

            // build checkbox
            const checkbox = document.createElement('div');
            checkbox.id = `content-rating-checkbox-${i}`;
            checkbox.classList.add('content-rating-checkbox-item', 'filter-item-checkbox', 'custom-checkbox');
            checkbox.dataset.value = `${i}`;
            checkbox.dataset.state = String(defaultCheckConfig);
            checkbox.dataset.filterType = 'Content Rating';

            // build label
            const label = document.createElement('div');
            label.id = `content-rating-label-${i}`;
            label.classList.add('content-rating-label-item', 'filter-item-label', 'custom-checkbox');
            label.textContent = String(name);

            
            listItem.append(checkbox, label);
            container.append(listItem);
        }

        return container;
    }

    private buildNovelTypeCheckbox(): HTMLDivElement {
        const container = document.createElement('div');
        container.classList.add('novel-type-checkbox', 'filter-checkbox-container');

        const novelTypes = this.settings.ContentTypesAndStatuses.TYPE_OPTIONS;

        for (const name of novelTypes) {
            // create a generic list item for each dataset entry
            const listItem = this.buildGenericListItem({id: `generic-list-checkbox-${name}`, classes: ['novel-type-item-list']});

            // build checkbox
            const checkbox = document.createElement('div');
            checkbox.id = `novel-type-checkbox-${name}`;
            checkbox.classList.add('novel-type-checkbox-item', 'filter-item-checkbox', 'custom-checkbox');
            checkbox.dataset.value = `${name}`;
            checkbox.dataset.state = '0';
            checkbox.dataset.filterType = 'Novel Type';

            // build label
            const label = document.createElement('div');
            label.id = `novel-type-label-${name}`;
            label.classList.add('novel-type-label-item', 'filter-item-label', 'custom-checkbox');
            label.textContent = `${name}`;

            listItem.append(checkbox, label);
            container.appendChild(listItem);
        }
        return container;
    }
    protected onMarkerClick(marker: HTMLElement): void {
        const hermidataId = marker.dataset.hermidata;
        const url = marker.dataset.url;
        if (!hermidataId) return;

        const hermidata = new HermidataModel(this.AllHermidata[hermidataId]);

        if (!hermidata) return;

        hermidata.jumpToUrl(url);
    }
    private buildGenresThemesCheckbox(): HTMLDivElement {
        const container = document.createElement('div');
        container.classList.add('genres-themes-checkbox', 'filter-checkbox-container');
        
        const allTagsValues = Array.from(getAllTags(this.AllHermidata).keys());

        

        const genresThemes = allTagsValues.filter(tag => !DEMOGRAPHIC_TAGS.includes(tag));

        for (const name of genresThemes) {
            // create a generic list item for each dataset entry
            const listItem = this.buildGenericListItem({id: `generic-list-checkbox-${name}`, classes: ['genres-themes-item-list', 'genres-themes-demographic-item-list']});

            // build checkbox
            const checkbox = document.createElement('div');
            checkbox.id = `genres-themes-checkbox-${name}`;
            checkbox.classList.add('genres-themes-checkbox-item', 'filter-item-checkbox', 'custom-checkbox');
            checkbox.dataset.value = `${name}`;
            checkbox.dataset.state = '0';
            checkbox.dataset.filterType = 'genres-themes';

            // build label
            const label = document.createElement('div');
            label.id = `genres-themes-label-${name}`;
            label.classList.add('genres-themes-label-item', 'filter-item-label', 'custom-checkbox');
            label.textContent = `${name}`;

            listItem.append(checkbox, label);
            container.appendChild(listItem);
        }
        return container;
    }
    private buildDemographicCheckbox(): HTMLDivElement {
        const container = document.createElement('div');
        container.classList.add('demographic-checkbox', 'filter-checkbox-container');

        for (const name of DEMOGRAPHIC_TAGS) {
            // create a generic list item for each dataset entry
            const listItem = this.buildGenericListItem({id: `generic-list-checkbox-${name}`, classes: ['demographic-item-list', 'genres-themes-demographic-item-list']});

            // build checkbox
            const checkbox = document.createElement('div');
            checkbox.id = `demographic-checkbox-${name}`;
            checkbox.classList.add('demographic-checkbox-item', 'filter-item-checkbox', 'custom-checkbox');
            checkbox.dataset.value = `${name}`;
            checkbox.dataset.state = '0';
            checkbox.dataset.filterType = 'Demographic';

            // build label
            const label = document.createElement('div');
            label.id = `demographic-label-${name}`;
            label.classList.add('demographic-label-item', 'filter-item-label', 'custom-checkbox');
            label.textContent = `${name}`;

            listItem.append(checkbox, label);
            container.appendChild(listItem);
        }
        return container;
    }
    private buildNovelStatusCheckbox(): HTMLDivElement {
        const container = document.createElement('div');
        container.classList.add('novel-status-checkbox', 'filter-checkbox-container');

        const novelStatuses = this.settings.ContentTypesAndStatuses.STATUS_OPTIONS;

        for (const name of novelStatuses) {
            // create a generic list item for each dataset entry
            const listItem = this.buildGenericListItem({id: `generic-list-checkbox-${name}`, classes: ['novel-status-item-list']});

            // build checkbox
            const checkbox = document.createElement('div');
            checkbox.id = `novel-status-checkbox-${name}`;
            checkbox.classList.add('novel-status-checkbox-item', 'filter-item-checkbox', 'custom-checkbox');
            checkbox.dataset.value = `${name}`;
            checkbox.dataset.state = '0';
            checkbox.dataset.filterType = 'Novel Status';

            // build label
            const label = document.createElement('div');
            label.id = `novel-status-label-${name}`;
            label.classList.add('novel-status-label-item', 'filter-item-label', 'custom-checkbox');
            label.textContent = `${name}`;

            listItem.append(checkbox, label);
            container.appendChild(listItem);
        }
        return container;
    }
    private buildSiteCheckbox(): HTMLDivElement {
        const container = document.createElement('div');
        container.classList.add('site-checkbox', 'filter-checkbox-container');

        const siteNames = Array.from(new Set(Object.values(this.AllHermidata).flatMap(novel => novel.meta.altSources || novel.source)))
            .filter(name => name !== null && name !== undefined && name.trim() !== '');
        
        for (const name of siteNames) {
            // create a generic list item for each dataset entry
            const listItem = this.buildGenericListItem({id: `generic-list-checkbox-${name}`, classes: ['site-item-list']});

            // build checkbox
            const checkbox = document.createElement('div');
            checkbox.id = `site-checkbox-${name}`;
            checkbox.classList.add('site-checkbox-item', 'filter-item-checkbox', 'custom-checkbox');
            checkbox.dataset.value = `${name}`;
            checkbox.dataset.state = '0';
            checkbox.dataset.filterType = 'Site';

            // build label
            const label = document.createElement('div');
            label.id = `site-label-${name}`;
            label.classList.add('site-label-item', 'filter-item-label', 'custom-checkbox');
            label.textContent = `${name}`;

            listItem.append(checkbox, label);
            container.appendChild(listItem);
        }
        return container;
    }
    private buildReleaseDateCheckbox(): HTMLDivElement {
        const container = document.createElement('div');
        container.classList.add('release-date-checkbox', 'filter-checkbox-container');

        const RELEASE_DATE_TAGS = this.generateDateFilterSection();

        for (const name of RELEASE_DATE_TAGS) {
            // create a generic list item for each dataset entry
            const listItem = this.buildGenericListItem({id: `generic-list-checkbox-${name}`, classes: ['release-date-item-list']});

            // build checkbox
            const checkbox = document.createElement('div');
            checkbox.id = `release-date-checkbox-${name}`;
            checkbox.classList.add('release-date-checkbox-item', 'filter-item-checkbox', 'custom-checkbox');
            checkbox.dataset.value = `${name}`;
            checkbox.dataset.state = '0';
            checkbox.dataset.filterType = 'Release Date';

            // build label
            const label = document.createElement('div');
            label.id = `release-date-label-${name}`;
            label.classList.add('release-date-label-item', 'filter-item-label', 'custom-checkbox');
            label.textContent = `${name}`;

            listItem.append(checkbox, label);
            container.appendChild(listItem);
        }
        return container;
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
    private buildSortCheckbox(): HTMLDivElement {
        const container = document.createElement('div');
        container.classList.add('sort-checkbox', 'filter-checkbox-container');

        const SORT_TAGS = this.generateSortFilterSection();

        for (const name of SORT_TAGS) {
            // create a generic list item for each dataset entry
            const listItem = this.buildGenericListItem({id: `generic-list-checkbox-${name}`, classes: ['sort-item-list']});

            // build checkbox
            const checkbox = document.createElement('div');
            checkbox.id = `sort-checkbox-${name}`;
            checkbox.classList.add('sort-checkbox-item', 'filter-item-checkbox', 'custom-checkbox');
            checkbox.dataset.value = `${name}`;
            checkbox.dataset.state = '0';
            checkbox.dataset.filterType = 'Sort';
            // comment out this line to disable all sort options
            // that needs custom attributes added to work
            //if (name === "Rating" || name === "Author" || name === "Release Date") checkbox.dataset.disabled = 'true'; // TEMP: disable sort options until implemented

            // build label
            const label = document.createElement('div');
            label.id = `sort-label-${name}`;
            label.classList.add('sort-label-item', 'filter-item-label', 'custom-checkbox');
            label.textContent = `${name}`;

            listItem.append(checkbox, label);
            container.appendChild(listItem);
        }
        return container;
    }
}