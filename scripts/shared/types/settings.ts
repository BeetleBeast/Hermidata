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
export interface Settings {
    version: number;

    AccountAndConnections: {
        spreadsheetUrl: string;
    }
    ExtensionBehaviour: {
        EnableLightMode: boolean;
        AllowContextMenu: boolean
        EnableNotification: NotificationTypes;
        EnableKeyboardShortcuts: boolean;
        EnableAutoSubscribe: boolean;
        SaveTarget: SaveTargets;
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
    typeAliases?: Record<string, string>  // Map types to their folder names
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
    notes: HTMLInputElement | null;
    saveButton: HTMLButtonElement | null;
}
export type elementMenu = {
    Type: HTMLSelectElement | null;
    ReadStatus: HTMLSelectElement | null;
    NovelStatus: HTMLSelectElement | null;
    tags: HTMLInputElement | null;
    notes: HTMLInputElement | null;
    saveButton: HTMLButtonElement | null;
}

export type elementsInputAndMenu = elementInput |  elementMenu;

export interface ElmentsWithInputAndMenu {
    input: {
        Type: HTMLSelectElement | null,
        ReadStatus: HTMLSelectElement | null,
        NovelStatus: HTMLSelectElement | null,
        tags: HTMLInputElement | null,
        notes: HTMLInputElement | null,
        saveButton: HTMLButtonElement | null
    },
    menu: {
        Type: HTMLSelectElement | null,
        ReadStatus: HTMLSelectElement | null,
        NovelStatus: HTMLSelectElement | null,
        tags: HTMLInputElement | null,
        notes: HTMLInputElement | null,
        saveButton: HTMLButtonElement | null
    }
}