import { CONTENT_RATINGS, DEMOGRAPHIC_TAGS } from "../../shared/constants";
import { getAllTags } from "../../shared/db/Storage";
import type { Hermidata, Settings } from "../../shared/types";
import { getElement } from "../../shared/utils/Selection";
import { RSSPageBuilder } from "../build";

export class filter extends RSSPageBuilder {

    private readonly starRatingDialog: HTMLElement | null = getElement('#StarRating-dialog');

    private readonly contentRatingDialog: HTMLElement | null = getElement('#ContentRating-dialog');
    
    private readonly novelTypeDialog: HTMLElement | null = getElement('#NovelType-dialog');
    
    private readonly genresDialog: HTMLElement | null = getElement('#Genres-dialog');
    
    private readonly demographicDialog: HTMLElement | null = getElement('#Demographic-dialog');
    

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


    public build(): Promise<void> {
        
        this.setFilterContent();

        return Promise.resolve();

    }
    protected reload(): void {
        throw new Error("Method not implemented.");
    }

    private setEventListener(): void {
        throw new Error("Method not implemented.");
    }


    setFilter() {
        // TODO
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
        // Genres & themes
        this.setGenresThemesFilter();

        // Demographic
        // this.setDemographicFilter();

        // Novel Status
        // this.setNovelStatusFilter();

        // Site
        // this.setSiteFilter();

        // Author
        // this.setAuthorFilter();

        // Release Date
        // this.setReleaseDateFilter();

        // Chapter completion level
        // this.setChapterCompletionFilter();

        // Sort

        
    }


    private setStarRatingFilter(): void {
        const container = this.starRatingDialog;
        if (!container) return;

        container.innerHTML = '';

        const starRatingCheckbox = this.buildStarRatingCheckbox(1,5);

        const starRatingLabel = this.buildStarRatingLabel(1,5);

        container.append(starRatingCheckbox, starRatingLabel);
    }
    private setContentRatingFilter() {
        const container = this.contentRatingDialog;
        if (!container) return;

        container.innerHTML = '';

        const contentRatingCheckbox = this.buildContentRatingCheckbox();

        const contentRatingLabel = this.buildContentRatingLabel();

        container.appendChild(contentRatingCheckbox);
    }
    private setFilterNovelTypeFilter() {
        const container = this.novelTypeDialog;
        if (!container) return;

        container.innerHTML = '';

        const novelTypeCheckbox = this.buildNovelTypeCheckbox();

        container.appendChild(novelTypeCheckbox);
    }
    private setGenresThemesFilter() {
        const container = this.genresDialog;
        if (!container) return;

        container.innerHTML = '';

        const genresThemesCheckbox = this.buildGenresThemesCheckbox();

        container.appendChild(genresThemesCheckbox);
    }
    private buildStarRatingCheckbox(min: number, max: number): HTMLDivElement {
        const container = document.createElement('div');
        container.classList.add('star-rating-checkbox');

        for (let i = min; i <= max; i++) {
            const checkbox = document.createElement('div');
            checkbox.id = `star-rating-checkbox-${i}`;
            checkbox.classList.add('star-rating-checkbox-item', 'filter-item-checkbox', 'custom-checkbox');
            checkbox.dataset.value = `${i}`;
            checkbox.dataset.state = '0';
            container.appendChild(checkbox);
        }

        return container;
    }
    private buildStarRatingLabel(min: number, max: number): HTMLDivElement {
        const container = document.createElement('div');
        container.classList.add('star-rating-label');

        for (let i = min; i <= max; i++) {
            const checkbox = document.createElement('div');
            checkbox.id = `star-rating-checkbox-${i}`;
            checkbox.classList.add('star-rating-checkbox-item', 'filter-item-label', 'custom-checkbox');
            checkbox.textContent = i === 1 ? '1 star' : `${i} stars`;

            container.appendChild(checkbox);
        }
        return container;
    }

    private buildContentRatingCheckbox(): HTMLDivElement {
        const container = document.createElement('div');
        container.classList.add('content-rating-checkbox');
        
        // temporary constants, will be moved to constants file
        // [ back-end, [front-end, default state] ]
        const contentRatings: Map<string, [string, boolean]> = new Map([
            ['G', ['Safe', true]],
            ['PG', ['Suggestive', true]],
            ['R', ['Erotica', false]],
            ['NR', ['Pornographic', false]],
        ])

        for (const [i, [_, defaultCheckConfig]] of contentRatings) {
            const checkbox = document.createElement('div');
            checkbox.id = `content-rating-checkbox-${i}`;
            checkbox.classList.add('content-rating-checkbox-item', 'filter-item-checkbox', 'custom-checkbox');
            checkbox.dataset.value = `${i}`;
            checkbox.dataset.state = String(defaultCheckConfig);

            container.appendChild(checkbox);
        }

        return container;
    }
    private buildContentRatingLabel(): HTMLDivElement {
        const container = document.createElement('div');
        container.classList.add('content-rating-label');


        for (const [i, [name, _]] of CONTENT_RATINGS) {
            const checkbox = document.createElement('div');
            checkbox.id = `content-rating-checkbox-${i}`;
            checkbox.classList.add('content-rating-checkbox-item', 'filter-item-label', 'custom-checkbox');
            checkbox.textContent = `${name}`;

            container.appendChild(checkbox);
        }

        return container;
    }

    private buildNovelTypeCheckbox(): HTMLDivElement {
        const container = document.createElement('div');
        container.classList.add('novel-type-checkbox');

        const novelTypes = this.settings.ContentTypesAndStatuses.TYPE_OPTIONS;

        for (const name of novelTypes) {
            const checkbox = document.createElement('div');
            checkbox.id = `novel-type-checkbox-${name}`;
            checkbox.classList.add('novel-type-checkbox-item', 'filter-checkbox-item');
            checkbox.dataset.value = `${name}`;
            checkbox.dataset.state = '0';
            checkbox.textContent = `${name}`;
        }
        return container;
    }
    private buildGenresThemesCheckbox(): HTMLDivElement {
        const container = document.createElement('div');
        container.classList.add('genres-themes-checkbox');
        
        const allTagsValues = Array.from(getAllTags(this.AllHermidata).keys());

        

        const genresThemes = allTagsValues.filter(tag => DEMOGRAPHIC_TAGS.includes(tag));

        for (const name of genresThemes) {
            const checkbox = document.createElement('div');
            checkbox.id = `genres-themes-checkbox-${name}`;
            checkbox.classList.add('genres-themes-checkbox-item', 'filter-checkbox-item');
            checkbox.dataset.value = `${name}`;
            checkbox.dataset.state = '0';
            checkbox.textContent = `${name}`;
        }
        return container;
    }
}