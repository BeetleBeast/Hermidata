import { getAllHermidata, getHermidataViaKey, getSettings, saveHermidata, setAllHermidata } from "../db/Storage"
import type { AnyNovelStatus, AnyNovelType, Hermidata } from "../types"



export interface CalculateStatusReturnObject {
    EnoughInfo: boolean,
    value: {
        Decision: 'Keep' | 'Change',
        Status: AnyNovelStatus,
        Reason: string,
        InactiveDays: number
        Score: number // percantage of inactive days to next threshold
    } | null
}

export type statusScore = Record<Exclude<AnyNovelStatus, 'Completed'>, Record<AnyNovelType, { numberOfDaysInactive: number, reason?: string }>>

const statusScore: statusScore = {
    Ongoing: {
        Manga: {
            numberOfDaysInactive: 0,
        },
        Manhwa: {
            numberOfDaysInactive: 0,
        },
        Manhua: {
            numberOfDaysInactive: 0,
        },
        Novel: {
            numberOfDaysInactive: 0,
        },
        Webnovel: {
            numberOfDaysInactive: 0,
        },
        Anime: {
            numberOfDaysInactive: 0,
        },
        'TV-Series': {
            numberOfDaysInactive: 0,
        }
    },
    Hiatus: {
        Manga: {
            numberOfDaysInactive: 45, // 1 month as default progress + 2 weeks
        },
        Manhwa: {
            numberOfDaysInactive: 21, // 1 week as default progress + 2 weeks
        },
        Manhua: {
            numberOfDaysInactive: 21, // 1 week as default progress + 2 weeks
        },
        Novel: {
            numberOfDaysInactive: 548, // 1 year as default progress + half a year
        },
        Webnovel: {
            numberOfDaysInactive: 21, // 1 week as default progress + 2 weeks
        },
        Anime: {
            numberOfDaysInactive: 186, // 1 week as default progress with half a year as extra buffer
        },
        'TV-Series': {
            numberOfDaysInactive: 548, // 1 year as default progress + half a year
        }
    },
    Canceled: {
        Manga: {
            numberOfDaysInactive: 365, // set to 1 year
        },
        Manhwa: {
            numberOfDaysInactive: 365, // set to 1 year
        },
        Manhua: {
            numberOfDaysInactive: 365, // set to 1 year
        },
        Novel: {
            numberOfDaysInactive: 730, // set to 2 years
        },
        Webnovel: {
            numberOfDaysInactive: 365, // set to 1 year
        },
        Anime: {
            numberOfDaysInactive: 730, // set to 2 years
        },
        'TV-Series': {
            numberOfDaysInactive: 1500, // set to 4 years + extra buffer
        }
    }
}
// TODO: should be able to set status Score inside settings
/*
Options: 
    Based on any Date field
    Based only on RSS Date** - this option is the default & recommended option

* RSS Date is the date of the latest RSS item
* This will only work on linked Hermidata's, all otyhers will be ignored

---

inside settings be able to set the status score

*/

