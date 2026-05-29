import type { FolderMapping, Settings } from "../types";
import { DEFAULT_NOVEL_STATUSES, DEFAULT_NOVEL_TYPES, DEFAULT_READ_STATUSES, DEFAULT_TAG_COLOURS } from "./popup";

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
    version: 7,
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
        EnableKeyboardShortcuts: false,
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
    FolderMapping: CustomFoldermapping, // TODO: change to DefaultFoldermapping
};