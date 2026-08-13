import type { allOlderHermidata } from "./oldVersions";

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
    cleanTitleKeywordStart: RegExp,
    stripReadOnline: RegExp
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

export type ContentRating = 'Safe' | 'Suggestive' | 'Erotica' | 'Pornographic';

export type ContentWarning = 'Nudity' | 'Violence' | 'Sex' | 'Language' | 'Mild Violence' | 'Mild Language' | 'Gore'
    | 'SA' | 'Abuse' | 'Incest' | 'Kidnapping' | 'Abortion' | 'Suicide' | 'Pregnancy' | 'Mental Illness' | 'Classism' | 'Racism' | 'Sexism'
    | 'Hateful Language' | 'Transphobia' | 'Homophobia' | 'Swears' | 'Murder' | 'Animal cruelty' | 'Self-harm' | 'Death' | 'childbirth'
    | 'Miscarriages' | 'Blood' | 'Ableism' | 'Racism' | 'misogyny' | 'Sexism' | 'pedophilia' | 'Child abuse' | 'heterosexism' | (string & {}); // Custom content warning

export type ReleaseSchedule = 'Once' | 'Daily' | 'Weekly' | 'Monthly' | 'Yearly' | 'Irregular' | 'Unknown';

export type Relation = {
    series: {
        seriesId: string;
        position: number;
    },
    relatedWorks: {
        type: 'sequel' | 'prequel' | 'sideStory' | 'spinOff' | 'summary';
        id: string;
    }[]
} 

export interface Bookmark { // new
    version: number;
	id: string;
	current: number;
	history: {
        chapter: number;
        at: string;  // timestamp (ISO 8601)
    }[];
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


export interface Hermidata {
    version: number;
    id: string;
    title: string;
    novelType: AnyNovelType;
    source: string;
    chapter: {
        latest: number;
        lastChecked: string;
        bookmarks: Record<string, Bookmark>; // Multiple saved positions
        revisitingCount: number; // How many times you've re-read
        bookmarkInUse: string;
        releaseSchedule: ReleaseSchedule; // calculated from chapter history
    };
    rss: Feed | null;
    import: string | null;
    meta: {
        tags: string[];

        contentRating: ContentRating;
        contentWarnings: ContentWarning[];
        starRating: number;
        image: string; // image url? or file path? ( unsure )
        author?: string; // optional
        language?: string; // optional
        translator?: string; // optional

        readingQueue: {
            readNext: boolean; // true if it is the first in the queue
            priority: number; // 1-10
            queueIndex: number;
        } | false; // false if not in queue

        relations: Relation | 'None';

        notes: string;
        added: string;
        updated: string;
        altSources: string[];
        altTitles: string[];
        originalRelease: string | null;
        novelStatus: AnyNovelStatus;
    };
}

/*
need to add:

image [x]
version [x]
starRating [x]
contentRating [x]
author [x]
language [x]

*/

// FIXME: make sure originalRelease is there

export type HermidataDateType = 'added' | 'updated' | 'originalRelease';
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
    id: string, // same As RawFeedId
    title: string,
    url: string,
    image: null | string,
    domain: string,
    lastFetched: null | string, // Date when last fetched
    latestItem: FeedItem
    lastBuildDate?: null | Date,
    Notified?: true;
}
// raw feed has multiple items
export type RawFeed = {
    id: string, // based on main Title
    title: string,
    url: string,
    domain: string,
    lastFetched: string,
    lastBuildDate: Date,
    image: string,
    latestItem: FeedItem,
    lastToken: string | null
}
// FIXME: lastToken && guid have been added; sheck if it works
export type FeedItem = {
    id: string, // based on title + link
    rawTitle: string, // the title as it appears in the feed
    title: string,
    link: string,
    chapter: number,
    pubDate: Date,
    guid: string
}
/** scripts file output */
export type RawScrappedFeed = {
    title: string;
    url: string;
    domain: string;
    lastFetched: string;
    lastBuildDateStr: string;
    image: string;
    latestItem: RawScrapedItem;
    lastToken: string | null;
}
/** scripts file output */
export type RawScrapedItem  = {
    title: string;
    link: string;
    pubDate: Date;
    guid: string;
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

export type ShouldBlockReturn = {
    action: "skip" | "append" | "alert";
}
export type ShouldReplaceReturn = {
    action: "replace";
    rowIndex: number;
    replacedURL: string | undefined;
    replaceID: string | undefined;
}
export type  ShouldReplaceOrBlockReturn = ShouldBlockReturn | ShouldReplaceReturn;


/**
 * Every dot-path inside T that ends at a string[].
 * Example: for HermidataModel, this produces "meta.tags" | "meta.altSources" | "meta.altTitles" | ...
 * (as tuples, e.g. ["meta", "tags"])
 */
export type StringListFieldPath<TRoot> = TRoot extends string[]
    ? []
    : TRoot extends object
        ? {
            [FieldName in Extract<keyof TRoot, string>]: [FieldName, ...StringListFieldPath<TRoot[FieldName]>]
        }[Extract<keyof TRoot, string>]
        : never;

/**
 * Given a root type and a path tuple into it, resolves the type found at that path.
 * Example: ValueAtPath<HermidataModel, ["meta", "tags"]> === string[]
 */
export type ValueAtPath<TRoot, TPath extends readonly PropertyKey[]> = TPath extends [infer FirstKey, ...infer RestKeys]
    ? FirstKey extends keyof TRoot
        ? RestKeys extends PropertyKey[]
            ? ValueAtPath<TRoot[FirstKey], RestKeys>
            : never
        : never
    : TRoot;


/* old versions */

export type migrationReturn = {
    result: allOlderHermidata,
    isMigratedSuccessfully: false
} | {
    result: Hermidata,
    isMigratedSuccessfully: true
}

export type Migration = (data: any) => any;