export async function calculateNovelStatusForAll(): Promise<boolean> {

    const newHermidataMap: Record<string, Hermidata> = {};

    const allHermidata = await getAllHermidata();
    console.groupCollapsed("[Novel Status Calculator] Calculating novel status for all hermidata");
    for (const [key, hermidata] of Object.entries(allHermidata)) {

        const result = await logStatus(hermidata);

        // if the status or novel type is not found return null
        if (!result.EnoughInfo) continue
        // if the status is not yet expired return null
        if (result.value?.Decision === 'Keep') continue

        // if the status is expired
        if (result.value?.Decision === 'Change') {
            hermidata.meta.novelStatus = result.value.Status;
            console.log(`[Novel Status Calculator] checking ${hermidata.title} for status change`);
            console.log(`[Novel Status Calculator] Changing novel status for ${key} to ${result.value.Status}`);
            console.table(result.value);
            newHermidataMap[key] = hermidata;
        }
    }
    console.groupEnd();
    
    // update all the hermidata at once
    if (Object.keys(newHermidataMap).length > 0) {
        await setAllHermidata(Object.values(newHermidataMap));
        return true
    }

    return false
}
export async function calculateNovelSatus(hermidataKey: string): Promise<boolean>;
export async function calculateNovelSatus(hermidata: Hermidata): Promise<boolean>;
export async function calculateNovelSatus(hermidataValue: string | Hermidata): Promise<boolean> {

    const hermidata =  (typeof hermidataValue === 'string') ? await getHermidataViaKey(hermidataValue) : hermidataValue;

    // if the hermidata is not found return false
    if (!hermidata) return false;

    const result = await logStatus(hermidata);

    // if the status or novel type is not found return null
    if (!result.EnoughInfo) return false
    // if the status is not yet expired return null
    if (result.value?.Decision === 'Keep') return false

    // if the status is expired
    if (result.value?.Decision === 'Change') {

        hermidata.meta.novelStatus = result.value.Status;
        console.table(result.value);
        // update hermidata
        await saveHermidata(hermidata.id, hermidata);
        return true
    }
    return false
}
async function init(HermidataUpdated: string, lastChecked: string, RSSLatestItemPubDate: Date | undefined): Promise<number> {
    
    const settings = await getSettings();
    const onlyRSSStatusScore = settings.ExtensionBehaviour.AutoSetStatusScore.onlyRSS;
    const allowAllDateFields = settings.ExtensionBehaviour.AutoSetStatusScore.allowAllDateFields;

    // if both options are false return 0
    if (!allowAllDateFields && !onlyRSSStatusScore) return 0
    // of both options are true return 0
    else if (onlyRSSStatusScore && allowAllDateFields) return 0 // this is a impossible case but implemented just in case
    // if onlyRSSStatusScore is set but has no value
    else if (onlyRSSStatusScore && !RSSLatestItemPubDate) return 0
    else if (allowAllDateFields) {
        const updated = new Date(HermidataUpdated).getTime();
        const checked = new Date(lastChecked).getTime();
        const rss = new Date(RSSLatestItemPubDate || 0).getTime();
        
        // take only the latest one
        const lastDateUpdated = Math.max(updated, checked, rss);
    
        const today = new Date().getTime();
    
        // get the amount of days since last update
        const numberOfDaysInactive = Math.floor((today - lastDateUpdated) / (1000 * 60 * 60 * 24));
        return numberOfDaysInactive
    }
    else if (onlyRSSStatusScore) {
        const rss = new Date(RSSLatestItemPubDate || 0).getTime();
        const today = new Date().getTime();
    
        // get the amount of days since last update
        const numberOfDaysInactive = Math.floor((today - rss) / (1000 * 60 * 60 * 24));
        return numberOfDaysInactive
    }
    else return 0
}
async function logStatus(Hermidata: Hermidata): Promise<CalculateStatusReturnObject> {
    const numberOfDaysInactive = await init(Hermidata.meta.updated, Hermidata.chapter.lastChecked, Hermidata.rss?.latestItem?.pubDate);
    
    const settings = await getSettings();
    const typeAliases = settings.FolderMapping.typeAliases;

    const findKeyOfValue = (obj: Record<string, string>, value: string) => Object.keys(obj).find(key => obj[key] === value);

    const trueCurrentType = typeAliases ? findKeyOfValue(typeAliases, Hermidata.novelType) ?? Hermidata.novelType : Hermidata.novelType;
    const currentNovelStatus = Hermidata.meta.novelStatus ?? 'Ongoing';

    if (currentNovelStatus === "Completed") return { EnoughInfo: false, value: null };

    const nextNovelStatus = calculateNextStatus(currentNovelStatus);

    if (currentNovelStatus === nextNovelStatus) return { EnoughInfo: false, value: null };

    // if the status or novel type is not found give return null
    if (!statusScore[currentNovelStatus][trueCurrentType]) return { EnoughInfo: false, value: null };
    

        if (numberOfDaysInactive >= statusScore[nextNovelStatus][trueCurrentType].numberOfDaysInactive) return { 
            EnoughInfo: true, 
            value: {
                Decision: 'Change',
                Status: nextNovelStatus, 
                Reason: statusScore[nextNovelStatus][trueCurrentType].reason ?? 'The novel has been inactive for ' + numberOfDaysInactive + ' days',
                InactiveDays: numberOfDaysInactive,
                Score: numberOfDaysInactive / statusScore[nextNovelStatus][trueCurrentType].numberOfDaysInactive

            }
        };

        return { 
            EnoughInfo: true, 
            value: {
                Decision: 'Keep',
                Status: currentNovelStatus, 
                Reason: statusScore[currentNovelStatus][trueCurrentType].reason ?? 'The novel has been inactive for ' + numberOfDaysInactive + ' days well below the next  threshold',
                InactiveDays: numberOfDaysInactive,
                Score: numberOfDaysInactive / statusScore[nextNovelStatus][trueCurrentType].numberOfDaysInactive
            } 
        };
}
function calculateNextStatus(currentStatus: Exclude<AnyNovelStatus, 'Completed'>): AnyNovelStatus {

    switch (currentStatus) {
        case 'Ongoing':
            return 'Hiatus';
        case 'Hiatus':
            return 'Canceled';
        case 'Canceled':
            return 'Canceled';
    }
    return 'Ongoing';
}