import { saveHermidata } from "../../shared/db/Storage";
import { returnBookmarkHash } from "../../shared/utils/StringOutput";
import type { Bookmark } from "../../shared/types";
import { getElement, setElement } from "../../shared/utils/Selection";
import { ColorPicker } from "../frontend/ColorPicker";
import { HermidataModel } from "../../shared/utils/HermidataSelector";
import { customConfirm } from "../frontend/confirm";
import { ConsoleMessage, ErrorMessage, logConsoleError} from "../../shared/utils/ErrorMessage";

export class BookmarkController {

    private hermidata: HermidataModel;
    public bookmarkInUseID: string | null = null;

    // img bookmark
    private readonly imgBookmark = getElement<SVGSVGElement>('.imgBookmark');
    private readonly bookmarkMenuTrigger = getElement<HTMLButtonElement>('#openBookmarkMenu');

    // add new bookmark
    private readonly AddNewBookmarkContainer = getElement<HTMLDivElement>('.AddNewBookmark');
    private readonly bookmarkLabelInput = getElement<HTMLInputElement>('#bookmarkLabelInput');
    private readonly bookmarkChapterInput = getElement<HTMLInputElement>('#bookmarkChapterInput');
    private readonly bookmarkNotesInput = getElement<HTMLInputElement>('#bookmarkNotesInput');
    private readonly bookmarkColorInput = getElement<HTMLButtonElement>('#bookmarkColorInput');
    private readonly saveBookmarkBtn = getElement<HTMLButtonElement>('#saveBookmarkBtn');

    // bookmark menu manager
    private readonly bookmarkMenuManagerContainer = getElement<HTMLDivElement>('.bookmarkMenuManagerContainer');
    private readonly bookmarkMenuManager = getElement<HTMLDivElement>('#bookmarkMenuManager');
    private readonly bookmarkManagerTip = getElement<HTMLElement>('.bookmarkMenuManager-sub');
    
    // bookmark menu ( on click of bookmark menu button )
    private readonly bookmarkMenuContainer = getElement<HTMLDivElement>('.bookmarkMenuContainer');
    private readonly bookmarkMenu = getElement<HTMLDivElement>('.bookmarkMenu');
    private readonly bookmarkMenuPagination = getElement<HTMLElement>('#bookmarkMenuPagination');
    private readonly bookmarkManagerPagination = getElement<HTMLElement>('#bookmarkManagerPagination');
    private readonly bookmarkMenuSort = getElement<HTMLSelectElement>('#bookmarkMenuSort');
    private readonly bookmarkManagerSort = getElement<HTMLSelectElement>('#bookmarkManagerSort');
    private readonly bookmarkMenuSortControls = getElement<HTMLDivElement>('#bookmarkMenuSortControls');
    private readonly bookmarkManagerSortControls = getElement<HTMLDivElement>('#bookmarkManagerSortControls');
    private readonly bookmarkMenuSortDirection = getElement<HTMLButtonElement>('#bookmarkMenuSortDirection');
    private readonly bookmarkManagerSortDirection = getElement<HTMLButtonElement>('#bookmarkManagerSortDirection');
    // general used    
    private readonly addNewBookmarkBtn = document.querySelectorAll<HTMLButtonElement>('.addNewBookmarkBtn'); // open add new bookmark form
    private readonly bookmarkMenuBtn = getElement<HTMLButtonElement>('.bookmarkMenuBtn'); // open bookmark menu manager

    private readonly isNewHermidata: boolean;
    private readonly markerPopovers = document.querySelectorAll<HTMLDivElement | HTMLElement>('.markerPopover[popover]');
    private popupBaseHeight = 0;
    private readonly markersPerPage = 6;
    private bookmarkMenuPage = 0;
    private bookmarkManagerPage = 0;
    private markerSort: 'updatedAt' | 'createdAt' = 'updatedAt';
    private markerSortDirection: 'asc' | 'desc' = 'desc';

