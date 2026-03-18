import type { Hermidata } from "../../shared/types/type";
import { confirmMigrationPrompt } from "../frontend/confirm";
import { returnHashedTitle, TrimTitle } from "../../shared/StringOutput";
import { getHermidataViaKey } from "../../shared/types/Storage";
import { ext } from "../../shared/BrowserCompat";
import { makeHermidataV3 } from "./save";
import type { Settings } from "../../shared/types/settings";

/**
 *  Detect if two Hermidata entries refer to the same series (by title similarity)
 */
function isSameSeries(a: Hermidata, b: Hermidata): boolean {
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

export async function migrateCopy(objs: Hermidata[]) {
    // Compare pairs and pick which one is newer vs older
    for (let i = 0; i < objs.length; i++) {
        for (let j = i + 1; j < objs.length; j++) {
            const obj1 = objs[i];
            const obj2 = objs[j];
            if (isSameSeries(obj1, obj2) && obj1.type !== obj2.type) return await migrationSteps(obj1, obj2);
        }
    }
    console.warn("No migratable pair found, returning most recent");
    objs.sort((a, b) => new Date(b.meta.updated || 0).getDate() - new Date(a.meta.updated || 0).getDate());
    return objs[0] || {};
}
export async function migrationSteps(obj1: Hermidata, obj2: Hermidata, options = {}) {
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
        const migrated = await migrateHermidataV5(newer, older);
        return migrated; // Stop after successful merge
    } else {
        console.log("User canceled migration; switching it up");
        // Confirm with clear indication which is which
        let New_older = newer;
        let New_newer = older
        const confirm_NewMerge = await confirmMigrationPrompt(New_newer, New_older, options );

        if (confirm_NewMerge) {
            const migrated = await migrateHermidataV5(New_newer, New_older);
            return migrated; // Stop after successful merge
        } else {
            console.log("User canceled migration; keeping newer data.");
            return newer;
        }   
    }
}
export async function tryToFindByOtherMeans(possibleObj: Hermidata[], HermidataV3: Hermidata) {
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
        sameTitleMatches.sort((a, b) => new Date(b.meta.updated || 0).getDate() - new Date(a.meta.updated || 0).getDate());
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




export async function migrateHermidataV5(newer: Hermidata, older: Hermidata, OLD_KEY = 'DEFAULT', NEW_KEY = 'DEFAULT') {
    // step 1. new key
    // re-make keys
    const [ newTitle, newType ] = [newer.title, newer.type]
    const [ oldTitle, oldType ] = [older.title, older.type]
    const newKey = NEW_KEY == 'DEFAULT' ? returnHashedTitle(newTitle, newType) : getOldIDType(newer);
    const oldKey = OLD_KEY == 'DEFAULT' ? returnHashedTitle(oldTitle, oldType) : getOldIDType(older);
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
            current: newer.chapter?.current ?? older.chapter?.current ?? 0,
            latest: newer.chapter?.latest ?? older.chapter?.latest ?? null,
            history: Array.from( new Set([...(older.chapter?.history || []), ...(newer.chapter?.history || [])]) ).sort((a, b) => a - b),
            lastChecked: newer.chapter?.lastChecked || older.chapter?.lastChecked || new Date().toISOString()
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
            altTitles: mergeAltTitles(
                newTitle,
                older.meta?.altTitles || [],
                newer.meta?.altTitles || [],
                [newer.title, older.title]
            ),
            added: older.meta?.added || base.meta.added,
            updated: new Date().toISOString(),
            originalRelease: null // TODO
        }
    }
    // step 3. save & remove key
    await ext.storage.sync.set({ [newKey]: merged });
    await ext.storage.sync.remove(oldKey);

    console.log(`Migrated from ${oldKey} → ${newKey}`);
    return merged;
}

export function detectHashType(obj: Hermidata) {
    if (!obj?.title || !obj?.type || !obj?.id) return "unknown";

    const normalizedTitle = TrimTitle.trimTitle(obj.title, obj.url).title.toLowerCase();

    const newHash = (() => {
        let hash = 0, chr;
        const str = `${obj.type}:${normalizedTitle}`;
        for (let i = 0; i < str.length; i++) {
            chr = str.codePointAt(i)!;
            hash = ((hash << 5) - hash) + chr;
            hash = Math.trunc(hash);
        }
        return hash.toString();
    })();

    if (obj.id === OLD_simpleHash(`${obj.type}:${normalizedTitle}`)) return "old";
    if (obj.id === newHash) return "new";
    return "unknown";
}

function OLD_simpleHash(str: string) {
    let hash = 0, i, chr;
    if (str.length === 0) return hash.toString();
    for (i = 0; i < str.length; i++) {
        chr = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0;
    }
    return hash.toString();
}


export function getOldIDType(Obj: Hermidata) {
    return OLD_simpleHash(`${Obj.type}:${TrimTitle.trimTitle(Obj.title, Obj.url).title.toLowerCase()}`);
}