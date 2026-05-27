import { returnBookmarkHash } from "../StringOutput";
import type { AllsortsType, AnyNovelStatus, AnyNovelType, AnyReadStatus, FilterClassName, FilterName, Hermidata, NovelStatus, NovelType, ReadStatus } from "../types";

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

// RSS mode

export const AllSorts: AllsortsType[] = ['Alphabet', 'Novel-Type', 'Recently-Added', 'Latest-Updates']

export const filterClassName: FilterClassName = {
    Sort: 'filter-sort',
    Type: 'filter-type', 
    Status: 'filter-status', 
    NovelStatus: 'filter-novel-status',
    Source: 'filter-source', 
    Tag: 'filter-tag', 
    Date: 'filter-date'
}
export const filterName: FilterName = {
    Sort: 'Sort',
    Type: 'Type', 
    Status: 'Read-Status', 
    NovelStatus: 'Novel-Status',
    Source: 'Source', 
    Tag: 'Tag', 
    Date: 'Date'
}


export const makeDefaultHermidata = (type: AnyNovelType, status: AnyReadStatus, novelStatus: AnyNovelStatus): Hermidata => ({
    id: '',
    title: '',
    type:  type,
    url: '',
    source: '',
    status: status,
    chapter: { 
        bookmarks: {
            [returnBookmarkHash('Primary')]: {
                id: returnBookmarkHash('Primary'),
                current: 0,
                history: [],
                label: 'Primary',
                color: 'blue',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                note: '',
                isPrimary: true
            }
        },
        latest: 0,
        lastChecked: new Date().toISOString(),
        revisitingCount: 0
    },
    rss: null,
    import: null,
    meta: {
        tags: [],
        notes: '',
        added: new Date().toISOString(),
        updated: new Date().toISOString(),
        altSources: [],
        altTitles: [],
        originalRelease: null,
        novelStatus: novelStatus,
        bookmarkInUse: returnBookmarkHash('Primary')
    }
});