import { CalcDiff, PastHermidata } from "../../popup/core/Past";
import { makeHermidataV3 } from "../../popup/core/save";
import { confirmMigrationPrompt } from "../../popup/frontend/confirm";
import { getAllHermidata, isHermidataV6 } from "../db/db";
import { getHermidataViaKey, updateHermidataV3 } from "../db/Storage";
import { returnHashedTitle, TrimTitle } from "../StringOutput";
import type { AllHermidata, Bookmark, Hermidata, HermidataV5, PotentialSameHermidata } from "../types";


interface DuplicationResult {
    keyA: string;
    keyB: string;
    titleA: string;
    titleB: string;
    sourceA: string;
    sourceB: string;
    score: number;
}



export class HermidataMigration {

    private AllHermidata: AllHermidata | undefined;
    
    public async init() {
        this.AllHermidata = await PastHermidata.getAllHermidata();
    }
    /**
     *  Entry point to find potential duplicates by similarity score
     * @param threshold - The minimum similarity score for two entries to be considered duplicates
     * @returns 
     */
    public async findPotentialDuplicates(threshold: number = 0.9): Promise<Array<DuplicationResult>> {
        
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
     * @param threshold - decimal number dictating the threshold of similarity to merge found entries
     * @returns - merged Keys, titles, sources and levenstein score
     */
    public async migrateAndAutoMergeDuplicates(threshold: number = 0.9): Promise<Array<DuplicationResult>> {
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
    private async autoMergeDuplicate(idA: string, idB: string) {
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
    
        const newerHashType = HermidataMigration.detectHashType(newer);
        const olderHashType = HermidataMigration.detectHashType(older);
        console.log(`Auto-merging "${older.title}" → "${newer.title}"`,
            `\n newer hash: ${newerHashType}`,
            `\n older hash: ${olderHashType}`
        );
        // check if Hash is the old way
        // Use your existing migrateHermidataV5 logic
        const merged = await HermidataMigration.migrateHermidataV5(newer, older,
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

    public static async findPotentialSameHermidata(title: string, allHermidata: { [key: string]: Hermidata }, threshold: number): Promise<PotentialSameHermidata> {
        const data = allHermidata;
        const entries = Object.entries(data);
        const HermidataFound = [];

        for (let i = 0; i < entries.length; i++) {
            const [keyA, valA] = entries[i];
            // Skip if same source and title already identical
            if (valA.title === title) continue;

            const score = CalcDiff(valA.title, title);
            if (score >= threshold) {
                HermidataFound.push({
                    key: keyA,
                    titleFound: valA.title,
                    titleGiven: title,
                    score
                });
            }
        }
        if (HermidataFound.length > 1) {
            console.warn(`Found ${HermidataFound.length} potential Hermidata for title "${title}":`);
            console.table(
                HermidataFound.map(d => ({
                    TitleA: d.titleFound,
                    TitleB: d.titleGiven,
                    Score: d.score.toFixed(2),
                }))
            );
            return {
                result: null,
                found: true,
                amountFound: HermidataFound.length
            }
        }
        if (HermidataFound.length === 0) {
            return {
                result: null,
                found: false,
                amountFound: 0
            }
        }
        return {
            result: HermidataFound[0],
            found: true,
            amountFound: HermidataFound.length
        }
    }
    
    
    /**
     * Manual Entry to manually merge duplicates
     * Select 2 ID's wich the user wants to merge
     * @param {String} id1 
     * @param {String} id2 
     */
    public async SelectDuplicatesToMerge(id1: string, id2: string) {
        const data = this.AllHermidata || await getAllHermidata();
        const obj1 = data[id1];
        const obj2 = data[id2];
        const finalObj = await HermidataMigration.migrationSteps(obj1, obj2);
        console.log('finalObj is: ',finalObj)
    }
    /**
     * Manual Entry to compare two entries and get a similarity score
     * compare the similarity between both inputs
     * @param {String} id1 
     * @param {String} id2 
     * @returns {Premise<DuplicationResult[]>} - the similarity score and details of both entries
     */
    public async findDuplicatescore(id1: string, id2: string): Promise<DuplicationResult[]> {
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

    private async detectOldHashEntries() {
        const all = this.AllHermidata || await getAllHermidata();
        const results = [];

        for (const [key, obj] of Object.entries(all)) {
            const oldHash = HermidataMigration.getOldIDType(obj);
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

    private async migrateOldHashes() {
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
                await HermidataMigration.migrateHermidataV5(newer, older, 'YES');
            } catch (err) {
                console.error(`Migration failed for ${entry.title}:`, err);
            }
        }

        console.log(`Finished migrating ${oldEntries.length} entries to new hash.`);
    }
    /**
     * Entry to migrate duplicates by user selection
     * Migrates old hash entries and checks for duplicates
     * @returns 
     */
    public async migrateAndCheckDuplicates(): Promise<DuplicationResult[]> {
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


    /**
    *  Detect if two Hermidata entries refer to the same series (by title similarity)
    */
    private static isSameSeries(a: Hermidata, b: Hermidata): boolean {
        if (!a || !b) return false;
        const titleA = TrimTitle.trimTitle(a.title || '', a.url ?? '').title.toLowerCase();
        const titleB = TrimTitle.trimTitle(b.title || '', b.url ?? '').title.toLowerCase();
        if (!titleA || !titleB) return false;

        // Exact match or fuzzy match (ignoring punctuation)
        return (
            titleA === titleB ||
            titleA.replaceAll(/\W/g, "") === titleB.replaceAll(/\W/g, "")
        );
    }
    /**
     * Entry point to migrate duplicates by user selection
     * Migrates a list of Hermidata objects by finding and merging duplicates
     * @param objs - list of Hermidata objects that are potential duplicates of the same series
     * @returns - merged Hermidata object or null if migration was cancelled or failed
     */
    public static async migrateCopy(objs: Hermidata[]): Promise<Hermidata | null> {
        // Compare pairs and pick which one is newer vs older
        for (let i = 0; i < objs.length; i++) {
            for (let j = i + 1; j < objs.length; j++) {
                const obj1 = objs[i];
                const obj2 = objs[j];
                if (this.isSameSeries(obj1, obj2) && obj1.type !== obj2.type) return await this.migrationSteps(obj1, obj2);
            }
        }
        console.warn("No migratable pair found, returning most recent");
        objs.sort((a, b) => new Date(b.meta.updated || 0).getTime() - new Date(a.meta.updated || 0).getTime());
        return objs[0] || {};
    }
    private static async migrationSteps(obj1: Hermidata, obj2: Hermidata, options = {}) {
        // Pick by date or lastUpdated
        const date1 = new Date(obj1.meta.updated || 0);
        const date2 = new Date(obj2.meta.updated || 0);

        let newer = obj1;
        let older = obj2;

        if (date1 < date2) {
            newer = obj2;
            older = obj1;
        }

        // Confirm with clear indication which is which
        const confirmMerge = await confirmMigrationPrompt(newer, older, options );

        if (confirmMerge) {
            const migrated = await this.migrateHermidataV5(newer, older);
            return migrated; // Stop after successful merge
        } else {
            console.log("User canceled migration; switching it up");
            // Confirm with clear indication which is which
            let New_older = newer;
            let New_newer = older
            const confirm_NewMerge = await confirmMigrationPrompt(New_newer, New_older, options );

            if (confirm_NewMerge) {
                const migrated = await this.migrateHermidataV5(New_newer, New_older);
                return migrated; // Stop after successful merge
            } else {
                console.log("User canceled migration; keeping newer data.");
                return newer;
            }   
        }
    }
    public async tryToFindByOtherMeans(possibleObj: Hermidata[], HermidataV3: Hermidata) {
        // Try to find by URL domain or substring
        const urlDomain = HermidataV3.url ? new URL(HermidataV3.url).hostname.replace(/^www\./, '') : "";
        const byUrl = Object.values(possibleObj).find(item => {
            try {
                const storedDomain = new URL(item.url || "").hostname.replace(/^www\./, '');
                return storedDomain === urlDomain;
            } catch { return false; }
        });
        if (byUrl) return byUrl;

        // Try to find same title + newest date
        const sameTitleMatches = Object.values(possibleObj).filter(item => {
            return TrimTitle.trimTitle(item.title, item.url).title.toLowerCase() === TrimTitle.trimTitle(HermidataV3.title, HermidataV3.url).title.toLowerCase();
        });
        if (sameTitleMatches.length) {
            sameTitleMatches.sort((a, b) => new Date(b.meta.updated || 0).getTime() - new Date(a.meta.updated || 0).getTime());
            return sameTitleMatches[0];
        }
        // Prefer the same type if exists
        const typeKey = returnHashedTitle(HermidataV3.title, HermidataV3.type);
        if (possibleObj.some(item => item.id === typeKey)) return possibleObj.some(item => item.id === typeKey);

        // Fallback: old V1 hash (title only)
        const fallbackKey = returnHashedTitle(HermidataV3.title, HermidataV3.type, HermidataV3.url);
        const fallbackObj = await getHermidataViaKey(fallbackKey);
        if (fallbackObj) return fallbackObj;

        // Nothing found
        return '';
    }




    public  static async migrateHermidataV5(newer: Hermidata, older: Hermidata, OLD_KEY = 'DEFAULT', NEW_KEY = 'DEFAULT'): Promise<Hermidata | null> {
        // step 1. new key
        // re-make keys
        const [ newTitle, newType ] = [newer.title, newer.type]
        const [ oldTitle, oldType ] = [older.title, older.type]
        const newKey = NEW_KEY == 'DEFAULT' ? returnHashedTitle(newTitle, newType) : this.getOldIDType(newer);
        const oldKey = OLD_KEY == 'DEFAULT' ? returnHashedTitle(oldTitle, oldType) : this.getOldIDType(older);
        // check keys validity
        if ( newKey !== newer.id || oldKey !== older.id) return null;
        // step 2. start with shell
        const mergeAltTitles = (mainTitle: string, ...altLists: string[][]) => {
            return [
                mainTitle,
                ...Array.from(new Set( 
                    altLists.flat().filter(t => TrimTitle.trimTitle(t, '').title && TrimTitle.trimTitle(t, '').title !== TrimTitle.trimTitle(mainTitle, '').title) ) )
            ];
        }
        const base = makeHermidataV3(newTitle, newer.url || older.url, newType);
        const merged: Hermidata = {
            ...base,
            id: newKey,
            title: newTitle || oldTitle,
            type: newType || oldType,
            url: newer.url || older.url,
            source: newer.source || older.source,
            status: newer.status || older.status || "Planned",
            chapter: {
                bookmarks: {
                    ...older.chapter?.bookmarks,
                    ...newer.chapter?.bookmarks
                },
                latest: newer.chapter?.latest ?? older.chapter?.latest ?? null,
                lastChecked: newer.chapter?.lastChecked || older.chapter?.lastChecked || new Date().toISOString(),
                revisitingCount: newer.chapter?.revisitingCount || older.chapter?.revisitingCount || 0

            },
            rss: newer.rss || older.rss || null,
            import: newer.import || older.import || null,
            meta: {
                tags: Array.from(
                    new Set([
                        ...(older.meta?.tags || []),
                        ...(newer.meta?.tags || [])
                    ])
                ),
                notes: newer.meta?.notes || older.meta?.notes || "",
                altSources: mergeAltTitles(
                    newer.source || older.source,
                    older.meta?.altSources || [],
                    newer.meta?.altSources || [],
                    [newer.title, older.title]
                ),
                altTitles: mergeAltTitles(
                    newTitle,
                    older.meta?.altTitles || [],
                    newer.meta?.altTitles || [],
                    [newer.title, older.title]
                ),
                added: older.meta?.added || base.meta.added,
                updated: new Date().toISOString(),
                originalRelease: null, // TODO: do something with it
                novelStatus: newer.meta?.novelStatus || older.meta?.novelStatus,
                bookmarkInUse: newer.meta?.bookmarkInUse || older.meta?.bookmarkInUse || this.NEW_simpleHash('Primary')
            }
        }
        // step 3. save & remove key
        updateHermidataV3(oldKey, newKey, merged);

        return merged;
    }

    public static detectHashType(obj: Hermidata) {
        if (!obj?.title || !obj?.type || !obj?.id) return "unknown";

        const normalizedTitle = TrimTitle.trimTitle(obj.title, obj.url).title.toLowerCase();

        if (obj.id === this.OLD_simpleHash(`${obj.type}:${normalizedTitle}`)) return "old";
        if (obj.id === this.NEW_simpleHash(`${obj.type}:${normalizedTitle}`)) return "new";
        return "unknown";
    }

    private static OLD_simpleHash(str: string) {
        let hash = 0, i, chr;
        if (str.length === 0) return hash.toString();
        for (i = 0; i < str.length; i++) {
            chr = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0;
        }
        return hash.toString();
    }
    private static NEW_simpleHash(str: string) {
        let hash = 0, chr;
        for (let i = 0; i < str.length; i++) {
            chr = str.codePointAt(i)!;
            hash = ((hash << 5) - hash) + chr;
            hash = Math.trunc(hash);
        }
        return hash.toString();
    }


    public static getOldIDType(Obj: Hermidata) {
        return this.OLD_simpleHash(`${Obj.type}:${TrimTitle.trimTitle(Obj.title, Obj.url).title.toLowerCase()}`);
    }

    /**
     * @summary
     * upgrade Hermidata V5 to V6
     */
    public static migrateHermidataV6(older: HermidataV5): Hermidata {
        const label = 'Primary';

        const newBoomark: Bookmark = {
            id: this.NEW_simpleHash(label),
            current: Number(older.chapter?.current),
            history: this.forceHistoryIntoNumbers(older.chapter?.history),
            label: label,
            color: 'blue',
            createdAt: older.meta?.added,
            updatedAt: new Date().toISOString(),
            note: older.meta?.notes,
            isPrimary: true
        }
        const result: Hermidata = {
            id: older.id,
            title: older.title,
            type: older.type,
            url: older.url,
            source: older.source,
            status: older.status,
            chapter: {
                bookmarks: {
                    [newBoomark.id]: newBoomark
                },
                latest: older.chapter?.latest,
                lastChecked: older.chapter?.lastChecked,
                revisitingCount: 0
            },
            rss: older.rss,
            import: older.import,
            meta: {
                tags: older.meta?.tags,
                notes: older.meta?.notes,
                altSources: [older.source], // new
                altTitles: older.meta?.altTitles,
                added: older.meta?.added,
                updated: older.meta?.updated,
                originalRelease: older.meta?.originalRelease,
                novelStatus: older.meta?.novelStatus,
                bookmarkInUse: newBoomark.id
            }
        };
        return result;
    }
    private static forceHistoryIntoNumbers(history: number[] | (string | number)[]): number[] {
        // history had once a bug where it was a string[]
        // not all history entries are int/float values, so we have to convert them
        let result: number[] = [];
        for (const item of history) {
            if (typeof item === "string") result.push(Number(item));
            else result.push(item);
        }
        return result;
    }

}