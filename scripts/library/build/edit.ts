import { ColorPicker } from "../../popup/frontend/ColorPicker";
import { CONTENT_RATING, DEMOGRAPHIC_TAGS } from "../../shared/constants";
import { getAllTags, removeHermidata, saveHermidata, updateHermidata } from "../../shared/db/Storage";
import type { AnyNovelStatus, AnyNovelType, AnyReadStatus, ContentRating, Hermidata, Settings, SwitchConfig, TagMap } from "../../shared/types";
import { HermidataModel } from "../../shared/utils/HermidataSelector";
import { openLink, returnHashedTitle } from "../../shared/utils/StringOutput";
import { PageDetailBuilder, RSSPageBuilder } from "../build";
import { Tags } from "./tags";

export class EditDetail extends RSSPageBuilder {

    private readonly hermidata: HermidataModel = this.getCurrentHermidata();

    private readonly cancelBtn = document.querySelector<HTMLDivElement>('#cancel-edit-btn');
    private readonly saveBtn = document.querySelector<HTMLDivElement>('#edit-info-btn');

    private readonly deleteOpenPanelBtn = document.querySelector<HTMLDivElement>('#delete-info-btn');
    private readonly deleteConfirmationBtn = document.querySelector<HTMLDivElement>('#customPrompt-button-delete');
    private readonly deleteCancelBtn = document.querySelector<HTMLDivElement>('#customPrompt-button-cancel');

    private get imgElement(): (HTMLImageElement | HTMLButtonElement) | null { return document.querySelector<HTMLImageElement | HTMLButtonElement>('#hermidata-img'); }
    private readonly popover = document.querySelector<HTMLDivElement>('#imageChanger-dialog');
    private readonly urlInput = document.querySelector<HTMLInputElement>('#imageChanger-url');
    private readonly fileInput = document.querySelector<HTMLInputElement>('#imageChanger-file');
    private readonly urlConfirmBtn = document.querySelector<HTMLButtonElement>('#imageChanger-url-confirm');

    private genreTags: Tags | null = null;
    private demographicTags: Tags | null = null;

    private currentImageUrl: string | null = null;

    private temporaryBlob: Blob | File | null = null;

    private newAltTitles: string[] | null = null;

    constructor(AllHermidata: Record<string, Hermidata>, settings: Settings) {
            super(AllHermidata, settings);
    
            PageDetailBuilder.hermidata = this.hermidata;
        }


    private getAllDivToInputs(): SwitchConfig[] {
        return [

            { element: document.querySelector<HTMLHeadingElement>('#hermidata-title'), switchTo: 'input', inputType: 'text' }, // main title
            // alternative titles container | special case handled separately

            { element: document.querySelector<HTMLDivElement>('#hermidata-contentRating'), switchTo: 'input', inputType: 'text' }, // content rating
            { element: document.querySelector<HTMLDivElement>('#hermidata-releaseDate'), switchTo: 'input', inputType: 'date' }, // release Date

            { element: document.querySelector<HTMLDivElement>('#hermidata-starRating'), switchTo: 'input', inputType: 'number' }, // star Rating

            // genres | special case handled separately
            // demographics | special case handled separately
            { element: document.querySelector<HTMLDivElement>('#hermidata-sources'), switchTo: 'input', inputType: 'text' }, // hermidata Sources
            { element: document.querySelector<HTMLDivElement>('#hermidata-author'), switchTo: 'input', inputType: 'text' }, // hermidata author
            // { element: document.querySelector<HTMLDivElement>('#hermidata-latestRelease'), switchTo: 'input', inputType: 'text' }, // latest Release
        ];
    }
    private getAllInputsBackToDiv(): SwitchConfig[] {
        return [
            { element: document.querySelector<HTMLButtonElement>('#hermidata-img'), switchTo: 'img'}, // image

            { element: document.querySelector<HTMLInputElement>('#hermidata-title'), switchTo: 'h2'}, // main title
            // alternative titles container | special case handled separately

            { element: document.querySelector<HTMLInputElement>('#hermidata-contentRating'), switchTo: 'div'}, // // content rating
            { element: document.querySelector<HTMLInputElement>('#hermidata-releaseDate'), switchTo: 'div'}, // release Date

            { element: document.querySelector<HTMLInputElement>('#hermidata-starRating'), switchTo: 'div'}, // star Rating

            // genres | special case handled separately
            // demographics | special case handled separately
            { element: document.querySelector<HTMLInputElement>('#hermidata-sources'), switchTo: 'div'}, // hermidata Sources
            { element: document.querySelector<HTMLInputElement>('#hermidata-author'), switchTo: 'div'}, // hermidata author
            // { element: document.querySelector<HTMLInputElement>('#hermidata-latestRelease'), switchTo: 'div'}, // latest Release
        ];
    }

    private saveButtonCurrentMode: 'Edit' | 'Save' = 'Edit';

