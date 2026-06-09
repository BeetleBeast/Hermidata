import { getSettings, saveHermidata } from "../../shared/db/Storage";
import type { Bookmark, Hermidata, Settings } from "../../shared/types";
import { getElement } from "../../shared/utils/Selection";
import { returnBookmarkHash } from "../../shared/utils/StringOutput";
import { RSSPageBuilder } from "../build";

export class Detail extends RSSPageBuilder {


    private readonly parentContainer: HTMLElement | null = getElement('.entry-details-container');
    private readonly mainContentContainer: HTMLElement | null = getElement('.entry-details-mainContent');
    private readonly bookmarksContainer: HTMLElement | null = getElement('.entry-details-bookmarks');

    private readonly title: HTMLInputElement | null = getElement('#detail-title');
    private readonly novelType: HTMLSelectElement | null = getElement('#detail-novelType');
    private readonly novelStatus: HTMLSelectElement | null = getElement('#etail-novelStatus');
    private readonly url: HTMLInputElement | null = getElement('#detail-url');
    private readonly notes: HTMLTextAreaElement | null = getElement('#detail-notes');
    
    private readonly tagsContainer: HTMLDivElement | null = getElement('#detail-tags-container');
    private readonly altSourcesContainer: HTMLDivElement | null = getElement('#detail-altSources-container');
    private readonly altTitlesContainer: HTMLDivElement | null = getElement('#detail-altTitles-container');
    
    private readonly saveDetail: HTMLButtonElement | null = getElement('#saveDetail');


    private editEntry: Hermidata | null = null;

    constructor(editEntry: Hermidata) {
        super();
        this.editEntry = editEntry;
    }




    protected async build(): Promise<void> {
        // populate
        this.populateDetails(this.settings);
        
        // build bookmarks
        await this.buildBookmarks();

        // add event listeners
        this.AddEventListener();
    }
    public open() {
        this.parentContainer!.style.display = 'block';
        this.mainContentContainer!.style.display = 'block';
        this.bookmarksContainer!.style.display = 'block';
    }
    public close() {
        this.parentContainer!.style.display = 'none';
        this.mainContentContainer!.style.display = 'none';
        this.bookmarksContainer!.style.display = 'none';
    }
    protected reload(): void {
        this.saveDetail!.removeEventListener('click', () => this.saveDetails());
        this.build();
    }
    private AddEventListener() {
        this.saveDetail!.removeEventListener('click', () => this.saveDetails());
        this.saveDetail!.addEventListener('click', () => this.saveDetails());
    }
    private async saveDetails() {
        if (!this.editEntry) return;
        this.editEntry.title = this.title!.value;
        this.editEntry.novelType = this.novelType!.value;
        this.editEntry.meta.novelStatus = this.novelStatus!.value;
        this.editEntry.url = this.url!.value;
        this.editEntry.meta.notes = this.notes!.value;

        this.editEntry.meta.tags = this.getNamesFromContainer(this.tagsContainer);
        this.editEntry.meta.altSources = this.getNamesFromContainer(this.altSourcesContainer);
        this.editEntry.meta.altTitles = this.getNamesFromContainer(this.altTitlesContainer);

        this.editEntry.chapter.bookmarks = this.getBookmarks();
        // make sure the last used bookmark ( id ) still exist else use the first of the list
        if (!this.editEntry.chapter.bookmarks[this.editEntry.chapter.bookmarkInUse]) {
            this.editEntry.chapter.bookmarkInUse = Object.keys(this.editEntry.chapter.bookmarks)[0];
        }

        this.editEntry.meta.updated = new Date().toISOString();

        await saveHermidata(this.editEntry.id, this.editEntry);
    }
    /** Get names from container */
    private getNamesFromContainer(container: HTMLDivElement | null): string[] {
        if (!container) return [];
        return Array.from(container.children).map((child) => child.textContent);
    }
    private getBookmarks(): Record<string, Bookmark> {
        const bookmarks: Map<string, Bookmark> = new Map();
        for (const bookmarkElement of Array.from(this.bookmarksContainer!.children)) {
            const bookmarkEl = bookmarkElement as HTMLDivElement;
            const oldID = bookmarkEl.dataset.bookmarkId;
            if (!oldID || !this.editEntry) continue;
            const label = bookmarkEl.querySelector('.bookmark-label')!.textContent;
            const currentChapter = bookmarkEl.querySelector('.bookmark-chapter')!.textContent;
            const allchapterHistory = bookmarkEl.querySelectorAll<HTMLInputElement>('.bookmark-history-chapter');
            const history = Array.from(allchapterHistory).map((chapter) => Number(chapter.value));
            const notes = bookmarkEl.querySelector('.bookmark-note')!.textContent;
            const colour = bookmarkEl.querySelector('.bookmark-colour')!.textContent;
            const readStatus = bookmarkEl.querySelector<HTMLSelectElement>('.bookmark-readStatus')!.selectedOptions[0].value;
            const bookmark: Bookmark = {
                id: returnBookmarkHash(label),
                label: label,
                history: history,
                note: notes,
                color: colour,
                current: Number(currentChapter),
                readStatus: readStatus,
                isPrimary: this.editEntry.chapter.bookmarks[oldID].isPrimary,
                createdAt: this.editEntry.chapter.bookmarks[oldID].createdAt,
                updatedAt: new Date().toISOString(),
                scrollPosition: this.editEntry.chapter.bookmarks[oldID].scrollPosition,
            }
            bookmarks.set(bookmark.id, bookmark);
        }
        return Object.fromEntries(bookmarks);
    }

