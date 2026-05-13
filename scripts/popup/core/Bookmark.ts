import { saveHermidataV3 } from "../../shared/db/Storage";
import { returnBookmarkHash } from "../../shared/StringOutput";
import type { Bookmark, Hermidata } from "../../shared/types";
import { getElement, setElement } from "../../utils/Selection";
import { ColorPicker } from "../frontend/ColorPicker";
import { activateother, customConfirm, deactivateother } from "../frontend/confirm";

export class BookmarkController {

    private hermidata: Hermidata;
    public bookmarkInUseID: string | null = null;

    private AddNewBookmarkContainerVisible: boolean = false;
    private bookmarkMenuManagerContainerVisible: boolean = false;
    private bookmarkMenuContainerVisible: boolean = false;

    // img bookmark
    private readonly imgBookmark = getElement<HTMLImageElement>('.imgBookmark');

    // add new bookmark
    private readonly AddNewBookmarkContainer = getElement<HTMLDivElement>('.AddNewBookmark');
    private readonly bookmarkChapterContainer = getElement<HTMLDivElement>('#bookmarkChapterContainer');
    private readonly bookmarkLabelInput = getElement<HTMLInputElement>('#bookmarkLabelInput');
    private readonly bookmarkChapterInput = getElement<HTMLInputElement>('#bookmarkChapterInput');
    private readonly bookmarkNotesInput = getElement<HTMLInputElement>('#bookmarkNotesInput');
    private readonly bookmarkColorInput = getElement<HTMLButtonElement>('#bookmarkColorInput');
    private readonly cancelBookmarkBtn = getElement<HTMLButtonElement>('#cancelBookmarkBtn');
    private readonly saveBookmarkBtn = getElement<HTMLButtonElement>('#saveBookmarkBtn');

    // bookmark menu manager
    private readonly bookmarkMenuManagerContainer = getElement<HTMLDivElement>('.bookmarkMenuManagerContainer');
    private readonly cancelBookmarkMenuBtn = getElement<HTMLButtonElement>('#cancelBookmarkMenuBtn');
    private readonly bookmarkMenuManager = getElement<HTMLDivElement>('#bookmarkMenuManager');
    
    // bookmark menu ( on click of bookmark menu button )
    private readonly bookmarkMenuContainer = getElement<HTMLDivElement>('.bookmarkMenuContainer');
    private readonly bookmarkMenu = getElement<HTMLDivElement>('.bookmarkMenu');
    // general used    
    private readonly addNewBookmarkBtn = document.querySelectorAll<HTMLButtonElement>('.addNewBookmarkBtn'); // open add new bookmark form
    private readonly bookmarkMenuBtn = getElement<HTMLButtonElement>('.bookmarkMenuBtn'); // open bookmark menu manager

    private readonly bookmarkSVG = getElement<SVGSVGElement>('.colorPicker');

    private readonly isNewHermidata: boolean;

    constructor(hermidata: Hermidata, isNew: boolean = false) {
        this.hermidata = hermidata;
        this.isNewHermidata = isNew;
    }
    public init(): void {
        this.setAllToDefault();

        this.imgBookmark!.style.fill = this.hermidata.chapter.bookmarks[this.hermidata.meta.bookmarkInUse].color;

        this.bindEvents();
    }
    private bindEvents() {
        // TODO: stop prpagation to prevent event from bubbling up and closing  popup when opening color picker
        this.imgBookmark?.addEventListener('click', (e) => this.openBookmarkMenu(e as PointerEvent));
        this.bookmarkMenuContainer?.addEventListener('focus', () => this.closeBookmarkMenu());


        for (const btn of this.addNewBookmarkBtn) btn?.addEventListener('click', (e) => this.addNewBookmarkForm());

        this.bookmarkMenuBtn?.addEventListener('click', (e) => {
            // Only stop propagation if clicking on the SVG or color picker
            if (e.target === this.bookmarkSVG || (e.target as HTMLElement).closest('svg') === this.bookmarkSVG) {
            e.stopPropagation();
            deactivateother();
            this.openBookmarkMenuManager()
        }});

        this.saveBookmarkBtn?.addEventListener('click', (e) => {
            // Only stop propagation if clicking on the SVG or color picker
            if (e.target === this.bookmarkSVG || (e.target as HTMLElement).closest('svg') === this.bookmarkSVG) {
            e.stopPropagation();
            deactivateother();
            this.saveNewBookmark()
        }});

        this.cancelBookmarkMenuBtn?.addEventListener('click', (e) => {
            // Only stop propagation if clicking on the SVG or color picker
            if (e.target === this.bookmarkSVG || (e.target as HTMLElement).closest('svg') === this.bookmarkSVG) {
            e.stopPropagation();
            this.closeBookmarkMenuManager()
        }});
        this.cancelBookmarkBtn?.addEventListener('click', (e) => {
            // Only stop propagation if clicking on the SVG or color picker
            if (e.target === this.bookmarkSVG || (e.target as HTMLElement).closest('svg') === this.bookmarkSVG) {
            e.stopPropagation();
            this.closeAddBookmark()
        }});
    }
    private setAllToDefault(): void {
        // set all elements to default
        this.bookmarkInUseID = null;
        this.AddNewBookmarkContainer!.style.display = 'none';
        this.bookmarkMenuContainer!.style.display = 'none';
        this.bookmarkMenuManagerContainer!.style.display = 'none';
    }

