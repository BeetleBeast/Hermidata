import type { FolderMapping, Settings } from "../types";
import { DEFAULT_NOVEL_STATUSES, DEFAULT_NOVEL_TYPES, DEFAULT_READ_STATUSES, DEFAULT_TAG_COLOURS } from "./popup";
import { DEFAULT_SHEET_NAME } from "../sheets/sheetConfig";
import { DEFAULT_KEYBOARD_SHORTCUTS } from "../utils/KeyboardShortcuts";

export const DEFAULT_FOLDER_MAPPING: FolderMapping = {
    root: 'Hermidata',
    statusFolders: {
        'Finished': 'Finished',
        'Viewing':  'Viewing',
        'Dropped':  'Dropped',
        'Planned':  'Planned',
        'On-hold':  'On-hold',
    },
    typeAliases: {},
    defaultPath: 'Unsorted'
}


export const DEFAULT_TOMBSTONE_TTL_DAYS = 30;
export const MAX_TOMBSTONE_TTL_DAYS = 3_650;
/** Whole days within 1..MAX_TOMBSTONE_TTL_DAYS; anything else falls back to the default */
export function resolveTombstoneTtlDays(days: number | undefined): number {
    return Number.isFinite(days) && days! >= 1 ? Math.min(Math.floor(days!), MAX_TOMBSTONE_TTL_DAYS) : DEFAULT_TOMBSTONE_TTL_DAYS;
}
/** Placeholders: {title} and {chapter} */
export const DEFAULT_BOOKMARK_TITLE_FORMAT = '{title} - Chapter {chapter}';

export const defaultSettings: Settings = {
    version: 9,
    AccountAndConnections: {
        spreadsheetUrl: '',
        sheetName: DEFAULT_SHEET_NAME,
    },
    ExtensionBehaviour: {
        EnableLightMode: false,
        AllowContextMenu : true,
        SaveTarget: {
            internalCollection: true,
            BrowserBookmark: true,
            GoogleSpreadsheet: false,
        },
        EnableKeyboardShortcuts: true,
        KeyboardShortcuts: { ...DEFAULT_KEYBOARD_SHORTCUTS },
        AutoSubscribe: {
            EnableAutoSubscribe: false,
            AllowSimilarityScanning: false,
            Threshold: 1.0,
            HermidataNotLinkedToRSS: {},
        },
        EnableNotification: 'None',
        AutoSetStatusScore: {
            onlyRSS: false,
            allowAllDateFields: false,
        },
        AltTitleLookup: {
            Enable: false,
        },
        TombstoneTtlDays: DEFAULT_TOMBSTONE_TTL_DAYS,
        BookmarkTitleFormat: DEFAULT_BOOKMARK_TITLE_FORMAT,
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
            tags : [],
            notes : ''
        },
        DefaultChoiceText_Menu: {
            novelType: 'Manga',
            readStatus: 'Planned',
            novelStatus: 'Ongoing',
            tags: [],
            notes: ''
        },
    },
    TagManagement: {
        tagColoring: DEFAULT_TAG_COLOURS,
    },
    FolderMapping: DEFAULT_FOLDER_MAPPING,
};