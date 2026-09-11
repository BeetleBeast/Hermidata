import type { AnyNovelStatus, AnyNovelType, AnyReadStatus, Feed, Hermidata, NovelType, ReadStatus } from "./popup";



export type allOlderHermidata = HermidataV1 | HermidataV2 | HermidataV3 | HermidataV4 | HermidataV5 | HermidataV6 | HermidataV7 | HermidataV8 | HermidataV9 | HermidataV10;

export type AnyHermidataVersion = HermidataV1 | HermidataV2 | HermidataV3 | HermidataV4 | HermidataV5 | HermidataV6 | HermidataV7 | HermidataV8 | HermidataV9 | HermidataV10 | Hermidata;

/* old Feed & RawFeed */

export type FeedV1 = {
    title: string,
    url: string,
    image: null | string,
    domain: string,
    lastFetched: null | string, // Date when last fetched
    latestItem: FeedItemV1
    lastBuildDate?: null | Date,
}
// raw feed has multiple items
export type RawFeedV1 = {
    title: string,
    url: string,
    domain: string,
    lastFetched: string,
    lastBuildDate: Date,
    image: string,
    items: FeedItemV1[],
    lastToken: string | null
}

export type FeedItemV1 = {
    title: string,
    link: string,
    pubDate: Date,
    guid: string
}


/* Old Bookmarks
    V1 is the base shape; each later version only adds one field on top of the previous one, so they're expressed as a chain of `extends`.
*/
export interface BookmarkV1 {
    id: string;
    current: number;
    history: number[];
    label: string; // "favorite scene", "reread from here", "primary"
    note?: string; // Optional note about why you bookmarked createdAt: string;
    color: string; // hex rgb for visual distinction
    createdAt: string;
    updatedAt: string;
    isPrimary: boolean; // only one can be primary
}
export interface BookmarkV2 extends BookmarkV1 {
    readStatus: AnyReadStatus;
}
export interface BookmarkV3 extends BookmarkV2 {
    scrollPosition: number;
}
export interface BookmarkV4 extends BookmarkV3 {
    url: string;
}
/* Old Hermidata
    V1/V2 are the original flat (capitalized-key) shape.
    From V3 onward the shape is lowercase-key/nested, and stabilizes over time:
    - `meta` settles into its final shape by V7 (MetaStable)
    - `chapter` settles into its final shape by V7 (ChapterV7Plus<Bookmark>), only the bookmark type inside it keeps changing (V1 -> V4)
    Each version below only re-declares the fields that actually changed, via `extends Omit<Prev, changedKeys>`.
*/
export interface HermidataV1 {
    Page_Title: string,
    Title: string,
    Type: NovelType,
    Chapter: string,
    Url: string,
    Status: ReadStatus,
    Date: string,
    Tag: string,
    Notes: string,
    GoogleSheetURL: string,
    Past: {}
}
export interface HermidataV2 extends HermidataV1 {
    Hash: string // added hash
}
// --- meta shapes shared across V3-V10 ---
type MetaV3V4 = {
    tags: string; // old versions might have string, but we will convert them to array
    notes: string,
    added: string,
    updated: string,
    altTitles: string[]
};
type MetaV5 = Omit<MetaV3V4, "tags"> & {
    tags: string[];
    originalRelease: string | null; // Date.toISOString of when the novel was released in the original language
    novelStatus: AnyNovelStatus;
};
type MetaV6 = MetaV5 & {
    altSources: string[]; // for multiple sources ( with the first one the same as above )
    bookmarkInUse: string;
};
// V7-V10 share this exact meta shape (bookmarkInUse moved into `chapter`)
type MetaStable = MetaV5 & {
    altSources: string[]; // for multiple sources ( with the first one the same as above )
};
// --- chapter shapes shared across V3-V10 ---
type ChapterV3 = {
    current: string,
    latest: null,
    history: (number | string)[],
    lastChecked: string
};
type ChapterV4V5 = {
    current: number;
    latest: number;
    history: number[];
    lastChecked: string;
};
type ChapterWithBookmarks<B> = {
    latest: number;
    lastChecked: string;
    bookmarks: Record<string, B>; // Multiple saved positions
    revisitingCount: number; // How many times you've re-read
};
// V7-V10 all share this chapter shape, differing only in the Bookmark version stored
type ChapterV7Plus<B> = ChapterWithBookmarks<B> & {
    bookmarkInUse: string;
};
export interface HermidataV3 {
    id: string,
    title: string,
    type: NovelType,
    url: string,
    source: string,
    status: ReadStatus,
    chapter: ChapterV3,
    rss: null,
    import: null,
    meta: MetaV3V4
}
export interface HermidataV4 extends Omit<HermidataV3, "type" | "status" | "chapter" | "rss" | "import"> {
    type: AnyNovelType;
    status: AnyReadStatus;
    chapter: ChapterV4V5;
    rss: Feed | null;
    import: string | null;
}
export interface HermidataV5 extends Omit<HermidataV4, "meta"> {
    meta: MetaV5;
}
export interface HermidataV6 extends Omit<HermidataV5, "chapter" | "meta"> {
    chapter: ChapterWithBookmarks<BookmarkV1>; // bookmarkInUse still lives in meta at this version
    meta: MetaV6;
}
export interface HermidataV7 extends Omit<HermidataV6, "chapter" | "meta"> {
    chapter: ChapterV7Plus<BookmarkV1>; // bookmarkInUse moved here from meta
    meta: MetaStable;
}
export interface HermidataV8 extends Omit<HermidataV7, "type" | "status" | "chapter"> {
    novelType: AnyNovelType; // renamed from `type`; top-level `status` removed (now per-bookmark readStatus)
    chapter: ChapterV7Plus<BookmarkV2>;
}
export interface HermidataV9 extends Omit<HermidataV8, "chapter"> {
    chapter: ChapterV7Plus<BookmarkV3>;
}
export interface HermidataV10 extends Omit<HermidataV9, "url" | "chapter"> {
    chapter: ChapterV7Plus<BookmarkV4>; // top-level `url` removed
}