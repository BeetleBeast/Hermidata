import type { Hermidata } from "./types/popupType";
import { ext } from "./BrowserCompat";
import type { RawFeed } from "./types/rssType";
import { defaultSettings, type SettingsInput as Settings } from "./types/settings";
import { getElement, setElement } from "../utils/Selection";
import type { AllsortsType, Filters } from "./types/rssBuildType";
import { CalcDiff } from "../popup/core/Past";

export async function getHermidataViaKey(key: string): Promise<Hermidata | null> {
    return new Promise<Hermidata | null>((resolve, reject) => {
        ext.storage.sync.get([key], (result: Record<string, Hermidata>) => {
            if (ext.runtime.lastError) return reject(new Error(`${ext.runtime.lastError.message}`));
            resolve(result?.[key] ?? null);
        });
    }).catch(error => {
        console.error('Failed to get Hermidata for key:', key, error);
        return null;
    })
}

function isHermidata(value: unknown): value is Hermidata {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as Hermidata).title === 'string' &&
        typeof (value as Hermidata).url === 'string'
        // add whatever fields are truly required
    );
}

export async function getAllHermidata(): Promise<Record<string, Hermidata>> {
    // get all data
    const allData = await getAllData();

    // filter
    const allHermidata = filterDataFromStorage(allData);

    // log
    const count = Object.keys(allHermidata).length;
    if (count === 0) console.warn('No valid Hermidata entries found in storage.');
    else console.log(`Total entries: ${count}`);

    return allHermidata;
}
async function getAllData(): Promise<Record<string, unknown>> {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
        ext.storage.sync.get(null, (result) => {
            if (ext.runtime.lastError) reject(new Error(`${ext.runtime.lastError.message}`));
            else resolve(result ?? {});
        });
    }).catch(error => {
        console.error('Failed to get all Hermidata:', error);
        return {} as Record<string, unknown>;
    });
}

function filterDataFromStorage(allData: Record<string, unknown>): Record<string, Hermidata> {
    const filteredData: Record<string, Hermidata> = {};
    for (const [key, value] of Object.entries(allData)) {
        if (!isHermidata(value)) continue;
        filteredData[key] = value;
    }
    return filteredData;
}




export async function getLocalNotificationItem(key: string): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
        ext.storage.local.get("clearedNotification", (result: { clearedNotification: Record<string, boolean> }) => {
            if (ext.runtime.lastError) return reject(new Error(ext.runtime.lastError?.message));
            resolve(result?.clearedNotification?.[key] || false);
        });
    }).catch(error => {
        console.error('Extention error: Failed Premise getHermidata key: ',key,' error: ',error);
        return false;
    })
}

export async function getAllRawFeeds(): Promise<Record<string, RawFeed>> {
    return new Promise<Record<string, RawFeed>>((resolve, reject) => {
        ext.storage.local.get("savedFeeds", (result: { savedFeeds: Record<string, RawFeed> }) => {
            if (ext.runtime.lastError) return reject(new Error(ext.runtime.lastError?.message));
            resolve(structuredClone(result?.savedFeeds || {}));
        });
    }).catch(error => {
        console.error('Extention error: Failed Premise savedFeeds: ',error);
        return {};
    })
}
export async function getRawFeedByTitle(title: string): Promise<RawFeed | null> {
    return new Promise<RawFeed | null>((resolve, reject) => {
        ext.storage.local.get("savedFeeds", (result: { savedFeeds: Record<string, RawFeed> }) => {
            if (ext.runtime.lastError) return reject(new Error(ext.runtime.lastError?.message));
            resolve(result?.savedFeeds?.[title] ?? null);
        });
    }).catch(error => {
        console.error('Extention error: Failed Premise savedFeeds: ',error);
        return null;
    })
}

export function removeKeysFromSync(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
        ext.storage.sync.remove(key, () => {
            if(ext.runtime.lastError) reject(new Error(ext.runtime.lastError?.message));
            else { 
                console.log("Removed key:", key);
                resolve();
            }
        });
    });
}

export async function getSettings(): Promise<Settings> {
    return await new Promise((resolve, reject) => {
        ext.storage.sync.get("Settings", (result: { Settings: Settings }) => {
            if (ext.runtime.lastError) reject(new Error(ext.runtime.lastError.message));
            else resolve(result.Settings ?? defaultSettings);
        });
    });
}

export async function getSpreadsheetUrl(): Promise<string> {
    return await new Promise((resolve, reject) => {
        ext.storage.sync.get(["spreadsheetUrl"], (result: { spreadsheetUrl: string }) => {
            if (ext.runtime.lastError) reject(new Error(ext.runtime.lastError.message));
            else resolve(result.spreadsheetUrl || "");
        });
    });
}

// Get GoogleSheet URL
export async function getGoogleSheetURL(): Promise<string> {
    const spreadsheetUrl = await getSpreadsheetUrl();
    if (spreadsheetUrl && isValidGoogleSheetUrl(spreadsheetUrl)) return spreadsheetUrl;

    return sheetUrlInput();
}

export function isValidGoogleSheetUrl(url: string) {
    return /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+/.test(url);
}

