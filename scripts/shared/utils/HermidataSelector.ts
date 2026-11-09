import { logConsoleError } from "./ErrorMessage";
import type { PastHermidata } from "../../popup/core/Past";
import { makeDefaultHermidata, HERMIDATA_VERSION } from "../constants";
import { isHermidataV1, isHermidataV10, isHermidataV12, isHermidataV2, isHermidataV3, isHermidataV4, isHermidataV5, isHermidataV6, isHermidataV7, isHermidataV8, isHermidataV9 } from "../db/db";
import { getImage, removeImage, saveImage, getSettings } from "../db/Storage";
import { type AnyNovelType, type Bookmark, type CurrentTab, type Feed, type Hermidata, type HermidataImageSource, type InputArraySheetType, type InputArrayType, type RawFeed, type StringListFieldPath, type ValueAtPath, type ReleaseSchedule } from "../types";
import { AutoSetAllHermidata } from "./AutoSetAllHermidata";
import { openLink, generateBookmarkId, generateRssFeedId, generateHermidataHash, TrimTitle } from "./StringOutput";

export class HermidataModel implements Hermidata {
    // ...all Hermidata fields, assigned via constructor as before...
    id: string;
    title: string;
    novelType: AnyNovelType;
    source: string;
    rss: Feed[];
    import: string | null;
    titleTrimming: Hermidata["titleTrimming"];
    chapter: Hermidata["chapter"];
    meta: Hermidata["meta"];
    version: number;

    private latestVersion = HERMIDATA_VERSION;
    private readonly locale: string = navigator.language; // e.g. "fr-FR", "en-US", "ja-JP"

