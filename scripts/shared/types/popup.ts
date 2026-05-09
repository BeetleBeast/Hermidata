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

// Default arrays — used to seed settings on first install
export const DEFAULT_NOVEL_TYPES: NovelType[] = ['Manga', 'Manhwa', 'Manhua', 'Novel', 'Webnovel', 'Anime', "TV-Series"];
export const DEFAULT_NOVEL_STATUSES: NovelStatus[] = ['Ongoing', 'Completed', 'Hiatus', 'Canceled'];
export const DEFAULT_READ_STATUSES: ReadStatus[] = ['Viewing', 'Finished', 'On-hold', 'Dropped', 'Planned'];


// hardcoded default tags
export const DEFAULT_TAGS: string[] = [
    'Action', 'Romance', 'Comedy', 'Drama', 'Slice of Life', 'Adventure', 'Parody', 'Magic',
    'Fantasy', 'Mystery', 'Thriller', 'Horror', 'Sci-Fi', 'Historical', 'Supernatural', 
    'Ecchi', 'Harem', 'Hentai',
    'Seinen', 'Shoujo', 'Shoujoai', 'Shounen', 'Shounenai', 'Josei', 'Yaoi', 'Yuri',
    'Isekai', 'Mecha', 'Demons', 'Ghosts', 'Vampire', 'Psychological', 'Super Power', 
];
// hardcoded default tag colours in hex | <tag, hex colour>
// hardcoded default tag colours in hex | <tag, hex colour>
export const DEFAULT_TAG_COLOURS: Record<string, string> = {
    'Action': '#E74C3C',           // Red
    'Romance': '#E91E63',          // Pink
    'Comedy': '#FFC107',           // Amber
    'Drama': '#9C27B0',            // Purple
    'Slice of Life': '#4CAF50',    // Green
    'Adventure': '#FF9800',        // Orange
    'Parody': '#FFD54F',           // Light Yellow
    'Magic': '#9C27B0',            // Purple
    'Fantasy': '#673AB7',          // Deep Purple
    'Mystery': '#607D8B',          // Blue Grey
    'Thriller': '#424242',         // Dark Grey
    'Horror': '#B71C1C',           // Dark Red
    'Sci-Fi': '#00BCD4',           // Cyan
    'Historical': '#8D6E63',       // Brown
    'Supernatural': '#7B1FA2',     // Dark Purple
    
    'Ecchi': '#F48FB1',            // Light Pink
    'Harem': '#EC407A',            // Hot Pink
    'Hentai': '#C2185B',           // Dark Pink
    'Seinen': '#455A64',           // Dark Blue Grey
    'Shoujo': '#F06292',           // Rose Pink
    'Shoujoai': '#F8BBD0',         // Soft Pink
    'Shounen': '#FF5722',          // Deep Orange
    'Shounenai': '#64B5F6',        // Light Blue
    'Josei': '#BA68C8',            // Medium Purple
    'Yaoi': '#5C6BC0',             // Indigo
    'Yuri': '#FF80AB',             // Pink Accent
    'Isekai': '#26C6DA',           // Light Cyan
    'Mecha': '#78909C',            // Grey Blue
    'Demons': '#6A1B9A',           // Dark Magenta
    'Ghosts': '#E0E0E0',           // Light Grey
    'Vampire': '#880E4F',          // Dark Maroon
    'Psychological': '#5D4037',    // Deep Brown
    'Super Power': '#1976D2',      // Blue
}


export interface Hermidata {
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