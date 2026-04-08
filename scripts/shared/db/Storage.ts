import { ext } from '../BrowserCompat';
import { getHermidataByKey, putHermidata, deleteHermidata,
    getAllHermidata as dbGetAllHermidata,
    getSettings as dbGetSettings, 
    getAllRawFeeds as dbGetAllRawFeeds, 
    putSettings, 
    putAllRawFeeds} from './db';
import { pushToSync, removeFromSync } from './sync';
import { PastHermidata } from '../../popup/core/Past';
import { returnHashedTitle } from '../StringOutput';
import { getElement, setElement } from '../../utils/Selection';
import { type Hermidata, type RawFeed, type Settings, type AllsortsType, type Filters, defaultSettings } from '../types/index';

// ============================================================
// Hermidata
// ============================================================
export function getHermidataViaKey(key: string): Promise<Hermidata | null> { return getHermidataByKey(key); }

export async function saveHermidataV3(key: string, entry: Hermidata): Promise<void> {
    try {
        const Key = key || entry.id || returnHashedTitle(entry.title, entry.type, entry.url);
        entry.id = Key;
        entry.meta.updated = new Date().toISOString();

        await putHermidata(entry, false)  // write to IndexedDB
        await pushToSync(entry)           // push to storage.sync for other devices

        PastHermidata.invalidateCache();
        console.log(`[HermidataV3] Saved ${entry.title}`);
    } catch (err) {
        console.error('[Storage] saveHermidataV3:', err);
    }
}

export async function updateHermidataV3(oldKey: string, newKey: string, entry: Hermidata): Promise<void> {
    try {
        entry.id = newKey;
        entry.meta.updated = new Date().toISOString();

        await putHermidata(entry, false)    // write new key to IndexedDB
        await deleteHermidata(oldKey, false) // remove old key from IndexedDB

        await pushToSync(entry)             // push new entry to sync
        await removeFromSync(oldKey)        // remove old key from sync

        PastHermidata.invalidateCache();
        console.log(`Migrated from ${oldKey} → ${newKey}`);
        console.log(`[HermidataV3] Updated ${entry.title}`);
    } catch (err) {
        console.error('[Storage] updateHermidataV3:', err);
    }
}

export async function removeHermidataV3(id: string): Promise<void> {
    try {
        await deleteHermidata(id, false)  // remove from IndexedDB
        await removeFromSync(id)          // remove from sync

        PastHermidata.invalidateCache();
        console.log(`[HermidataV3] Removed ${id}`);
    } catch (err) {
        console.error('[Storage] removeHermidataV3:', err);
    }
}

export async function getAllHermidata(): Promise<Record<string, Hermidata>> {
    try {
        const all = await dbGetAllHermidata();
        const count = Object.keys(all).length;
        if (count === 0) console.warn('[Storage] No Hermidata entries found.');
        else console.log(`[Storage] Total entries: ${count}`);
        return all;
    } catch (err) {
        console.error('[Storage] getAllHermidata:', err);
        return {};
    }
}

// ============================================================
// Feeds
// ============================================================

export async function getAllRawFeeds(): Promise<Record<string, RawFeed>> {
    try {
        return await dbGetAllRawFeeds();
    } catch (err) {
        console.error('[Storage] getAllRawFeeds:', err);
        return {};
    }
}

export async function setAllRawFeeds(feeds: RawFeed[]): Promise<void> {
    try {
        await putAllRawFeeds(feeds);
    } catch (err) {
        console.error('[Storage] setAllRawFeeds:', err);
    }
}

export async function getRawFeedByTitle(title: string): Promise<RawFeed | null> {
    try {
        // feeds are now keyed by URL — search by title across all feeds
        const all = await dbGetAllRawFeeds();
        return Object.values(all).find(f => f.title === title) ?? null;
    } catch (err) {
        console.error('[Storage] getRawFeedByTitle:', err);
        return null;
    }
}

// ============================================================
// Settings — still in storage.sync (small, needs cross-device sync)
// ============================================================

export async function getSettings(): Promise<Settings> {
    try {
        // Try IndexedDB first
        const local = await dbGetSettings();
        if (local) return local;

        // Fall back to storage.sync for users not yet migrated
        return await new Promise<Settings>((resolve, reject) => {
            ext.storage.sync.get('Settings', (result: { Settings: Settings }) => {
                if (ext.runtime.lastError) reject(new Error(ext.runtime.lastError.message));
                else resolve(result.Settings ?? defaultSettings);
            });
        });
    } catch (err) {
        console.error('[Storage] getSettings:', err);
        return defaultSettings;
    }
}

export async function saveSettings(settings: Settings): Promise<void> {
    try {
        await putSettings(settings);                            // IndexedDB
        await ext.storage.sync.set({ Settings: settings });    // sync for cross-device
        console.log('[Storage] Settings saved');
    } catch (err) {
        console.error('[Storage] saveSettings:', err);
    }
}

// ============================================================
// Google Sheet URL — kept in storage.sync (small, needed cross-device)
// ============================================================

