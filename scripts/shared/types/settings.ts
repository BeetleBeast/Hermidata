import { type AnyNovelStatus, type AnyNovelType, type AnyReadStatus, type Hermidata, type RawFeed } from "./popup";


export interface quickBackup {
    Settings: Settings,
    Hermidata: Record<string, Hermidata>,
    SyncData?:  {
        [key: string]: unknown;
    }
    RSSData?: Record<string, RawFeed>
}
export interface DefaultChoice {
    novelType : AnyNovelType,
    readStatus : AnyReadStatus,
    novelStatus : AnyNovelStatus,
    tags : string[],
    notes : string
}

export type NotificationTypes = "Badge" | "MessageMinimum" | "MessageFull" | "None";

export type SaveTargets = {
    internalCollection: true,
    GoogleSpreadsheet: boolean,
    BrowserBookmark: boolean
}

export type AutoSubscribe = {
    EnableAutoSubscribe: boolean;
    AllowSimilarityScanning: boolean,
    Threshold: number; // only allow between 0.9 and 1.0
    // Record<Hermidata id, RSS id>
    HermidataNotLinkedToRSS: Record<string, string>;
}

/**
 * Which dates count as activity when the novel status is set automatically.
 * - off: never change a status
 * - rss: only the newest RSS item ( safer )
 * - all: the newest RSS item or the last time a chapter was checked
 */
export type AutoSetStatusMode = 'off' | 'rss' | 'all';

export type AutoSetStatusSettings = {
    mode: AutoSetStatusMode
}

/** Whether the reading list ranks itself from releases ( off: the manual queue ) */
export type AutoReadingListSettings = {
    enabled: boolean
}

/** The shape before settings version 10; both flags true was possible but meaningless */
export type LegacyAutoSetStatusSettings = {
    onlyRSS: boolean,
    allowAllDateFields: boolean
}

/** What each placeholder of the bookmark title format stands for */
export type BookmarkTitleValues = {
    title: string;
    chapter: string | number;
    type: string;
    domain: string;
}

export type BookmarkTitlePlaceholder = {
    token: string;
    key: keyof BookmarkTitleValues;
    label: string;
    required: boolean;
}

/** One piece of a bookmark title format: literal text, or a placeholder */
export type BookmarkTitleFormatPart =
    | { kind: 'text'; text: string }
    | { kind: 'placeholder'; placeholder: BookmarkTitlePlaceholder };

export interface KeyboardShortcutSettings {
    openSettings: string;
    openLibraryPopup: string;
    focusSearch: string;
    saveCurrentPage: string;
    switchToClassic: string;
    switchToRSS: string;
}

export interface Settings {
    version: number;

    AccountAndConnections: {
        spreadsheetUrl: string;
        /** The tab rows are written to. Empty means the default tab. */
        sheetName: string;
    }
    ExtensionBehaviour: {
        EnableLightMode: boolean;
        AllowContextMenu: boolean
        EnableNotification: NotificationTypes;
        EnableKeyboardShortcuts: boolean;
        KeyboardShortcuts: KeyboardShortcutSettings;
        AutoSubscribe: AutoSubscribe;
        SaveTarget: SaveTargets;
        AutoSetStatusScore: AutoSetStatusSettings;
        /** Optional: settings saved before this existed lack it, and it counts as off */
        AutoReadingList?: AutoReadingListSettings;
        /** Optional: settings saved before this existed lack it, and it counts as off */
        AltTitleLookup?: { Enable: boolean };
        /** Optional: settings saved before this existed lack it, and it counts as off. Links MangaUpdates release feeds to items the alt-title lookup matched there. */
        MangaUpdatesFeeds?: { Enable: boolean };
        /** Optional: settings saved before this existed lack it, and it counts as the default. Days a deletion is remembered for sync. */
        TombstoneTtlDays?: number;
        /** Optional: settings saved before this existed lack it, and it counts as the default. Uses {title} and {chapter}. */
        BookmarkTitleFormat?: string;
        /** Optional: settings saved before this existed lack it, and it counts as the default. Minutes between RSS checks. */
        RssCheckIntervalMinutes?: number;
    }
    DefaultBookmarkSettings: {
        DefaultChoice: DefaultChoice,
        DefaultChoiceText_Menu: DefaultChoice,
    }
    ContentTypesAndStatuses: {
        TYPE_OPTIONS : AnyNovelType[],
        STATUS_OPTIONS : AnyReadStatus[],
        NOVEL_STATUS_OPTIONS: AnyNovelStatus[],
    }
    TagManagement: {
        tagColoring: Record<string, string>,
    }
    FolderMapping: FolderMapping,
}


export type FolderMapping = {
    root: string                          // "Manga - Anime - Novels - TV-Series"
    statusFolders: Record<string, string> // status → folder name
    overrides?: FolderRule[]              // optional type+status specific overrides
    typeAliases: Record<string, string>  // Map types to their folder names
    defaultPath: string                   // fallback for unknown types/statuses
}

export type FolderRule = {
    type?: string     // string not NovelType — handles user-defined types
    status?: string   // string not ReadStatus — handles user-defined statuses
    path: string
}

export type elementInput = {
    Type: HTMLSelectElement | null;
    ReadStatus: HTMLSelectElement | null;
    NovelStatus: HTMLSelectElement | null;
    tags: HTMLInputElement | null;
    notes: HTMLInputElement | HTMLTextAreaElement | null;
    saveButton: HTMLButtonElement | null;
}
export type elementMenu = {
    Type: HTMLSelectElement | null;
    ReadStatus: HTMLSelectElement | null;
    NovelStatus: HTMLSelectElement | null;
    tags: HTMLInputElement | null;
    notes: HTMLInputElement | HTMLTextAreaElement | null;
    saveButton: HTMLButtonElement | null;
}

export type elementsInputAndMenu = elementInput |  elementMenu;

export interface ElementsWithInputAndMenu {
    input: elementInput;
    menu: elementInput;
}
export type SheetProblem = 'auth' | 'no-access' | 'not-found' | 'no-tab' | 'server' | 'network';

/** The answer to "can Hermidata write to this spreadsheet and tab?". */
export type SheetCheck =
    | { ok: true; title: string }
    | { ok: false; problem: SheetProblem; message: string };