    public build(): void {

        this.eventListener();

    }
    public reload(): void {
        // force page reload
        window.location.reload();
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
    public activate(): void {

        // 1. set cancel & delete button
        if (!this.cancelBtn || !this.deleteOpenPanelBtn) return;
        this.cancelBtn.style.display = 'flex';
        this.deleteOpenPanelBtn.style.display = 'flex';

        // 2. set all inputs to editable
        this.changeAllInputsToEditable();

        this.hideButtons();
    }


    public async deactivate(mode: 'cancel' | 'save'): Promise<void> {
        // 1. set cancel & delete button
        if (!this.cancelBtn || !this.deleteOpenPanelBtn) return;
        this.cancelBtn.style.display = 'none';
        this.deleteOpenPanelBtn.style.display = 'none';
        
        // 2. set all inputs to editable
        this.changeAllInputsBack(mode);

        // 3. reset or save information
        await this.updateInformation(mode);
        
        this.showButtons();

    }
    private eventListener(): void {

        // cancel button
        this.cancelBtn?.addEventListener('click', () => {
            this.changeEditButton('Edit');
            this.deactivate('cancel');
        })

        // save/edit button
        this.saveBtn?.addEventListener('click', () => {
            if (this.saveButtonCurrentMode === 'Edit') {
                this.changeEditButton('Save');
                this.changeDeleteButton('hidden');
                this.activate();
            } else {
                this.changeEditButton('Edit');
                this.changeDeleteButton('visible');
                this.deactivate('save');
            }
        });

        // delete button
        // set label on click of delete panel button
        this.deleteOpenPanelBtn?.addEventListener('click', this.setLabelOfDeletePanel);
        // delete hermidata on click of delete button
        this.deleteConfirmationBtn?.addEventListener('click', this.deleteHermidata);
        // close delete panel on click of cancel button
        this.deleteCancelBtn?.addEventListener('click', this.closeDeletePanel)
    }
    private changeDeleteButton(mode: 'visible' | 'hidden'): void {
        if (!this.deleteOpenPanelBtn) return;

        if (mode === 'visible') {
            this.deleteOpenPanelBtn.style.display = 'flex';
        } else {
            this.deleteOpenPanelBtn.style.display = 'none';
        }
    }
    private closeDeletePanel() {
        const mergePanel = document.querySelector<HTMLDivElement>('#delete-dialog');
        if (!mergePanel) return;
        
        if (mergePanel.matches(':popover-open')) {
            mergePanel.hidePopover();
        }
    }
    private setLabelOfDeletePanel() {
        // label
        const label = document.querySelector<HTMLDivElement>('#delete-label');
        if (!label) return;
        label.textContent = `Delete ${this.hermidata.title}?`;
    }
    private async deleteHermidata(): Promise<void> {
        // delete hermidata
        
        const id = this.hermidata.id;
        const exist = this.AllHermidata[id];
        
        if (!exist) throw new Error(`No hermidata found for id ${id}`);

        console.log(`[Hermidata] %cRemoved Hermidata%c \nDeleted at ${this.isoToLocal(new Date().toISOString())} | id: ${id} | title: ${exist.title} `,
            'color: red; font-weight: bold;', 'color: inherit; font-weight: normal;'
        );
        
        // 1 remove from all hermidata
        delete this.AllHermidata[id];

        // 2 remove from indexDB
        await removeHermidata(id);

        // 3. go back to library
        openLink('./dist/pages/Library.html', 'sameTab');
    }
    private changeEditButton(changeTo: 'Save' | 'Edit'): void {
        const button = this.saveBtn!;
        button.classList.toggle('edit', changeTo === 'Edit');
        button.textContent = changeTo;

        this.saveButtonCurrentMode = changeTo;
    }
    private showButtons() {
        // show edit star rating button
        const starRatingEditButton = document.querySelector<HTMLDivElement>('#hermidata-starRating-edit');
        if (!starRatingEditButton) throw new Error('Star rating edit button not found');
        starRatingEditButton.style.display = 'block';
    }
    private hideButtons() {
        // hide edit star rating button
        const starRatingEditButton = document.querySelector<HTMLDivElement>('#hermidata-starRating-edit');
        if (!starRatingEditButton) throw new Error('Star rating edit button not found');
        starRatingEditButton.style.display = 'none';
    }
    private changeAllInputsBack(mode: 'cancel' | 'save'): void {

        for (const {element, switchTo} of this.getAllInputsBackToDiv()) {
            if (!element) continue;
            
            if (switchTo !== 'input') this.switchElement(element, switchTo, true, 'reset');
            else throw new Error("Element not found.");
            
        }

        // set image back
        // document.querySelector<HTMLImageElement>('#hermidata-img')?.setAttribute('src', this.hermidata.meta.image);

        // set author text
        const author = document.querySelector<HTMLDivElement>('#hermidata-author');
        this.setEmptyText(author);

        // set sources text
        const sources = document.querySelector<HTMLDivElement>('#hermidata-sources');
        this.setEmptyText(sources);

        // notes Content | set read only
        document.querySelector<HTMLTextAreaElement>('#hermidata-notes-content')?.setAttribute('readonly', '');

        // alt titles
        this.changeAltTitleBackToDiv(mode);

        // data group 1 | set select back to div
        this.changeGroup1BackToDiv();

        // data group 2 | set input back to div
        this.changeGroup2BackToDiv(mode === 'save');

        // markers
        this.changeMarkersBackToDiv(mode === 'cancel');
    }
    private setEmptyText(element: HTMLElement | null) {
        if (!element) return;

        const noContent = element.textContent === '';
        if (noContent) {
            // add --None--
            element.classList.add('empty-text');
            element.dataset.empty = 'true';
            element.textContent = `--None--`;
        } else {
            // remove --None--
            element.dataset.empty = 'false';
            element.classList.remove('empty-text');
        }
    }
    private changeGroup1BackToDiv() {
        const group1 = [
            { element: document.querySelector<HTMLSelectElement>('#hermidata-novelType'), switchTo: 'div'}, // novel type
            { element: document.querySelector<HTMLSelectElement>('#hermidata-contentRating'), switchTo: 'div'}, // content Rating
            { element: document.querySelector<HTMLSelectElement>('#hermidata-novelStatus'), switchTo: 'div'}, // novel Status
        ];

        for (const {element, switchTo} of group1) {
            if (!element) continue;
            
            // 1. create new element
            const newElement = document.createElement(switchTo);

            // 2. copy attributes
            for (const attr of element.attributes) newElement.setAttribute(attr.name, attr.value);
            newElement.dataset.editing = 'false';

            // 3. transfer content
            const value = this.getElementContent(element);
            this.setElementContent(newElement, value);
            
            // 4. replace element
            element.replaceWith(newElement);
        }
    }
    private setImageValue(element: HTMLImageElement | HTMLButtonElement, content: string) { 
        if (element instanceof HTMLImageElement) element.src = content;
        else element.value = content;
    }
    private async updateInformation(mode: 'cancel' | 'save') {
        const title = document.querySelector<HTMLDivElement>('#hermidata-title');

        const novelType = document.querySelector<HTMLDivElement>('#hermidata-novelType');
        const contentRating = document.querySelector<HTMLDivElement>('#hermidata-contentRating');
        const releaseDate = document.querySelector<HTMLDivElement>('#hermidata-releaseDate');
        const novelStatus = document.querySelector<HTMLDivElement>('#hermidata-novelStatus');
        
        const starRating = document.querySelector<HTMLDivElement>('#hermidata-starRating');

        // genres + Demographics already handled in changeGroup2BackToDiv()

        const sources = document.querySelector<HTMLDivElement>('#hermidata-sources');
        const author = document.querySelector<HTMLDivElement>('#hermidata-author');

        const notes = document.querySelector<HTMLDivElement>('#hermidata-notes-content');

        if (!this.imgElement || !title || !novelType || !contentRating || !releaseDate || !novelStatus || !starRating || !sources || !author || !notes) throw new Error('Information not found');

        // image
        const image = await this.hermidata.getDisplayImageUrl();
        if (mode == "save" && this.temporaryBlob) {
            // update back-end
            await this.hermidata.SetImage(this.temporaryBlob);

            // update front-end
            // get new image
            const newImage = await this.hermidata.getDisplayImageUrl();
            // set new image value
            this.setImageValue(this.imgElement, newImage);
            // update image ratio
            if (this.imgElement instanceof HTMLImageElement) this.calculateImageRatio(this.imgElement);
        }
        else if (mode == "cancel") this.setImageValue(this.imgElement, image);

        // Title
        if (mode === 'save') this.hermidata.title = title?.textContent ?? this.hermidata.title 
        else this.resetContent(title, this.hermidata.title)

        // Alt. Titles
        if (mode === 'save' && this.newAltTitles) this.hermidata.SetMultipleAltTitles(this.newAltTitles);
        // cancel content already handled in changeAltTitleBackToDiv()

        // Novel Type
        if (mode === 'save') this.hermidata.novelType = novelType?.textContent ?? this.hermidata.novelType;
        else this.resetContent(novelType, this.hermidata.novelType);

        await this.forceKeyUpdate();

        // Content Rating
        const contentRatingValue = contentRating?.textContent as ContentRating ?? this.hermidata.meta.contentRating;
        if (mode === 'save') this.hermidata.meta.contentRating = contentRatingValue;
        else this.resetContent(contentRating, this.hermidata.meta.contentRating);

        // Release Date
        const releaseDateValue = this.hermidata.meta.originalRelease ?? this.hermidata.meta.added; // both ISO
        const releaseDateLocale = this.localToISO(releaseDate?.textContent) ?? releaseDateValue; // element content is locale but not the latter
        if (mode === 'save') this.hermidata.meta.originalRelease = releaseDateLocale;
        else this.resetContent(releaseDate, this.isoToLocal(releaseDateValue));

        // Novel Status
        if (mode === 'save') this.hermidata.meta.novelStatus = novelStatus?.textContent ?? this.hermidata.meta.novelStatus;
        else this.resetContent(novelStatus, this.hermidata.meta.novelStatus);

        // Star Rating
        if (mode === 'save') this.hermidata.meta.starRating = Number(starRating?.textContent) ?? this.hermidata.meta.starRating;
        else this.resetContent(starRating, String(this.hermidata.meta.starRating));
        const canSaveStarRating = this.saveInput(starRating, String(this.hermidata.meta.starRating), '0');

        // Author
        if (mode === 'save') this.hermidata.meta.author = author.dataset.empty === 'false' ? author.textContent : undefined; // author can be undefined
        else this.resetContent(author, this.hermidata.meta.author ?? '--None--');
        const canSaveAuthor = this.saveInput(author, this.hermidata.meta.author, '--None--');

        // Alt. Sources
        const altSourcesSingleString = this.hermidata.GetAltSources().join(', ');
        if (mode === 'save') this.hermidata.SetAltSources(sources?.textContent ?? altSourcesSingleString)
        else this.resetContent(sources, altSourcesSingleString);
        const canSaveSources = this.saveInput(sources, altSourcesSingleString, this.hermidata.source);

        // markers
        if (mode === 'save') this.saveMarkers();

        // Notes
        if ( mode === 'save') this.hermidata.meta.notes = notes?.textContent ?? this.hermidata.meta.notes;
        else this.resetContent(notes, this.hermidata.meta.notes);


        await saveHermidata(this.hermidata.id, this.hermidata.toJSON());

    }
    private saveInput(element: HTMLElement, content: string | undefined, backup?: string): boolean {
        // if input is empty, set it to a backup value OR reject submission
        if (content !== '' || content !== undefined) return true;
        
        if (!backup) return false;

        element.textContent = backup;
        return true;
    }
    private resetContent(element: HTMLElement, content: string) {
        element.textContent = content;
    }
    /** update key if changes have been made */
    private async forceKeyUpdate() {
        const newKey = returnHashedTitle(this.hermidata.title, this.hermidata.novelType, this.hermidata.GetUrl());
        const oldKey = this.hermidata.id;
        if (newKey === oldKey) return;
        
        this.hermidata.id = newKey;

        await updateHermidata(oldKey, newKey, this.hermidata.toJSON());
    }
    private saveMarkers() {
        const markersContainer = document.querySelectorAll<HTMLDivElement>('.hermidata-marker-container');
        const markers = document.querySelectorAll<HTMLDivElement>('.hermidata-marker');
        if (!markers || !markersContainer) return;
        for (const marker of markersContainer) {
            const markerId = marker.dataset.id;
            if (!markerId) continue;

            const colour = marker.querySelector<HTMLDivElement>('.hermidata-marker-color');
            const chapter = marker.querySelector<HTMLInputElement>('.hermidata-marker-chapter');
            const label = marker.querySelector<HTMLInputElement>('.hermidata-marker-label');
            const readStatus = marker.querySelector<HTMLInputElement>('.hermidata-marker-readStatus');
            const note = marker.querySelector<HTMLInputElement>('.hermidata-marker-note');

            if (!colour || !chapter || !label || !readStatus || !note) continue;

            if (!this.hermidata.chapter.bookmarks[markerId]) throw new Error('Bookmark not found');

            this.hermidata.chapter.bookmarks[markerId].color = colour.style.backgroundColor;
            this.hermidata.chapter.bookmarks[markerId].current = Number(chapter.value);
            this.hermidata.chapter.bookmarks[markerId].label = label.value;
            this.hermidata.chapter.bookmarks[markerId].readStatus = readStatus.value;
            if (note.value !== '') this.hermidata.chapter.bookmarks[markerId].note = note.value;
        }
    }
    private removePillRemoveButton(pill: HTMLDivElement) {
        // remove x button
        const removeX = pill.querySelectorAll('.tag-pill-removeX')
        for (const x of removeX) x.remove();
    }
    private setChildEmptyTextIfOnlyOneChild(element: HTMLDivElement) {
        if (element.childElementCount === 1 && (element.children[0] as HTMLDivElement).dataset.empty === "true") {
            element.children[0].remove();
            this.setChildEmptyText(element);
        }
    }
    private changeGroup2BackToDiv(saveInfo: boolean) {
        const allTags = document.querySelectorAll<HTMLDivElement>('.filter-allTags-container');
        const filterInput = document.querySelectorAll<HTMLInputElement>('.filterInput');
        const tagsContainer = document.querySelectorAll<HTMLDivElement>('.selected-tag-container');
        const filterTags = document.querySelectorAll<HTMLDivElement>('.hermidata-genre, .hermidata-demographic');

        for (const element of allTags) element.dataset.editing = 'false';
        for (const element of filterInput) element.dataset.editing = 'false';

        for (const element of tagsContainer) {
            if (!element) continue;
            element.dataset.editing = 'false';
            // remove x button
            this.removePillRemoveButton(element);

            this.setChildEmptyTextIfOnlyOneChild(element);
        }

        // keep info
        if (saveInfo) {
            const allGenresAndDemographics = Array.from(filterTags.values()).map(el => el.textContent.trim());
            this.hermidata.SetTags(allGenresAndDemographics);
        } else this.cancelDataAndSetToDefaultContent(filterTags);
        // discard info
    }
    private cancelDataAndSetToDefaultContent(filterTags: NodeListOf<HTMLDivElement>) {
        // to remove all info except the existing one
        const tags = new Set<string>();

        const allTagsValues = this.hermidata.meta.tags;
        const allGenreTags = allTagsValues.filter(tag => !DEMOGRAPHIC_TAGS.includes(tag));
        const allDemographicTags = allTagsValues.filter(tag => DEMOGRAPHIC_TAGS.includes(tag));

        for (const element of filterTags) {
            if (!element) continue;
            const isGenre = element.classList.contains('hermidata-genre');
            const isDemographic = element.classList.contains('hermidata-demographic');

            const name = element.textContent;

            // remove if not in list
            if (isGenre && !allGenreTags.includes(name)) {
                // if container is empty, add empty text
                if (element.parentElement!.childElementCount === 1) this.setChildEmptyText(element.parentElement!);
                element.remove();
            }
            else if (isDemographic && !allDemographicTags.includes(name)) {
                // if container is empty, add empty text
                if (element.parentElement!.childElementCount === 1) this.setChildEmptyText(element.parentElement!);
                element.remove();
            }

            tags.add(name);
        }

        // add if not in the list
        if (tags.size !== this.hermidata.meta.tags.length) {
            for (const name of this.hermidata.meta.tags) {
                if (tags.has(name)) continue;
                const isGenre = !DEMOGRAPHIC_TAGS.includes(name);
                const isDemographic = DEMOGRAPHIC_TAGS.includes(name);

                if (isGenre && allGenreTags.includes(name)) this.genreTags?.createPill(name, 'WithoutRemoveButton');
                else if (isDemographic && allDemographicTags.includes(name)) this.demographicTags?.createPill(name, 'WithoutRemoveButton');
            }
        }
    }
    private setChildEmptyText(element: HTMLElement) {
        const emptyText = document.createElement('div');
        emptyText.classList.add('empty-text');
        emptyText.textContent = `--None--`;
        element.appendChild(emptyText);
    }
    private changeAltTitleBackToDiv(mode: 'cancel' | 'save') {
        const altTitlesContainer = document.querySelector<HTMLTextAreaElement>('#hermidata-alternative-titles-list');

        if (!altTitlesContainer) throw new Error('Alt titles container not found');
        // get the content
        const altTitlesContent = this.hermidata.meta.altTitles;

        this.newAltTitles = mode === 'save' ? altTitlesContainer.value.split('\n') : altTitlesContent;

        const altTitles = this.switchElement(altTitlesContainer, 'div', false, 'reset');

        for (const title of altTitlesContent) {

            // 1. create new element
            const newElement = document.createElement('div');
            newElement.classList.add('hermidata-alternative-title');
            // 3. transfer content
            this.setElementContent(newElement, title);
            
            // 4. append element
            altTitles.appendChild(newElement);
        }

        // re-Attach event listener of alt titles
        const altTitleButton = document.querySelector<HTMLDivElement>('#hermidata-alternative-title-button-text');
        if (!altTitleButton) throw new Error("Alternative title button does not exist");
        altTitleButton?.addEventListener('click', () => {
            altTitles!.dataset.closed = altTitles!.dataset.closed === 'true' ? 'false' : 'true';
            document.querySelector<SVGElement>('.hermidata-alternative-title-button-arrow')!.dataset.closed = altTitles!.dataset.closed;
        });
        
    }
    private changeAltTitleToInput() {
        const altTitlesContainer = document.querySelector<HTMLDivElement>('#hermidata-alternative-titles-list');
        const altTitles = document.querySelectorAll<HTMLDivElement>('.hermidata-alternative-title');
        if (!altTitlesContainer || !altTitles) throw new Error('Alt titles container not found');
        // get the content
        const altTitlesContent = Array.from(altTitles).map(title => title.textContent).join('\n');
        // 1. create new element
        const newElement = document.createElement('textarea');

        // 2. copy attributes
        for (const attr of altTitlesContainer.attributes) newElement.setAttribute(attr.name, attr.value);
        newElement.dataset.editing = 'true';

        // 3. transfer content
        this.setElementContent(newElement, altTitlesContent);
        
        // 4. replace element
        altTitlesContainer.replaceWith(newElement);
    }
    private setImageChangerToEditable() {

        const image: { element: HTMLImageElement | null, switchTo: 'button', inputType: 'button' }[] = [
            { element: document.querySelector<HTMLImageElement>('#hermidata-img'), switchTo: 'button', inputType: 'button' } // image
        ]

        for (const {element, switchTo, inputType: content} of image) {
            if (!element) continue;
            
            // 1. create new element
            const newElement = document.createElement(switchTo);

            // 2. copy attributes
            for (const attr of element.attributes) newElement.setAttribute(attr.name, attr.value);
            newElement.dataset.editing = 'true';

            // 3. transfer content
            const value = this.getElementContent(element);

            // 4. add content
            newElement.value = value;

            // 4.5 add background image
            newElement.style.backgroundImage = `url(${element.src})`;
            newElement.style.backgroundSize = 'cover';
            newElement.style.backgroundRepeat = 'no-repeat';
            newElement.style.backgroundClip = 'border-box';
            
            
            // 5. replace element
            element.replaceWith(newElement);
        }
    }

    private changeAllInputsToEditable() {

        for (const config of this.getAllDivToInputs()) {
            if (!config.element) continue;

            if (config.switchTo === 'input') this.switchElement(config.element, config.switchTo, config.inputType, true, 'set');
            else this.switchElement(config.element, config.switchTo, true, 'set');
        }
        this.setImageChangerToEditable();

        this.initImageChanger();

        // author | remove --empty content
        this.removeAuthorEmptyText();

        // notes Content | remove read only
        document.querySelector<HTMLTextAreaElement>('#hermidata-notes-content')?.removeAttribute('readonly');

        // alt titles 
        this.changeAltTitleToInput();

        // data group 1 | set div to select
        this.setGroup1ToSelect();

        // star rating
        this.setStarRatingEditLimits()
        
        // data group 2 | set div to input
        this.setGroup2ToCustomPill();

        // markers
        this.setMarkersToInput();
    }
    private removeAuthorEmptyText() {
        const author = document.querySelector<HTMLInputElement>('#hermidata-author');
        if (!author) throw new Error('Author does not exist');
        // if empty text
        if (author.value === '--None--' || this.hermidata.meta.author === undefined ) {
            author.value = '';
        }
    }
    protected setMarkerColourHandler = (event: MouseEvent) => {
        const colour = event.target as HTMLDivElement;
        const defaultColor = colour.style.backgroundColor;
        const rect = document.body.getBoundingClientRect();

        this.setMarkerColour(colour, defaultColor, rect);
    };
    private setMarkersToInput() {
        const markersContainer = document.querySelectorAll<HTMLDivElement>('.hermidata-marker-container');
        const markers = document.querySelectorAll<HTMLDivElement>('.hermidata-marker');
        if (!markers || !markersContainer) return;
        for (const marker of markersContainer) {
            
            const row = marker.querySelector<HTMLDivElement>('.hermidata-marker-row');
            if (!row) continue;
            row.dataset.editing = 'true';
            
            const markerElement = marker.querySelector<HTMLDivElement>('.hermidata-marker');
            markerElement!.dataset.editing = 'true';

            // disable event listeners
            markerElement?.removeEventListener('click', PageDetailBuilder.handleMarkerClick);

            // colour
            const colour = marker.querySelector<HTMLDivElement>('.hermidata-marker-color');
            if (!colour) continue;
            
            colour.dataset.editing = 'true';
            
            colour.addEventListener('click', this.setMarkerColourHandler );
            // chapter
            const chapter = marker.querySelector<HTMLDivElement>('.hermidata-marker-chapter');
            if (!chapter) continue;
            // trim chapter
            chapter.textContent = chapter.textContent.replace('Ch. ', '');
            this.switchElement(chapter, 'input', 'number', true, 'set');
            // label
            const label = marker.querySelector<HTMLDivElement>('.hermidata-marker-label');
            if (!label) continue;
            this.switchElement(label, 'input', 'text', true, 'set');
            // read status
            const readStatus = marker.querySelector<HTMLDivElement>('.hermidata-marker-readStatus');
            if (!readStatus) continue;
            const select = this.switchElement(readStatus, 'select', true, 'set');
            // set read status options
            this.setReadStatusOptions(select, readStatus.textContent);

            // set notes
            const notesContainer = marker.querySelector<HTMLDivElement>('.hermidata-marker-notes');
            const notes = marker.querySelector<HTMLDivElement>('.hermidata-marker-notes-inner');
            if (!notes || !notesContainer) continue;
            notesContainer.dataset.editing = 'true';
            this.switchElement(notes, 'input', 'text', true, 'set');
        }
    }
    private setMarkerColour = (colour: HTMLDivElement, defaultColor: string, rect: DOMRect) => {
        ColorPicker.show( ColorPicker.getHexColor() ?? defaultColor,
            async () => {
                colour!.style.backgroundColor = ColorPicker.getHexColor() ?? defaultColor;
            },
            { x: rect.left + ColorPicker.dimensions.width, y: (rect.bottom / 2) + 50 + ColorPicker.dimensions.height }
        );
    }
    private changeMarkersBackToDiv(resetInfo = true) {
        const markersContainer = document.querySelectorAll<HTMLDivElement>('.hermidata-marker-container');
        const markers = document.querySelectorAll<HTMLDivElement>('.hermidata-marker');
        if (!markers || !markersContainer) return;
        for (const marker of markersContainer) {
            
            const markerId = marker.dataset.id;
            if (!markerId) continue;

            const row = marker.querySelector<HTMLDivElement>('.hermidata-marker-row');
            if (!row) continue;
            row.dataset.editing = 'false';

            const markerElement = marker.querySelector<HTMLDivElement>('.hermidata-marker');
            markerElement!.dataset.editing = 'false';

            // enable event listeners
            markerElement?.addEventListener('click', PageDetailBuilder.handleMarkerClick);

            // colour
            const colour = marker.querySelector<HTMLDivElement>('.hermidata-marker-color');
            if (!colour) continue;
            const defaultColor = this.hermidata.getBookmark(markerId).color;
            colour.removeEventListener('click', this.setMarkerColourHandler);
            colour.dataset.editing = 'false';
            colour.style.backgroundColor =  resetInfo ? defaultColor : colour.style.backgroundColor;
            // chapter
            const chapter = marker.querySelector<HTMLInputElement>('.hermidata-marker-chapter');
            if (!chapter) continue;
            const chapterDiv = this.switchElement(chapter, 'div', false, 'reset');
            chapterDiv.textContent = 'Ch. ' + resetInfo ? String(this.hermidata.getBookmark(markerId).current): chapter.value;
            // label
            const label = marker.querySelector<HTMLInputElement>('.hermidata-marker-label');
            if (!label) continue;
            const labelDiv = this.switchElement(label, 'div', false, 'reset');
            labelDiv.textContent = resetInfo ? this.hermidata.getBookmark(markerId).label : label.value;
            // read status
            const readStatus = marker.querySelector<HTMLSelectElement>('.hermidata-marker-readStatus');
            if (!readStatus) continue;
            const readStatusDiv = this.switchElement(readStatus, 'div', false, 'reset');
            readStatusDiv.textContent = resetInfo ? this.hermidata.getBookmark(markerId).readStatus: readStatus.value;
            // notes ( optional )
            const notesContainer = marker.querySelector<HTMLInputElement>('.hermidata-marker-notes');
            const notes = marker.querySelector<HTMLInputElement>('.hermidata-marker-notes-inner');
            
            if (notes && notesContainer) {
                notesContainer.dataset.editing = 'false';
                const notesDiv = this.switchElement(notes, 'div', false, 'reset');
                const originalText = this.hermidata.getBookmark(markerId).note;
                notesDiv.textContent = resetInfo ? originalText ?? '': notes.value;
            }
        }
    }
    private setReadStatusOptions(select: HTMLSelectElement | null, selectedReadStatus: AnyReadStatus) {
        const readStatuses = this.settings.ContentTypesAndStatuses.STATUS_OPTIONS;
        if (!select) return;
        for (const status of readStatuses) {
            const option = document.createElement('option');
            option.value = status;
            if (status === selectedReadStatus) option.selected = true;
            option.textContent = status;
            select.appendChild(option);
        }
        select.value = selectedReadStatus;
    }
    private setGenreTag(): Tags | null {
        const allTagsValues = Array.from(getAllTags(this.AllHermidata).keys());
        const genresThemes = allTagsValues.filter(tag => !DEMOGRAPHIC_TAGS.includes(tag));

        const selectedRow = document.querySelector<HTMLDivElement>('#hermidata-genres');
        const allTags = document.querySelector<HTMLDivElement>('#allTags-genres');
        const filterInput = document.querySelector<HTMLInputElement>('#filterInput-genres');

        if (!selectedRow || !allTags || !filterInput) return null;

        this.setElementToEditing(selectedRow);
        this.setElementToEditing(allTags);
        this.setElementToEditing(filterInput);

        const tagClass = new Tags(genresThemes, true, new HermidataModel(this.hermidata), { selectedRow, allTags, filterInput});
        return tagClass;
    }
    private setDemographicTag(): Tags | null {
        const allTagsValues = Array.from(getAllTags(this.AllHermidata).keys());
        const genresDemographics = allTagsValues.filter(tag => DEMOGRAPHIC_TAGS.includes(tag));

        const selectedRow = document.querySelector<HTMLDivElement>('#hermidata-demographics');
        const allTags = document.querySelector<HTMLDivElement>('#allTags-demographics');
        const filterInput = document.querySelector<HTMLInputElement>('#filterInput-demographics');

        if (!selectedRow || !allTags || !filterInput) return null;

        this.setElementToEditing(selectedRow);
        this.setElementToEditing(allTags);
        this.setElementToEditing(filterInput);

        const tagClass = new Tags(genresDemographics, false, new HermidataModel(this.hermidata), { selectedRow, allTags, filterInput});
        return tagClass;
    }
    private setGroup2ToCustomPill() {
        // genres
        this.genreTags = this.setGenreTag();
        // demographics
        this.demographicTags = this.setDemographicTag();
    }
    private setElementToEditing(element: HTMLElement) { 
        element.dataset.editing = 'true';
    }
    private addNewInput(className: string, container: HTMLDivElement, type: 'genre' | 'demographic'): void {
        const newInput = document.createElement('input');
        newInput.classList.add(className, 'emptyInput', type);
        newInput.setAttribute('is_empty', '');
        newInput.setAttribute('data-editing', 'true');

        const handleInput = () => {
            newInput.removeAttribute('is_empty');
            newInput.removeEventListener('input', handleInput);
            this.addNewInput(className, container, type);
        };

        newInput.addEventListener('input', handleInput);

        container.appendChild(newInput);
    }
    private setGroup1ToSelect() {
        const group1: { element: HTMLDivElement | null, switchTo: 'select', content: AnyNovelType[] | AnyNovelStatus[] | ContentRating[] }[] = [
            { 
                element: document.querySelector<HTMLDivElement>('#hermidata-novelType'), 
                switchTo: 'select', 
                content: this.settings.ContentTypesAndStatuses.TYPE_OPTIONS
            }, // novel type
            { 
                element: document.querySelector<HTMLDivElement>('#hermidata-contentRating'), 
                switchTo: 'select', 
                content: CONTENT_RATING
            }, // content Rating
            { 
                element: document.querySelector<HTMLDivElement>('#hermidata-novelStatus'), 
                switchTo: 'select', 
                content: this.settings.ContentTypesAndStatuses.NOVEL_STATUS_OPTIONS
            }, // novel Status
        ]

        for (const {element, switchTo, content} of group1) {
            if (!element) continue;
            
            // 1. create new element
            const newElement = document.createElement(switchTo);

            // 2. copy attributes
            for (const attr of element.attributes) newElement.setAttribute(attr.name, attr.value);
            newElement.dataset.editing = 'true';

            // 3. transfer content
            const value = this.getElementContent(element);
            
            // 3.1 get first option from content
            const option = this.getOptionFromValue(value, switchTo);
            // 3.2 get all options from const
            const options = this.getAllOptions(content);

            // 3.3 add option to select
            if (option) newElement.append(option, ...options);

            
            // 4. replace element
            element.replaceWith(newElement);
        }
    }
    private setStarRatingEditLimits() {
        const starRating = document.querySelector<HTMLInputElement>('#hermidata-starRating');
        if (!starRating) return;
        
        starRating.min = '0';
        starRating.max = '10';
        starRating.step = '1';
    }

    // overload: switching to 'input' — inputType required
    private switchElement<K extends 'input'>( element: HTMLElement, switchTo: K, inputType: 'text' | 'number' | 'image' | 'date' | 'file', transferContent?: boolean, set?: 'reset' | 'set' ): TagMap[K];

    // overload: switching to anything else — no inputType
    private switchElement<K extends Exclude<keyof TagMap, 'input'>>( element: HTMLElement, switchTo: K, transferContent?: boolean, set?: 'reset' | 'set' ): TagMap[K];

    // implementation signature — must be compatible with BOTH overloads above
    private switchElement( element: HTMLElement, switchTo: keyof TagMap, arg3?: 'text' | 'number' | 'image' | 'date' | 'file' | boolean, arg4?: boolean | 'reset' | 'set', arg5?: 'reset' | 'set'): HTMLElement {

        // disambiguate which overload was actually called
        let inputType: 'text' | 'number' | 'date' | 'image' | 'file' = 'text';
        let transferContent = false;
        let set: 'reset' | 'set' = 'set';

        if (switchTo === 'input') {
            inputType = (arg3 as typeof inputType) ?? 'text';
            transferContent = (arg4 as boolean) ?? false;
            set = (arg5 as 'reset' | 'set') ?? 'set';
        } else {
            transferContent = (arg3 as boolean) ?? false;
            set = (arg4 as 'reset' | 'set') ?? 'set';
        }

        // 1. create new element
        const newElement = document.createElement(switchTo);
        if (switchTo === 'input') {
            (newElement as HTMLInputElement).type = inputType;
        }

        // 2. copy attributes
        for (const attr of element.attributes) {
            if (attr.name === 'style' && element instanceof HTMLTextAreaElement && switchTo === 'div') {
                const strippedStyle = this.removeStyleProperty(attr.value, 'height');
                if (strippedStyle) newElement.setAttribute('style', strippedStyle);
                continue;
            }
            else newElement.setAttribute(attr.name, attr.value);
        }
        newElement.dataset.editing = set === 'reset' ? 'false' : 'true';

        // 3. transfer content
        if (transferContent) {
            const value = this.getElementContent(element);
            if (value === '') this.setElementContent(newElement, '--None--');
            this.setElementContent(newElement, value);
        }

        // 4. replace element
        element.replaceWith(newElement);

        // 5. return new element
        return newElement;
    }
    private isValueElement(element: HTMLElement): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
        return element instanceof HTMLInputElement
            || element instanceof HTMLTextAreaElement
            || element instanceof HTMLSelectElement;
    }
    private removeStyleProperty(styleValue: string, property: string): string {
        return styleValue
            .split(';')
            .map(rule => rule.trim())
            .filter(rule => rule && !rule.toLowerCase().startsWith(`${property.toLowerCase()}:`))
            .join('; ');
    }