    constructor(data: Hermidata) {
        this.id = data.id;
        this.title = data.title;
        this.novelType = data.novelType;
        this.source = data.source;
        this.rss = data.rss;
        this.import = data.import;
        this.chapter = data.chapter;
        this.meta = data.meta;
        this.titleTrimming = data.titleTrimming;

        this.version = data.version ?? this.CalculateHermidataVersion();
        // if (this.version !== this.latestVersion) console.count("HermidataModel version check");
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
    public static GetLatestRssFeed(feeds: Feed[], dateField: "pubDate" | "lastFetched" = "pubDate"): Feed | undefined {
        return feeds.reduce<Feed | undefined>((latest, feed) => {
            if (!latest) return feed;
            const feedDate = Date.parse(dateField === "pubDate" ? String(feed.latestItem.pubDate) : feed.lastFetched ?? "") || 0;
            const latestDate = Date.parse(dateField === "pubDate" ? String(latest.latestItem.pubDate) : latest.lastFetched ?? "") || 0;
            return feedDate > latestDate ? feed : latest;
        }, undefined);
    }
    // -- private methods --
    private Replace(hermidata: Hermidata) {
        Object.assign(this, new HermidataModel(hermidata));
    }
    private CalculateHermidataVersion(): number {
        const Hermidata = this.toJSON();

        if (isHermidataV12(Hermidata)) return 12;
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
    async getDisplayImageUrl(): Promise<string> {
        // Retrieve the image from the indexedDB or from a URL and create an object URL
        const blobId = this.meta.image.kind === "stored" ? this.meta.image.id : this.id;
        const blob = await getImage(blobId);
        if (blob) return URL.createObjectURL(blob);

        // If the image is not stored, return the URL directly
        const imagePath = this.GetImagePath();
        if (imagePath) return imagePath;

        // If there is no image, return the default image
        else return this.GetImageDefaultPath();
    }
    GetImagePath(): string | null {
        if (this.meta.image.kind === "stored") return null;
        return this.meta.image.url ?? this.GetLatestRssFeed()?.image ?? this.GetImageDefaultPath();
    }
    GetImageDefaultPath(): string {
        return '../../../assets/icon/icon48.png';
    }
    GetLatestReadChapter(bookmarkInUseId?: string): number {
        // ignore placeholder entries (e.g. the chapter 0 seeded at bookmark creation)
        const latestHistory = this.GetHistory(bookmarkInUseId).filter(history => history.chapter > 0)?.at(-1);

        const latestChapter = this.chapter.latest;
        const allowedTakeLatestChapter = this.rss.length === 0;
        const currentChapter = this.GetChapter(bookmarkInUseId);
        
        const latestChapterCatch = allowedTakeLatestChapter ? latestChapter : currentChapter;

        return latestHistory?.chapter ?? latestChapterCatch;
    }
    GetLatestRssFeed(): Feed | undefined {
        return HermidataModel.GetLatestRssFeed(this.rss);
    }
    GetLatestChapter(): number { return this.chapter.latest; }
    GetAltSources(): string[] {
        return this.meta.altSources;
    }
    GetSourceOfLatestChapter(): string { 
        // find the source of the latest chapter
        const list = Object.values(this.chapter.bookmarks).filter(bookmark => bookmark.current === (this.chapter.latest)).map(bookmark => bookmark.url);
        // transform list of strings into list of sources ( only the site name )
        const sourceList = list.map(url => new URL(url).hostname.replace(/^www\./, ""));


        const latestRss = HermidataModel.GetLatestRssFeed(this.rss.filter(feed => feed.latestItem.chapter >= this.chapter.latest));
        if ((latestRss?.latestItem.chapter === this.chapter.latest ) || (latestRss && latestRss.latestItem.chapter >= this.chapter.latest)) return latestRss.domain;

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
    /** Store an uploaded image in IndexedDB and reference it by ID. */
    async SetImage(imageFile: Blob | File): Promise<void>;
    /** Fetch and cache a URL image, optionally using the already-fetched image data. */
    async SetImage(imageUrl: string, cachedImage?: Blob): Promise<void>;
    async SetImage(image: string | Blob | File, cachedImage?: Blob): Promise<void> {
        let imageBlob: Blob;
        let imageSource: HermidataImageSource;
        const previousImage = this.meta.image;
        const previousImageId = previousImage.kind === "stored" ? previousImage.id : undefined;

        // If the image is a URL, fetch it and store it in IndexedDB.
        if (typeof image === 'string') {

            imageSource = { kind: "url", url: image };
            if (cachedImage) imageBlob = cachedImage;
            else {
                const response = await fetch(image);
                if (!response.ok) throw new Error(`Could not fetch image (${response.status} ${response.statusText})`);

                imageBlob = await response.blob();
            }
        }
        // If the image is a Blob or File, store it in IndexedDB.
        else {
            imageBlob = image;
            imageSource = { kind: "stored", id: this.id };
        }

        const imageSaved = await saveImage(this.id, imageBlob);
        if (!imageSaved) throw new Error(`Could not save image ${this.id}`);

        // If there was a previous image, remove it from IndexedDB.
        if (previousImageId && previousImageId !== this.id) {
            const imageRemoved = await removeImage(previousImageId);
            if (!imageRemoved) throw new Error(`Could not remove stored image ${previousImageId}`);
        }
        this.meta.image = imageSource;
    }
    /** update image with rss feed or given image source */
    UpdateImage(imageURL?: string): void {
        const newImage = imageURL ?? this.GetLatestRssFeed()?.image ?? undefined;
        if (newImage) this.meta.image = { kind: "url", url: newImage };
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
    SetTags(newTags: string[]): void { 
        // 1. concat tags and new tags
        const concatTags = this.meta.tags.concat(newTags);
        // 2. remove duplicates
        const tags = Array.from(new Set(concatTags));
        // 3. remove empty strings
        const filterTags = tags.filter((tag) => tag !== '');
        // 4. add new tags
        this.meta.tags = filterTags;
    }
    SetAltSources(source: string): void;
    SetAltSources(sources: string[]): void;
    SetAltSources(sources: string | string[]): void {
        const splitStrings = (string: string) => string.split(', ');
        const sourcesSplit = Array.isArray(sources) ? sources : splitStrings(sources);
        if (sourcesSplit.length === 1) {
            this.meta.altSources.push(sourcesSplit[0]);
        } else { 
            this.meta.altSources = this.meta.altSources.concat(sourcesSplit);
        }

        // sort
        this.meta.altSources.sort((a, b) => a.localeCompare(b));
        // set first of list the same as source
        this.meta.altSources.unshift(this.source);
        // remove duplicates
        this.meta.altSources = [...new Set(this.meta.altSources)];
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
    // -- remove --
    removeAltSources(sources: string[]): void;
    removeAltSources(source: string): void;
    removeAltSources(source: string | string[]): void {
        const sourcesToRemove = Array.isArray(source) ? source : [source];
        const sourcesToRemoveSet = Array.from(new Set(sourcesToRemove));

        this.meta.altSources = this.meta.altSources.filter(src => !sourcesToRemoveSet.includes(src));
    }
    removeAltTitles(titles: string[]): void;
    removeAltTitles(title: string): void;
    removeAltTitles(title: string | string[]): void {
        const titlesToRemove = Array.isArray(title) ? title : [title];
        const titlesToRemoveSet = Array.from(new Set(titlesToRemove));
        
        this.meta.altTitles = this.meta.altTitles.filter(title => !titlesToRemoveSet.includes(title));
    }
    // --actions --
    ShiftHistory(): void;
    ShiftHistory(bookmarkInUseId: string): void;
    ShiftHistory(bookmarkInUseId?: string): void {
        if (bookmarkInUseId) this.chapter.bookmarks[bookmarkInUseId].history?.shift();
        else this.chapter.bookmarks[this.chapter.bookmarkInUse].history?.shift();
    }
    PushHistory(chapter: number, timeStamp: string): void;
    PushHistory(chapter: number, timeStamp: string, bookmarkInUseId: string): void;
    PushHistory(chapter: number, timeStamp: string, bookmarkInUseId?: string): void {
        if (bookmarkInUseId) this.chapter.bookmarks[bookmarkInUseId].history?.push({ chapter, at: timeStamp });
        else this.chapter.bookmarks[this.chapter.bookmarkInUse].history?.push({ chapter, at: timeStamp });
    }
    PushUniqueHistory(chapter: number, timeStamp: string): void;
    PushUniqueHistory(chapter: number, timeStamp: string, bookmarkInUseId: string): void;
    PushUniqueHistory(newChapter: number, timeStamp: string, bookmarkInUseId?: string): void {
        if (bookmarkInUseId) {
            if (!this.GetHistory(bookmarkInUseId).some(history => history.chapter === newChapter)) this.PushHistory(newChapter, timeStamp, bookmarkInUseId)
        }
        else {
            if (!this.GetHistory().some(history => history.chapter === newChapter)) this.PushHistory(newChapter, timeStamp);
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
        this.PushUniqueHistory(newChapterNumber, new Date().toISOString(), hermidata.chapter.bookmarkInUse);
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
        logConsoleError(`[Hermidata Selector] Missing required data.`, this);
        logConsoleError(`[Hermidata Selector] forcing to creating new hermidata.`);
        const brokenHermidata: Partial<Hermidata> = this.toJSON();
        // minimum required
        // title, novelType, url
        // if missing
        const alternativeRequired = {
            title: brokenHermidata.title ?? brokenHermidata.rss?.[0]?.latestItem.title ?? brokenHermidata.rss?.[0]?.latestItem.rawTitle ?? brokenHermidata.rss?.[0]?.title ?? null,
            novelType: brokenHermidata.novelType ?? null,
            url: brokenHermidata.chapter?.bookmarks?.[brokenHermidata.chapter.bookmarkInUse]?.url ?? brokenHermidata.rss?.[0]?.latestItem.link ?? null,
        }
        if (!alternativeRequired.title || !alternativeRequired.novelType || !alternativeRequired.url) {
            logConsoleError(`[Hermidata Selector] Missing required data.`, alternativeRequired, brokenHermidata);
            return;
        }
        const trimmedTitle = TrimTitle.trimTitle(alternativeRequired.title, alternativeRequired.url);
        const newId = generateHermidataHash(trimmedTitle.title, alternativeRequired.novelType, alternativeRequired.url);
        this.id = newId;
        this.novelType = alternativeRequired.novelType;
        this.title = trimmedTitle.title;
        this.meta.notes = trimmedTitle.note ?? '';

        this.SetSource(alternativeRequired.url);

        if (!brokenHermidata?.chapter?.bookmarks) {
            const newBookmark: Bookmark = {
                id: generateBookmarkId('Primary'),
                version: 6,
                current: 0,
                history: [],
                label: 'Primary',
                color: '#5979d6',
                readStatus: 'Viewing',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                lastUsedAt: new Date().toISOString(),
                isPrimary: true,
                url: alternativeRequired.url,
                scrollPosition: 0,
                note: '',
            }
            this.chapter.bookmarks = {
                [generateBookmarkId('Primary')]: newBookmark
            }
        }else {
            this.chapter = {
                bookmarkInUse: brokenHermidata?.chapter?.bookmarkInUse ?? 'Primary',
                lastChecked: brokenHermidata?.chapter?.lastChecked ?? new Date().toISOString(),
                revisitingCount: brokenHermidata?.chapter?.revisitingCount ?? 0,
                latest: brokenHermidata?.chapter?.latest ?? 0,
                bookmarks: {},
                releaseSchedule: brokenHermidata?.chapter?.releaseSchedule ?? 
                    AutoSetAllHermidata.releaseSchedule(brokenHermidata?.chapter?.bookmarks[brokenHermidata?.chapter?.bookmarkInUse].history) ?? 'Unknown',
            }
            const bookmarks: Bookmark[] = [];
            const hasPrimary = false;
            for (const markerBookmark of Object.values(brokenHermidata?.chapter?.bookmarks)) {
                const marker: Partial<Bookmark> = markerBookmark;
                if (hasPrimary && marker.label == undefined) continue;
                const newBookmark: Bookmark = {
                    version: 6,
                    id: generateBookmarkId(marker?.label ?? 'Primary'),
                    current: marker.current ?? 0,
                    history: marker.history ?? [],
                    label: marker.label ?? 'Primary',
                    color: marker.color ?? '#5979d6',
                    createdAt: marker.createdAt ?? new Date().toISOString(),
                    updatedAt: marker.updatedAt ?? new Date().toISOString(),
                    lastUsedAt: marker.lastUsedAt ?? marker.updatedAt ?? new Date().toISOString(),
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


        this.rss = brokenHermidata?.rss ?? [];
        this.meta = {
            contentRating: brokenHermidata?.meta?.contentRating ?? this.meta.tags.includes('Hentai') ? 'Pornographic' : 'Safe',
            contentWarnings: brokenHermidata?.meta?.contentWarnings ?? [],
            starRating: brokenHermidata?.meta?.starRating ?? 5.0,
            image: brokenHermidata?.meta?.image ?? { kind: 'url', url: brokenHermidata?.rss?.[0]?.image ?? '../../../assets/icon/icon48.png' },

            readingQueue: brokenHermidata?.meta?.readingQueue ?? false,
            relations: brokenHermidata?.meta?.relations ?? "None",

            added: brokenHermidata?.meta?.added ?? new Date().toISOString(),
            updated: brokenHermidata?.meta?.updated ?? new Date().toISOString(),
            tags: brokenHermidata?.meta?.tags ?? [],
            notes: brokenHermidata?.meta?.notes ?? '',
            altSources: brokenHermidata?.meta?.altSources ?? [this.source],
            altTitles: brokenHermidata?.meta?.altTitles ?? [alternativeRequired.title],
            originalRelease: brokenHermidata?.meta?.originalRelease ?? null,
            novelStatus: brokenHermidata?.meta?.novelStatus ?? 'Ongoing',
        };
        this.titleTrimming = brokenHermidata?.titleTrimming ?? { type: 'default' };

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
        const activeBookmarkId = bookmarkInUseId ?? this.chapter.bookmarkInUse;
        const savedBookmark = this.getBookmark(activeBookmarkId);
        const savedHistory = savedBookmark.history ?? [];

        const savedLastRead = this.GetLatestReadChapter(activeBookmarkId) || savedBookmark.current;
        const tabChapter = hermidataCopy.GetChapter(activeBookmarkId);
        const wouldBeClobbered = this.rss.length > 0 || tabChapter > this.chapter.latest || this.chapter.latest < savedBookmark.current;

        const hasNoReadHistory = !savedHistory.some(entry => Number.isFinite(entry.chapter) && entry.chapter > 0);

        if (hasNoReadHistory && wouldBeClobbered && Number.isFinite(savedBookmark.current) && savedLastRead > 0) {
            this.PushHistory(savedBookmark.current, savedBookmark.updatedAt || this.meta.updated);
        }

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
            this.chapter.bookmarks[this.chapter.bookmarkInUse].history.push({chapter: hermidata.GetLatestReadChapter(), at: new Date().toISOString()});
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
        const feedIndex = this.rss.findIndex(feed => feed.url === rawFeed.url);
        if (feedIndex === -1) return;
        const currentFeed = this.rss[feedIndex];
        const latestFetchedIsNewer = new Date(rawFeed.latestItem.pubDate).getTime() > new Date(currentFeed.latestItem.pubDate).getTime();
    
        const isNew = (rawFeed.latestItem?.link !== currentFeed.latestItem?.link) && latestFetchedIsNewer;
    
        const latestChapter = latestFetchedIsNewer ? rawFeed.latestItem.chapter : currentFeed.latestItem.chapter;
    
        if (isNew) console.log(`
            New Release\n
            title: ${rawFeed.latestItem.title}\n
            New Chapter: ${rawFeed.latestItem.chapter}\n
            Old Chapter: ${currentFeed.latestItem.chapter}\n
            new Date: ${new Date(rawFeed.latestItem.pubDate)}\n
            old Date: ${new Date(currentFeed.latestItem.pubDate)}\n
        `);
        
        
        // only update feed if we have a newer chapter, otherwise we might overwrite with stale data
        this.rss[feedIndex] = {
            id: generateRssFeedId(this.title, currentFeed.url),
            title: latestFetchedIsNewer ? rawFeed.latestItem.title : currentFeed.title,
            url: currentFeed.url,
            image: latestFetchedIsNewer ? rawFeed.image : currentFeed.image,
            domain: latestFetchedIsNewer ? rawFeed.domain : currentFeed.domain,
            lastFetched: new Date().toISOString(),
            latestItem: latestFetchedIsNewer ? rawFeed.latestItem : currentFeed.latestItem,
            lastBuildDate: currentFeed.lastBuildDate,
            Notified: true
        };
        this.chapter.latest = latestChapter;
    }
    Copy(): HermidataModel {
        return new HermidataModel(this.toJSON());
    }
    // -- serialization --
    toJSON(): Hermidata {
        const { id, title, novelType, source, chapter, rss, import: imp, titleTrimming, meta, version } = this;
        return { id, title, novelType, source, chapter, rss, import: imp, titleTrimming, meta, version };
    }

    private isoToLocal(rawDate: string, locale?: string): string {
        const isoDate = rawDate.includes('T') ? rawDate : rawDate + 'T00:00:00';
        if (isoDate.includes('/')) {
            console.trace('slash found');
            const isoDateWithoutSlash = isoDate.replaceAll('/', '-');
            const list = isoDateWithoutSlash.split('T')[0].split('-').map(String);
            // reverse order
            list.reverse();
            // if second or third is only 1 char long, pad with 0
            list[1] = String(list[1]).padStart(2, '0');
            list[2] = String(list[2]).padStart(2, '0');
            // stich back

            const trueIsoDate = list.join('-') + 'T' + isoDateWithoutSlash.split('T')[1];
            const d = new Date(trueIsoDate); // avoid TZ shift
            return new Intl.DateTimeFormat(locale ?? this.locale).format(d);
        }
        const d = new Date(isoDate); // avoid TZ shift
        return new Intl.DateTimeFormat(locale ?? this.locale).format(d);
    }
    private getDateOrder(locale?: string): (keyof Intl.DateTimeFormatPartTypesRegistry)[] {
        const parts = new Intl.DateTimeFormat(locale ?? this.locale).formatToParts(new Date(2026, 0, 2)); 
        const result = parts
            .filter(p => ["day", "month", "year"].includes(p.type))
            .map(p => p.type);
        return result
    }
    private localToISO(str: string, locale?: string, withTime = true): string {
        const order = this.getDateOrder(locale ?? this.locale);
        const separators = /[\/\-\.]/;
        const values = str.split(separators).map(Number);
        const map: Partial<Intl.DateTimeFormatPartTypesRegistry> = {};

        order.forEach((field, i) => map[field] = values[i]);
        
        const yyyy = String(map.year).padStart(4, '0');
        const mm = String(map.month).padStart(2, '0');
        const dd = String(map.day).padStart(2, '0');

        const date = `${yyyy}-${mm}-${dd}`;

        if(!withTime) return date;
        else return `${date}T00:00:00`;
    }

    private normalizeTagsForSheet(dataArray: InputArrayType | InputArraySheetType): InputArraySheetType {
        const tags = (Array.isArray(dataArray[6]) ? dataArray[6].join(", ") : dataArray[6]);
        const localeDates = this.isoToLocal(dataArray[5]);
        return [dataArray[0], dataArray[1], dataArray[2], dataArray[3], dataArray[4], localeDates, tags, dataArray[7]]
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
        return this.rss.length > 0;
    }
    public IsLatestVersion(): boolean {
        return this.GetVersion() === this.latestVersion;
    }
    /** open url and visit site or use default url */
    public jumpToUrl = (url?: string): void => {
        // TODO: make it more robust later
        openLink(url ?? this.GetUrl(), 'newTab');
    }
}