    private async buildBookmarks() {
        if (!this.editEntry) return;
        for (const bookmark of Object.values(this.editEntry.chapter.bookmarks)) {
            const bookmarkEl = this.buildBookmark(bookmark, this.editEntry);
            this.bookmarksContainer?.appendChild(bookmarkEl);
        }
    }
    private buildBookmark(bookmark: Bookmark, entry: Hermidata): HTMLDivElement {
        const bookmarkEl = document.createElement('div');
        bookmarkEl.classList.add('bookmark');
        bookmarkEl.id = `bookmark-${bookmark.id}`;
        bookmarkEl.dataset.bookmarkId = bookmark.id;

        // create bookmark label
        const nameLabel = this.createBookmarkNameLabel(bookmark);
        const name = this.createBookmarkName(bookmark);

        // create bookmark current chapter
        const ChapterLabel = this.createBookmarkChapterLabel(bookmark);
        const chapter = this.createBookmarkChapter(bookmark);

        // create bookmark latest chapter
        const latestChapterLabel = this.createBookmarkLatestChapterLabel(entry);
        const latestChapter = this.createBookmarkLatestChapter(entry);

        // create bookmark history chapter
        const historyChapterLabel = this.createBookmarkChapterHistoryLabel(bookmark);
        const historyChapter = this.createBookmarkChapterHistory(bookmark);

        // create bookmark Read Status
        const readStatusLabel = this.createBookmarkReadStatusLabel(bookmark);
        const readStatus = this.createBookmarkReadStatus(bookmark);

        // create bookmark colour
        const colourLabel = this.createBookmarkColourLabel(bookmark);
        const colour = this.createBookmarkColour(bookmark);

        // create bookmark note
        const noteLabel = this.createBookmarkNoteLabel(bookmark);
        const note = this.createBookmarkNote(bookmark);

        bookmarkEl.append(
            nameLabel, name,
            ChapterLabel, chapter,
            latestChapterLabel, latestChapter,
            historyChapterLabel, historyChapter,
            readStatusLabel, readStatus,
            colourLabel, colour,
            noteLabel, note
        )

        return bookmarkEl;
    }
    private createBookmarkNameLabel(bookmark: Bookmark): HTMLLabelElement {
        const bookmarkLabel = document.createElement('label');
        bookmarkLabel.textContent = bookmark.label;
        bookmarkLabel.setAttribute('for', bookmark.label);
        return bookmarkLabel;
    }
    private createBookmarkName(bookmark: Bookmark): HTMLInputElement {
        const bookmarkName = document.createElement('input');
        bookmarkName.value = bookmark.label;
        bookmarkName.type = 'text';
        bookmarkName.id = bookmark.label;
        bookmarkName.classList.add('bookmark-label');
        bookmarkName.textContent = bookmark.label;
        return bookmarkName;
    }
    private createBookmarkChapterLabel(bookmark: Bookmark): HTMLLabelElement {
        const bookmarkChapterLabel = document.createElement('label');
        bookmarkChapterLabel.textContent = 'Chapter';
        bookmarkChapterLabel.setAttribute('for', `bookmark-chapter-${bookmark.id}`);
        return bookmarkChapterLabel;
    }
    private createBookmarkChapter(bookmark: Bookmark): HTMLInputElement {
        const bookmarkChapter = document.createElement('input');
        bookmarkChapter.value = String(bookmark.current);
        bookmarkChapter.type = 'number';
        bookmarkChapter.id = `bookmark-chapter-${bookmark.id}`;
        bookmarkChapter.classList.add('bookmark-chapter');
        bookmarkChapter.textContent = String(bookmark.current);
        return bookmarkChapter;
    }
    private createBookmarkLatestChapterLabel(entry: Hermidata): HTMLLabelElement {
        const bookmarkChapterLabel = document.createElement('label');
        bookmarkChapterLabel.textContent = 'Latest Chapter';
        bookmarkChapterLabel.setAttribute('for', `bookmark-latest-chapter-${entry.id}`);
        return bookmarkChapterLabel;
    }
    private createBookmarkLatestChapter(entry: Hermidata): HTMLInputElement {
        const bookmarkChapter = document.createElement('input');
        bookmarkChapter.value = String(entry.chapter.latest);
        bookmarkChapter.type = 'number';
        bookmarkChapter.id = `bookmark-latest-chapter-${entry.id}`;
        bookmarkChapter.classList.add('bookmark-Latest-chapter');
        bookmarkChapter.textContent = String(entry.chapter.latest);
        return bookmarkChapter;
    }
    private createBookmarkChapterHistoryLabel(bookmark: Bookmark): HTMLLabelElement {
        const bookmarkChapterLabel = document.createElement('label');
        bookmarkChapterLabel.textContent = 'History';
        bookmarkChapterLabel.setAttribute('for', `bookmark-history-${bookmark.id}`);
        return bookmarkChapterLabel;
    }
    private createBookmarkChapterHistory(bookmark: Bookmark): HTMLDivElement {
        const bookmarkChapterContainer = document.createElement('div');
        for (const chapter of bookmark.history) {
            const bookmarkChapter = document.createElement('input');
            bookmarkChapter.value = String(chapter);
            bookmarkChapter.type = 'text';
            bookmarkChapter.classList.add('bookmark-history-chapter');
            bookmarkChapter.textContent = String(chapter);
            bookmarkChapterContainer.appendChild(bookmarkChapter);
        }
        bookmarkChapterContainer.id = `bookmark-history-${bookmark.id}`;
        bookmarkChapterContainer.classList.add('bookmark-history');

        return bookmarkChapterContainer;
    }

