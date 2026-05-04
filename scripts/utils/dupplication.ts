import { detectHashType, getOldIDType, migrateHermidataV5, migrationSteps } from "../popup/core/migrate";
import { CalcDiff, PastHermidata } from "../popup/core/Past";
import { returnHashedTitle } from "../shared/StringOutput";
import { getAllHermidata, updateHermidataV3 } from "../shared/db/Storage";
import { defaultSettings, type AllHermidata, type AnyNovelStatus, type AnyNovelType, type AnyReadStatus, type DefaultChoice, type NotificationTypes, type Settings, type FolderMapping } from "../shared/types/index";
import { migrateFolderMapping } from "../settings/build/ImportsAndExports";
import { putSettings } from "../shared/db/db";



export class Duplicate  {

    private AllHermidata: AllHermidata | undefined;
    
    public async init() {
        this.AllHermidata = await PastHermidata.getAllHermidata();
    }

    public async findPotentialDuplicates(threshold = 0.9) {
        
        const data = this.AllHermidata || await getAllHermidata();
        const entries = Object.entries(data);
        const duplicates = [];

        console.group("[Dupplication] Duplicate Title Scan");

        for (let i = 0; i < entries.length; i++) {
            const [keyA, valA] = entries[i];
            for (let j = i + 1; j < entries.length; j++) {
                const [keyB, valB] = entries[j];

                // Skip if same source and title already identical
                if (valA.source === valB.source && valA.title === valB.title && valA.id === valB.id ) continue;

                const score = CalcDiff(valA.title, valB.title);
                if (score >= threshold) {
                    duplicates.push({
                        keyA,
                        keyB,
                        titleA: valA.title,
                        titleB: valB.title,
                        sourceA: valA.source,
                        sourceB: valB.source,
                        score
                    });

                    console.warn(
                        `[DUPLICATE ${score.toFixed(2)}]`,
                        `(${valA.source}) "${valA.title}" ↔ (${valB.source}) "${valB.title}"`
                    );
                }
            }
        }
        console.info(`Scan complete: found ${duplicates.length} potential duplicates.`);

        console.groupEnd();

        return duplicates;
    }
    /**
     * Entry to auto merge duplicates
     * @param {number} threshold - decimal number dictating the threshold of similarity to merge found entries
     * @returns - merged Keys, titles, sources and levenstein score
     */
    public async migrateAndAutoMergeDuplicates(threshold = 0.9) {
        // Step 1: migrate all old hashes first
        await this.migrateOldHashes();

        // Step 2: scan for duplicates
        console.log("Scanning for duplicates after migration...");
        const dups = await this.findPotentialDuplicates(threshold);

        if (!dups.length) {
            console.log("No duplicates found after migration.");
            return [];
        }

        console.warn(`Found ${dups.length} potential duplicates.`);
        console.table(
            dups.map(d => ({
                TitleA: d.titleA,
                TitleB: d.titleB,
                Score: d.score.toFixed(2),
            }))
        );

        // Step 3: automatically merge them
        for (const dup of dups) {
            await this.autoMergeDuplicate(dup.keyA, dup.keyB);
        }

        console.log("All possible duplicates processed.");
        return dups;
    }
    /**
     * Automatically merges two entries by picking the one
     * with the highest chapter.latest (or the newest update).
     */
    public async autoMergeDuplicate(idA: string, idB: string) {
        const data = this.AllHermidata || await getAllHermidata();
        const objA = data[idA];
        const objB = data[idB];
    
        if (!objA || !objB) {
            console.warn(`Skipping missing objects:`, idA, idB);
            return;
        }
    
        // Compare chapter.latest as "progress"
        const latestA = objA.chapter?.latest ?? 0;
        const latestB = objB.chapter?.latest ?? 0;
    
        // Pick which one is "newer"
        let newer = objA;
        let older = objB;
        if (latestB > latestA) [newer, older] = [objB, objA];
    
        const newerHashType = detectHashType(newer);
        const olderHashType = detectHashType(older);
        console.log(`Auto-merging "${older.title}" → "${newer.title}"`,
            `\n newer hash: ${newerHashType}`,
            `\n older hash: ${olderHashType}`
        );
        // check if Hash is the old way
        // Use your existing migrateHermidataV5 logic
        const merged = await migrateHermidataV5(newer, older,
            olderHashType === 'old' ? 'OLD' : 'DEFAULT',
            newerHashType === 'old' ? 'OLD' : 'DEFAULT'
        );
    
        // Save and remove the old entry key
        if (merged) {
            await updateHermidataV3(older.id, merged.id, merged);
            console.log(`Merged "${older.title}" into "${newer.title}"`);
        } else {
            console.error(`Merge failed for:`, older.title, newer.title);
        }
    }
    
    
    /**
     * Select 2 ID's wich the user wants to merge
     * @param {String} id1 
     * @param {String} id2 
     */
    public async SelectDuplicates(id1: string, id2: string) {
        const data = this.AllHermidata || await getAllHermidata();
        const obj1 = data[id1];
        const obj2 = data[id2];
        const finalObj = await migrationSteps(obj1, obj2);
        console.log('finalObj is: ',finalObj)
    }
    /**
     * compare the similarity between both inputs
     * @param {String} id1 
     * @param {String} id2 
     * @returns {Premise<{
     * keyA: String
     * keyB: String
     * titleA: String
     * titleB: String
     * sourceA: String
     * sourceB: String
     * RSSA: object|null
     * RSSB: object|null
     * score: number
     * }>}
     */
    public async findDuplicatescore(id1: string, id2: string) {
        const data = this.AllHermidata || await getAllHermidata();
        const score = CalcDiff(data[id1].title, data[id2].title);
        let output = []
        output.push({
            keyA: id1,
            keyB: id2,
            titleA: data[id1].title,
            titleB: data[id2].title,
            sourceA: data[id1].source,
            sourceB: data[id2].source,
            RSSA: data[id1]?.rss || null,
            RSSB: data[id2]?.rss || null,
            score: score
        })
        return output;
    }

