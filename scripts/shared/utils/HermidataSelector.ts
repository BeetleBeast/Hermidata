import type { PastHermidata } from "../../popup/core/Past";
import { makeDefaultHermidata } from "../constants";
import { getSettings, isHermidataV1, isHermidataV10, isHermidataV2, isHermidataV3, isHermidataV4, isHermidataV5, isHermidataV6, isHermidataV7, isHermidataV8, isHermidataV9 } from "../db/db";
import type { AnyNovelType, Bookmark, CurrentTab, Feed, Hermidata, InputArraySheetType, InputArrayType, RawFeed, StringListFieldPath, ValueAtPath } from "../types";
import { returnBookmarkHash, returnHashedFeedId, returnHashedTitle, TrimTitle } from "./StringOutput";

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
    private latestVersion = 10;

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
        if (this.version !== this.latestVersion) console.count("HermidataModel version check");
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
        Object.assign(this, new HermidataModel(hermidata));
    }
    private CalculateHermidataVersion(): number {
        const Hermidata = this.toJSON();

        if (isHermidataV10(Hermidata)) return 10;
        if (isHermidataV9(Hermidata)) return 9;
        if (isHermidataV8(Hermidata)) return 8;
        if (isHermidataV7(Hermidata)) return 7;
        if (isHermidataV6(Hermidata)) return 6;
        if (isHermidataV5(Hermidata)) return 5;
        if (isHermidataV4(Hermidata)) return 4;
        if (isHermidataV3(Hermidata)) return 3;
        if (isHermidataV2(Hermidata)) return 2;
        if (isHermidataV1(Hermidata)) return 1;
        console.warn(`Unknown hermidata version detected.`, Hermidata);
        this.ForceCreateNewHermidata();
        return 0;
    }
    // -- getters --
    getBookmark(bookmarkInUseId?: string | undefined): Bookmark {
        if (bookmarkInUseId) return this.chapter.bookmarks[bookmarkInUseId];
        return this.chapter.bookmarks[this.chapter.bookmarkInUse];
    }
    GetUrl(bookmarkInUseId?: string): string {
        return this.getBookmark(bookmarkInUseId)?.url;
    }
    GetChapter(bookmarkInUseId?: string): number {
        return this.getBookmark(bookmarkInUseId)?.current;
    }
    GetReadStatus(bookmarkInUseId?: string): Bookmark["readStatus"] {
        return this.getBookmark(bookmarkInUseId)?.readStatus;
    }
    GetScrollPosition(bookmarkInUseId?: string): number {
        return this.getBookmark(bookmarkInUseId)?.scrollPosition;
    }
    GetHistory(bookmarkInUseId?: string): Bookmark["history"] {
        return this.getBookmark(bookmarkInUseId)?.history;
    }
    GetLatestReadChapter(bookmarkInUseId?: string): number {
        const latestHistory = this.GetHistory(bookmarkInUseId)?.at(-1);

        const latestChapter = this.chapter.latest;
        const allowedTakeLatestChapter = this.rss == null;
        const currentChapter = this.GetChapter(bookmarkInUseId);
        
        const latestChapterCatch = allowedTakeLatestChapter ? latestChapter : currentChapter;

        return latestHistory ?? latestChapterCatch;
    }
    GetLatestChapter(): number { return this.chapter.latest; }
    GetSourceOfLatestChapter(): string { 
        // find the source of the latest chapter
        const list = Object.values(this.chapter.bookmarks).filter(bookmark => bookmark.current === (this.chapter.latest)).map(bookmark => bookmark.url);
        // transform list of strings into list of sources ( only the site name )
        const sourceList = list.map(url => new URL(url).hostname.replace(/^www\./, ""));

        if ((this.rss?.latestItem.chapter === this.chapter.latest ) || (this.rss && this.rss.latestItem.chapter >= this.chapter.latest)) return this.rss.domain;

        return sourceList[0];
    }
    GetVersion(): number { return this.version; }
    // -- setters --
    SetUrl(url: string): void;
    SetUrl(url: string, bookmarkInUseId: string): void;
    SetUrl(url: string, bookmarkInUseId?: string): void {
        if (bookmarkInUseId) this.chapter.bookmarks[bookmarkInUseId].url = url;
        else this.chapter.bookmarks[this.chapter.bookmarkInUse].url = url;
    }
    SetChapter(chapter: number): void;
    SetChapter(chapter: number, bookmarkInUseId: string): void;
    SetChapter(chapter: number, bookmarkInUseId?: string): void {
        if (bookmarkInUseId) this.chapter.bookmarks[bookmarkInUseId].current = chapter;
        else this.chapter.bookmarks[this.chapter.bookmarkInUse].current = chapter;
    }
    SetReadStatus(readStatus: Bookmark["readStatus"]): void
    SetReadStatus(readStatus: Bookmark["readStatus"], bookmarkInUseId: string): void;
    SetReadStatus(readStatus: Bookmark["readStatus"], bookmarkInUseId?: string): void {
        if (bookmarkInUseId) this.chapter.bookmarks[bookmarkInUseId].readStatus = readStatus;
        else this.chapter.bookmarks[this.chapter.bookmarkInUse].readStatus = readStatus;
    }
    SetHistory(history: Bookmark["history"]): void
    SetHistory(history: Bookmark["history"], bookmarkInUseId: string): void;
    SetHistory(history: Bookmark["history"], bookmarkInUseId?: string): void {
        if (bookmarkInUseId) this.chapter.bookmarks[bookmarkInUseId].history = history;
        else this.chapter.bookmarks[this.chapter.bookmarkInUse].history = history;
    }
    SetAltTitle(title: string): void {
        // remove duplicates
        let altTitles = Array.from(new Set(this.meta.altTitles));
        // remove empty strings
        altTitles = altTitles.filter((title) => title !== '');
        // add new title (only if not already in list )
        if (!altTitles.includes(title)) this.meta.altTitles.push(title);
    }
    SetMultipleAltTitles(titles: string[]): void {
        // remove duplicates from list & current altTitles
        let newAltTitles = Array.from(new Set(titles));
        let altTitles = Array.from(new Set(this.meta.altTitles));
        // remove empty strings
        altTitles = altTitles.filter((title) => title !== '');
        newAltTitles = newAltTitles.filter((title) => title !== '');
        // add new title (only if not already in list )
        for (const newTitle of newAltTitles) {
            if (!altTitles.includes(newTitle)) altTitles.push(newTitle);
        }
        this.meta.altTitles = altTitles;
    }
    SetScrollPosition(scrollPosition: number): void;
    SetScrollPosition(scrollPosition: number, bookmarkInUseId: string): void;
    SetScrollPosition(scrollPosition: number, bookmarkInUseId?: string): void {
        if (bookmarkInUseId) this.chapter.bookmarks[bookmarkInUseId].scrollPosition = scrollPosition;
        else this.chapter.bookmarks[this.chapter.bookmarkInUse].scrollPosition = scrollPosition;
    }
    SetUpdatedAt(date?: string | Date | number): void;
    SetUpdatedAt(bookmarkInUseId: string, date?: string | Date | number): void;
    SetUpdatedAt(date: string | Date | number = new Date().toISOString(), bookmarkInUseId?: string): void {
        if (bookmarkInUseId) this.chapter.bookmarks[bookmarkInUseId].updatedAt = new Date(date).toISOString();
        else this.chapter.bookmarks[this.chapter.bookmarkInUse].updatedAt = new Date(date).toISOString();
    }
    /** Normalize tags and force into list */
    normalizeTags(tags: string[] | string): void {
        const value = (Array.isArray(tags)) ? tags : tags.split(',').map(tag => tag.trim()).filter(Boolean);
        this.meta.tags = value;
    }
    // --actions --
    ShiftHistory(): void;
    ShiftHistory(bookmarkInUseId: string): void;
    ShiftHistory(bookmarkInUseId?: string): void {
        if (bookmarkInUseId) this.chapter.bookmarks[bookmarkInUseId].history?.shift();
        else this.chapter.bookmarks[this.chapter.bookmarkInUse].history?.shift();
    }
    PushHistory(chapter: number): void;
    PushHistory(chapter: number, bookmarkInUseId: string): void;
    PushHistory(chapter: number, bookmarkInUseId?: string): void {
        if (bookmarkInUseId) this.chapter.bookmarks[bookmarkInUseId].history?.push(chapter);
        else this.chapter.bookmarks[this.chapter.bookmarkInUse].history?.push(chapter);
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
    /* updates */
    /**
     * - updates the bookmark
     * - Normalize tags
     * - Updates the source
     * - Update last updated
     * - and update meta
     */
    Update(key: string, hermidata: HermidataModel, newChapterNumber: number): void {
        const sameKey = this.id === key;
        if (!sameKey) console.warn(`[Hermidata Selector] New key detected.`, key, this.id, hermidata);
        this.id = key;

        this.novelType = hermidata.novelType;
        this.meta.novelStatus = hermidata.meta.novelStatus;

        this.UpdateBookmark(hermidata, newChapterNumber);

        this.normalizeTags(hermidata.meta.tags);

        this.UpdateSource(hermidata);

        this.meta.updated = new Date().toISOString();
    }
    UpdateBookmark(hermidata: HermidataModel, newChapterNumber: number): void {

        this.SetChapter(newChapterNumber, hermidata.chapter.bookmarkInUse);
        this.PushUniqueHistory(newChapterNumber, hermidata.chapter.bookmarkInUse);
        this.SetUrl(hermidata.GetUrl(), hermidata.chapter.bookmarkInUse);
        this.SetScrollPosition(hermidata.GetScrollPosition(), hermidata.chapter.bookmarkInUse);
        this.SetReadStatus(hermidata.GetReadStatus(), hermidata.chapter.bookmarkInUse);
        this.SetUpdatedAt(new Date().toISOString(), hermidata.chapter.bookmarkInUse);

        this.chapter.bookmarkInUse = hermidata.chapter.bookmarkInUse;
        this.chapter.lastChecked = new Date().toISOString();

        // update latest if the current chapter is greater
        if ( this.GetChapter() > this.chapter.latest) this.chapter.latest = this.GetChapter();
        if (hermidata.chapter.latest > this.chapter.latest) this.chapter.latest = hermidata.chapter.latest;
    }
    UpdateSource(hermidata: HermidataModel): void {
        const isSameSource = this.source === hermidata.source;
        const sourceInAlt = this.meta.altSources.includes(hermidata.source);
        if (isSameSource && sourceInAlt) return;

        this.source = hermidata.source; // make sure the source is always latest used source
        if (!sourceInAlt) this.meta.altSources.push(hermidata.source);
    }
    // -- helpers --
    private ForceCreateNewHermidata(): void {
        console.error(`[Hermidata Selector] Missing required data.`, this);
        console.error(`[Hermidata Selector] forcing to creating new hermidata.`);
        const brokenHermidata: Partial<Hermidata> = this.toJSON();
        // minimum required
        // title, novelType, url
        // if missing
        const alternativeRequired = {
            title: brokenHermidata.title ?? brokenHermidata.rss?.latestItem.title ?? brokenHermidata.rss?.latestItem.rawTitle ?? brokenHermidata.rss?.title ?? null,
            novelType: brokenHermidata.novelType ?? null,
            url: brokenHermidata.chapter?.bookmarks?.[brokenHermidata.chapter.bookmarkInUse]?.url ?? brokenHermidata.rss?.latestItem.link ?? null,
        }
        if (!alternativeRequired.title || !alternativeRequired.novelType || !alternativeRequired.url) {
            console.error(`[Hermidata Selector] Missing required data.`, alternativeRequired, brokenHermidata);
            return;
        }
        const trimmedTitle = TrimTitle.trimTitle(alternativeRequired.title, alternativeRequired.url);
        const newId = returnHashedTitle(trimmedTitle.title, alternativeRequired.novelType, alternativeRequired.url);
        this.id = newId;
        this.novelType = alternativeRequired.novelType;
        this.title = trimmedTitle.title;
        this.meta.notes = trimmedTitle.note ?? '';

        this.SetSource(alternativeRequired.url);

        if (!brokenHermidata?.chapter?.bookmarks) {
            const newBookmark: Bookmark = {
                id: returnBookmarkHash('Primary'),
                current: 0,
                history: [],
                label: 'Primary',
                color: '#5979d6',
                readStatus: 'Viewing',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                isPrimary: true,
                url: alternativeRequired.url,
                scrollPosition: 0,
                note: '',
            }
            this.chapter.bookmarks = {
                [returnBookmarkHash('Primary')]: newBookmark
            }
        }else {
            this.chapter = {
                bookmarkInUse: brokenHermidata?.chapter?.bookmarkInUse ?? 'Primary',
                lastChecked: brokenHermidata?.chapter?.lastChecked ?? new Date().toISOString(),
                revisitingCount: brokenHermidata?.chapter?.revisitingCount ?? 0,
                latest: brokenHermidata?.chapter?.latest ?? 0,
                bookmarks: {}
            }
            const bookmarks: Bookmark[] = [];
            const hasPrimary = false;
            for (const markerBookmark of Object.values(brokenHermidata?.chapter?.bookmarks)) {
                const marker: Partial<Bookmark> = markerBookmark;
                if (hasPrimary && marker.label == undefined) continue;
                const newBookmark: Bookmark = {
                    id: returnBookmarkHash(marker?.label ?? 'Primary'),
                    current: marker.current ?? 0,
                    history: marker.history ?? [],
                    label: marker.label ?? 'Primary',
                    color: marker.color ?? '#5979d6',
                    createdAt: marker.createdAt ?? new Date().toISOString(),
                    updatedAt: marker.updatedAt ?? new Date().toISOString(),
                    note: marker.note ?? '',
                    isPrimary: marker.isPrimary ?? true,
                    readStatus: marker.readStatus ?? 'Viewing',
                    scrollPosition: marker.scrollPosition ?? 0,
                    url: marker.url ?? alternativeRequired.url ?? '',
                }
                bookmarks.push(newBookmark);
            }
            this.chapter.bookmarks = Object.fromEntries(bookmarks.map(b => [b.id, b]));
        }


        this.rss = brokenHermidata?.rss ?? null;
        this.meta = {
            added: brokenHermidata?.meta?.added ?? new Date().toISOString(),
            updated: brokenHermidata?.meta?.updated ?? new Date().toISOString(),
            tags: brokenHermidata?.meta?.tags ?? [],
            notes: brokenHermidata?.meta?.notes ?? '',
            altSources: brokenHermidata?.meta?.altSources ?? [this.source],
            altTitles: brokenHermidata?.meta?.altTitles ?? [alternativeRequired.title],
            originalRelease: brokenHermidata?.meta?.originalRelease ?? null,
            novelStatus: brokenHermidata?.meta?.novelStatus ?? 'Ongoing',
        };

        this.version = this.CalculateHermidataVersion();
    }
    SetSource(url: string): void {
        this.source = new URL(url).hostname.replace(/^www\./, "");
    }
    SetFromTab(currentTab: CurrentTab): void;
    SetFromTab(currentTab: CurrentTab, bookmarkInUseId: string): void;
    SetFromTab(currentTab: CurrentTab, bookmarkInUseId?: string): void {
        const trimmedTitle = TrimTitle.trimTitle(currentTab.pageTitle, currentTab.url);

        this.title = trimmedTitle.title;
        this.meta.notes = trimmedTitle.note ?? '';

        this.chapter.bookmarks[bookmarkInUseId ? bookmarkInUseId : this.chapter.bookmarkInUse].url = currentTab.url;
        this.chapter.bookmarks[bookmarkInUseId ? bookmarkInUseId : this.chapter.bookmarkInUse].current = currentTab.currentChapter;
    }
    SetDefaultContextMenuValues(date: string, tags: string[], notes: string ): void {
        this.meta.updated = date;
        this.meta.tags = tags;
        this.meta.notes = notes;
    }
    async SetPast(past: PastHermidata): Promise<boolean>;
    async SetPast(past: PastHermidata, bookmarkInUseId: string): Promise<boolean>;
    async SetPast(past: PastHermidata, bookmarkInUseId?: string): Promise<boolean> {
        const pastHermidata = await past.init();
        
        // early return if no past
        if (!pastHermidata) return false;
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
        return true;
    }
    /** Update With Outdated Sync Data */
    UpdateOutdatedSync(hermidata: HermidataModel): void {
        // potential new bookmarks
        // potential new alt sources/titles
        // potential new tags
        // update history

        const bookmarksCount = Object.keys(hermidata.chapter.bookmarks).length;
        const currentBookmarksCount = Object.keys(this.chapter.bookmarks).length;

        if (bookmarksCount > currentBookmarksCount) {
            // add new bookmark only
            const newBookmarks = Object.values(hermidata.chapter.bookmarks).filter(bookmark => !this.chapter.bookmarks[bookmark.id]);
            for (const bookmark of newBookmarks) this.AddBookmark(bookmark);
        }

        this.AddItemToList(hermidata, ["meta", "altTitles"]);
        this.AddItemToList(hermidata, ["meta", "altSources"]);
        this.AddItemToList(hermidata, ["meta", "tags"]);

        if (hermidata.GetLatestReadChapter() > this.GetLatestReadChapter() ) {
            this.chapter.bookmarks[this.chapter.bookmarkInUse].history.push(hermidata.GetLatestReadChapter());
        }
    }
    public AddItemToList<TPath extends StringListFieldPath<Hermidata>>( hermidata: Hermidata, path: readonly [...TPath] ): void {
        const outdatedList = this.readByPath(hermidata, path);
        const currentList = this.readByPath(this, path);

        if (outdatedList.length > currentList.length) {
            const newItems = outdatedList.filter((item) => !currentList.includes(item));
            const mergedList = [...currentList, ...newItems] as ValueAtPath<HermidataModel, TPath>;
            this.writeByPath(this, path, mergedList);
        }
    }
    private writeByPath<TRoot, TPath extends readonly PropertyKey[]>( root: TRoot, path: readonly [...TPath], value: ValueAtPath<TRoot, TPath> ): void {
        const parentPath = path.slice(0, -1);
        const lastKey = path[path.length - 1];
        const parent = this.readByPath(root, parentPath as any) as any;
        parent[lastKey] = value;
    }
    private readByPath<TRoot, TPath extends readonly PropertyKey[]>( root: TRoot, path: readonly [...TPath] ): ValueAtPath<TRoot, TPath> {
        return path.reduce((current: any, key) => current[key], root);
    }
    AddBookmark(bookmark: Bookmark): void {
        this.chapter.bookmarks[bookmark.id] = bookmark;
    }
    UpdateFeed(rawFeed: RawFeed): void {
        // always update it with latest info NOT latest fetched item
        if (!this.rss) return;

        const latestFetchedIsNewer = new Date(rawFeed.latestItem.pubDate).getTime() > new Date(this.rss.latestItem.pubDate).getTime();
    
        const isNew = (rawFeed.latestItem?.link !== this.rss.latestItem?.link) && latestFetchedIsNewer;
    
        const latestChapter = latestFetchedIsNewer ? rawFeed.latestItem.chapter : this.rss.latestItem.chapter;
    
        if (isNew) console.log(`
            New Release\n
            title: ${rawFeed.latestItem.title}\n
            New Chapter: ${rawFeed.latestItem.chapter}\n
            Old Chapter: ${this.rss.latestItem.chapter}\n
            new Date: ${new Date(rawFeed.latestItem.pubDate)}\n
            old Date: ${new Date(this.rss.latestItem.pubDate)}\n
        `);
        
        
        // only update feed if we have a newer chapter, otherwise we might overwrite with stale data
        this.rss = {
            id: returnHashedFeedId(this.title, this.rss.url),
            title: latestFetchedIsNewer ? rawFeed.latestItem.title : this.rss.title,
            url: latestFetchedIsNewer ? rawFeed.url : this.rss.url, // rss url
            image: latestFetchedIsNewer ? rawFeed.image : this.rss.image,
            domain: latestFetchedIsNewer ? rawFeed.domain : this.rss.domain,
            lastFetched: new Date().toISOString(),
            latestItem: latestFetchedIsNewer ? rawFeed.latestItem : this.rss.latestItem,
            lastBuildDate: this.rss?.lastBuildDate,
            Notified: true
        };
        this.chapter.latest = latestChapter;
    }
    Copy(): HermidataModel {
        return new HermidataModel(this.toJSON());
    }
    // -- serialization --
    toJSON(): Hermidata {
        const { id, title, novelType, source, chapter, rss, import: imp, meta } = this;
        return { id, title, novelType, source, chapter, rss, import: imp, meta };
    }

    private normalizeTagsForSheet(dataArray: InputArrayType | InputArraySheetType): InputArraySheetType {
        const tags = (Array.isArray(dataArray[6]) ? dataArray[6].join(", ") : dataArray[6])
        return [dataArray[0], dataArray[1], dataArray[2], dataArray[3], dataArray[4], dataArray[5], tags, dataArray[7]]
    }
    private toInputArrayRow(): InputArrayType;
    private toInputArrayRow(bookmarkInUseId: string): InputArrayType;
    private toInputArrayRow(bookmarkInUseId?: string): InputArrayType {
        if (bookmarkInUseId) {
            return [this.title, this.novelType, this.GetChapter(bookmarkInUseId), this.GetUrl(bookmarkInUseId), this.GetReadStatus(bookmarkInUseId), this.meta.updated, this.meta.tags, this.meta.notes]
        }
        return [this.title, this.novelType, this.GetChapter(), this.GetUrl(), this.GetReadStatus(), this.meta.updated, this.meta.tags, this.meta.notes]
    }
    toInputArraySheetRow(): InputArraySheetType;
    toInputArraySheetRow(bookmarkInUseId: string): InputArraySheetType;
    toInputArraySheetRow(bookmarkInUseId?: string): InputArraySheetType {
        if (bookmarkInUseId) return this.normalizeTagsForSheet(this.toInputArrayRow(bookmarkInUseId));
        return this.normalizeTagsForSheet(this.toInputArrayRow())
    }
    // -- boolean helpers --
    public hasRSS(): boolean {
        return this.rss !== null;
    }
    public IsLatestVersion(): boolean {
        return this.GetVersion() === this.latestVersion;
    }
}