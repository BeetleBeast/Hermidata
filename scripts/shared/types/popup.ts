/**
 * @fileoverview Types
 * - RegexConfig is a oject definition for regex patterns used in the TrimTitle class
 */
export type RegexConfig = {
    chapterRemoveRegexV3: RegExp,
    chapterRegex: RegExp,
    readRegex: RegExp,
    junkRegex: RegExp,
    siteNameRegex: RegExp,
    flexibleSiteNameRegex: RegExp,
    cleanTitleKeywordEnd: RegExp,
    cleanTitleKeywordStart: RegExp
}
/**
 * @fileoverview Types
 * - TrimmedTitle is a oject definition for trimmed title
 */
export type TrimmedTitle = {
    title: string,
    note?: string
}

// Hardcoded defaults — used for autocomplete and initial settings
export type NovelType =  'Manga' | 'Manhwa' | 'Manhua' | 'Novel' | 'Webnovel' | 'Anime' | "TV-Series";
export type NovelStatus = 'Ongoing' | 'Completed' | 'Hiatus' | 'Canceled';
export type ReadStatus = 'Viewing' | 'Finished' | 'On-hold' | 'Dropped' | 'Planned';

// Extended versions — what you actually use at runtime
// Allows user-defined values while keeping autocomplete on the defaults
export type AnyNovelType = NovelType  | (string & {});
export type AnyReadStatus = ReadStatus | (string & {});
export type AnyNovelStatus = NovelStatus | (string & {});


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
        altSources: string[]; // for multiple souces ( with the first one the same as above )
        altTitles: string[];
        originalRelease: string | null; // Date.toISOString of when the novel was released in the original language
        novelStatus: AnyNovelStatus;
    };
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
export interface Bookmark { // new
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


export interface Hermidata {
    id: string;
    title: string;
    novelType: AnyNovelType;
    url: string;
    source: string;
    chapter: {
        latest: number;
        lastChecked: string;
        bookmarks: Record<string, Bookmark>; // Multiple saved positions
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
        altSources: string[]; // for multiple souces ( with the first one the same as above )
        altTitles: string[];
        originalRelease: string | null; // Date.toISOString of when the novel was released in the original language
        novelStatus: AnyNovelStatus;
    };
}

// FIXME: make sure oginalRelease is there

export type HermidataDateType = 'added' | 'updated';
export type HermidataSortType = 'pubDate';


export type AllHermidata = Record<string, Hermidata>;



export type AltCheck = {
    needAltTitle: boolean;
    reason: string;
    existingKey?: undefined;
    similarity?: undefined;
    relatedKey?: undefined;
    relatedTitle?: undefined;
} | {
    needAltTitle: boolean;
    reason: string;
    existingKey: string;
    similarity?: undefined;
    relatedKey?: undefined;
    relatedTitle?: undefined;
} | {
    needAltTitle: boolean;
    reason: string;
    similarity: number;
    relatedKey: string | null;
    relatedTitle: string | null;
    existingKey?: undefined;
}

export type InputArrayType = [string, AnyNovelType, number, string, AnyReadStatus, string, string[], string]
export type InputArraySheetType = [string, AnyNovelType, number, string, AnyReadStatus, string, string, string]



export type AllFeeds = Record<string, Feed>;

// Feed has single item
export type Feed = {
    title: string,
    url: string,
    image: null | string,
    domain: string,
    lastFetched: null | string, // Date when last fetched
    latestItem: FeedItem
    lastBuildDate?: null | Date,
}
// raw feed has multiple items
export type RawFeed = {
    title: string,
    url: string,
    domain: string,
    lastFetched: string,
    lastBuildDate: Date,
    image: string,
    items: FeedItem[],
    lastToken: string | null
}
// FIXME: lastToken && guid have been added; sheck if it works
export type FeedItem = {
    title: string,
    link: string,
    pubDate: Date,
    guid: string
}

export interface LatestValue {
    title: string;
    Type: AnyNovelType;
    Chapter: number;
    url: string;
    status: AnyReadStatus;
    novelStatuses: AnyNovelStatus;
    tagsArray: string[];
    notes: string;
    date: string;
}
export type PotentialSameHermidata = {
    result: {
        key: string,
        titleFound: string,
        titleGiven: string,
        score: number
    } | null,
    found: boolean,
    amountFound: number
}

export type CurrentTab = {
    currentChapter: number;
    pageTitle: string;
    url: string;
}