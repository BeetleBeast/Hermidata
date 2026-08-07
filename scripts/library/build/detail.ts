import { DEMOGRAPHIC_TAGS } from "../../shared/constants";
import { HermidataModel } from "../../shared/utils/HermidataSelector";
import { findByTitleOrAlt } from "../../shared/utils/StringOutput";
import { RSSPageBuilder } from "../build";

export class Detail extends RSSPageBuilder {


    private readonly hermidata: HermidataModel = this.getCurrentHermidata();

    private readonly utilityMarkerSortChapter = document.querySelector<HTMLDivElement>('#hermidata-markers-utility-sort-chapter');

    private readonly utilityMarkerSortDate = document.querySelector<HTMLDivElement>('#hermidata-markers-utility-sort-date');

    private readonly altTitleContainer = document.querySelector<HTMLDivElement>('#hermidata-alternative-titles-list');

    private readonly altTitleBtn = document.querySelector<HTMLDivElement>('#hermidata-alternative-title-button');

    private readonly starRatingEdit = document.querySelector<HTMLDivElement>('#hermidata-starRating-edit');

    private readonly searchMarker = document.querySelector<HTMLInputElement>('#search-marker');

    private readonly searchInput = document.querySelector<HTMLInputElement>('#search');

    private readonly autocompleteContainer = document.querySelector<HTMLDivElement>('#search-suggestions');

    private viewMode: 'chapter' | 'date' = 'chapter';

    private sortMode: 'asc' | 'desc' = 'asc';

    private selectedIndex: number = -1;

    public build(): void {
        
        
        // 1. Build the page

        // 2. populate page
        this.populateDetails();

        this.addEventListener();

        this.sort();

    }
    public reload(): void {
        // force page reload
        window.location.reload();
    }

    private addEventListener(): void {
        
        // on clicked Sort button
        this.utilityMarkerSortChapter?.addEventListener('click', () => {
            const nextSortMode = this.sortMode === 'asc' ? 'desc' : 'asc';
            this.setMarkersViewMode('chapter');
            this.setMarkersSortMode(nextSortMode);
            this.sort();
        });
        this.utilityMarkerSortDate?.addEventListener('click', () => {
            const nextSortMode = this.sortMode === 'asc' ? 'desc' : 'asc';
            this.setMarkersViewMode('date');
            this.setMarkersSortMode(nextSortMode);
            this.sort();
        });
        // on clicked alt titles
        this.altTitleBtn?.addEventListener('click', () => {
            this.altTitleContainer!.dataset.closed = this.altTitleContainer!.dataset.closed === 'true' ? 'false' : 'true';
            document.querySelector<SVGElement>('.hermidata-alternative-title-button-arrow')!.dataset.closed = this.altTitleContainer!.dataset.closed;
        });
        // on marker search
        this.searchMarker?.addEventListener('input', (e) => {
            const target = e.target as HTMLInputElement;
            const value = target.value;
            this.search(value);
        })
        // on global search
        this.searchInput?.addEventListener('input', (e) => this.handleSearchInput(e, this.autocompleteContainer!));
        this.searchInput?.addEventListener('keydown', (e) => this.setupSearchBar(e, this.autocompleteContainer!));

        // on clicked Edit star button
        this.starRatingEdit?.addEventListener('click', this.editStarRating);
    }
    private jumpToChapter(url: string): void {
        // TODO: implement
        window.open(url, '_blank');
    }
    private setMarkersSortMode(newSortMode: 'asc' | 'desc'): void {
        const currentButtonSelected = document.querySelector<HTMLButtonElement>('.filter-button[data-state="true"]');

        if (!currentButtonSelected) return;

        const newSortArrow = newSortMode === 'asc' ?  '↓': '↑';
        const text = currentButtonSelected.textContent?.replace('↑', '').replace('↓', '');
        currentButtonSelected.textContent = `${newSortArrow}  ${text}`;

        currentButtonSelected.dataset.sort = newSortMode;

        this.sortMode = newSortMode;

        document.body.dataset.ascMode = this.sortMode === 'asc' ? 'true' : 'false';
    }
    private editStarRating = (): void => {
        const starRatingElement = document.querySelector<HTMLDivElement>('#hermidata-starRating');
        // TODO: add star rating to hermidata
        const starRatingValue = /*this.hermidata.meta.starRating ?? */ starRatingElement?.textContent?.split(' ')[1];

        if (!starRatingValue || !starRatingElement) return;

        // change star rating element from div to input
        starRatingElement.replaceWith(this.createStarRatingInput(starRatingValue));

        // focus on input
        const input = document.querySelector<HTMLInputElement>('#hermidata-starRating');
        input?.focus();

        // set edit button to save
        if (!this.starRatingEdit) return;
        this.starRatingEdit.textContent = 'Save';
        this.starRatingEdit.removeEventListener('click', this.editStarRating);
        this.starRatingEdit.addEventListener('click', this.saveStarRating);

    }
    private saveStarRating =(): void => {
        const input = document.querySelector<HTMLInputElement>('#hermidata-starRating');
        // TODO: add star rating to hermidata
        /*this.hermidata.meta.starRating = input.value;*/
        this.restoreStarRating();

        this.starRatingEdit!.removeEventListener('click', this.saveStarRating);
        this.starRatingEdit!.addEventListener('click', this.editStarRating);
    }
    private createStarRatingInput(starRatingValue: string): HTMLInputElement {
        const input = document.createElement('input');
        input.type = 'number';
        input.value = starRatingValue;
        input.step = '0.1';
        input.min = '0';
        input.max = '10';
        input.classList.add('hermidata-starRating', 'hermidata-starRating-input');
        input.id = 'hermidata-starRating';
        input.addEventListener('focusout', () => {
            // TODO: add star rating to hermidata
            /*this.hermidata.meta.starRating = input.value;*/
            this.saveStarRating();
        });
        return input;
    }
    private createStarRatingDiv(starRatingValue: string): HTMLDivElement {
        const div = document.createElement('div');
        div.classList.add('hermidata-starRating');
        div.id = 'hermidata-starRating';
        div.textContent = `★ ${starRatingValue}`;
        return div;
    }
    private restoreStarRating(): void {
        const starRatingElement = document.querySelector<HTMLInputElement>('#hermidata-starRating');
        const starRatingValue = /*this.hermidata.meta.starRating ?? */ starRatingElement?.value
        if (!starRatingValue || !starRatingElement) return;

        starRatingElement.replaceWith(this.createStarRatingDiv(starRatingValue));

        // set edit button text back to Edit
        if (!this.starRatingEdit) return;
        this.starRatingEdit.textContent = 'Edit';
    }

