import type { PastHermidata } from "../../popup/core/Past";
import { makeDefaultHermidata } from "../constants";
import { getSettings, isHermidataV10, isHermidataV4OrOlder, isHermidataV5, isHermidataV6, isHermidataV7, isHermidataV8, isHermidataV9 } from "../db/db";
import type { AnyNovelType, Bookmark, CurrentTab, Feed, Hermidata, InputArraySheetType, InputArrayType } from "../types";
import { TrimTitle } from "./StringOutput";

export class HermidataModel implements Hermidata {
    // ...all Hermidata fields, assigned via constructor as before...
    id: string;
    title: string;
    novelType: AnyNovelType;
    source: string;
    rss: Feed | null;
    import: string | null;
    chapter: Hermidata["chapter"];
    meta: Hermidata["meta"];

    private version: number;

    constructor(data: Hermidata) {
        this.id = data.id;
        this.title = data.title;
        this.novelType = data.novelType;
        this.source = data.source;
        this.rss = data.rss;
        this.import = data.import;
        this.chapter = data.chapter;
        this.meta = data.meta;

        this.version = this.CalculateHermidataVersion();
    }
    // -- static methods --
    public static from(novelType: AnyNovelType, readStatus: string, novelStatus: string): HermidataModel {
        return new HermidataModel(makeDefaultHermidata(novelType, readStatus, novelStatus));
    }

    public static async fromNothing(novelType: AnyNovelType | null, readStatus: string | null, novelStatus: string | null): Promise<HermidataModel | null> {
        const settings = await getSettings();
        
        if (!settings && (novelType && readStatus && novelStatus)) return new HermidataModel(makeDefaultHermidata(novelType, readStatus, novelStatus));
        if (!settings) return null;

        const {  TYPE_OPTIONS: defaultNovelType, NOVEL_STATUS_OPTIONS: defaultNovelStatus, STATUS_OPTIONS: defaultReadStatus }  = settings.ContentTypesAndStatuses;


        return new HermidataModel(makeDefaultHermidata(novelType ?? defaultNovelType[0], readStatus ?? defaultReadStatus[0], novelStatus ?? defaultNovelStatus[0]));
    }
    // -- private methods --
    private Replace(hermidata: Hermidata) {
        this.id = hermidata.id;
        this.title = hermidata.title;
        this.novelType = hermidata.novelType;
        this.source = hermidata.source;
        this.rss = hermidata.rss;
        this.import = hermidata.import;
        this.chapter = hermidata.chapter;
        this.meta = hermidata.meta;
    }
    private CalculateHermidataVersion(): number {
        const Hermidata = this.toJSON();

        if (isHermidataV4OrOlder(Hermidata)) return 4;
        if (isHermidataV5(Hermidata)) return 5;
        if (isHermidataV6(Hermidata)) return 6;
        if (isHermidataV7(Hermidata)) return 7;
        if (isHermidataV8(Hermidata)) return 8;
        if (isHermidataV9(Hermidata)) return 9;
        if (isHermidataV10(Hermidata)) return 10;
        console.warn(`Unknown hermidata version detected.`, Hermidata);
        return 0;
    }
    // -- getters --
    getBookmark(): Bookmark;
    getBookmark(bookmarkInUseId: string): Bookmark;
    getBookmark(bookmarkInUseId?: string): Bookmark {
        if (bookmarkInUseId) return this.chapter.bookmarks[bookmarkInUseId];
        return this.chapter.bookmarks[this.chapter.bookmarkInUse];
    }
    GetUrl(): string;
    GetUrl(bookmarkInUseId: string): string;
    GetUrl(bookmarkInUseId?: string): string {
        if (bookmarkInUseId) return this.getBookmark(bookmarkInUseId)?.url;
        return this.getBookmark()?.url;
    }

