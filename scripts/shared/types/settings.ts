import { DEFAULT_NOVEL_STATUSES, DEFAULT_NOVEL_TYPES, DEFAULT_READ_STATUSES, type AnyNovelStatus, type AnyNovelType, type AnyReadStatus } from "./popup";

export interface DefaultChoice {
    Type : AnyNovelType,
    status : AnyReadStatus,
    tags : string[],
    notes : string
}

export interface Settings {
    version: number;

    spreadsheetUrl: string;
    
    darkMode: boolean;

    DefaultChoice: DefaultChoice,
    DefaultChoiceText_Menu: DefaultChoice,

    TYPE_OPTIONS : AnyNovelType[],
    STATUS_OPTIONS : AnyReadStatus[],
    NOVEL_STATUS_OPTIONS: AnyNovelStatus[],

    tagColoring: Record<string, string>,
    FolderMapping: FolderMapping,

    AllowContextMenu: boolean
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
    Status: HTMLSelectElement | null;
    tags: HTMLInputElement | null;
    notes: HTMLInputElement | null;
    saveButton: HTMLButtonElement | null;
}
export type elementMenu = {
    Type: HTMLSelectElement | null;
    Status: HTMLSelectElement | null;
    tags: HTMLInputElement | null;
    notes: HTMLInputElement | null;
    saveButton: HTMLButtonElement | null;
}

export type elementsInputAndMenu = elementInput |  elementMenu;

export interface ElmentsWithInputAndMenu {
    input: {
        Type: HTMLSelectElement | null,
        Status: HTMLSelectElement | null,
        tags: HTMLInputElement | null,
        notes: HTMLInputElement | null,
        saveButton: HTMLButtonElement | null
    },
    menu: {
        Type: HTMLSelectElement | null,
        Status: HTMLSelectElement | null,
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
    version: 5,
    spreadsheetUrl: '',
    darkMode: true,
    DefaultChoice : {
        Type : 'Manga',
        status : 'Viewing',
        tags : [''],
        notes : ''
    },
    DefaultChoiceText_Menu : {
        Type : 'Manga',
        status : 'Planned',
        tags : [''],
        notes : ''
    },
    TYPE_OPTIONS : [...DEFAULT_NOVEL_TYPES],
    STATUS_OPTIONS : [...DEFAULT_READ_STATUSES],
    NOVEL_STATUS_OPTIONS: [...DEFAULT_NOVEL_STATUSES],

    tagColoring: {},
    FolderMapping: CustomFoldermapping,
    AllowContextMenu : true,
};