    public setMarkersViewMode(newViewMode: 'chapter' | 'date'): void {
        const buttons = document.querySelectorAll<HTMLButtonElement>('.filter-button');
        const currentButtonSelected = document.querySelector<HTMLButtonElement>(newViewMode === 'chapter' ? "#hermidata-markers-utility-sort-chapter" : "#hermidata-markers-utility-sort-date");

        if (!currentButtonSelected) return;

        // toggle button
        buttons.forEach(button => button.dataset.state = (button === currentButtonSelected) ? 'true' : 'false' );
        
        this.viewMode = newViewMode;

        document.body.dataset.chapterMode = this.viewMode === 'chapter' ? 'true' : 'false';
    }
    
    private getIdFromUrl(): string | null {
        const hash = window.location.hash; // "#/id/someID"
        const match = hash.match(/^#\/id\/(.+)$/);
        return match ? match[1] : null;
    }

    /** Get the current hermidata from the id parameter inside the url */
    private getCurrentHermidata(): HermidataModel {
        const id = this.getIdFromUrl();
        if (!id) throw new Error("No id found in url");

        const hermidata = this.AllHermidata[id];
        if (!hermidata) throw new Error(`No hermidata found for id ${id}`);

        return new HermidataModel(hermidata);
    }
    private populateDetails() {
        // main
        this.populateMainDetails();
        // markers
        this.populateMarkers();
        // notes
        this.populateNotes();
    }
    private populateMainDetails() {
        // image
        this.populateImage();
        // read latest chapter button
        this.populateReadLatestChapterButton();
        // title
        this.populateTitle();
        // alternative titles
        this.populateAlternativeTitles();
        // metadata
        this.populateMetadata();
        
    }
    private populateImage() {
        const container = document.getElementById('hermidata-img-container');
        if (!container) throw new Error("Image container does not exist");

        const img = document.createElement('img');
        img.id = 'hermidata-img';
        img.src = this.hermidata.rss?.image ?? '../../../assets/icon/icon48.png'
        img.alt = `${this.hermidata.rss?.latestItem.title} Image`

        container.appendChild(img);
        
    }
    private populateReadLatestChapterButton() {
        const button = document.getElementById('hermidata-readLatest-btn');
        if (!button) throw new Error("Read latest chapter button does not exist");

        button.addEventListener('click', () => {
            window.open(this.hermidata.rss?.latestItem.link ?? this.hermidata.GetUrl(), '_blank');
        });
    }
    private populateTitle() {
        const title = document.getElementById('hermidata-title');
        if (!title) throw new Error("Title does not exist");

        title.textContent = this.hermidata.title;
    }
    private populateAlternativeTitles() {
        const container = document.getElementById('hermidata-alternative-titles-list');
        if (!container) throw new Error("Alternative titles does not exist");

        const allAlternativeTitles = this.hermidata.meta.altTitles;

        // button to open alt titles
        const altTitleButton = document.querySelector<HTMLDivElement>('#hermidata-alternative-title-button-text');
        if (!altTitleButton) throw new Error("Alternative title button does not exist");
        altTitleButton.textContent = this.hermidata.title;

        // create multiple titles
        for (let i = 0; i < allAlternativeTitles.length; i++) {
            const title = document.createElement('div');
            title.classList.add('hermidata-alternative-title');
            title.textContent = allAlternativeTitles[i];
            container.appendChild(title);
        }

    }
    private populateMetadata() {
        // novel type
        this.populateNovelType();
        // content rating
        this.populateContentRating();
        // release date
        this.populateReleaseDate();
        // novel status
        this.populateNovelStatus();

        // star rating
        this.populateStarRating();

        // Genres, demographics, Sources and latest release

        // genres
        this.populateGenres();
        // demographics
        this.populateDemographics();
        // sources
        this.populateSources();
        // latest release
        this.populateLatestRelease();
    }
    private populateNovelType() {
        const novelType = document.getElementById('hermidata-novelType');
        if (!novelType) throw new Error("Novel type does not exist");

        novelType.textContent = this.hermidata.novelType.toUpperCase();
    }
    private populateContentRating() {
        const contentRating = document.getElementById('hermidata-contentRating');
        if (!contentRating) throw new Error("Content rating does not exist");

        // TODO: add content rating to hermidata
        // TEMP: use default temporaryContentRating until implemented
        let temporaryContentRating: string; 
        
        temporaryContentRating = this.hermidata.meta.tags.some(tag => tag === 'Hentai') ? 'Pornographic' : 'Safe';
        temporaryContentRating = this.hermidata.meta.tags.some(tag => tag === 'Ecchi') ? 'Explicit' : 'Safe';
        
        contentRating.textContent = temporaryContentRating.toUpperCase();
    }
    private populateReleaseDate() {
        const releaseDate = document.getElementById('hermidata-releaseDate');
        if (!releaseDate) throw new Error("Release date does not exist");

        releaseDate.textContent = this.setToFrenchDate(this.hermidata.meta.originalRelease ?? this.hermidata.meta.added);
    }
    private populateNovelStatus() {
        const novelStatus = document.getElementById('hermidata-novelStatus');
        if (!novelStatus) throw new Error("Novel status does not exist");

        novelStatus.textContent = this.hermidata.meta.novelStatus.toUpperCase();
    }
    private populateStarRating() {
        const starRating = document.getElementById('hermidata-starRating');
        if (!starRating) throw new Error("Star rating does not exist");

        // TODO: add star rating to hermidata
        // TEMP: use default 5 until implemented
        starRating.textContent = "5.0"; //String(this.hermidata.meta.starRating);
    }
    private populateGenres() {
        const genres = document.getElementById('hermidata-genres');
        if (!genres) throw new Error("Genres does not exist");

        const allTagsUsed = this.hermidata.meta.tags;
        
        const genresThemes = allTagsUsed.filter(tag => !DEMOGRAPHIC_TAGS.includes(tag));
        const allGenres = genresThemes.join(', ');
        genres.textContent = allGenres || "--None--";
        genres.dataset.hasNone = allGenres ? 'false' : 'true';
    }
    private populateDemographics() {
        const demographics = document.getElementById('hermidata-demographics');
        if (!demographics) throw new Error("Demographics does not exist");

        const allTagsUsed = this.hermidata.meta.tags;
        const allDemographics = allTagsUsed.filter(tag => DEMOGRAPHIC_TAGS.includes(tag)).join(', ');
        
        demographics.textContent = allDemographics || "--None--";
        demographics.dataset.hasNone = allDemographics ? 'false' : 'true';
    }
    private populateSources() {
        const sources = document.getElementById('hermidata-sources');
        if (!sources) throw new Error("Sources does not exist");

        const allSources = this.hermidata.meta.altSources.join(', ');
        sources.textContent = allSources || "--None--";
        sources.dataset.hasNone = sources ? 'false' : 'true';
    }
    private populateLatestRelease() {
        const latestRelease = document.getElementById('hermidata-latestRelease');
        if (!latestRelease) throw new Error("Latest release does not exist");

        const latestChapter = this.hermidata.GetLatestChapter();
        const SourceOfLatestChapter = this.hermidata.GetSourceOfLatestChapter();

        latestRelease.textContent = `Ch. ${latestChapter} by ${SourceOfLatestChapter}`
    }
    private populateMarkers() {
        const container = document.getElementById('hermidata-markers-list');
        if (!container) throw new Error("Markers does not exist");

        const allMarkers = this.hermidata.chapter.bookmarks;

        for (const [index, marker] of Object.entries(allMarkers)) {
            const markerElementContainer = document.createElement('div');
            markerElementContainer.classList.add('hermidata-marker-container');
            markerElementContainer.dataset.id = marker.id;
            markerElementContainer.id = `hermidata-marker-container-${index}`;

            // add marker row container
            const markerRowContainer = document.createElement('div');
            markerRowContainer.classList.add('hermidata-marker-row');
            
            // add marker color bookmark
            const markerColor = document.createElement('div');
            markerColor.classList.add('hermidata-marker-color');
            markerColor.style.backgroundColor = marker.color;

            // add marker element
            const markerElement = document.createElement('div');
            markerElement.classList.add('hermidata-marker');
            markerElement.id = `hermidata-marker-${index}`;
            markerElement.addEventListener('click', () => this.jumpToChapter(marker.url));

            // add marker chapter
            const markerChapter = document.createElement('div');
            markerChapter.classList.add('hermidata-marker-chapter');
            markerChapter.textContent = `Ch. ${marker.current}`;

            // add marker label
            const markerLabel = document.createElement('div');
            markerLabel.classList.add('hermidata-marker-label');
            markerLabel.textContent = marker.label;
            
            // add marker read status
            const markerReadStatus = document.createElement('div');
            markerReadStatus.classList.add('hermidata-marker-readStatus');
            markerReadStatus.textContent = marker.readStatus;

            // add marker last updated/added
            const markerLastUpdated = document.createElement('div');
            markerLastUpdated.classList.add('hermidata-marker-lastUpdated');
            markerLastUpdated.textContent = this.getTimeAgo(marker.updatedAt) ?? this.getTimeAgo(marker.createdAt);
            
            // append
            markerElement.append(markerChapter, markerLabel, markerReadStatus, markerLastUpdated);
            markerRowContainer.append(markerColor, markerElement);
            markerElementContainer.append(markerRowContainer);

            // add marker notes
            // NOTE: marker notes are optional AND need to be set under the marker element
            if (marker.note) {
                const markerNotesContainer = document.createElement('div');
                markerNotesContainer.classList.add('hermidata-marker-notes');
                markerElementContainer.append(markerNotesContainer);

                const markerNotes = document.createElement('div');
                markerNotes.classList.add('hermidata-marker-notes-inner');
                markerNotes.textContent = marker.note;
                markerNotesContainer.append(markerNotes);
            }

            container.appendChild(markerElementContainer);
            
        }
    }
    private populateNotes() {
        const notes = document.getElementById('hermidata-notes-content');
        if (!notes) throw new Error("Notes does not exist");

        notes.textContent = this.hermidata.meta.notes;
    }
    private sort() {
        const container = document.getElementById('hermidata-markers-list');
        if (!container) throw new Error("Markers does not exist");

        const allMarkers = document.querySelectorAll<HTMLDivElement>('.hermidata-marker-container');

        const newMarkersList: HTMLDivElement[] = Array.from(allMarkers);
        
        const sortByDate = (a: HTMLDivElement, b: HTMLDivElement) => {
            const markerA = this.getMarkerFromID(a.dataset.id!);
            const markerB = this.getMarkerFromID(b.dataset.id!);

            const dateA = markerA.updatedAt ?? markerA.createdAt;
            const dateB = markerB.updatedAt ?? markerB.createdAt;

            const asc = new Date(dateA).getTime() - new Date(dateB).getTime();
            const desc = new Date(dateB).getTime() - new Date(dateA).getTime();

            return this.sortMode === 'asc' ? asc : desc;
        }
        const sortByChapter = (a: HTMLDivElement, b: HTMLDivElement) => {
            const markerA = this.getMarkerFromID(a.dataset.id!);
            const markerB = this.getMarkerFromID(b.dataset.id!);

            const chapterA = markerA.current;
            const chapterB = markerB.current;

            const asc = chapterA - chapterB;
            const desc = chapterB - chapterA;

            return this.sortMode === 'asc' ? asc : desc;
        }

        const sortMode = this.viewMode === 'date' ? sortByDate : sortByChapter;

        newMarkersList.sort(sortMode);

        container.append(...newMarkersList);
    }

    private getMarkerFromID(markerID: string) {
        return this.hermidata.chapter.bookmarks[markerID];
    }
    private search(query: string) {
        const allItems = document.querySelectorAll<HTMLDivElement>(('.hermidata-marker-container'))

        if (!allItems) return
        // If no query, restore all items to their filter-determined state
        if (!query) {
            allItems.forEach(item => {
                // Restore visibility based on what filters decided
                
                item.style.display = 'flex';
            });
            this.removeNoResultsMessage();
            return;
        }

        // With a query: check both filter state AND search match
        allItems.forEach(parent => {
            const item = this.getMarkerFromID(parent.dataset.id!);
            const chapterValue = item.current.toString();
            const label = item.label;


            const queryLower = query.toLocaleLowerCase();
            // match chapter
            const chapterLower = chapterValue.toLocaleLowerCase();
            const matchChapter = chapterLower.includes(queryLower);
            // match label
            const labelLower = label.toLocaleLowerCase();
            const matchLabel = labelLower.includes(queryLower);

            const matchesAny = matchChapter || matchLabel;

            // Show only if it passes BOTH filters AND search
            parent.style.display = matchesAny ? 'flex' : 'none';
        });

        // if all hidden, show no results message
        if (Array.from(allItems).every(item => item.style.display === 'none')) this.createNoResultsMessage(query);
        else this.removeNoResultsMessage();
    }
    private removeNoResultsMessage() {
        const oldNoResults = document.querySelector<HTMLDivElement>('.hermidata-no-results');
        if (oldNoResults) oldNoResults.remove();

    }
    private createNoResultsMessage(query: string) {
        // 1. remove all no results messages
        this.removeNoResultsMessage();
        // 2. create new no results message
        const noResults = document.createElement('div');
        noResults.classList.add('hermidata-no-results');
        noResults.textContent = `No results for "${query}"`;

        // 3. append
        const container = document.getElementById('hermidata-markers-list');
        if (!container) throw new Error("Markers does not exist");
        container.append(noResults);
    }

    private setupSearchBar(e_: KeyboardEvent, suggestionBox: HTMLDivElement) {
        const searchInput = document.querySelector<HTMLInputElement>('#search');

        if (!searchInput) throw new Error('Element not found');

        // const items = suggestionBox.querySelectorAll<HTMLDivElement>(`.hermidata-item[data-searchable="true"]`);
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
    private applySearchSelection(input: HTMLInputElement, suggestionBox: HTMLDivElement, value: string) {
        input.value = value;
        suggestionBox.innerHTML = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        suggestionBox.innerHTML = '';
        input.focus();
        const entry = findByTitleOrAlt(value, this.AllHermidata);
        if (!entry) return
        open('./Hermidata.html#/id/' + entry.id);
    }

    private handleSearchInput(e: KeyboardEvent | Event, suggestionBox: HTMLDivElement) {
        const target = e.target as HTMLInputElement;
        const query = target.value.trim().toLowerCase();
        suggestionBox.innerHTML = '';

        if (!query || query == '') {
            return;
        }

        const visibleHashes = Array.from(Object.keys(this.AllHermidata)).map(item => item);
    
        const filtered = Object.entries(this.AllHermidata).filter(([hash, item]) => {
            // Only include if item is currently visible
            if (!visibleHashes.includes(hash)) return false;
            
            return [item.title, ...(item.meta?.altTitles || [])].some(t => t.toLowerCase().includes(query));
        }).map(([, item]) => item);

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
}