    private createBookmarkReadStatusLabel(bookmark: Bookmark): HTMLLabelElement {
        const bookmarkChapterLabel = document.createElement('label');
        bookmarkChapterLabel.textContent = 'Read Status';
        bookmarkChapterLabel.setAttribute('for', `bookmark-readStatus-${bookmark.id}`);
        return bookmarkChapterLabel;
    }
    private createBookmarkReadStatus(bookmark: Bookmark): HTMLSelectElement {
        const bookmarkChapter = document.createElement('select');
        bookmarkChapter.value = bookmark.readStatus;

        
        bookmarkChapter.id = `bookmark-readStatus-${bookmark.id}`;
        bookmarkChapter.classList.add('bookmark-readStatus');
        
        for (const option of this.settings!.ContentTypesAndStatuses.STATUS_OPTIONS) {
            const optionEl = document.createElement('option');
            optionEl.value = option;
            optionEl.textContent = option;
            bookmarkChapter.appendChild(optionEl);
        }
        const selected = bookmarkChapter.options.namedItem(bookmark.readStatus);
        if (selected) bookmarkChapter.selectedIndex = selected.index;

        return bookmarkChapter;
    }
    private createBookmarkColourLabel(bookmark: Bookmark): HTMLLabelElement {
        const bookmarkChapterLabel = document.createElement('label');
        bookmarkChapterLabel.textContent = 'Colour';
        bookmarkChapterLabel.setAttribute('for', `bookmark-colour-${bookmark.id}`);
        return bookmarkChapterLabel;
    }
    private createBookmarkColour(bookmark: Bookmark): HTMLInputElement {
        const bookmarkChapter = document.createElement('input');
        bookmarkChapter.value = bookmark.color;
        bookmarkChapter.type = 'color';
        bookmarkChapter.id = `bookmark-colour-${bookmark.id}`;
        bookmarkChapter.classList.add('bookmark-colour');
        return bookmarkChapter;
    }

