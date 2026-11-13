import type { FolderMapping, Settings } from "../types";
import { DEFAULT_NOVEL_STATUSES, DEFAULT_NOVEL_TYPES, DEFAULT_READ_STATUSES, DEFAULT_TAG_COLOURS } from "./popup";
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


export const defaultSettings: Settings = {
    version: 8,
    AccountAndConnections: {
        spreadsheetUrl: '',
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