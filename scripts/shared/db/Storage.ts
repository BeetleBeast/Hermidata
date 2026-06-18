import { ext } from '../utils/BrowserCompat';
import { getHermidataByKey, putHermidata, deleteHermidata,
    getAllHermidata as dbGetAllHermidata,
    getSettings as dbGetSettings, 
    getAllRawFeeds as dbGetAllRawFeeds, 
    putSettings, 
    putAllRawFeeds,
    putAllHermidata,
    deleteRawFeed} from './db';
import { pushToSync, removeFromSync } from './sync';
import { CalcDiff, PastHermidata } from '../../popup/core/Past';
import { returnHashedTitle } from '../utils/StringOutput';
import { getElement, setElement } from '../utils/Selection';
import { type Hermidata, type RawFeed, type Settings, type AllsortsType, type Filters } from '../types/index';
import { SettingsMigration } from '../migration/Settings';
import { DEFAULT_TAGS, defaultSettings } from '../constants';

// ============================================================
// Hermidata
// ============================================================
export function getHermidataViaKey(key: string): Promise<Hermidata | null> { return getHermidataByKey(key); }

export async function saveHermidata(key: string, entry: Hermidata): Promise<void> {
    try {
        const Key = key || entry.id || returnHashedTitle(entry.title, entry.novelType, entry.chapter.bookmarks[entry.chapter.bookmarkInUse].url);
        entry.id = Key;
        entry.meta.updated = new Date().toISOString();

        await putHermidata(entry, false)  // write to IndexedDB
        await pushToSync(entry)           // push to storage.sync for other devices

        PastHermidata.invalidateCache();
        console.log(`[HermidataV3] Saved ${entry.title}`);
    } catch (err) {
        console.error('[Storage] saveHermidata:', err);
        throw err;
    }
}

export async function updateHermidata(oldKey: string, newKey: string, entry: Hermidata): Promise<void> {
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
        console.error('[Storage] updateHermidata:', err);
    }
}

export async function removeHermidata(id: string): Promise<void> {
    try {
        await deleteHermidata(id, false)  // remove from IndexedDB
        await removeFromSync(id)          // remove from sync

        PastHermidata.invalidateCache();
        console.log(`[HermidataV3] Removed ${id}`);
    } catch (err) {
        console.error('[Storage] removeHermidata:', err);
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
export async function setAllHermidata(hermidata: Hermidata[]): Promise<void> {
    try {
        await putAllHermidata(hermidata);
        const count = Object.keys(hermidata).length;
        console.log(`[Storage] set ${count} total entries`);
    } catch (err) {
        console.error('[Storage] setAllHermidata:', err);
    }
}
// ============================================================
// Tags
// ============================================================

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
    // add default tags
    for (const tag of DEFAULT_TAGS) {
        if (tagCount.has(tag)) continue;
        tagCount.set(tag, 0);
    }
    return tagCount; // tag → usage count
}
export function getSuggestedTags( input: string, allTags: Map<string, number>, selectedTags: string[], threshold = 0.80 ): Array<{ tag: string; count: number }> {
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
export async function removeRawFeedByUrl(url: string): Promise<boolean> {
    try {
        // feeds are keyed by URL — remove by URL
        await deleteRawFeed(url);
        return true;
    } catch (err) {
        console.error('[Storage] removeRawFeedByUrl:', err);
        return false;
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

        console.log('[Storage] Settings not found in IndexedDB, falling back to storage.sync');

        // Fall back to storage.sync for users not yet migrated
        return await new Promise<Settings>((resolve, reject) => {
            ext.storage.sync.get('Settings', (result: { Settings: Settings }) => {
                if (ext.runtime.lastError) reject(new Error(ext.runtime.lastError.message));
                else resolve(result.Settings ?? defaultSettings); // TEMP: if you remove the result.setings you can regain the default settings
            });
        });
    } catch (err) {
        console.error('[Storage] getSettings:', err);
        return defaultSettings;
    }
}

export async function setSettings(settings: Settings): Promise<void> {
    try {
        await putSettings(settings);                            // IndexedDB
        await ext.storage.sync.set({ Settings: settings });    // sync for cross-device
        console.log('[Storage] Settings saved');
    } catch (err) {
        console.error('[Storage] setSettings:', err);
    }
}
// For development/testing: reset to default settings (does not affect Hermidata or Feeds)
export async function resetSettings(): Promise<void> {
    try {
        const settings = await getSettings();
        const settingsVersion = settings?.version ?? 0;
        const latestVersion = defaultSettings.version;
        if (settingsVersion >= latestVersion) {
            console.warn(`[Storage] resetSettings: current version (${settingsVersion}) is up-to-date, no reset needed.`);
            return;
        }
        else {
            console.error('[Storage] resetSettings: wrong version');
            await putSettings(defaultSettings);                            // IndexedDB
            console.log('[Storage] Settings reset');
        }
    } catch (err) {
        console.error('[Storage] resetSettings:', err);
    }
}
// migrate old settings to new format (called on extension update)
/** - If settings are already up-to-date, no migration needed else migrate them to latest  */
export async function migrateSettings(): Promise<void> {
    try {
        const settings = await getSettings();
        const settingsVersion = settings.version ?? 0;
        const latestVersion = defaultSettings.version;
        // If settings are already up-to-date, no migration needed
        if (settingsVersion >= latestVersion) return;
        // if settings has no version ( version 4 or earlier), or version is less than latest, migrate it
        // if settings are not up-to-date, migrate them
        if (settingsVersion < latestVersion || !settingsVersion) {
            console.error('[Storage] migrateSettings: wrong version');
            await SettingsMigration.migrateSettingsToLatest(settings as unknown, settingsVersion);
            console.log('[Storage] Settings migrated');
        }
    } catch (err) {
        console.error('[Storage] migrateSettings:', err);
    }
}

// ============================================================
// Google Sheet URL — kept in storage.sync (small, needed cross-device)
// ============================================================

async function getSpreadsheetUrl(): Promise<string> {
    try {
        const settings = await getSettings();
        if (settings?.AccountAndConnections.spreadsheetUrl) return settings.AccountAndConnections.spreadsheetUrl;

        // Fall back to old standalone key for users not yet migrated
        const urlFromSync =  await new Promise<string>((resolve, reject) => {
            ext.storage.sync.get(['spreadsheetUrl'], (result: { spreadsheetUrl: string }) => {
                if (ext.runtime.lastError) reject(new Error(ext.runtime.lastError.message));
                else resolve(result.spreadsheetUrl || '');
            });
        });

        if (urlFromSync) await setSpreadsheetUrl(urlFromSync);

        return urlFromSync;
    } catch (err) {
        console.error('[Storage] getSpreadsheetUrl:', err);
        return '';
    }
}

export async function getGoogleSheetURL(): Promise<string> {
    try {
        const url = await getSpreadsheetUrl();
        if (url && isValidGoogleSheetUrl(url)) return url;
        const settings = await getSettings();
        const googleSpreadsheet = settings.ExtensionBehaviour.SaveTarget.GoogleSpreadsheet;
        if (googleSpreadsheet) return sheetUrlInput();
        return '';
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
    await setSettings({ ...settings, AccountAndConnections : { ...settings.AccountAndConnections, spreadsheetUrl: url }});
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