    constructor(hermidata: HermidataModel, isNew: boolean = false) {
        this.hermidata = hermidata;
        this.isNewHermidata = isNew;
    }
    public init(): void {
        this.setAllToDefault();
        this.popupBaseHeight = document.body.scrollHeight;

        this.imgBookmark!.style.fill = this.hermidata.chapter.bookmarks[this.hermidata.chapter.bookmarkInUse].color;

        this.bindEvents();
    }
    private bindEvents() {
        // add listener to open bookmark menu button
        this.openBookmarkMenuEvent();
        // add listener to open add new bookmark button
        this.openAddNewBookmarkEvent();
        // add listener to open bookmark menu manager button
        this.openBookmarkMenuManagerEvent();
        // add listener to open color picker button
        this.openColorPickerEvent();
        this.bindMarkerPagination();
        // add listener to resize popup height when marker popover is opened or closed
        this.resizePopupHeight();
        // add listener to close popovers when clicking outside of them or pressing escape
        document.addEventListener('click', this.handleOutsideMarkerClick);
        document.addEventListener('keydown', this.handleMarkerEscape);
        // save new bookmark
        this.saveBookmarkBtn?.addEventListener('click', () => this.saveNewBookmark() );
    }
    private openBookmarkMenuEvent(): void {
        this.bookmarkMenuTrigger?.addEventListener('click', () => {
            ColorPicker.hide();
            this.closeOtherMarkerPopovers(this.bookmarkMenuContainer);
            this.openBookmarkMenu();
        });
    }
    private openAddNewBookmarkEvent(): void {
        for (const btn of this.addNewBookmarkBtn) {
            btn.addEventListener('click', () => {
                ColorPicker.hide();
                this.closeOtherMarkerPopovers(this.AddNewBookmarkContainer);
                this.addNewBookmarkForm();
            });
        }
    }
    private openBookmarkMenuManagerEvent(): void {
        this.bookmarkMenuBtn?.addEventListener('click', () => {
            ColorPicker.hide();
            this.closeOtherMarkerPopovers(this.bookmarkMenuManagerContainer);
            this.openBookmarkMenuManager();
        });
    }
    private openColorPickerEvent(): void {
        this.bookmarkColorInput?.addEventListener('click', () => {
            const defaultColor = '#fcfcfc';
            ColorPicker.show(
                ColorPicker.getHexColor() ?? defaultColor,
                () => {
                    this.bookmarkColorInput!.style.backgroundColor = ColorPicker.getHexColor() ?? defaultColor;
                },
                this.bookmarkColorInput!
            );
        });
    }
    private resizePopupHeight(): void {
        for (const popover of this.markerPopovers) {
            popover?.addEventListener('toggle', () => {
                if (popover.matches(':popover-open')) requestAnimationFrame(() => this.fitPopupToMarkerPanel(popover));
                else {
                    if (popover === this.AddNewBookmarkContainer || popover === this.bookmarkMenuManagerContainer) ColorPicker.destroy();
                    requestAnimationFrame(() => this.resetPopupHeightIfNoMarkerPanel());
                }
            });
        }
    }

