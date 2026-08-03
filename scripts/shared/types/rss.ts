import type { AllHermidata } from "./popup";

export type NormalSortsType = 'Alphabet' | 'Novel-Type' | 'Recently-Added' | 'Latest-Updates';
export type ExeptionSortsType = '';
export type ReverseAllsortsType = `Reverse-${NormalSortsType}`;

export type AllsortsType = (NormalSortsType | ReverseAllsortsType) | ExeptionSortsType;

export type MenuOption = {
    label: string;
    action: () => void | Promise<void>;
    danger?: boolean;
}
export type subMenu = {
    label: string;
    options: MenuOption[];
}

export type MenuOptions = MenuOption | separator | subMenu;
export type separator = "separator";

export type Filters = {
    include: Record<string, string[]>; // { type: ['Manga'], status: ['Ongoing'] }
    exclude: Record<string, string[]>;
    sort: AllsortsType;
}

export interface FilterName {
    Sort: string,
    Type: string,
    Status: string,
    NovelStatus: string,
    Source: string,
    Tag: string,
    Date: string
}
export interface FilterClassName {
    [key: string]: string;
    Sort: string,
    Type: string ,
    Status: string ,
    NovelStatus: string,
    Source: string,
    Tag: string,
    Date: string,
}

export type RSSDOM = {
    notifications: {
        items: DocumentFragment;
    };
    allItems: {
        header: DocumentFragment;
        items: DocumentFragment;
    }
}
export type RSSData = {
    feeds: AllHermidata; // this one has RSS the other is all
    hermidata: AllHermidata;
}

export interface FuzzyBookmarkMatches {
    folderPath: string;
    bookmarkTitle: string;
    fuzzySearchUrl: string;
    currentUrl: string | undefined;
    similarity: number;
}
export interface FuzzyHermidataMatches {
    bookmarkTitle: string,
    fuzzySearchUrl: string,
    chapter: number,
    currentUrl: string | undefined,
    similarity: number
}


export type FuzzyMatchResult =
    | { type: 'bookmark'; match: FuzzyBookmarkMatches; sameChapter: boolean }
    | { type: 'hermidata'; match: FuzzyHermidataMatches; sameChapter: boolean }
    | { type: 'none' };

export interface HermidataMigrationConfiguration {
    keepId: string;
    removeId: string;
    resolutions: Record<string, "A" | "B">; // only for fields that need a manual pick
}
export interface MergeAnalysis {
    automaticallyMergedFields: string[];
    automaticallyMergedFieldsAmount: number;
    manuallyMergedFieldsAmount: number;
    manuallyMergedFields: Record<string, { A: unknown; B: unknown }>;
    configuration: HermidataMigrationConfiguration;
}
export interface ScalarConflict<K extends string = string> {
    field: K;
    path: string;        // e.g. "meta.novelStatus"
    valueA: unknown;
    valueB: unknown;
}
