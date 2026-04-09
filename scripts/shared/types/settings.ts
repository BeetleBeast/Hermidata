import { DEFAULT_NOVEL_STATUSES, DEFAULT_NOVEL_TYPES, DEFAULT_READ_STATUSES, type AnyNovelStatus, type AnyNovelType, type AnyReadStatus } from "./popup";

export interface DefaultChoice {
    Type : AnyNovelType,
    status : AnyReadStatus,
    tags : string[],
    notes : string
}

type FolderEntry = { path: string }

export interface Settings {
    spreadsheetUrl: string;
    
    darkMode: boolean;

    DefaultChoice: DefaultChoice,
    DefaultChoiceText_Menu: DefaultChoice,

    TYPE_OPTIONS : AnyNovelType[],
    STATUS_OPTIONS : AnyReadStatus[],
    NOVEL_STATUS_OPTIONS: AnyNovelStatus[],

    NOVEL_TYPE_OPTIONS_V3: string[],
    NOVEL_TYPE_OPTIONS_V2: string[],
    NOVEL_STATUS_OPTIONS_V2: string[],
    READ_STATUS_OPTIONS_V2: string[],
    tagColoring: Record<string, string>,
    // FolderMapping: Record< TypeOptions, Record<StatusOptions, Record<string, path>>>
    FolderMapping: Record<string, Record<string, FolderEntry>>,
    FolderMappingV2: FolderMapping,

    AllowContextMenu: boolean
}

export type FolderMapping = {
    root: string                          // "Manga - Anime - Novels - TV-Series"
    statusFolders: Record<string, string> // status → folder name
    overrides?: FolderRule[]              // optional type+status specific overrides
    defaultPath: string                   // fallback for unknown types/statuses
}

export type FolderRule = {
    type?: string     // string not NovelType — handles user-defined types
    status?: string   // string not ReadStatus — handles user-defined statuses
    path: string
}
// new one 
/*
export interface Settings {
    spreadsheetUrl: string;
    darkMode: boolean;
    
    DefaultChoice: DefaultChoice,
    DefaultChoiceText_Menu: DefaultChoice,
    
    FolderMapping: Record<string, Record<string, { path: string }>>;
    
    AllowContextMenu: boolean;
}
*/
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
    overrides: [
        // Manga has a deeper path for Viewing
        {
            type: 'Manga',
            status: 'Viewing',
            path: 'Manga - Anime - Novels - TV-Series/Manga/Currently - Reading/Reading'
        },
        // Manga Planned also differs
        {
            type: 'Manga',
            status: 'Planned',
            path: 'Manga - Anime - Novels - TV-Series/Manga/Currently - Reading/future watch'
        },
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

    NOVEL_TYPE_OPTIONS_V3: ['Manga', 'Manhwa', 'Manhua', 'Novel', 'Webnovel', 'Anime', "TV-Series"],
    NOVEL_TYPE_OPTIONS_V2: ['Manga', 'Manhwa', 'Manhua', 'Novel', 'Webnovel'],
    NOVEL_STATUS_OPTIONS_V2: ['Ongoing', 'Completed', 'Hiatus', 'Canceled'],
    READ_STATUS_OPTIONS_V2: ['Viewing', 'Finished', 'On-hold', 'Dropped', 'Planned'],
    tagColoring: {},
    FolderMappingV2: CustomFoldermapping,
    FolderMapping: {
        Manga: {
            Finished: {
                path: "Manga - Anime - Novels - TV-Series/Manga/Finished"
                },
            Viewing: {
                path: "Manga - Anime - Novels - TV-Series/Manga/Currently - Reading/Reading"
                },
            Dropped: {
                path: "Manga - Anime - Novels - TV-Series/Manga/Abandond"
                },
            Planned: {
                path: "Manga - Anime - Novels - TV-Series/Manga/Currently - Reading/future watch"
                }
            },
        Novel: {
            Finished: {
                path: "Manga - Anime - Novels - TV-Series/Novels/Finished"
                },
            Viewing: {
                path: "Manga - Anime - Novels - TV-Series/Novels/Currently - Reading"
                },
            Dropped: {
                path: "Manga - Anime - Novels - TV-Series/Novels/Abandond"
                },
            Planned: {
                path: "Manga - Anime - Novels - TV-Series/Novels/Planned"
                },
            },
        Anime: {
            Finished: {
                path: "Manga - Anime - Novels - TV-Series/Anime/Finished"
            },
            Viewing: {
                path: "Manga - Anime - Novels - TV-Series/Anime/Currently - Reading"
                },
            Dropped: {
                path: "Manga - Anime - Novels - TV-Series/Anime/Abandond"
                },
            Planned: {
                path: "Manga - Anime - Novels - TV-Series/Anime/Planned"
                },
            },
        'TV-Series': {
            Finished: {
                path: "Manga - Anime - Novels - TV-Series/TV-Series/Finished"
                },
            Viewing: {
                path: "Manga - Anime - Novels - TV-Series/TV-Series/Currently - Reading"
                },
            Dropped: {
                path: "Manga - Anime - Novels - TV-Series/TV-Series/Abandond"
                },
            Planned: {
                path: "Manga - Anime - Novels - TV-Series/TV-Series/Planned"
            },
        },
    },
    AllowContextMenu : true,
};