    private openBookmarkMenuManager(): void {
        if (!this.bookmarkMenuManagerContainer) return;
        this.closeBookmarkMenu();
        this.bookmarkMenuManagerContainer.style.display = 'block';

        for (const [key, value] of Object.entries(this.hermidata.chapter.bookmarks)) {
            if (this.bookmarkMenuManager?.querySelector<HTMLDivElement>(`.bookmarkMenuManager-item[data-key="${key}"]`)) continue;
            this.createBookmarkMenuManager(key, value);
        }
    }
    private createBookmarkMenuManager(key: string, value: Bookmark): void {
    
        const bookmarkContainer = document.createElement('div');
        bookmarkContainer.className = 'bookmarkMenuManager-item';
        bookmarkContainer.dataset.key = key;

        const bookmarkLabel = document.createElement('input');
        bookmarkLabel.className = 'bookmarkLabel';
        bookmarkLabel.value = value.label;

        bookmarkLabel.addEventListener('focusout', () => {
            this.saveBookmarkLabel(key, bookmarkLabel.value);
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
        // TODO: update popup to have correct height as menu has a great chance to overflow

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
            const rect = document.body.getBoundingClientRect();
            
            ColorPicker.show(  ColorPicker.getHexColor() ?? currentColor,
                async (newColor) => {
                    svg.style.fill = newColor;
                    this.hermidata.chapter.bookmarks[key].color = newColor;
                    try {
                        if (!this.isNewHermidata) await saveHermidataV3(this.hermidata.id, this.hermidata);
                    } catch (error) {
                        console.error('Failed to save bookmark color:', error);
                    }
                },
                { x: (rect.right / 4 + rect.right / 2) - 80, y: (rect.bottom / 2) - 100 }
            );
        });
    }

    private async removeBookmark(key: string): Promise<boolean> {
        const confirmation = await customConfirm('are you sure you want to remove this bookmark?');
        if (!confirmation) return false;

        // set used bookmark to primary if selected
        if (this.hermidata.meta.bookmarkInUse === key){
            // get primary bookmark
            const primaryBookmarkKey = Object.keys(this.hermidata.chapter.bookmarks).find(b => this.hermidata.chapter.bookmarks[b].isPrimary);
            if (!primaryBookmarkKey) return false;
            this.hermidata.meta.bookmarkInUse = primaryBookmarkKey;
        } 
        // remove bookmark
        delete this.hermidata.chapter.bookmarks[key];

        if (!this.isNewHermidata) await saveHermidataV3(this.hermidata.id, this.hermidata);
        return true;
    }
    private addNewBookmarkForm(): void {
        this.closeBookmarkMenu();
        this.closeBookmarkMenuManager();
        if (!this.AddNewBookmarkContainer) return;
        this.AddNewBookmarkContainer.style.display = 'block';
        this.AddNewBookmarkContainerVisible = true;
        this.setAddNewBookmarkFormData();
    }
    private setAddNewBookmarkFormData(): void {
        const currentChapter = this.hermidata.chapter.bookmarks[this.hermidata.meta.bookmarkInUse].current;
        const currentNotes = this.hermidata.meta.notes;
        this.bookmarkLabelInput!.textContent = '';
        this.bookmarkChapterInput!.value = currentChapter.toString();
        this.bookmarkNotesInput!.textContent = currentNotes ?? '';

        const defaultColor = 'green';
        const rect = document.body.getBoundingClientRect();

        this.bookmarkColorInput!.addEventListener('click', () => {
            ColorPicker.show( ColorPicker.getHexColor() ?? defaultColor,
                async () => {
                    this.bookmarkColorInput!.style.backgroundColor = ColorPicker.getHexColor() ?? defaultColor;
                },
                { x: (rect.right / 4 + rect.right / 2) - 80, y: (rect.bottom / 2) - 100 }
            );
        });
    }
    private async saveNewBookmark(): Promise<void> {
        const labelValue = this.bookmarkLabelInput?.value;
        const chapterValue = this.bookmarkChapterInput?.value;
        const notesValue = this.bookmarkNotesInput?.value;
        const colorValue = ColorPicker.getHexColor();

        if (!labelValue || !chapterValue || !colorValue) return;

        const hash = returnBookmarkHash(labelValue);

        this.hermidata.chapter.bookmarks[hash] = {
            id: hash,
            label: labelValue,
            current: Number(chapterValue),
            note: notesValue ?? undefined,
            color: colorValue,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            history: [],
            isPrimary: false
        }

        // if re-reading, update revisiting count
        if (this.hermidata.chapter.latest === this.hermidata.chapter.bookmarks[hash].current) this.hermidata.chapter.revisitingCount++;

        if (!this.isNewHermidata) await saveHermidataV3(this.hermidata.id, this.hermidata);
        this.switchBookmarkMenu(hash);
        this.closeAddBookmark();
    }
    /**
     * - open or close bookmark menu depending on where the mouse points
     * @param e - event of where the mouse points to
     */
    public openBookmarkMenu(e: PointerEvent): void {
        if (!this.bookmarkMenuContainer) return;
        if (this.bookmarkMenuContainerVisible) {
            this.closeBookmarkMenu();
            return;
        }
        this.bookmarkMenuContainer.style.display = 'block';
        this.bookmarkMenuContainerVisible = true;
        this.addBookmarksToMenu();
    }
    // close bookmark menu
    private closeBookmarkMenu(): void {
        if (!this.bookmarkMenuContainer) return;
        this.bookmarkMenuContainer.style.display = 'none';
        this.bookmarkMenuContainerVisible = false;
        activateother();
    }
    // close add bookmark
    private closeAddBookmark(): void {
        if (!this.AddNewBookmarkContainer) return;
        this.AddNewBookmarkContainer.style.display = 'none';
        this.AddNewBookmarkContainerVisible = false;
        ColorPicker.destroy();
        activateother();
    }
    // close bookmark menu manager
    private closeBookmarkMenuManager(): void {
        if (!this.bookmarkMenuManagerContainer) return;
        this.bookmarkMenuManagerContainer.style.display = 'none';
        this.bookmarkMenuManagerContainerVisible = false;
        ColorPicker.destroy();
        activateother();
    }
    /** - creates a bookmark menu with all bookmarks */
    private addBookmarksToMenu() {
        const bookmarks = Object.entries(this.hermidata.chapter.bookmarks);
        this.bookmarkMenu!.innerHTML = '';
        // only create new bookmarks
        for (const [key, value] of bookmarks) {
            // if (this.bookmarkMenu?.querySelector<HTMLDivElement>(`.bookmarkMenu-item[data-key="${key}"]`)) continue;
            this.createBookmarkMenu(key, value);
            this.bookmarkMenu?.appendChild( document.createElement('hr') );
        }
    }

