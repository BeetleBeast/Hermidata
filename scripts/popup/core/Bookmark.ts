import type { Bookmark, Hermidata } from "../../shared/types";
import { getElement, setElement } from "../../utils/Selection";

export class BookmarkController {

    private readonly hermidata: Hermidata;
    public bookmarkInUseID: string | null = null;

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
    private readonly addNewBookmarkBtn = getElement<HTMLButtonElement>('#addNewBookmarkBtn'); // open add new bookmark form
    private readonly bookmarkMenuBtn = getElement<HTMLButtonElement>('.bookmarkMenuBtn'); // open bookmark menu manager

    constructor(hermidata: Hermidata) {
        this.hermidata = hermidata;
    }
    public init(): void {
        this.bindEvents();
    }
    private bindEvents() {
        this.imgBookmark?.addEventListener('click', (e) => this.openBookmarkMenu(e as PointerEvent));
        this.addNewBookmarkBtn?.addEventListener('click', () => this.addNewBookmarkForm());
        this.bookmarkMenuBtn?.addEventListener('click', () => this.openBookmarkMenuManager());
        this.cancelBookmarkMenuBtn?.addEventListener('click', () => this.closeBookmarkMenuManager());
    }
    private openBookmarkMenuManager(): void {
        if (!this.bookmarkMenuManagerContainer) return;
        this.bookmarkMenuManagerContainer.style.display = 'block';


        this.createBookmarkMenuManager();
    }
    private addNewBookmarkForm(): void {
        throw new Error("Method not implemented.");
    }
    private closeBookmarkMenuManager(): void {
        if (!this.bookmarkMenuManagerContainer) return;
        this.bookmarkMenuManagerContainer.style.display = 'none';
    }
    private createBookmarkMenuManager() {
        for (const [key, value] of Object.entries(this.hermidata.chapter.bookmarks)) {
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
            const yesterday = new Date().setDate(new Date().getDate() - 1);
            const weeksAgo_2 = new Date().setDate(new Date().getDate() - 14);
            const isCreatedAtLessThan24Hours = new Date(value.createdAt).getTime() > yesterday && new Date(value.createdAt).getTime() < weeksAgo_2;
            const wording = isCreatedAtLessThan24Hours ? 'Created at' : 'Last updated at';
            const lastUpdatedValue = isCreatedAtLessThan24Hours ? new Date(value.createdAt).toLocaleString() : new Date(value.updatedAt).toLocaleString();
            const relativeTime = new Date(value.updatedAt).toLocaleString([], {hourCycle: 'h23', hour: 'numeric', minute: 'numeric', day: 'numeric', month: 'numeric', year: 'numeric'});
            const timeValue = new Date().getTime() > weeksAgo_2 ? lastUpdatedValue.toString() : relativeTime;

            bookmarkLastUpdated.textContent = wording + ': ' + timeValue;

            const bookmarkColor = document.createElement('div');
            bookmarkColor.className = 'bookmarkColor';
            bookmarkColor.style.backgroundColor = value.color;

            if (!value.isPrimary) {
                const bookmarkDelete = document.createElement('div');
                bookmarkDelete.className = 'bookmarkDelete';
                bookmarkDelete.textContent = 'Remove';
                bookmarkDelete.addEventListener('click', () => this.removeBookmark(key));
                bookmarkContainer.append(bookmarkDelete);
            }


            bookmarkContainer.append(bookmarkLabel, bookmarkLastUpdated, bookmarkColor);
            this.bookmarkMenuManager?.appendChild(bookmarkContainer);
        }
    }
    private removeBookmark(key: string): any {
        // TODO: remove bookmark
        // TODO: add a confirmation message to remove
    }
    /**
     * - open or close bookmark menu depending on where the mouse points
     * @param e - event of where the mouse points to
     */
    public openBookmarkMenu(e: PointerEvent): void {
        if (!this.bookmarkMenuContainer) return;
        if (e.target != this.bookmarkMenuContainer) {
            this.bookmarkMenuContainer.style.display = 'none';
        } else if (e.target == this.bookmarkMenuContainer) {
            this.bookmarkMenuContainer.style.display = 'block';
            this.bookmarkMenuContainer.style.left = `${e.clientX}px`;
            this.bookmarkMenuContainer.style.top = `${e.clientY}px`;
            this.addBookmarksToMenu();
        }

    }
    /** - creates a bookmark menu with all bookmarks */
    private addBookmarksToMenu() {
        const bookmarks = Object.entries(this.hermidata.chapter.bookmarks);
        for (const [key, value] of bookmarks) this.createBookmarkMenu(key, value);
    }

    private async createBookmarkMenu(key: string, bookmark: Bookmark): Promise<void> {
        // 
        const bookmarkContainer = document.createElement('div');
        bookmarkContainer.className = 'bookmarkMenu';
        bookmarkContainer.dataset.key = key;

        const bookmarkLabel = document.createElement('div');
        bookmarkLabel.className = 'bookmarkLabel';
        bookmarkLabel.textContent = bookmark.label;

        const bookmarkChapter = document.createElement('div');
        bookmarkChapter.className = 'bookmarkChapter';
        bookmarkChapter.textContent = bookmark.current.toString();

        bookmarkContainer.addEventListener('click', () => {
            this.switchBookmarkMenu(key);
        });

        bookmarkContainer.append(bookmarkLabel, bookmarkChapter);
        this.bookmarkMenu?.appendChild(bookmarkContainer);
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
        // close bookmark menu
        // TODO: add transition
        this.bookmarkMenuContainer!.style.display = 'none';
    }

}