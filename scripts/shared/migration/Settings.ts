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
    private static upgrade(knownSettings: oldSettingsV5 | oldSettingsV4, defaultSettings: Settings): Settings {
        // Type guard to check if it's already the new FolderMapping format
        

        const result: Settings = {
            version: 7,
            AccountAndConnections: {
                spreadsheetUrl: knownSettings.spreadsheetUrl
            },
            ExtensionBehaviour: {
                EnableLightMode: knownSettings.darkMode ? false : true,
                AllowContextMenu: knownSettings.AllowContextMenu,
                EnableNotification: "None" as NotificationTypes,
                EnableKeyboardShortcuts: false as boolean,
                AutoSubscribe: {
                    EnableAutoSubscribe: false as boolean,
                    AllowSimilarityScanning: false as boolean,
                    Threshold: 1.0,
                    HermidataNotLinkedToRSS: {}
                },
                SaveTarget: {
                    internalCollection: true,
                    GoogleSpreadsheet: true as boolean,
                    BrowserBookmark: true as boolean
                },
                AutoSetStatusScore: {
                    onlyRSS: false,
                    allowAllDateFields: false,
                }
            },
            DefaultBookmarkSettings: {
                DefaultChoice: { 
                    novelStatus: defaultSettings.DefaultBookmarkSettings.DefaultChoice.novelStatus,
                    novelType: knownSettings.DefaultChoice.Type, 
                    readStatus: knownSettings.DefaultChoice.status,
                    tags: knownSettings.DefaultChoice.tags,
                    notes: knownSettings.DefaultChoice.notes
                },
                DefaultChoiceText_Menu: {
                    novelStatus: defaultSettings.DefaultBookmarkSettings.DefaultChoiceText_Menu.novelStatus,
                    novelType: knownSettings.DefaultChoiceText_Menu.Type, 
                    readStatus: knownSettings.DefaultChoiceText_Menu.status,
                    tags: knownSettings.DefaultChoiceText_Menu.tags,
                    notes: knownSettings.DefaultChoiceText_Menu.notes
                }
            },
            ContentTypesAndStatuses: {
                TYPE_OPTIONS: knownSettings.TYPE_OPTIONS,
                STATUS_OPTIONS: knownSettings.STATUS_OPTIONS,
                NOVEL_STATUS_OPTIONS: knownSettings.NOVEL_STATUS_OPTIONS,
            },
            TagManagement: {
                tagColoring: knownSettings.tagColoring
            },
            FolderMapping: SettingsMigration.getLatestFolderMappingFromPotentiallyOldFolderMapping( knownSettings.FolderMapping ),
        };
        return result;
    };
    public static async migrateSettingsToLatest(settings: oldSettingsV6 | oldSettingsV5 | oldSettingsV4 | unknown, version: number): Promise<void> {
        if (version === 6) {
            const knownSettings = settings as oldSettingsV6;
            const result: Settings = {
                ...knownSettings,
                version: 7,
                ExtensionBehaviour: {
                    EnableLightMode: knownSettings.ExtensionBehaviour.EnableLightMode,
                    AllowContextMenu: knownSettings.ExtensionBehaviour.AllowContextMenu,
                    AutoSubscribe: {
                        EnableAutoSubscribe: knownSettings.ExtensionBehaviour.AllowContextMenu,
                        AllowSimilarityScanning: false as boolean,
                        Threshold: 1.0,
                        HermidataNotLinkedToRSS: {}
                    },
                    EnableNotification: knownSettings.ExtensionBehaviour.EnableNotification,
                    EnableKeyboardShortcuts: knownSettings.ExtensionBehaviour.EnableKeyboardShortcuts,
                    SaveTarget: knownSettings.ExtensionBehaviour.SaveTarget,
                    AutoSetStatusScore: {
                        onlyRSS: false,
                        allowAllDateFields: false
                    },
                }
            }
            await putSettings(result);
        }
        if (version === 5) {
            console.warn("Settings version is newer than expected. Attempting best-effort migration.");
            const knownSettings = settings as oldSettingsV5;
            const result: Settings = SettingsMigration.upgrade(knownSettings, defaultSettings);
            await putSettings(result);
        }

        if (version === 4 || !version || version < 4) {
            const knownSettings = settings as oldSettingsV4;
            
            const result: Settings = SettingsMigration.upgrade(knownSettings, defaultSettings);
            await putSettings(result);
        }
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