    private async createBookmarkMenu(key: string, bookmark: Bookmark): Promise<void> {
        // 
        const bookmarkContainer = document.createElement('div');
        bookmarkContainer.className = 'bookmarkMenu-item';
        bookmarkContainer.dataset.key = key;
        const isActiveBookmark = this.hermidata.meta.bookmarkInUse === key;

        bookmarkContainer.style.backgroundColor = isActiveBookmark ? 'var(--Btn_active)' : 'var(--Input-colorV2)';

        const bookmarkLabel = document.createElement('div');
        bookmarkLabel.className = 'bookmarkLabel';
        bookmarkLabel.textContent = bookmark.label;

        const bookmarkChapter = document.createElement('div');
        bookmarkChapter.className = 'bookmarkChapter';
        bookmarkChapter.textContent = 'Ch. ' + bookmark.current.toString();

        bookmarkContainer.addEventListener('click', () => {
            this.closeBookmarkMenu();
            this.switchBookmarkMenu(key);
        });

        bookmarkContainer.append(bookmarkLabel, bookmarkChapter);
        this.bookmarkMenu!.appendChild(bookmarkContainer);
    }
    private saveBookmarkLabel(key: string, label: string): void {
        if (!this.hermidata.chapter.bookmarks[key]) return;
        if (label === this.hermidata.chapter.bookmarks[key].label) return;

        this.hermidata.chapter.bookmarks[key].label = label;
        this.hermidata.chapter.bookmarks[key].updatedAt = new Date().toISOString();

        if (!this.isNewHermidata) saveHermidataV3(this.hermidata.id, this.hermidata);
    }

    private switchBookmarkMenu(key: string): void {
        // check if bookmark is already in use
        if (this.hermidata.meta.bookmarkInUse == key) return;
        // update current bookmark in use
        this.hermidata.meta.bookmarkInUse = key;
        // update popup UI
        setElement<HTMLInputElement>('#previousChapter', el => el.textContent = String(this.hermidata.chapter.bookmarks[this.hermidata.meta.bookmarkInUse].history.at(-1) || 0));
        setElement<HTMLInputElement>('#chapter', el => el.value = String(this.hermidata.chapter.bookmarks[this.hermidata.meta.bookmarkInUse].current));
        setElement<HTMLInputElement>('#notes', el => el.value = this.hermidata.meta.notes);
        // update bookmark menu UI
        this.imgBookmark!.style.fill = this.hermidata.chapter.bookmarks[this.hermidata.meta.bookmarkInUse].color;
    }

}