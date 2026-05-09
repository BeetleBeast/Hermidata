import { DEFAULT_NOVEL_STATUSES, DEFAULT_NOVEL_TYPES, DEFAULT_READ_STATUSES, type AnyNovelStatus, type AnyNovelType, type AnyReadStatus, type Hermidata, type RawFeed } from "./popup";


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

const CustomFoldermapping: FolderMapping = {
    root: 'Manga - Anime - Novels - TV-Series',
    statusFolders: {
        'Finished': 'Finished',
        'Viewing':  'Currently - Reading',
        'Dropped':  'Abandond',
        'Planned':  'Planned',
        'On-hold':  'On-hold',
    },
    typeAliases: {
        "Manga": "Manga",
        "Manhwa": "Manga",    // Manhwa → Manga folder
        "Manhua": "Manga",    // Manhua → Manga folder
        "Novel": "Novels",    // Novel → Novels (with s)
        "Webnovel": "Novels", // Webnovel → Novels
        "Anime": "Anime",
        "TV-Series": "TV-Series"
    },
    overrides: [
        // Manga / Manhwa / Manhua ->  from Reading to Currently - Reading/Reading
        { type: 'Manga', status: 'Viewing', path: 'Manga - Anime - Novels - TV-Series/Manga/Currently - Reading/Reading' },
        { type: 'Manhwa', status: 'Viewing', path: 'Manga - Anime - Novels - TV-Series/Manga/Currently - Reading/Reading'},
        { type: 'Manhua', status: 'Viewing', path: 'Manga - Anime - Novels - TV-Series/Manga/Currently - Reading/Reading' },
        // Manga / Manhwa / Manhua -> from Planned to Currently - Reading/future watch
        { type: 'Manga', status: 'Planned', path: 'Manga - Anime - Novels - TV-Series/Manga/Currently - Reading/future watch' },
        { type: 'Manhwa', status: 'Planned', path: 'Manga - Anime - Novels - TV-Series/Manga/Currently - Reading/future watch' },
        { type: 'Manhua', status: 'Planned', path: 'Manga - Anime - Novels - TV-Series/Manga/Currently - Reading/future watch' },
        // Novel / Webnovel -> from Reading to Currently - Reading/Reading
        { type: "Novel", status: "Viewing", path: "Manga - Anime - Novels - TV-Series/Novels/Currently - Reading" },
        { type: "Webnovel", status: "Viewing", path: "Manga - Anime - Novels - TV-Series/Novels/Currently - Reading" },
    ],
    defaultPath: 'Unsorted'
}
export const DefaultFoldermapping: FolderMapping = {
    root: 'Hermidata',
    statusFolders: {
        'Finished': 'Finished',
        'Viewing':  'Viewing',
        'Dropped':  'Dropped',
        'Planned':  'Planned',
        'On-hold':  'On-hold',
    },
    defaultPath: 'Unsorted'
}


export const defaultSettings: Settings = {
    version: 6,
    AccountAndConnections: {
        spreadsheetUrl: '',
    },
    ExtensionBehaviour: {
        EnableLightMode: false,
        AllowContextMenu : true,
        SaveTarget: {
            internalCollection: true,
            BrowserBookmark: true,
            GoogleSpreadsheet: true,
        },
        EnableKeyboardShortcuts: false,
        EnableAutoSubscribe: false,
        EnableNotification: 'None',
    },
    ContentTypesAndStatuses: {
        TYPE_OPTIONS : [...DEFAULT_NOVEL_TYPES],
        STATUS_OPTIONS : [...DEFAULT_READ_STATUSES],
        NOVEL_STATUS_OPTIONS: [...DEFAULT_NOVEL_STATUSES],
    },
    DefaultBookmarkSettings: {
        DefaultChoice: {
            novelType: 'Manga',
            readStatus: 'Viewing',
            novelStatus: 'Ongoing',
            tags : [''],
            notes : ''
        },
        DefaultChoiceText_Menu: {
            novelType: 'Manga',
            readStatus: 'Planned',
            novelStatus: 'Ongoing',
            tags: [''],
            notes: ''
        },
    },
    TagManagement: {
        tagColoring: {},
    },
    FolderMapping: CustomFoldermapping,
};