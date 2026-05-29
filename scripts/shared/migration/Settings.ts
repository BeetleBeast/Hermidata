import { defaultSettings } from "../constants";
import { putSettings } from "../db/db";
import { type AnyNovelStatus, type AnyNovelType, type AnyReadStatus, type Settings, type FolderMapping, type FolderRule, type NotificationTypes, type SaveTargets, type DefaultChoice } from "../types/index";

type FolderEntry = { path: string }

interface oldSettingsV4 {
    spreadsheetUrl: string;
    
    darkMode: boolean;

    DefaultChoice: DefaultChoice_V5,
    DefaultChoiceText_Menu: DefaultChoice_V5,

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
interface DefaultChoice_V5 {
    Type : AnyNovelType,
    status : AnyReadStatus,
    tags : string[],
    notes : string
}
interface oldSettingsV5 {
    version: number;

    spreadsheetUrl: string;

    darkMode: boolean;

    DefaultChoice: DefaultChoice_V5,
    DefaultChoiceText_Menu: DefaultChoice_V5,

    TYPE_OPTIONS : AnyNovelType[],
    STATUS_OPTIONS : AnyReadStatus[],
    NOVEL_STATUS_OPTIONS: AnyNovelStatus[],

    tagColoring: Record<string, string>,
    FolderMapping: FolderMapping,

    AllowContextMenu: boolean
}

interface oldSettingsV6 {
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

type oldFoldermapping = Record<string, Record<string, FolderEntry>>;

export class SettingsMigration {
    private static getLatestFolderMappingFromPotentiallyOldFolderMapping( folderMapping: oldFoldermapping | FolderMapping ): FolderMapping {
        const isFolderMapping = (value: any): value is FolderMapping => {
            return value && 
                typeof value === 'object' && 
                'root' in value && 
                'statusFolders' in value && 
                'defaultPath' in value;
        };
        const migratedFolderMapping: FolderMapping = isFolderMapping(folderMapping)
            ? folderMapping : SettingsMigration.migrateFolderMapping( folderMapping as oldFoldermapping,  defaultSettings.FolderMapping.root );
        return migratedFolderMapping;
    }
    public static async migrateSettingsToLatest(settings: oldSettingsV6 | oldSettingsV5 | oldSettingsV4 | unknown, version: number): Promise<void> {
        let current = settings;

        if (version <= 4) current = this.migrateV4toV5(current as oldSettingsV4);
        if (version <= 5) current = this.migrateV5toV6(current as oldSettingsV5);
        if (version <= 6) current = this.migrateV6toV7(current as oldSettingsV6);

        await putSettings(current as Settings);
    }

    private static migrateV4toV5(data: oldSettingsV4): oldSettingsV5 {
        return {
            version: 5,
            spreadsheetUrl: data.spreadsheetUrl,
            darkMode: data.darkMode,
            DefaultChoice: data.DefaultChoice,
            DefaultChoiceText_Menu: data.DefaultChoiceText_Menu,
            TYPE_OPTIONS: data.TYPE_OPTIONS,
            STATUS_OPTIONS: data.STATUS_OPTIONS,
            NOVEL_STATUS_OPTIONS: data.NOVEL_STATUS_OPTIONS,
            tagColoring: data.tagColoring,
            FolderMapping: this.getLatestFolderMappingFromPotentiallyOldFolderMapping(data.FolderMappingV2 ?? data.FolderMapping),
            AllowContextMenu: data.AllowContextMenu,
        };
    }

    private static migrateV5toV6(data: oldSettingsV5): oldSettingsV6 {
        return {
            version: 6,
            AccountAndConnections: { spreadsheetUrl: data.spreadsheetUrl },
            ExtensionBehaviour: {
                EnableLightMode: !data.darkMode,
                AllowContextMenu: data.AllowContextMenu,
                EnableNotification: "None",
                EnableKeyboardShortcuts: false,
                EnableAutoSubscribe: false,
                SaveTarget: { internalCollection: true, GoogleSpreadsheet: true, BrowserBookmark: true },
            },
            DefaultBookmarkSettings: {
                DefaultChoice: {
                    novelStatus: defaultSettings.DefaultBookmarkSettings.DefaultChoice.novelStatus,
                    novelType: data.DefaultChoice.Type,
                    readStatus: data.DefaultChoice.status,
                    tags: data.DefaultChoice.tags,
                    notes: data.DefaultChoice.notes,
                },
                DefaultChoiceText_Menu: {
                    novelStatus: defaultSettings.DefaultBookmarkSettings.DefaultChoiceText_Menu.novelStatus,
                    novelType: data.DefaultChoiceText_Menu.Type,
                    readStatus: data.DefaultChoiceText_Menu.status,
                    tags: data.DefaultChoiceText_Menu.tags,
                    notes: data.DefaultChoiceText_Menu.notes,
                },
            },
            ContentTypesAndStatuses: {
                TYPE_OPTIONS: data.TYPE_OPTIONS,
                STATUS_OPTIONS: data.STATUS_OPTIONS,
                NOVEL_STATUS_OPTIONS: data.NOVEL_STATUS_OPTIONS,
            },
            TagManagement: { tagColoring: data.tagColoring },
            FolderMapping: data.FolderMapping,
        };
    }

    private static migrateV6toV7(data: oldSettingsV6): Settings {
        return {
            version: 7,
            ExtensionBehaviour: {
                ...data.ExtensionBehaviour,
                AutoSubscribe: {
                    EnableAutoSubscribe: false,
                    AllowSimilarityScanning: false,
                    Threshold: 1.0,
                    HermidataNotLinkedToRSS: {},
                },
                AutoSetStatusScore: {
                    onlyRSS: false,
                    allowAllDateFields: false,
                },
            },
            AccountAndConnections: data.AccountAndConnections,
            DefaultBookmarkSettings: data.DefaultBookmarkSettings,
            ContentTypesAndStatuses: data.ContentTypesAndStatuses,
            TagManagement: data.TagManagement,
            FolderMapping: data.FolderMapping,
        };
    }
    public static migrateFolderMapping( old: oldFoldermapping, root: string ): FolderMapping {
        // Collect status → folder name from the first type's entries
        const statusFolders: Record<string, string> = {}
        const typeAliases: Record<string, string> = {}
        const overrides: FolderRule[] = []

        const firstType = Object.values(old)[0] ?? {}
        for (const [status, { path }] of Object.entries(firstType)) {
            const segment = path.split('/').at(-1) ?? status
            statusFolders[status] = segment
        }

        const AllTypes = Object.entries(old) ?? {}
        for (const [type, { statuses: paths }] of AllTypes) {
            const path = paths.path
            const segment = path.split('/').at(1) ?? type
            typeAliases[type] = segment
        }

        // Anything that doesn't match the pattern becomes an override
        for (const [type, statuses] of Object.entries(old)) {
            for (const [status, { path }] of Object.entries(statuses)) {
                const expected = `${root}/${type}/${statusFolders[status]}`
                if (path !== expected) {
                    overrides.push({ type, status, path })
                }
            }
        }

        return {
            root,
            statusFolders,
            typeAliases, // No type aliases in old format
            overrides,
            defaultPath: `${root}/Unsorted`
        }
    }
}