    GetChapter(): number;
    GetChapter(bookmarkInUseId: string): number;
    GetChapter(bookmarkInUseId?: string): number {
        if (bookmarkInUseId) return this.getBookmark(bookmarkInUseId)?.current;
        return this.getBookmark()?.current;
    }
    GetReadStatus(): Bookmark["readStatus"];
    GetReadStatus(bookmarkInUseId: string): Bookmark["readStatus"];
    GetReadStatus(bookmarkInUseId?: string): Bookmark["readStatus"] {
        if (bookmarkInUseId) return this.getBookmark(bookmarkInUseId)?.readStatus;
        return this.getBookmark()?.readStatus;
    }
    GetScrollPosition(): number;
    GetScrollPosition(bookmarkInUseId: string): number;
    GetScrollPosition(bookmarkInUseId?: string): number {
        if (bookmarkInUseId) return this.getBookmark(bookmarkInUseId)?.scrollPosition;
        return this.getBookmark()?.scrollPosition;
    }
    GetHistory(): Bookmark["history"];
    GetHistory(bookmarkInUseId: string): Bookmark["history"];
    GetHistory(bookmarkInUseId?: string): Bookmark["history"] {
        if (bookmarkInUseId) return this.getBookmark(bookmarkInUseId)?.history;
        return this.getBookmark()?.history;
    }
    GetVersion(): number { return this.version; }
    // -- setters --
    SetUrl(url: string): void;
    SetUrl(url: string, bookmarkInUseId: string): void;
    SetUrl(url: string, bookmarkInUseId?: string): void {
        if (bookmarkInUseId) this.chapter.bookmarks[bookmarkInUseId].url = url;
        this.chapter.bookmarks[this.chapter.bookmarkInUse].url = url;
    }
    SetChapter(chapter: number): void;
    SetChapter(chapter: number, bookmarkInUseId: string): void;
    SetChapter(chapter: number, bookmarkInUseId?: string): void {
        if (bookmarkInUseId) this.chapter.bookmarks[bookmarkInUseId].current = chapter;
        this.chapter.bookmarks[this.chapter.bookmarkInUse].current = chapter;
    }
    SetReadStatus(readStatus: Bookmark["readStatus"]): void
    SetReadStatus(readStatus: Bookmark["readStatus"], bookmarkInUseId: string): void;
    SetReadStatus(readStatus: Bookmark["readStatus"], bookmarkInUseId?: string): void {
        if (bookmarkInUseId) this.chapter.bookmarks[bookmarkInUseId].readStatus = readStatus;
        this.chapter.bookmarks[this.chapter.bookmarkInUse].readStatus = readStatus;
    }
    SetHistory(history: Bookmark["history"]): void
    SetHistory(history: Bookmark["history"], bookmarkInUseId: string): void;
    SetHistory(history: Bookmark["history"], bookmarkInUseId?: string): void {
        if (bookmarkInUseId) this.chapter.bookmarks[bookmarkInUseId].history = history;
        this.chapter.bookmarks[this.chapter.bookmarkInUse].history = history;
    }
    SetScrollPosition(scrollPosition: number): void;
    SetScrollPosition(scrollPosition: number, bookmarkInUseId: string): void;
    SetScrollPosition(scrollPosition: number, bookmarkInUseId?: string): void {
        if (bookmarkInUseId) this.chapter.bookmarks[bookmarkInUseId].scrollPosition = scrollPosition;
        this.chapter.bookmarks[this.chapter.bookmarkInUse].scrollPosition = scrollPosition;
    }
    SetUpdatedAt(date?: string | Date | number): void;
    SetUpdatedAt(bookmarkInUseId: string, date?: string | Date | number): void;
    SetUpdatedAt(date: string | Date | number = new Date().toISOString(), bookmarkInUseId?: string): void {
        if (bookmarkInUseId) this.chapter.bookmarks[bookmarkInUseId].updatedAt = new Date(date).toISOString();
        this.chapter.bookmarks[this.chapter.bookmarkInUse].updatedAt = new Date(date).toISOString();
    }
    SetTagsAndForceIntoList(tags: string[] | string): void {
        const value = (Array.isArray(tags)) ? tags : tags.split(',').map(tag => tag.trim()).filter(Boolean);
        this.meta.tags = value;
    }
    // --actions --
    ShiftHistory(): void;
    ShiftHistory(bookmarkInUseId: string): void;
    ShiftHistory(bookmarkInUseId?: string): void {
        if (bookmarkInUseId) this.chapter.bookmarks[bookmarkInUseId].history?.shift();
        this.chapter.bookmarks[this.chapter.bookmarkInUse].history?.shift();
    }
    PushHistory(chapter: number): void;
    PushHistory(chapter: number, bookmarkInUseId: string): void;
    PushHistory(chapter: number, bookmarkInUseId?: string): void {
        if (bookmarkInUseId) this.chapter.bookmarks[bookmarkInUseId].history?.push(chapter);
        this.chapter.bookmarks[this.chapter.bookmarkInUse].history?.push(chapter);
    }
    PushUniqueHistory(chapter: number): void;
    PushUniqueHistory(chapter: number, bookmarkInUseId: string): void;
    PushUniqueHistory(newChapter: number, bookmarkInUseId?: string): void {
        if (bookmarkInUseId) {
            if (!this.GetHistory(bookmarkInUseId).some(chapter => chapter === newChapter)) this.PushHistory(newChapter, bookmarkInUseId)
        }
        else {
            if (!this.GetHistory().some(chapter => chapter === newChapter)) this.PushHistory(newChapter)
        }
    }
    /**
     * - updates:
     *   - id
     *   - chapter
     *   - last updated bookmark
     *   - push to history
     *   - scroll position
     *   - url
     *   - read status
     *   - bookmark in use
     *   - last checked bookmark
     *   - novel type
     *   - novel status
     *   - tags ( force into list )
     *   - last updated Hermidata
     *  - if latest chapter is less than the new chapter, set it as latest
     */
    Update(key: string, hermidata: HermidataModel, newChapterNumber: number): void {
        this.id = key;

        this.SetChapter(newChapterNumber, hermidata.chapter.bookmarkInUse);
        this.SetUpdatedAt(new Date().toISOString(), hermidata.chapter.bookmarkInUse);
        this.PushUniqueHistory(newChapterNumber, hermidata.chapter.bookmarkInUse);
        this.SetScrollPosition(hermidata.GetScrollPosition(), hermidata.chapter.bookmarkInUse);
        
        this.SetUrl(hermidata.GetUrl(), hermidata.chapter.bookmarkInUse);

        this.SetReadStatus(hermidata.GetReadStatus(), hermidata.chapter.bookmarkInUse);
        
        this.chapter.bookmarkInUse = hermidata.chapter.bookmarkInUse;
        this.chapter.lastChecked = new Date().toISOString();
        
        this.novelType = hermidata.novelType;
        this.meta.novelStatus = hermidata.meta.novelStatus;

        this.SetTagsAndForceIntoList(hermidata.meta.tags);
        
        this.meta.updated = new Date().toISOString();

        if (hermidata.chapter.latest > this.chapter.latest) this.chapter.latest = hermidata.chapter.latest;
    }
    // -- helpers --
    SetFromTab(currentTab: CurrentTab): void;
    SetFromTab(currentTab: CurrentTab, bookmarkInUseId: string): void;
    SetFromTab(currentTab: CurrentTab, bookmarkInUseId?: string): void {
        const trimmedTitle = TrimTitle.trimTitle(currentTab.pageTitle, currentTab.url);

        this.title = trimmedTitle.title;
        this.meta.notes = trimmedTitle.note ?? '';

        this.chapter.bookmarks[bookmarkInUseId ? bookmarkInUseId : this.chapter.bookmarkInUse].url = currentTab.url;
        this.chapter.bookmarks[bookmarkInUseId ? bookmarkInUseId : this.chapter.bookmarkInUse].current = currentTab.currentChapter;
    }
    async SetPast(past: PastHermidata): Promise<void>;
    async SetPast(past: PastHermidata, bookmarkInUseId: string): Promise<void>;
    async SetPast(past: PastHermidata, bookmarkInUseId?: string): Promise<void> {
        const pastHermidata = await past.init();
        
        // early return if no past
        if (!pastHermidata) return;
        const hermidataCopy = this.Copy();

        // replace hermidata
        this.Replace(pastHermidata);

        // add changes with the past as a template
        if (bookmarkInUseId) {
            this.SetUrl(hermidataCopy.GetUrl(bookmarkInUseId), bookmarkInUseId);
            this.SetChapter(hermidataCopy.GetChapter(bookmarkInUseId), bookmarkInUseId);
            this.source = hermidataCopy.source;
            this.chapter.latest = this.GetChapter(bookmarkInUseId) > this.chapter.latest ? this.GetChapter(bookmarkInUseId) : this.chapter.latest;
        } else {
            this.SetUrl(hermidataCopy.GetUrl());
            this.SetChapter(hermidataCopy.GetChapter());
            this.source = hermidataCopy.source;
            this.chapter.latest = this.GetChapter() > this.chapter.latest ? this.GetChapter() : this.chapter.latest;
        }
    }
    Copy(): HermidataModel {
        return new HermidataModel(this.toJSON());
    }
    // -- serialization --
    toJSON(): Hermidata {
        const { id, title, novelType, source, chapter, rss, import: imp, meta } = this;
        return { id, title, novelType, source, chapter, rss, import: imp, meta };
    }