export function sheetUrlInput(): Promise<string> {

    return new Promise((resolve, reject) => {
        

        setElement("#spreadsheetPrompt", el => el.style.display = "block");
        // document.getElementById('body').style.display = 'none';
        const saveBtn = getElement("#saveSheetUrlBtn");
        if (!saveBtn) return reject(new Error("Could not find save button."));

        saveBtn.onclick = () => {
            const url = getElement<HTMLInputElement>("#sheetUrlInput")?.value.trim();

            if (!url) return reject(new Error("Please enter a valid URL."));

            if (!isValidGoogleSheetUrl(url)) return reject(new Error("Invalid URL format."));

            setElement("#spreadsheetPrompt", el => el.style.display = "none")
            setElement("#body", el => el.style.display = 'block');
            ext.storage.sync.set({ spreadsheetUrl: url }, () => resolve(url) );
        };    
    });
}

export async function setNotificationList(key: string, value = true): Promise<Record<string, boolean>> {
    return new Promise<Record<string, boolean>>((_resolve, reject) => {
        ext.storage.local.get("clearedNotification", (result: { clearedNotification: Record<string, boolean> }) => {
        const conbined = {...result?.clearedNotification};
        conbined[key] = value;
        ext.storage.local.set({clearedNotification: conbined}, () => {
            if (ext.runtime.lastError) return reject(new Error(ext.runtime.lastError.message));
        });
    });
    }).catch(error => {
        console.error('Extention error: Failed Premise getHermidata: ',error);
        return {};
    });
}

export async function getLastSortOption(): Promise<AllsortsType | undefined> {
    return new Promise<AllsortsType | undefined>((resolve, reject) => {
        ext.storage.local.get("lastFilter", (result: { lastFilter: Filters }) => {
            if (ext.runtime.lastError) return reject(new Error(ext.runtime.lastError.message));
            resolve(result?.lastFilter?.sort ?? undefined);
        });
    }).catch(error => {
        console.error('Extention error: Failed Premise getHermidata: ',error);
        return undefined;
    });
    
}
export async function getLastFilter(): Promise<Filters | undefined> {
    return new Promise<Filters | undefined>((resolve, reject) => {
        ext.storage.local.get("lastFilter", (result: { lastFilter: Filters }) => {
            if (ext.runtime.lastError) return reject(new Error(ext.runtime.lastError.message));
            resolve(result?.lastFilter ?? undefined);
        });
    }).catch(error => {
        console.error('Extention error: Failed Premise getHermidata: ',error);
        return undefined;
    });
}
export async function setLastFilter(lastFilter: Filters): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
        ext.storage.local.set({"lastFilter": lastFilter}, () => {
            if (ext.runtime.lastError) return reject(new Error(ext.runtime.lastError.message));
            resolve(true);
        });
    }).catch(error => {
        console.error('Extention error: Failed Premise getHermidata: ',error);
        return false;
    });
}
export async function setLastSortOption(lastSortOption: AllsortsType): Promise<boolean> {
    const lastFilter = await getLastFilter();
    const newFilter: Filters = {
        include: lastFilter?.include ?? {},
        exclude: lastFilter?.exclude ?? {},
        sort: lastSortOption
    };
    return new Promise<boolean>((resolve, reject) => {
        ext.storage.local.set({"lastFilter": newFilter}, () => {
            if (ext.runtime.lastError) return reject(new Error(ext.runtime.lastError.message));
            resolve(true);
        });
    }).catch(error => {
        console.error('Extention error: Failed Premise getHermidata: ',error);
        return false;
    });
}

export function getAllTags(allHermidata: Record<string, Hermidata>): Map<string, number> {
    const tagCount = new Map<string, number>();
    for (const entry of Object.values(allHermidata)) {

        const tags = entry.meta.tags as (string[] | string);
        const tagsArray = Array.isArray(tags) ? tags : tags?.split(',');

        for (const tag of tagsArray) {
            if (!tag.trim()) continue; // skip empty
            tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
        }
    }
    return tagCount; // tag → usage count
}
export function getSuggestedTags( input: string, allTags: Map<string, number>, selectedTags: string[], threshold = 0. ): Array<{ tag: string; count: number }> {
    return [...allTags.entries()]
        .filter(([tag]) => !selectedTags.includes(tag)) // hide already selected
        .filter(([tag]) =>
            tag.toLowerCase().includes(input.toLowerCase()) // substring first
            || CalcDiff(input, tag) >= threshold            // then fuzzy
        )
        .sort((a, b) => b[1] - a[1]) // sort by usage count descending
        .slice(0, 8)                  // max 8 suggestions
        .map(([tag, count]) => ({ tag, count }));
}
function filterByTags( allHermidata: Record<string, Hermidata>, selectedTags: string[] ): Record<string, Hermidata> {
    if (!selectedTags.length) return allHermidata;

    return Object.fromEntries(
        Object.entries(allHermidata).filter(([_, entry]) =>
            // AND — entry must have ALL selected tags
            selectedTags.every(tag => entry.meta.tags.includes(tag))
        )
    );
}