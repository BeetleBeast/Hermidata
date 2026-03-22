import type { NovelType, ReadStatus } from "./popupType";

export interface DefaultChoice {
    Type : NovelType,
    chapter : number,
    status : ReadStatus,
    tags : string[],
    notes : string
}

type FolderEntry = { path: string }

export interface SettingsInput {
    DefaultChoice: DefaultChoice,
    DefaultChoiceText_Menu: DefaultChoice,

    TYPE_OPTIONS : NovelType[],
    STATUS_OPTIONS : ReadStatus[],
    NOVEL_TYPE_OPTIONS_V3: string[],
    NOVEL_TYPE_OPTIONS_V2: string[],
    NOVEL_STATUS_OPTIONS_V2: string[],
    READ_STATUS_OPTIONS_V2: string[],
    tagColoring: Record<string, string>,
    // FolderMapping: Record< TypeOptions, Record<StatusOptions, Record<string, path>>>
    FolderMapping: Record<string, Record<string, FolderEntry>>,

    AllowContextMenu: boolean
}


export const defaultSettings: SettingsInput = {
        DefaultChoice : {
            Type : 'Manga',
            chapter : 0,
            status : 'Viewing',
            tags : [''],
            notes : ''
        },
        DefaultChoiceText_Menu : {
            Type : 'Manga',
            chapter : 0,
            status : 'Planned',
            tags : [''],
            notes : ''
        },
        TYPE_OPTIONS : ["Manga", "Novel", "Anime", "TV-Series"],
        STATUS_OPTIONS : ["Finished", "Viewing", "Dropped", "Planned"],

        NOVEL_TYPE_OPTIONS_V3: ['Manga', 'Manhwa', 'Manhua', 'Novel', 'Webnovel', 'Anime', "TV-Series"],
        NOVEL_TYPE_OPTIONS_V2: ['Manga', 'Manhwa', 'Manhua', 'Novel', 'Webnovel'],
        NOVEL_STATUS_OPTIONS_V2: ['Ongoing', 'Completed', 'Hiatus', 'Canceled'],
        READ_STATUS_OPTIONS_V2: ['Viewing', 'Finished', 'On-hold', 'Dropped', 'Planned'],
        tagColoring: {},
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