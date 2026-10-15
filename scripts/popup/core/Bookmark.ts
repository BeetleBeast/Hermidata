import { saveHermidata } from "../../shared/db/Storage";
import { returnBookmarkHash } from "../../shared/utils/StringOutput";
import type { Bookmark } from "../../shared/types";
import { getElement, setElement } from "../../shared/utils/Selection";
import { ColorPicker } from "../frontend/ColorPicker";
import { HermidataModel } from "../../shared/utils/HermidataSelector";
import { customConfirm } from "../frontend/confirm";

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
    
    // bookmark menu ( on click of bookmark menu button )
    private readonly bookmarkMenuContainer = getElement<HTMLDivElement>('.bookmarkMenuContainer');
    private readonly bookmarkMenu = getElement<HTMLDivElement>('.bookmarkMenu');
    // general used    
    private readonly addNewBookmarkBtn = document.querySelectorAll<HTMLButtonElement>('.addNewBookmarkBtn'); // open add new bookmark form
    private readonly bookmarkMenuBtn = getElement<HTMLButtonElement>('.bookmarkMenuBtn'); // open bookmark menu manager

    private readonly isNewHermidata: boolean;
    private readonly markerPopovers = document.querySelectorAll<HTMLDivElement | HTMLElement>('.markerPopover[popover]');
    private popupBaseHeight = 0;

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
        if (!(target instanceof Element)) return;
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
        if (!this.bookmarkMenu) return;
        this.bookmarkMenu.innerHTML = '';
        // only create new bookmarks
        for (const [key, value] of Object.entries(this.hermidata.chapter.bookmarks)) {
            this.createBookmarkMenu(key, value);
        }
    }
    /** open add new bookmark */
    private addNewBookmarkForm(): void {
        if (!this.AddNewBookmarkContainer) return;
        this.setAddNewBookmarkFormData();
    }
    /** Populate the manager before its native popover trigger opens it. */
    private openBookmarkMenuManager(): void {
        if (!this.bookmarkMenuManagerContainer || !this.bookmarkMenuManager) return;
        this.bookmarkMenuManager!.innerHTML = '';

        for (const [key, value] of Object.entries(this.hermidata.chapter.bookmarks)) {
            this.createBookmarkMenuManager(key, value);
        }
        requestAnimationFrame(() => this.fitPopupToMarkerPanel(this.bookmarkMenuManagerContainer!));
    }
    /** close bookmark menu */
    private closeBookmarkMenu = (): void => {
        if (this.bookmarkMenuContainer?.matches(':popover-open')) this.bookmarkMenuContainer.hidePopover();
    }
    /** close add bookmark */
    private closeAddBookmark(): void {
        if (!this.AddNewBookmarkContainer) return;
        if (this.AddNewBookmarkContainer.matches(':popover-open')) this.AddNewBookmarkContainer.hidePopover();
        ColorPicker.destroy();
    }
    /** create bookmark menu */
    private async createBookmarkMenu(key: string, bookmark: Bookmark): Promise<void> {
        const bookmarkContainer = document.createElement('div');
        bookmarkContainer.className = 'bookmarkMenu-item';
        bookmarkContainer.dataset.key = key;
        const isActiveBookmark = this.hermidata.chapter.bookmarkInUse === key;

        bookmarkContainer.dataset.active = isActiveBookmark.toString();
        bookmarkContainer.style.setProperty('--marker-color', bookmark.color);
        const bookmarkLabel = document.createElement('div');
        bookmarkLabel.className = 'bookmarkLabel';
        bookmarkLabel.textContent = bookmark.label;

        const bookmarkChapter = document.createElement('div');
        bookmarkChapter.className = 'bookmarkChapter';

        const lastChapter = bookmark?.history?.at(-1)?.chapter || bookmark.current;

        if (typeof lastChapter !== 'number') return; // safety check to ensure lastChapter is a number before proceeding

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
                <title class="bookmarkMenuManager-item-icon-title">this Item is not linked to a RSS feed</title>
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
                        console.error('Failed to save bookmark color:', error);
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
        this.openBookmarkMenuManager(); // refresh
        return true;
    }
    private async saveNewBookmark(): Promise<void> {
        const labelValue = this.bookmarkLabelInput?.value;
        const chapterValue = this.bookmarkChapterInput?.valueAsNumber;
        const notesValue = this.bookmarkNotesInput?.value;
        const colorValue = ColorPicker.getHexColor();

        if (!labelValue || !chapterValue || !colorValue) return;

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
        if (!this.hermidata.chapter.bookmarks[key]) return;
        if (label === this.hermidata.chapter.bookmarks[key].label) return;

        this.hermidata.chapter.bookmarks[key].label = label;
        this.hermidata.chapter.bookmarks[key].updatedAt = new Date().toISOString();

        if (!this.isNewHermidata) await saveHermidata(this.hermidata.id, this.hermidata.toJSON());
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