    private handleOutsideMarkerClick = (event: MouseEvent): void => {
        const target = event.target;
        if (!(target instanceof Element)) return new ConsoleMessage('target is not an Element', undefined, { consoleLevel: 'log' }).sendMessage();
        if (target.closest('.markerPopover, #ColorPicker, [popovertarget]')) return;
        this.closeOtherMarkerPopovers();
        ColorPicker.hide();
    };
    private handleMarkerEscape = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape') return;
        if (ColorPicker.isOpen()) {
            ColorPicker.hide();
            event.preventDefault();
            return;
        }
        this.closeOtherMarkerPopovers();
    };
    private setAllToDefault(): void {
        this.bookmarkInUseID = null;
        this.closeOtherMarkerPopovers();
    }
    private bindMarkerPagination(): void {
        this.bindPaginationButtons(this.bookmarkMenuPagination, (direction) => {
            this.bookmarkMenuPage += direction;
            this.renderBookmarkMenu();
            requestAnimationFrame(() => this.fitPopupToMarkerPanel(this.bookmarkMenuContainer!));
        });
        this.bindPaginationButtons(this.bookmarkManagerPagination, (direction) => {
            this.bookmarkManagerPage += direction;
            this.renderBookmarkMenuManager();
            requestAnimationFrame(() => this.fitPopupToMarkerPanel(this.bookmarkMenuManagerContainer!));
        });

        for (const select of [this.bookmarkMenuSort, this.bookmarkManagerSort]) {
            select?.addEventListener('change', () => {
                this.markerSort = select.value === 'createdAt' ? 'createdAt' : 'updatedAt';
                this.refreshSortedMarkerPanels();
            });
        }
        for (const button of [this.bookmarkMenuSortDirection, this.bookmarkManagerSortDirection]) {
            button?.addEventListener('click', () => {
                this.markerSortDirection = this.markerSortDirection === 'asc' ? 'desc' : 'asc';
                this.refreshSortedMarkerPanels();
            });
        }
        this.updateSortDirectionButton(this.bookmarkMenuSortDirection);
        this.updateSortDirectionButton(this.bookmarkManagerSortDirection);
    }
    private refreshSortedMarkerPanels(): void {
        this.bookmarkMenuPage = 0;
        this.bookmarkManagerPage = 0;
        if (this.bookmarkMenuSort) this.bookmarkMenuSort.value = this.markerSort;
        if (this.bookmarkManagerSort) this.bookmarkManagerSort.value = this.markerSort;
        this.updateSortDirectionButton(this.bookmarkMenuSortDirection);
        this.updateSortDirectionButton(this.bookmarkManagerSortDirection);
        this.renderBookmarkMenu();
        this.renderBookmarkMenuManager();
        requestAnimationFrame(() => {
            if (this.bookmarkMenuContainer?.matches(':popover-open')) this.fitPopupToMarkerPanel(this.bookmarkMenuContainer);
            if (this.bookmarkMenuManagerContainer?.matches(':popover-open')) this.fitPopupToMarkerPanel(this.bookmarkMenuManagerContainer);
        });
    }
    private updateSortDirectionButton(button: HTMLButtonElement | null): void {
        if (!button) return new ConsoleMessage('Sort direction button not found').sendMessage();
        const isAscending = this.markerSortDirection === 'asc';
        button.textContent = isAscending ? '↓' : '↑';
        button.title = `Sort ${this.markerSortDirection}`;
        button.setAttribute('aria-label', `Change sort direction; currently ${this.markerSortDirection}`);
        button.setAttribute('aria-pressed', String(isAscending));
    }
    private bindPaginationButtons(container: HTMLElement | null, changePage: (direction: -1 | 1) => void): void {
        container?.querySelector<HTMLButtonElement>('.marker-page-previous')?.addEventListener('click', () => changePage(-1));
        container?.querySelector<HTMLButtonElement>('.marker-page-next')?.addEventListener('click', () => changePage(1));
    }
    private updatePagination(container: HTMLElement | null, page: number, itemCount: number): number {
        const pageCount = Math.max(1, Math.ceil(itemCount / this.markersPerPage));
        const currentPage = Math.min(Math.max(page, 0), pageCount - 1);
        if (container) {
            container.hidden = pageCount <= 1;
            const previous = container.querySelector<HTMLButtonElement>('.marker-page-previous');
            const next = container.querySelector<HTMLButtonElement>('.marker-page-next');
            const status = container.querySelector<HTMLSpanElement>('.marker-page-status');
            if (previous) previous.disabled = currentPage === 0;
            if (next) next.disabled = currentPage >= pageCount - 1;
            if (status) status.textContent = `Page ${currentPage + 1} of ${pageCount}`;
        }
        return currentPage;
    }
    private getSortedMarkers(): [string, Bookmark][] {
        return Object.entries(this.hermidata.chapter.bookmarks).sort(([, first], [, second]) => {
            const firstDate = Date.parse(first[this.markerSort]) || 0;
            const secondDate = Date.parse(second[this.markerSort]) || 0;
            const dateDifference = this.markerSortDirection === 'asc' ? firstDate - secondDate : secondDate - firstDate;
            return dateDifference || first.label.localeCompare(second.label);
        });
    }
    private closeOtherMarkerPopovers(exception?: HTMLElement | null): void {
        for (const popover of this.markerPopovers) {
            if (popover !== exception && popover.matches(':popover-open')) popover.hidePopover();
        }
    }
    private fitPopupToMarkerPanel(popover: HTMLElement): void {
        if (!popover.matches(':popover-open')) return;
        const panelBottom = Math.ceil(popover.getBoundingClientRect().bottom);
        document.body.style.height = `${Math.max(this.popupBaseHeight, panelBottom + 12)}px`;
    }
    private resetPopupHeightIfNoMarkerPanel(): void {
        if ([...this.markerPopovers].some(popover => popover.matches(':popover-open'))) return;
        document.body.style.height = '';
    }
    /** Populate the marker list before its native popover trigger opens it. */
    private openBookmarkMenu(): void {
        if (!this.bookmarkMenu) return new ConsoleMessage('Bookmark menu not found').sendMessage();
        this.bookmarkMenuPage = 0;
        this.renderBookmarkMenu();
    }
    private renderBookmarkMenu(): void {
        if (!this.bookmarkMenu) return new ConsoleMessage('Bookmark menu not found').sendMessage();
        this.bookmarkMenu.innerHTML = '';
        const markers = this.getSortedMarkers();
        this.bookmarkMenuPage = this.updatePagination(this.bookmarkMenuPagination, this.bookmarkMenuPage, markers.length);
        if (this.bookmarkMenuSortControls) this.bookmarkMenuSortControls.hidden = markers.length <= 1;
        const pageMarkers = markers.slice(this.bookmarkMenuPage * this.markersPerPage, (this.bookmarkMenuPage + 1) * this.markersPerPage);
        for (const [key, value] of pageMarkers) {
            this.createBookmarkMenu(key, value);
        }
    }
    /** open add new bookmark */
    private addNewBookmarkForm(): void {
        if (!this.AddNewBookmarkContainer) return new ConsoleMessage('Add new bookmark not found').sendMessage();
        this.setAddNewBookmarkFormData();
    }
    /** Populate the manager before its native popover trigger opens it. */
    private openBookmarkMenuManager(): void {
        if (!this.bookmarkMenuManagerContainer || !this.bookmarkMenuManager) return new ConsoleMessage('Bookmark menu manager not found').sendMessage();
        this.bookmarkManagerPage = 0;
        this.renderBookmarkMenuManager();
    }
    private renderBookmarkMenuManager(): void {
        if (!this.bookmarkMenuManagerContainer || !this.bookmarkMenuManager) return new ConsoleMessage('Bookmark menu manager not found').sendMessage();
        this.bookmarkMenuManager!.innerHTML = '';
        const markers = this.getSortedMarkers();
        this.bookmarkManagerPage = this.updatePagination(this.bookmarkManagerPagination, this.bookmarkManagerPage, markers.length);
        if (this.bookmarkManagerSortControls) this.bookmarkManagerSortControls.hidden = markers.length <= 1;
        const pageMarkers = markers.slice(this.bookmarkManagerPage * this.markersPerPage, (this.bookmarkManagerPage + 1) * this.markersPerPage);
        for (const [key, value] of pageMarkers) {
            this.createBookmarkMenuManager(key, value);
        }
        this.updateMarkerManagerTip()
        requestAnimationFrame(() => this.fitPopupToMarkerPanel(this.bookmarkMenuManagerContainer!));
    }
    private updateMarkerManagerTip(): void {
        // Update the tip if the primary bookmark has been renamed
        const primaryBookmark = Object.values(this.hermidata.chapter.bookmarks).find(b => b.isPrimary);
        const isDefaultLabel = primaryBookmark?.label === 'Primary';
        if (primaryBookmark && this.bookmarkManagerTip && !isDefaultLabel) {
            this.bookmarkManagerTip.textContent = `Tip: "${primaryBookmark.label}" marker cannot be removed.`;
        }
    }
    /** close bookmark menu */
    private closeBookmarkMenu = (): void => {
        if (this.bookmarkMenuContainer?.matches(':popover-open')) this.bookmarkMenuContainer.hidePopover();
    }
    /** close add bookmark */
    private closeAddBookmark(): void {
        if (!this.AddNewBookmarkContainer) return new ConsoleMessage('AddNewBookmarkContainer is null').sendMessage();
        if (this.AddNewBookmarkContainer.matches(':popover-open')) this.AddNewBookmarkContainer.hidePopover();
        ColorPicker.destroy();
    }
    /** create bookmark menu */
    private async createBookmarkMenu(key: string, bookmark: Bookmark): Promise<void> {
        const bookmarkContainer = document.createElement('div');
        bookmarkContainer.className = 'bookmarkMenu-item';
        bookmarkContainer.setAttribute('title', 'use this marker');
        bookmarkContainer.dataset.key = key;
        const isActiveBookmark = this.hermidata.chapter.bookmarkInUse === key;

        bookmarkContainer.dataset.active = isActiveBookmark.toString();
        bookmarkContainer.style.setProperty('--marker-color', bookmark.color);
        const bookmarkLabel = document.createElement('div');
        bookmarkLabel.className = 'bookmarkLabel';
        bookmarkLabel.setAttribute('name', 'marker label');
        bookmarkLabel.textContent = bookmark.label;

        const bookmarkChapter = document.createElement('div');
        bookmarkChapter.className = 'bookmarkChapter';

        const lastChapter = bookmark?.history?.at(-1)?.chapter || bookmark.current;

        if (typeof lastChapter !== 'number') return new ConsoleMessage('lastChapter is not a number').sendMessage(); // safety check to ensure lastChapter is a number before proceeding

        bookmarkChapter.textContent = 'Ch. ' + String(lastChapter);

        bookmarkContainer.addEventListener('click', () => {
            this.closeBookmarkMenu();
            this.switchBookmarkMenu(key);
        });

        bookmarkContainer.append(bookmarkLabel, bookmarkChapter);
        this.bookmarkMenu!.appendChild(bookmarkContainer);
    }
    /** create new bookmark form */
    private setAddNewBookmarkFormData(): void {
        const currentChapter = this.hermidata.chapter.bookmarks[this.hermidata.chapter.bookmarkInUse].current;
        const currentNotes = this.hermidata.meta.notes;
        this.bookmarkLabelInput!.value = '';
        const defaultColor = '#fcfcfc';
        ColorPicker.updateColor(defaultColor);
        this.bookmarkColorInput!.style.backgroundColor = 'var(--surface-raised)';
        this.bookmarkChapterInput!.value = currentChapter.toString();
        this.bookmarkNotesInput!.value = currentNotes ?? '';
    }
    /** create bookmark menu manager */
    private createBookmarkMenuManager(key: string, value: Bookmark): void {
    
        const bookmarkContainer = document.createElement('div');
        bookmarkContainer.className = 'bookmarkMenuManager-item';
        bookmarkContainer.dataset.key = key;

        const bookmarkLabel = document.createElement('input');
        bookmarkLabel.className = 'bookmarkLabel';
        bookmarkLabel.setAttribute('name', 'marker label');
        bookmarkLabel.setAttribute('type', 'text');
        bookmarkLabel.setAttribute('title', 'rename this marker');
        bookmarkLabel.value = value.label;

        bookmarkLabel.addEventListener('focusout', async () => {
            await this.saveBookmarkLabel(key, bookmarkLabel.value);
        })

        const bookmarkLastUpdated = document.createElement('div');
        bookmarkLastUpdated.className = 'bookmarkLastUpdated';

        const relativeTimeValue = this.getTimeInWords(value.createdAt, value.updatedAt);
        bookmarkLastUpdated.textContent = 'chapter ' + value.current + ' - ' + relativeTimeValue;

        const bookmarkSVG = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        bookmarkSVG.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        bookmarkSVG.setAttribute('height', '24px');
        bookmarkSVG.setAttribute('viewBox', '0 -960 960 960');
        bookmarkSVG.classList.add('bookmarkMenuManager-item-icon');
        bookmarkSVG.innerHTML = `<g class="bookmarkMenuManager-item-icon-g">
            <path d="M240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h480q33 0 56.5 23.5T800-800v640q0 33-23.5 56.5T720-80H240Zm0-80h480v-640h-80v280l-100-60-100 60v-280H240v640Zm0 0v-640 640Zm200-360 100-60 100 60-100-60-100 60Z">
                <title class="bookmarkMenuManager-item-icon-title">Change marker colour</title>
            </path>
        </g>`;
        bookmarkSVG.style.fill = value.color;
        bookmarkSVG.style.cursor = 'pointer';
        this.createColorPicker(bookmarkSVG, key);

        if (!value.isPrimary) {
            const bookmarkDelete = document.createElement('div');
            bookmarkDelete.className = 'bookmarkDelete';
            bookmarkDelete.textContent = 'Remove';
            bookmarkDelete.addEventListener('click', () => this.removeBookmark(key));
            bookmarkContainer.append(bookmarkDelete);
        }


        bookmarkContainer.append(bookmarkSVG, bookmarkLabel, bookmarkLastUpdated);
        this.bookmarkMenuManager?.appendChild(bookmarkContainer);

    }
    private getTimeInWords(timeCreated: string, timeUpdated: string): string {
        /* Rules:
            if created at is less than 24 hours, show: created today at <time>
            if created yesterday, show: created yesterday
            if created more than 48 hours ago, show: created this week <date>
            if created less than 1 week ago, show: created 1 week ago
            if created less than 2 weeks ago, show: created 2 weeks ago
            if created more than 2 weeks ago, show: created <date>

            If updated is smaller than created, update all of the above to: Last updated <text>
        */
        const today = new Date().getDate();
        const yesterday = new Date().getTime() - (24 * 60 * 60 * 1000);
        const weeksAgo_3 = new Date().getTime() - (21 * 24 * 60 * 60 * 1000);
        const weeksAgo_2 = new Date().getTime() - (14 * 24 * 60 * 60 * 1000);
        const weeksAgo_1 = new Date().getTime() - (7 * 24 * 60 * 60 * 1000);

        const timeCreatedIsSmaller = new Date(timeCreated).getTime() < new Date(timeUpdated).getTime();
        const wordingType = timeCreatedIsSmaller ? 'Created ' : 'Last updated ';
        const timeCreatedOrUpdated = timeCreatedIsSmaller ? timeCreated : timeUpdated;

        const SetLessThan1Week = new Date(timeCreatedOrUpdated).getTime() > weeksAgo_1;
        const SetLessThan2Weeks = new Date(timeCreatedOrUpdated).getTime() > weeksAgo_2;
        const SetLessThan3Weeks = new Date(timeCreatedOrUpdated).getTime() > weeksAgo_3;

        const SetLessThan1Day = new Date(timeCreatedOrUpdated).getDate() === today;
        const SetLessThan48Hours = new Date(timeCreatedOrUpdated).getTime() > new Date(yesterday).getDate();

        let wording = wordingType;
        if (SetLessThan1Day) wording += 'today'
        else if (SetLessThan48Hours) wording += 'yesterday'
        else if(SetLessThan1Week) wording += 'this week' 
        else if (SetLessThan2Weeks) wording += '1 week ago' 
        else if (SetLessThan3Weeks) wording += '2 weeks ago';
        else wording += `at ${new Date(timeCreatedOrUpdated).toLocaleString([], {hourCycle: 'h23', hour: 'numeric', minute: 'numeric', day: 'numeric', month: 'short', year: 'numeric'})}`

        return wording;
    }
    private createColorPicker(svg: SVGSVGElement | HTMLElement, key: string): void {
        svg.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            const currentColor = this.hermidata.chapter.bookmarks[key].color;
            ColorPicker.show( ColorPicker.getHexColor() ?? currentColor,
                async (newColor) => {
                    svg.style.fill = newColor;
                    if (this.hermidata.chapter.bookmarkInUse === key) this.imgBookmark!.style.fill = newColor;
                    this.hermidata.chapter.bookmarks[key].color = newColor;
                    try {
                        if (!this.isNewHermidata) await saveHermidata(this.hermidata.id, this.hermidata.toJSON());
                    } catch (error) {
                        logConsoleError('Failed to save bookmark color:', error);
                    }
                },
                svg
            );
        });
    }

    private async removeBookmark(key: string): Promise<boolean> {
        const confirmation = await customConfirm('are you sure you want to remove this bookmark?', {accept: 'Remove', reject: 'Cancel'});
        if (!confirmation) return false;

        // set used bookmark to primary if selected
        if (this.hermidata.chapter.bookmarkInUse === key){
            // get primary bookmark
            const primaryBookmarkKey = Object.keys(this.hermidata.chapter.bookmarks).find(b => this.hermidata.chapter.bookmarks[b].isPrimary);
            if (!primaryBookmarkKey) return false;
            this.switchBookmarkMenu(primaryBookmarkKey);
        } 
        // remove bookmark
        delete this.hermidata.chapter.bookmarks[key];

        if (!this.isNewHermidata) await saveHermidata(this.hermidata.id, this.hermidata.toJSON());
        this.renderBookmarkMenuManager(); // refresh
        return true;
    }
    private async saveNewBookmark(): Promise<void> {
        const labelValue = this.bookmarkLabelInput?.value;
        const chapterValue = this.bookmarkChapterInput?.valueAsNumber;
        const notesValue = this.bookmarkNotesInput?.value;
        const colorValue = ColorPicker.getHexColor();

        const IsNotNumber = Number.isNaN(chapterValue);

        const validationErrors: string[] = [];
        if (!labelValue) validationErrors.push('Please enter a valid label');
        if (IsNotNumber) validationErrors.push('Please enter a valid chapter number');
        if (!colorValue) validationErrors.push('Please select a color');
        if (!labelValue || IsNotNumber || !colorValue) {
            new ErrorMessage(validationErrors.join('\n')).sendMessage();
            return;
        }

        const hash = returnBookmarkHash(labelValue);

        this.hermidata.chapter.bookmarks[hash] = {
            version: this.hermidata.version,
            id: hash,
            label: labelValue,
            current: Number(chapterValue),
            note: notesValue ?? undefined,
            color: colorValue,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            history: [{
                chapter: Number(chapterValue),
                at: new Date().toISOString()
            }],
            isPrimary: false,
            readStatus: 'Viewing',
            scrollPosition: 0,
            url: this.hermidata.GetUrl(this.hermidata.chapter.bookmarkInUse)
        }

        // if re-reading, update revisiting count
        if (this.hermidata.chapter.latest === this.hermidata.chapter.bookmarks[hash].current) this.hermidata.chapter.revisitingCount++;

        if (!this.isNewHermidata) await saveHermidata(this.hermidata.id, this.hermidata.toJSON());
        this.switchBookmarkMenu(hash);
        this.closeAddBookmark();
    }
    private async saveBookmarkLabel(key: string, label: string): Promise<void> {
        if (!this.hermidata.chapter.bookmarks[key]) return new ErrorMessage('Bookmark not found').sendMessage();
        if (label === this.hermidata.chapter.bookmarks[key].label) return;

        this.hermidata.chapter.bookmarks[key].label = label;
        this.hermidata.chapter.bookmarks[key].updatedAt = new Date().toISOString();

        if (!this.isNewHermidata) await saveHermidata(this.hermidata.id, this.hermidata.toJSON());
        if (this.bookmarkMenuManagerContainer?.matches(':popover-open')) this.renderBookmarkMenuManager();
    }

    private switchBookmarkMenu(key: string): void {
        // check if bookmark is already in use
        if (this.hermidata.chapter.bookmarkInUse == key) return;
        // update current bookmark in use
        this.hermidata.chapter.bookmarkInUse = key;
        this.bookmarkInUseID = key;
        // update popup UI
        setElement<HTMLInputElement>('#previousChapter', el => el.textContent = String(this.hermidata.chapter.bookmarks[this.hermidata.chapter.bookmarkInUse].history.at(-1) || 0));
        setElement<HTMLInputElement>('#chapter', el => el.value = String(this.hermidata.chapter.bookmarks[this.hermidata.chapter.bookmarkInUse].current));
        setElement<HTMLInputElement>('#notes', el => el.value = this.hermidata.meta.notes);
        setElement<HTMLSelectElement>('#status', el => el.value = this.hermidata.chapter.bookmarks[this.hermidata.chapter.bookmarkInUse].readStatus);
        // update bookmark menu UI
        this.imgBookmark!.style.fill = this.hermidata.chapter.bookmarks[this.hermidata.chapter.bookmarkInUse].color;
    }
}