    private makeSureTagsISNotAnArray(dataArray: InputArrayType | InputArraySheetType): InputArraySheetType {
        const tags = (Array.isArray(dataArray[6]) ? dataArray[6].join(", ") : dataArray[6])
        return [dataArray[0], dataArray[1], dataArray[2], dataArray[3], dataArray[4], dataArray[5], tags, dataArray[7]]
    }
    toInputArrayRow(): InputArrayType;
    toInputArrayRow(bookmarkInUseId: string): InputArrayType;
    toInputArrayRow(bookmarkInUseId?: string): InputArrayType {
        if (bookmarkInUseId) {
            return [this.title, this.novelType, this.GetChapter(bookmarkInUseId), this.GetUrl(bookmarkInUseId), this.GetReadStatus(bookmarkInUseId), this.meta.updated, this.meta.tags, this.meta.notes]
        }
        return [this.title, this.novelType, this.GetChapter(), this.GetUrl(), this.GetReadStatus(), this.meta.updated, this.meta.tags, this.meta.notes]
    }
    toInputArraySheetRow(): InputArraySheetType;
    toInputArraySheetRow(bookmarkInUseId: string): InputArraySheetType;
    toInputArraySheetRow(bookmarkInUseId?: string): InputArraySheetType {
        if (bookmarkInUseId) return this.makeSureTagsISNotAnArray(this.toInputArrayRow(bookmarkInUseId));
        return this.makeSureTagsISNotAnArray(this.toInputArrayRow())
    }
}