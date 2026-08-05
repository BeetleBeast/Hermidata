import { DEMOGRAPHIC_TAGS } from "../../shared/constants";
import { getAllTags } from "../../shared/db/Storage";
import { HermidataModel } from "../../shared/utils/HermidataSelector";
import { RSSPageBuilder } from "../build";

export class Detail extends RSSPageBuilder {


    private readonly hermidata: HermidataModel = this.getCurrentHermidata();

    public build(): void {
        
        
        // 1. Build the page

        // 2. populate page
        this.populateDetails();

    }
    public reload(): void {
        throw new Error("Method not implemented.");
    }

    private addEventListener(): void {
        throw new Error("Method not implemented.");

        // on clicked Edit button
    }
    private jumpToChapter(url: string): void {
        // TODO: implement
        window.open(url, '_blank');
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
        const container = document.getElementById('hermidata-alternative-titles-container');
        if (!container) throw new Error("Alternative titles does not exist");

        const allAlternativeTitles = this.hermidata.meta.altTitles;


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

        novelType.textContent = this.hermidata.novelType;
    }
    private populateContentRating() {
        const contentRating = document.getElementById('hermidata-contentRating');
        if (!contentRating) throw new Error("Content rating does not exist");

        // TODO: add content rating to hermidata
        // TEMP: use default temporaryContentRating until implemented
        let temporaryContentRating: string; 
        
        temporaryContentRating = this.hermidata.meta.tags.some(tag => tag === 'Hentai') ? 'Pornographic' : 'Safe';
        temporaryContentRating = this.hermidata.meta.tags.some(tag => tag === 'Ecchi') ? 'Explicit' : 'Safe';
        
        contentRating.textContent = temporaryContentRating;
    }
    private populateReleaseDate() {
        const releaseDate = document.getElementById('hermidata-releaseDate');
        if (!releaseDate) throw new Error("Release date does not exist");

        releaseDate.textContent = this.hermidata.meta.originalRelease ?? this.hermidata.meta.added;
    }
    private populateNovelStatus() {
        const novelStatus = document.getElementById('hermidata-novelStatus');
        if (!novelStatus) throw new Error("Novel status does not exist");

        novelStatus.textContent = this.hermidata.meta.novelStatus;
    }
    private populateStarRating() {
        const starRating = document.getElementById('hermidata-starRating');
        if (!starRating) throw new Error("Star rating does not exist");

        // TODO: add star rating to hermidata
        // TEMP: use default 5 until implemented
        starRating.textContent = "5"; //String(this.hermidata.meta.starRating);
    }
    private populateGenres() {
        const genres = document.getElementById('hermidata-genres');
        if (!genres) throw new Error("Genres does not exist");

        const allTagsUsed = this.hermidata.meta.tags;
        
                
        
        const genresThemes = allTagsUsed.filter(tag => !DEMOGRAPHIC_TAGS.includes(tag));

        const allGenres = genresThemes.join(', ');
        genres.textContent = allGenres;
    }
    private populateDemographics() {
        const demographics = document.getElementById('hermidata-demographics');
        if (!demographics) throw new Error("Demographics does not exist");

        const allTagsUsed = this.hermidata.meta.tags;
        const allDemographics = allTagsUsed.filter(tag => DEMOGRAPHIC_TAGS.includes(tag)).join(', ');
        demographics.textContent = allDemographics;
    }
    private populateSources() {
        const sources = document.getElementById('hermidata-sources');
        if (!sources) throw new Error("Sources does not exist");

        const allSources = this.hermidata.meta.altSources.join(', ');
        sources.textContent = allSources;
    }
    private populateLatestRelease() {
        const latestRelease = document.getElementById('hermidata-latestRelease');
        if (!latestRelease) throw new Error("Latest release does not exist");

        const latestChapter = this.hermidata.GetLatestChapter();
        const SourceOfLatestChapter = this.hermidata.GetSourceOfLatestChapter();

        latestRelease.textContent = `Ch. ${latestChapter} - by ${SourceOfLatestChapter}`
    }
    private populateMarkers() {
        const container = document.getElementById('hermidata-markers-list');
        if (!container) throw new Error("Markers does not exist");

        const allMarkers = this.hermidata.chapter.bookmarks;

        for (const [index, marker] of Object.entries(allMarkers)) {
            const markerElementContainer = document.createElement('div');
            markerElementContainer.classList.add('hermidata-marker-container');
            markerElementContainer.id = `hermidata-marker-container-${index}`;
            
            // add marker color bookmark
            const markerColor = document.createElement('div');
            markerColor.classList.add('hermidata-marker-color');
            markerColor.style.backgroundColor = marker.color;

            // add marker element
            const markerElement = document.createElement('div');
            markerElement.classList.add('hermidata-marker');
            markerElement.id = `hermidata-marker-${index}`;
            markerElement.addEventListener('click', () => this.jumpToChapter(marker.url));

            // add marker notes
            if (marker.note) {
                const markerNotes = document.createElement('div');
                markerNotes.classList.add('hermidata-marker-notes');
                markerNotes.textContent = marker.note;
                markerElementContainer.append(markerNotes);
            }

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
            markerLastUpdated.textContent = marker.updatedAt ?? marker.createdAt;
            
            // append
            markerElement.append(markerChapter, markerLabel, markerReadStatus, markerLastUpdated);
            markerElementContainer.append(markerColor, markerElement);
            container.appendChild(markerElementContainer);
            
        }
    }
    private populateNotes() {
        const notes = document.getElementById('hermidata-notes-content');
        if (!notes) throw new Error("Notes does not exist");

        notes.textContent = this.hermidata.meta.notes;
    }

}