    private createBookmarkNoteLabel(bookmark: Bookmark): HTMLLabelElement {
        const bookmarkChapterLabel = document.createElement('label');
        bookmarkChapterLabel.textContent = 'Note';
        bookmarkChapterLabel.setAttribute('for', `bookmark-note-${bookmark.id}`);
        return bookmarkChapterLabel;
    }
    private createBookmarkNote(bookmark: Bookmark): HTMLInputElement {
        const bookmarkChapter = document.createElement('input');
        bookmarkChapter.value = bookmark.note ?? '';
        bookmarkChapter.type = 'text';
        bookmarkChapter.id = `bookmark-note-${bookmark.id}`;
        bookmarkChapter.classList.add('bookmark-note');
        return bookmarkChapter;
    }







    private populateDetails(settings: Settings | null): void {

        if (!this.editEntry || !settings) return;

        this.title!.value = this.editEntry.title;
        this.novelType!.value = this.editEntry.novelType;
        this.novelStatus!.value = this.editEntry.meta.novelStatus;
        this.url!.value = this.editEntry.url;
        this.notes!.value = this.editEntry.meta.notes;

        this.popuplateSelects(settings);


        this.buildMultipleCases('tag', this.tagsContainer, this.editEntry.meta.tags);
        this.buildMultipleCases('title', this.altTitlesContainer, this.editEntry.meta.altTitles);
        this.buildMultipleCases('source', this.altSourcesContainer, this.editEntry.meta.altSources);
    }

    private buildMultipleCases(name: string, container: HTMLDivElement | null, options: string[]) {
        for ( const option of options) {
            const optionEl = document.createElement('div');
            optionEl.classList.add('detail-option', name);
            optionEl.textContent = option;
            container!.appendChild(optionEl);
        }
    }


    private popuplateSelects(settings: Settings) {
        try {
            
            const { TYPE_OPTIONS: novelTypes, STATUS_OPTIONS: readStatuses, NOVEL_STATUS_OPTIONS: novelStatuses } = settings.ContentTypesAndStatuses;

            this.populateSelect(this.novelType, novelTypes, 'select-novelType');
            this.populateSelect(this.novelStatus, novelStatuses, 'select-novelStatus');
        } catch (error) {
            console.error(error);
        }
    }
    private populateSelect(selectEl: HTMLSelectElement | null, options: string[], customClass: string): HTMLSelectElement {
        if (!selectEl) throw new Error("Element not found");
        selectEl.innerHTML = "";
        options.forEach(value => {
            const opt = document.createElement("option");
            opt.classList.add("select-option", customClass);
            opt.value = value;
            opt.textContent = value;
            selectEl.appendChild(opt);
        });
        return selectEl;
    }
}