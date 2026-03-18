import type { Hermidata } from "./type";
import { ext } from "../BrowserCompat";
import type { RawFeed } from "./rssType";
import type { Settings } from "./settings";

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




export async function getLocalNotificationItem(key: string) {
    return new Promise((resolve, reject) => {
        ext.storage.local.get("clearedNotification", (result: { clearedNotification: Record<string, boolean> }) => {
            if (ext.runtime.lastError) return reject(new Error(ext.runtime.lastError?.message));
            resolve(result?.clearedNotification?.[key] || false);
        });
    }).catch(error => {
        console.error('Extention error: Failed Premise getHermidata key: ',key,' error: ',error);
        return {};
    })
}

export async function getAllRawFeeds(): Promise<Record<string, RawFeed>> {
    return new Promise<Record<string, RawFeed>>((resolve, reject) => {
        ext.storage.local.get("savedFeeds", (result: { savedFeeds: Record<string, RawFeed> }) => {
            if (ext.runtime.lastError) return reject(new Error(ext.runtime.lastError?.message));
            resolve(result?.savedFeeds || {});
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
            else { console.log("Removed key:", key); }
        });
    });
}

export async function getSettings(): Promise<Settings> {
    return await new Promise((resolve, reject) => {
        ext.storage.sync.get("Settings", (result: { Settings: Settings }) => {
            if (ext.runtime.lastError) reject(new Error(ext.runtime.lastError.message));
            else resolve(result.Settings || {});
        });
    });
}