async function getSpreadsheetUrl(): Promise<string> {
    try {
        const settings = await getSettings();
        if (settings?.spreadsheetUrl) return settings.spreadsheetUrl;

        // Fall back to old standalone key for users not yet migrated
        return await new Promise<string>((resolve, reject) => {
            ext.storage.sync.get(['spreadsheetUrl'], (result: { spreadsheetUrl: string }) => {
                if (ext.runtime.lastError) reject(new Error(ext.runtime.lastError.message));
                else resolve(result.spreadsheetUrl || '');
            });
        });
    } catch (err) {
        console.error('[Storage] getSpreadsheetUrl:', err);
        return '';
    }
}

export async function getGoogleSheetURL(): Promise<string> {
    try {
        const url = await getSpreadsheetUrl();
        if (url && isValidGoogleSheetUrl(url)) return url;
        return sheetUrlInput();
    } catch (error) {
        console.error('[Storage] getGoogleSheetURL:', error);
        return sheetUrlInput();
    }
}

export function isValidGoogleSheetUrl(url: string): boolean {
    return /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+/.test(url);
}

export function sheetUrlInput(): Promise<string> {
    return new Promise((resolve, reject) => {
        setElement('#spreadsheetPrompt', el => el.style.display = 'block');
        const saveBtn = getElement('#saveSheetUrlBtn');
        if (!saveBtn) return reject(new Error('Could not find save button.'));

        saveBtn.onclick = async () => {
            const url = getElement<HTMLInputElement>('#sheetUrlInput')?.value.trim();
            if (!url)                        return reject(new Error('Please enter a valid URL.'));
            if (!isValidGoogleSheetUrl(url)) return reject(new Error('Invalid URL format.'));

            setElement('#spreadsheetPrompt', el => el.style.display = 'none');
            setElement('#body',              el => el.style.display = 'block');

            setSpreadsheetUrl(url);
            
            resolve(url);
        };
    });
}

export async function setSpreadsheetUrl(url: string): Promise<void> {
    const settings = await getSettings();
    await saveSettings({ ...settings, spreadsheetUrl: url });
}

// ============================================================
// Notifications — kept in storage.local (device-specific, no sync needed)
// ============================================================

export async function getLocalNotificationItem(key: string): Promise<boolean> {
    try {
        return await new Promise<boolean>((resolve, reject) => {
            ext.storage.local.get('clearedNotification', (result: { clearedNotification: Record<string, boolean> }) => {
                if (ext.runtime.lastError) return reject(new Error(ext.runtime.lastError.message));
                resolve(result?.clearedNotification?.[key] ?? false);
            });
        });
    } catch (err) {
        console.error('[Storage] getLocalNotificationItem:', key, err);
        return false;
    }
}

export async function setNotificationList(key: string, value = true): Promise<Record<string, boolean>> {
    try {
        return await new Promise<Record<string, boolean>>((resolve, reject) => {
            ext.storage.local.get('clearedNotification', (result: { clearedNotification: Record<string, boolean> }) => {
                const combined = { ...result?.clearedNotification, [key]: value };
                ext.storage.local.set({ clearedNotification: combined }, () => {
                    if (ext.runtime.lastError) return reject(new Error(ext.runtime.lastError.message));
                    resolve(combined);
                });
            });
        });
    } catch (err) {
        console.error('[Storage] setNotificationList:', err);
        return {};
    }
}

// ============================================================
// Filters — kept in storage.local (device-specific UI state)
// ============================================================

export async function getLastFilter(): Promise<Filters | undefined> {
    try {
        return await new Promise<Filters | undefined>((resolve, reject) => {
            ext.storage.local.get('lastFilter', (result: { lastFilter: Filters }) => {
                if (ext.runtime.lastError) return reject(new Error(ext.runtime.lastError.message));
                resolve(result?.lastFilter ?? undefined);
            });
        });
    } catch (err) {
        console.error('[Storage] getLastFilter:', err);
        return undefined;
    }
}

export async function setLastFilter(lastFilter: Filters): Promise<boolean> {
    try {
        return await new Promise<boolean>((resolve, reject) => {
            ext.storage.local.set({ lastFilter }, () => {
                if (ext.runtime.lastError) return reject(new Error(ext.runtime.lastError.message));
                resolve(true);
            });
        });
    } catch (err) {
        console.error('[Storage] setLastFilter:', err);
        return false;
    }
}

export async function getLastSortOption(): Promise<AllsortsType | undefined> {
    try {
        const filter = await getLastFilter();
        return filter?.sort ?? undefined;
    } catch (err) {
        console.error('[Storage] getLastSortOption:', err);
        return undefined;
    }
}

export async function setLastSortOption(lastSortOption: AllsortsType): Promise<boolean> {
    try {
        const lastFilter = await getLastFilter();
        return setLastFilter({
            include: lastFilter?.include ?? {},
            exclude: lastFilter?.exclude ?? {},
            sort: lastSortOption,
        });
    } catch (err) {
        console.error('[Storage] setLastSortOption:', err);
        return false;
    }
}