import type { Bookmark, Hermidata } from "../../shared/types";
import { getElement, setElement } from "../../utils/Selection";

export class BookmarkController {

    private readonly hermidata: Hermidata;
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
    private readonly bookmarkColorInput = getElement<HTMLInputElement>('#bookmarkColorInput');
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

    constructor(hermidata: Hermidata) {
        this.hermidata = hermidata;
    }
    public init(): void {
        this.setAllToDefault();

        this.imgBookmark!.style.fill = this.hermidata.chapter.bookmarks[this.hermidata.meta.bookmarkInUse].color;

        this.bindEvents();
    }
    private bindEvents() {
        // must be set first
        // getElement<HTMLDivElement>('.HDClassic')?.addEventListener('click', (e) => this.setAllToDefault(e as PointerEvent));

        this.imgBookmark?.addEventListener('click', (e) => this.openBookmarkMenu(e as PointerEvent));
        for (const btn of this.addNewBookmarkBtn) btn?.addEventListener('click', () => this.addNewBookmarkForm());
        this.bookmarkMenuBtn?.addEventListener('click', () => this.openBookmarkMenuManager());
        this.cancelBookmarkMenuBtn?.addEventListener('click', () => this.closeBookmarkMenuManager());
    }
    private setAllToDefault(): void {
        // set all elements to default
        // only if not pressed on other button
        // if (e.target !== this.imgBookmark && e.target !== this.bookmarkMenuBtn && e.target !== this.addNewBookmarkBtn) return;
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
    private addNewBookmarkForm(): void {
        throw new Error("Method not implemented.");
    }
    private closeBookmarkMenuManager(): void {
        if (!this.bookmarkMenuManagerContainer) return;
        this.bookmarkMenuManagerContainer.style.display = 'none';
    }
    private createBookmarkMenuManager(key: string, value: Bookmark): void {
    
        const bookmarkContainer = document.createElement('div');
        bookmarkContainer.className = 'bookmarkMenuManager-item';
        bookmarkContainer.dataset.key = key;

        const bookmarkLabel = document.createElement('div');
        bookmarkLabel.className = 'bookmarkLabel';
        bookmarkLabel.textContent = value.label;

        const bookmarkLastUpdated = document.createElement('div');
        bookmarkLastUpdated.className = 'bookmarkLastUpdated';

        // if created at is less than 24 hours, show created at
        // if created at is more than 24 hours, show last updated
        // show last updated as relative time if less than 2 weeks ago
        // FIXME: this doesn't display correctly
        const yesterday = new Date().setDate(new Date().getDate() - 1);
        const weeksAgo_2 = new Date().setDate(new Date().getDate() - 14);
        const isCreatedAtLessThan24Hours = new Date(value.createdAt).getTime() > yesterday && new Date(value.createdAt).getTime() < weeksAgo_2;
        const wording = isCreatedAtLessThan24Hours ? 'Created at' : 'Last updated';
        const lastUpdatedValue = isCreatedAtLessThan24Hours ? new Date(value.createdAt).toLocaleString() : new Date(value.updatedAt).toLocaleString();
        const relativeTime = new Date(value.updatedAt).toLocaleString([], {hourCycle: 'h23', hour: 'numeric', minute: 'numeric', day: 'numeric', month: 'numeric', year: 'numeric'});
        const timeValue = new Date().getTime() > weeksAgo_2 ? lastUpdatedValue.toString() : relativeTime;

        bookmarkLastUpdated.textContent = 'chapter ' + value.current + ' - ' + wording + ': ' + timeValue;

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
        bookmarkSVG.addEventListener('click', () => this.editBookmarkColor(key));

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
    private editBookmarkColor(key: string): void {

    }
    private removeBookmark(key: string): boolean {
        // TODO: remove bookmark
        // TODO: add a confirmation message to remove
        return true;
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
    private closeBookmarkMenu(): void {
        if (!this.bookmarkMenuContainer) return;
        this.bookmarkMenuContainer.style.display = 'none';
        this.bookmarkMenuContainerVisible = false;
    }
    /** - creates a bookmark menu with all bookmarks */
    private addBookmarksToMenu() {
        const bookmarks = Object.entries(this.hermidata.chapter.bookmarks);

        // only create new bookmarks
        for (const [key, value] of bookmarks) {
            // document.querySelectorAll<HTMLDivElement>('.hermidata-item[data-is-notification-item="true"]');
            if (this.bookmarkMenu?.querySelector<HTMLDivElement>(`.bookmarkMenu-item[data-key="${key}"]`)) continue;
            this.createBookmarkMenu(key, value);
            this.bookmarkMenu?.appendChild( document.createElement('hr') );
        }
    }

    private async createBookmarkMenu(key: string, bookmark: Bookmark): Promise<void> {
        // 
        const bookmarkContainer = document.createElement('div');
        bookmarkContainer.className = 'bookmarkMenu-item';
        bookmarkContainer.dataset.key = key;
        bookmarkContainer.style.backgroundColor = 'var(--Btn_active)';

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
        this.imgBookmark!.style.backgroundColor = this.hermidata.chapter.bookmarks[this.hermidata.meta.bookmarkInUse].color;
    }

}