    private getElementContent(element: HTMLElement): string {
        if (element instanceof HTMLInputElement && element.type === 'date') return this.isoToLocal(element.value, this.locale);
        if (element instanceof HTMLImageElement) return element.src;
        return this.isValueElement(element)
            ? element.value
            : (element.textContent ?? '');
    }

    private setElementContent(element: HTMLElement, value: string): void {
        if (!this.isValueElement(element)) element.textContent = value;
        else { 
            if (element instanceof HTMLInputElement && element.type === 'date') element.value = this.localToISO(value, this.locale, false);
            else element.value = value;
        }
    }
    private getOptionFromValue(value: string, element: 'option' | 'select' ): HTMLOptionElement | HTMLSelectElement {
        const opt = document.createElement(element);
        opt.classList.add('select-option');
        opt.value = value;
        opt.textContent = value;
        if (element === 'select') (opt as HTMLSelectElement ).name = value;
        return opt;
    }
    private getAllOptions(content: string[]): HTMLOptionElement[] {
        return content.map(value => this.getOptionFromValue(value, 'option') as HTMLOptionElement);
    }
    private initImageChanger() {
        if (!this.popover || !this.imgElement) return;

        // prefill URL with current image src, if one exists
        this.popover.addEventListener('toggle', (e: Event) => {
            const toggleEvent = e as ToggleEvent; // 'toggle' event on popovers is a ToggleEvent
            const image: string | null = this.imgElement instanceof HTMLImageElement ? this.imgElement.src : this.imgElement!.value;
            if (toggleEvent.newState === 'open' && this.urlInput && image) {
                this.urlInput.value = image;
            }
        });

        // tab switching
        const tabButtons = this.popover.querySelectorAll<HTMLButtonElement>('.tab-btn');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                tabButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const mode = btn.dataset.mode;
                this.popover?.querySelectorAll<HTMLDivElement>('.image-changer-panel').forEach(panel => {
                    panel.hidden = panel.dataset.panel !== mode;
                });
            });
        });

        // URL confirm
        this.urlConfirmBtn?.addEventListener('click', async () => {
            if (this.urlInput?.value && this.imgElement) {
                
                const response = await fetch(this.urlInput.value);
                const blob = await response.blob();

                this.temporaryBlob = blob;

                this.setImage(blob);
                this.popover?.hidePopover();
            }
        });

        // file selected
        this.fileInput?.addEventListener('change', async () => {
            const file = this.fileInput?.files?.[0];
            if (!file || !this.imgElement) return;
            
            this.temporaryBlob = file;

            this.setImage(file);
            this.popover?.hidePopover();
            
        });
    }
    private setImage(blob: Blob) {
        if (this.currentImageUrl) URL.revokeObjectURL(this.currentImageUrl);
        this.currentImageUrl = URL.createObjectURL(blob);

        this.imgElement instanceof HTMLImageElement ? this.imgElement.src = this.currentImageUrl : this.imgElement!.value = this.currentImageUrl;

        // set as background image
        this.imgElement!.style.backgroundImage = `url(${this.currentImageUrl})`;
        
    }

}