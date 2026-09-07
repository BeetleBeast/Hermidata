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


/* Old Bookmarks */

export interface BookmarkV4 { // new
    id: string;
    current: number;
    history: number[];
    readStatus: AnyReadStatus;
    label: string; // "favorite scene", "reread from here", "primary"
    note?: string; // Optional note about why you bookmarked createdAt: string;
    color: string; // hex rgb for visual distinction
    createdAt: string;
    updatedAt: string;
    isPrimary: boolean; // only one can be primary
    scrollPosition: number;
    url: string;
}

export interface BookmarkV3 { // new
    id: string;
    current: number;
    history: number[];
    readStatus: AnyReadStatus;
    label: string; // "favorite scene", "reread from here", "primary"
    note?: string; // Optional note about why you bookmarked createdAt: string;
    color: string; // hex rgb for visual distinction
    createdAt: string;
    updatedAt: string;
    isPrimary: boolean; // only one can be primary
    scrollPosition: number;
}
export interface BookmarkV2 { // new
	id: string;
	current: number;
	history: number[];
    readStatus: AnyReadStatus;
	label: string; // "favorite scene", "reread from here", "primary"
	note?: string; // Optional note about why you bookmarked createdAt: string;
	color: string; // hex rgb for visual distinction
	createdAt: string;
	updatedAt: string;
	isPrimary: boolean; // only one can be primary
}

export interface BookmarkV1 { // new
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

/* Old Hermidata */

export interface HermidataV10 {
    id: string;
    title: string;
    novelType: AnyNovelType;
    source: string;
    chapter: {
        latest: number;
        lastChecked: string;
        bookmarks: Record<string, BookmarkV4>; // Multiple saved positions
        revisitingCount: number; // How many times you've re-read
        bookmarkInUse: string;
    };
    rss: Feed | null;
    import: string | null;
    meta: {
        tags: string[]; // old versions might have string, but we will convert them to array
        notes: string;
        added: string;
        updated: string;
        altSources: string[]; // for multiple sources ( with the first one the same as above )
        altTitles: string[];
        originalRelease: string | null; // Date.toISOString of when the novel was released in the original language
        novelStatus: AnyNovelStatus;
    };
}


export interface HermidataV9 {
    id: string;
    title: string;
    novelType: AnyNovelType;
    url: string;
    source: string;
    chapter: {
        latest: number;
        lastChecked: string;
        bookmarks: Record<string, BookmarkV3>; // Multiple saved positions
        revisitingCount: number; // How many times you've re-read
        bookmarkInUse: string;
    };
    rss: Feed | null;
    import: string | null;
    meta: {
        tags: string[]; // old versions might have string, but we will convert them to array
        notes: string;
        added: string;
        updated: string;
        altSources: string[]; // for multiple sources ( with the first one the same as above )
        altTitles: string[];
        originalRelease: string | null; // Date.toISOString of when the novel was released in the original language
        novelStatus: AnyNovelStatus;
    };
}

export interface HermidataV8 {
    id: string;
    title: string;
    novelType: AnyNovelType;
    url: string;
    source: string;
    chapter: {
        latest: number;
        lastChecked: string;
        bookmarks: Record<string, BookmarkV2>; // Multiple saved positions
        revisitingCount: number; // How many times you've re-read
        bookmarkInUse: string;
    };
    rss: Feed | null;
    import: string | null;
    meta: {
        tags: string[]; // old versions might have string, but we will convert them to array
        notes: string;
        added: string;
        updated: string;
        altSources: string[]; // for multiple sources ( with the first one the same as above )
        altTitles: string[];
        originalRelease: string | null; // Date.toISOString of when the novel was released in the original language
        novelStatus: AnyNovelStatus;
    };
}


export interface HermidataV7 {
    id: string;
    title: string;
    type: AnyNovelType;
    url: string;
    source: string;
    status: AnyReadStatus;
    chapter: {
        latest: number;
        lastChecked: string;
        bookmarks: Record<string, BookmarkV1>; // Multiple saved positions
        revisitingCount: number; // How many times you've re-read
        bookmarkInUse: string;
    };
    rss: Feed | null;
    import: string | null;
    meta: {
        tags: string[]; // old versions might have string, but we will convert them to array
        notes: string;
        added: string;
        updated: string;
        altSources: string[]; // for multiple sources ( with the first one the same as above )
        altTitles: string[];
        originalRelease: string | null; // Date.toISOString of when the novel was released in the original language
        novelStatus: AnyNovelStatus;
    };
}
export interface HermidataV6 {
    id: string;
    title: string;
    type: AnyNovelType;
    url: string;
    source: string;
    status: AnyReadStatus;
    chapter: {
        latest: number;
        lastChecked: string;
        bookmarks: Record<string, BookmarkV1>; // Multiple saved positions
        revisitingCount: number; // How many times you've re-read
    };
    rss: Feed | null;
    import: string | null;
    meta: {
        tags: string[]; // old versions might have string, but we will convert them to array
        notes: string;
        added: string;
        updated: string;
        altSources: string[]; // for multiple souces ( with the first one the same as above )
        altTitles: string[];
        originalRelease: string | null; // Date.toISOString of when the novel was released in the original language
        novelStatus: AnyNovelStatus;
        bookmarkInUse: string;
    };
}
export interface HermidataV5 {
    id: string;
    title: string;
    type: AnyNovelType;
    url: string;
    source: string;
    status: AnyReadStatus;
    chapter: {
        current: number;
        latest: number;
        history: number[];
        lastChecked: string;
    };
    rss: Feed | null;
    import: string | null;
    meta: {
        tags: string[]; // old versions might have string, but we will convert them to array
        notes: string;
        added: string;
        updated: string;
        altTitles: string[];
        originalRelease: string | null; // Date.toISOString of when the novel was released in the original language
        novelStatus: AnyNovelStatus;
    };
}

export interface HermidataV4 {
    id: string;
    title: string;
    type: AnyNovelType;
    url: string;
    source: string;
    status: AnyReadStatus;
    chapter: {
        current: number;
        latest: number;
        history: number[];
        lastChecked: string;
    };
    rss: Feed | null;
    import: string | null;
    meta: {
        tags: string;
        notes: string;
        added: string;
        updated: string;
        altTitles: string[];
    };
}

export interface HermidataV3 {
    id: string,
    title: string,
    type: NovelType,
    url: string,
    source: string,
    status: ReadStatus,
    chapter: {
        current: string,
        latest: null,
        history: (number | string)[],
        lastChecked: string
    },
    rss: null,
    import: null,
    meta: {
        tags: string,
        notes: string,
        added: string,
        updated: string,
        altTitles: string[]
    }
}
export interface HermidataV2 {
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
    Past: {},
    Hash: string // added hash
}
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