    public async detectOldHashEntries() {
        const all = this.AllHermidata || await getAllHermidata();
        const results = [];

        for (const [key, obj] of Object.entries(all)) {
            const oldHash = getOldIDType(obj);
            const newHash = returnHashedTitle(obj.title, obj.type);

            if (obj.id === oldHash && oldHash !== newHash) {
                results.push({
                    key,
                    title: obj.title,
                    type: obj.type,
                    source: obj.source,
                    oldHash,
                    newHash
                });
            }
        }

        console.table(results);
        console.info(`Found ${results.length} entries using the old hash method.`);
        return results;
    }

    public async migrateOldHashes() {
        const oldEntries = await this.detectOldHashEntries();
        if (!oldEntries.length) {
            console.log("No old-hash entries found — everything is already up to date!");
            return;
        }

        const all = this.AllHermidata || await getAllHermidata();

        for (const entry of oldEntries) {
            const older = all[entry.oldHash];
            const newer = { ...older, id: entry.newHash };
            try {
                await migrateHermidataV5(newer, older, 'YES');
            } catch (err) {
                console.error(`Migration failed for ${entry.title}:`, err);
            }
        }

        console.log(`Finished migrating ${oldEntries.length} entries to new hash.`);
    }

    public async migrateAndCheckDuplicates() {
        await this.migrateOldHashes();
        console.log("Now scanning for duplicates...");
        const dups = await this.findPotentialDuplicates(0.9);

        if (dups.length === 0) {
            console.log("No duplicates found after migration.");
        } else {
            console.warn(`Found ${dups.length} potential duplicates.`);
            console.table(dups.map(d => ({
                TitleA: d.titleA,
                TitleB: d.titleB,
                Score: d.score.toFixed(2)
            })));
        }

        return dups;
    }

}
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

export async function  migrateSettingsToLatest(settings: oldSettingsV5 | oldSettingsV4 | unknown, version: number): Promise<void> {
    const upgrade = (knownSettings: oldSettingsV5 | oldSettingsV4, defaultSettings: Settings): Settings => {
        // Type guard to check if it's already the new FolderMapping format
        const isFolderMapping = (value: any): value is FolderMapping => {
            return value && 
                typeof value === 'object' && 
                'root' in value && 
                'statusFolders' in value && 
                'defaultPath' in value;
        }
        const migratedFolderMapping: FolderMapping = isFolderMapping(knownSettings.FolderMapping)
            ? knownSettings.FolderMapping : migrateFolderMapping( knownSettings.FolderMapping as Record<string, Record<string, FolderEntry>>,  defaultSettings.FolderMapping.root );
        const result: Settings = {...defaultSettings,
            version: 6,
            AccountAndConnections: {
                spreadsheetUrl: knownSettings.spreadsheetUrl
            },
            ExtensionBehaviour: {
                EnableLightMode: knownSettings.darkMode ? false : true,
                AllowContextMenu: knownSettings.AllowContextMenu,
                EnableNotification: "None" as NotificationTypes,
                EnableKeyboardShortcuts: false as boolean,
                EnableAutoSubscribe: false as boolean,
                SaveTarget: {
                    internalCollection: true,
                    GoogleSpreadsheet: true as boolean,
                    BrowserBookmark: true as boolean
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
            FolderMapping: migratedFolderMapping,
        };
        return result;
    };
    if (version === 5) {
        console.warn("Settings version is newer than expected. Attempting best-effort migration.");
        const knownSettings = settings as oldSettingsV5;
        const result: Settings = upgrade(knownSettings, defaultSettings);
        await putSettings(result);
    }

    if (version === 4 || !version || version < 4) {
        const knownSettings = settings as oldSettingsV4;
        
        const result: Settings = upgrade(knownSettings, defaultSettings);
        await putSettings(result);
    }
}