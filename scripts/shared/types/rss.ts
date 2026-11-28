import type { AllHermidata, OnlyPlainHermidata, RawFeed } from "./popup";
import type { Settings } from "./settings";

export type NormalSortsType = 'Alphabet' | 'Novel-Type' | 'Recently-Added' | 'Latest-Updates';
export type ExceptionSortsType = '';
export type ReverseAllSortsType = `Reverse-${NormalSortsType}`;

export type AllSortsType = (NormalSortsType | ReverseAllSortsType) | ExceptionSortsType;

export type MenuOption = {
    label: string;
    action: () => void | Promise<void>;
    danger?: boolean;
}
export type subMenu = {
    label: string;
    /** Entries of the submenu, which can hold submenus of its own */
    options: MenuOptions[];
}

export type MenuOptions = MenuOption | separator | subMenu;
export type separator = "separator";

export type Filters = {
    include: Record<string, string[]>; // { type: ['Manga'], status: ['Ongoing'] }
    exclude: Record<string, string[]>;
    sort: AllSortsType;
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

export type RssDOM = {
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


/* Element Picker */
export interface ElementAttribute {
    name: string;
    value: string;
}

export interface ChildInfo {
    tag: string;
    text: string;
}

export interface PickedElementData {
    tag: string;
    id: string;
    classes: string[];
    /** Direct text content, trimmed */
    text: string;
    /** innerHTML, trimmed */
    html: string;
    attributes: ElementAttribute[];
    /** Direct children only (not full descendant tree) */
    children: ChildInfo[];
    /** Best-effort unique-ish CSS selector for re-selecting this element later */
    selector: string;
    /** one entry per lowest-level text-bearing element, in DOM order */
    leafTexts: string[];
}


export interface ElementPickedMessage {
    action: "elementPicked";
    data: PickedElementData;
}

export interface PickingCancelledMessage {
    action: "pickingCancelled";
}

export interface StartPickingMessage { action: "startPicking"; }

export interface CancelPickingMessage { action: "cancelPicking"; }

export type RuntimeMessage = ElementPickedMessage | PickingCancelledMessage | StartPickingMessage | CancelPickingMessage;
export interface HermidataMigrationConfiguration {
    keepId: string;
    removeId: string;
    resolutions: Record<string, "A" | "B">; // only for fields that need a manual pick
}
/** The two entries in the Library merge dialog, in the order they were selected */
export type MergeLetter = "A" | "B";
export interface MergeSuggestion {
    keep: MergeLetter;
    reason: string;
}
/** A field both entries fill in differently; the user picks which value survives */
export interface MergeConflictChoice {
    path: string;
    label: string;
    values: Record<MergeLetter, unknown>;
    chosen: MergeLetter;
    /** false while the choice still follows the kept entry */
    touched: boolean;
}
export interface ScalarConflict<K extends string = string> {
    field: K;
    path: string;        // e.g. "meta.novelStatus"
    valueA: unknown;
    valueB: unknown;
}
