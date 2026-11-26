import { logConsoleError } from "../utils/ErrorMessage";
import { ext } from '../utils/BrowserCompat';
import { getHermidataByKey, putHermidata, deleteHermidata,
    getAllHermidata as dbGetAllHermidata,
    getSettings as dbGetSettings, 
    getAllRawFeeds as dbGetAllRawFeeds, 
    putSettings, 
    putAllRawFeeds,
    putAllHermidata,
    deleteRawFeed,
    dbGetAllImages,
    dbDeleteImage,
    dbSaveImage,
    dbGetImage,
    dbSaveAllImages,
    dbUpdateImageKey} from './db';
import { pushToSync, removeFromSync } from '../sync/sync.engine';
import { loadSyncConfig } from '../sync/syncConfig';
import { CalcDiff, PastHermidata } from '../../popup/core/Past';
import { generateHermidataHash } from '../utils/StringOutput';
import { applyGroupRoles, groupRoles, hasRelatedWork, retargetRelations } from '../utils/Relations';
import { getElement, setElement } from '../utils/Selection';
import { isValidGoogleSheetUrl } from '../sheets/sheetConfig';
import { type RawFeed, type Settings, type AllSortsType, type Filters, type RelatedWorkType } from '../types';
import { SettingsMigration } from '../migration/Settings';
import { DEFAULT_TAGS, defaultSettings } from '../constants';
import type { AllSortsType as LibraryAllSortsType } from '../../library/build/filter';
import type { Filters as LibraryFilters } from '../../library/build/filterLogic';
import type { HermidataImageSource, OnlyPlainHermidata } from '../types/popup';


// ============================================================
// Hermidata
// ============================================================
export function getHermidataViaKey(key: string): Promise<OnlyPlainHermidata | null> { return getHermidataByKey(key); }

/**
 * Writes an entry under its own id ( `key`, else the entry's id, else one made from the entry ):
 * stamps `meta.updated`, pushes it to sync and drops the cached copy. Returns the entry as stored.
 * To give an entry a different id use `moveHermidata`.
 */
export async function saveHermidata(key: string, entry: OnlyPlainHermidata ): Promise<OnlyPlainHermidata> {
    try {
        const Key = key || entry.id || generateHermidataHash(entry.title, entry.novelType, entry.chapter.bookmarks[entry.chapter.bookmarkInUse].url);
        entry.id = Key;
        entry.meta.updated = new Date().toISOString();

        await putHermidata(entry, false)  // write to IndexedDB
        pushToSync(entry)           // push to storage.sync for other devices

        PastHermidata.invalidateCache();
        console.log(`[HermidataV3] Saved ${entry.title}`);
        return entry;
    } catch (err) {
        logConsoleError('[Storage] saveHermidata:', err);
        throw err;
    }
}

function updateImageReference(entry: OnlyPlainHermidata, oldId: string, newId: string): HermidataImageSource {
    const image = entry.meta.image;
    if (image.kind === 'stored' && image.id === oldId) return { kind: "stored", id: newId };
    return image;
}

const ID_REDIRECTS_KEY = 'hermidataIdRedirects';

/** Remember that an entry moved from `oldKey` to `newKey` so pages still holding the old id can follow it. */
async function recordIdRedirect(oldKey: string, newKey: string): Promise<void> {
    if (oldKey === newKey) return;
    try {
        const redirects = await readIdRedirects();
        // keep chains short: everything that pointed at oldKey now points at newKey
        for (const [from, to] of Object.entries(redirects)) if (to === oldKey) redirects[from] = newKey;
        redirects[oldKey] = newKey;
        delete redirects[newKey];
        await new Promise<void>(resolve => ext.storage.local.set({ [ID_REDIRECTS_KEY]: redirects }, () => resolve()));
    } catch (err) {
        logConsoleError('[Storage] recordIdRedirect:', err);
    }
}
function readIdRedirects(): Promise<Record<string, string>> {
    return new Promise(resolve => {
        ext.storage.local.get(ID_REDIRECTS_KEY, (result: Record<string, Record<string, string> | undefined>) => {
            resolve({ ...(result?.[ID_REDIRECTS_KEY] ?? {}) });
        });
    });
}
/** Follow the redirect trail of an id that no longer exists. Returns the newest id, or null when there is none. */
export async function resolveIdRedirect(id: string): Promise<string | null> {
    try {
        const redirects = await readIdRedirects();
        let current = id;
        const seen = new Set<string>();
        while (redirects[current] && !seen.has(current)) {
            seen.add(current);
            current = redirects[current];
        }
        return current === id ? null : current;
    } catch (err) {
        logConsoleError('[Storage] resolveIdRedirect:', err);
        return null;
    }
}

/**
 * Gives an entry a different id: writes it under `newKey`, then removes `oldKey` ( and its sync record ), and moves the images.
 * With equal keys there is nothing to remove, so it only saves the entry: the old key IS the new key, deleting it would delete the entry.
 * Returns the entry as stored.
 */
export async function moveHermidata(oldKey: string, newKey: string, entry: OnlyPlainHermidata): Promise<OnlyPlainHermidata> {
    try {
        const moved = oldKey !== newKey;
        entry.id = newKey;
        entry.meta.updated = new Date().toISOString();
        if (moved) {
            entry.meta.image = updateImageReference(entry, oldKey, newKey); // update image key
            void recordIdRedirect(oldKey, newKey); // open pages can still find this entry through its old id
        }

        await putHermidata(entry, false)    // write new key to IndexedDB
        pushToSync(entry)                   // push new entry to sync

        if (moved) {
            await deleteHermidata(oldKey, false) // remove old key from IndexedDB
            await updateImageKey(oldKey, newKey); // move associated images to new key
            removeFromSync(oldKey)        // remove old key from sync
            await retargetLinks(oldKey, newKey); // linked items follow it to its new id
            console.log(`Migrated from ${oldKey} → ${newKey}`);
        }

        PastHermidata.invalidateCache();
        console.log(`[HermidataV3] Updated ${entry.title}`);
        return entry;
    } catch (err) {
        logConsoleError('[Storage] moveHermidata:', err);
        throw err;
    }
}

/**
 * Deletes an entry and the links other entries hold to it. When the entry was merged into another one, pass that
 * one as `replacedBy`: the links then point at it instead, and pages still holding the old id can follow it.
 */
export async function removeHermidata(id: string, replacedBy?: string): Promise<void> {
    try {
        await deleteHermidata(id, false)  // remove from IndexedDB
        removeFromSync(id)          // remove from sync
        if (replacedBy) void recordIdRedirect(id, replacedBy);
        await retargetLinks(id, replacedBy ?? null);

        PastHermidata.invalidateCache();
        console.log(`[HermidataV3] Removed ${id}`);
    } catch (err) {
        logConsoleError('[Storage] removeHermidata:', err);
    }
}

/**
 * Puts `targetId` in the related titles of `id` as `type`, or gives it that type when it is in them already.
 * Related titles are one group in which every entry lists all the others with their type, so this writes every
 * entry of the group. A `targetId` with related titles of its own brings them along: the two groups become one.
 * With `targetId` equal to `id`, it sets the type of `id` itself. Returns the entries that changed, as stored.
 */
export async function linkHermidata(id: string, targetId: string, type: RelatedWorkType): Promise<OnlyPlainHermidata[]> {
    const all = await dbGetAllHermidata();
    if (!all[id] || !all[targetId]) throw new Error('Could not find both entries to link.');

    const roles = { ...groupRoles(id, all), ...groupRoles(targetId, all), [targetId]: type };
    if (Object.keys(roles).length < 2) throw new Error('Link another title first.');
    const changed = applyGroupRoles(all, roles, []);
    await saveAllHermidata(changed);
    return changed;
}

/**
 * Takes `targetId` out of the related titles of `id`: no entry of the group lists it any more, and it lists none of them.
 * Returns the entries that changed, as stored.
 */
export async function unlinkHermidata(id: string, targetId: string): Promise<OnlyPlainHermidata[]> {
    const all = await dbGetAllHermidata();
    if (!all[id]) throw new Error('Could not find the entry to unlink.');

    const roles = groupRoles(id, all);
    delete roles[targetId];
    const changed = applyGroupRoles(all, roles, [targetId]);
    await saveAllHermidata(changed);
    return changed;
}

/**
 * Points every link to `fromId` at `toId` ( an entry that moved or was merged ), or drops those links when `toId`
 * is null ( a deleted entry ). The changed entries are saved like an edit, so sync carries the change.
 * The entry itself is already stored or deleted, so a failure here is logged instead of undoing that.
 */
async function retargetLinks(fromId: string, toId: string | null): Promise<void> {
    try {
        const linked = Object.values(await dbGetAllHermidata()).filter(entry => hasRelatedWork(entry.meta.relations, fromId));
        for (const entry of linked) entry.meta.relations = retargetRelations(entry.meta.relations, entry.id, fromId, toId);
        await saveAllHermidata(linked);
    } catch (err) {
        logConsoleError('[Storage] retargetLinks:', err);
    }
}

export async function getAllHermidata(): Promise<Record<string, OnlyPlainHermidata>> {
    try {
        const all = await dbGetAllHermidata();
        const count = Object.keys(all).length;
        if (count === 0) console.warn('[Storage] No Hermidata entries found.');
        else console.log(`[Storage] Total entries: ${count}`);
        return all;
    } catch (err) {
        logConsoleError('[Storage] getAllHermidata:', err);
        return {};
    }
}
/**
 * Saves edited entries in one transaction, the batch version of saveHermidata: each one is stamped as updated
 * so sync ( newest meta.updated wins ) carries the change to other devices. Use setAllHermidata to write without that.
 */
export async function saveAllHermidata(entries: OnlyPlainHermidata[]): Promise<void> {
    if (entries.length === 0) return;
    const now = new Date().toISOString();
    for (const entry of entries) entry.meta.updated = now;

    await putAllHermidata(entries);
    pushToSync();
    PastHermidata.invalidateCache();
    console.log(`[Storage] saved ${entries.length} edited entries`);
}
export async function setAllHermidata(hermidata: OnlyPlainHermidata[]): Promise<void> {
    try {
        await putAllHermidata(hermidata);
        const count = Object.keys(hermidata).length;
        console.log(`[Storage] set ${count} total entries`);
    } catch (err) {
        logConsoleError('[Storage] setAllHermidata:', err);
    }
}
// ============================================================
// Tags
// ============================================================

export function getAllTags(allHermidata: Record<string, OnlyPlainHermidata>): Map<string, number> {
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
        logConsoleError('[Storage] getAllRawFeeds:', err);
        return {};
    }
}

export async function setAllRawFeeds(feeds: RawFeed[]): Promise<void> {
    try {
        await putAllRawFeeds(feeds);
    } catch (err) {
        logConsoleError('[Storage] setAllRawFeeds:', err);
    }
}

export async function getRawFeedByTitle(title: string): Promise<RawFeed | null> {
    try {
        // feeds are now keyed by URL — search by title across all feeds
        const all = await dbGetAllRawFeeds();
        return Object.values(all).find(f => f.title === title) ?? null;
    } catch (err) {
        logConsoleError('[Storage] getRawFeedByTitle:', err);
        return null;
    }
}
export async function removeRawFeedByUrl(url: string): Promise<boolean> {
    try {
        // feeds are keyed by URL — remove by URL
        await deleteRawFeed(url);
        return true;
    } catch (err) {
        logConsoleError('[Storage] removeRawFeedByUrl:', err);
        return false;
    }
}
// ============================================================
// Images
// ============================================================

export async function saveImage(id: string, blob: Blob): Promise<boolean> {
    try {
        await dbSaveImage(id, blob);
        return true;
    } catch (err) {
        logConsoleError('[Storage] saveImage:', err);
        return false;
    }
}
export async function getImage(id: string): Promise<Blob | null> {
    try {
        const image = await dbGetImage(id);
        return image ?? null;
    } catch (err) {
        logConsoleError('[Storage] getImage:', err);
        return null;
    }
}
export async function saveAllImages(blobs: Record<string, Blob>): Promise<boolean> {
    try {
        await dbSaveAllImages(blobs);
        return true;
    } catch (err) {
        logConsoleError('[Storage] saveAllImages:', err);
        return false;
    }
}

export async function getAllImages(): Promise<Blob[]> {
    try {
        return await dbGetAllImages();
    } catch (err) {
        logConsoleError('[Storage] getAllImages:', err);
        return [];
    }
}

export async function removeImage(id: string): Promise<boolean> {
    try {
        await dbDeleteImage(id);
        return true;
    } catch (err) {
        logConsoleError('[Storage] removeImage:', err);
        return false;
    }
}

export async function updateImageKey(oldId: string, newId: string): Promise<boolean> {
    try {
        await dbUpdateImageKey(oldId, newId);
        return true;
    } catch (err) {
        logConsoleError('[Storage] updateImageKey:', err);
        return false;
    }
}



// ============================================================
// Settings — IndexedDB, mirrored to storage.sync (small, needs cross-device sync).
// A device set to "local only" mirrors to storage.local instead, so nothing leaves it.
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
                else resolve(result.Settings ?? defaultSettings); // TEMP: if you remove the result.settings you can regain the default settings
            });
        });
    } catch (err) {
        logConsoleError('[Storage] getSettings:', err);
        return defaultSettings;
    }
}

export async function setSettings(settings: Settings): Promise<void> {
    try {
        await putSettings(settings);                            // IndexedDB
        const { kind } = await loadSyncConfig(ext.storage.local);
        if (kind === 'local') await ext.storage.local.set({ Settings: settings });   // same change event, but never synced
        else await ext.storage.sync.set({ Settings: settings });                      // sync for cross-device
        console.log('[Storage] Settings saved');
    } catch (err) {
        logConsoleError('[Storage] setSettings:', err);
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
            logConsoleError('[Storage] resetSettings: wrong version');
            await putSettings(defaultSettings);                            // IndexedDB
            console.log('[Storage] Settings reset');
        }
    } catch (err) {
        logConsoleError('[Storage] resetSettings:', err);
    }
}
// migrate old settings to new format (called on extension update)
/** - If settings are already up-to-date, no migration needed else migrate them to latest  */
export async function migrateSettings(_settings: Settings | undefined = undefined): Promise<void> {
    try {
        const settings = _settings ?? await getSettings();
        const settingsVersion = settings.version ?? 0;
        const latestVersion = defaultSettings.version;
        // If settings are already up-to-date, no migration needed
        if (settingsVersion >= latestVersion) return;
        // if settings has no version ( version 4 or earlier), or version is less than latest, migrate it
        // if settings are not up-to-date, migrate them
        if (settingsVersion < latestVersion || !settingsVersion) {
            logConsoleError('[Storage] migrateSettings: wrong version');
            await SettingsMigration.migrateSettingsToLatest(settings as unknown, settingsVersion);
            console.log('[Storage] Settings migrated');
        }
    } catch (err) {
        logConsoleError('[Storage] migrateSettings:', err);
    }
}

// ============================================================
// Google Sheet URL — kept in Settings.AccountAndConnections (old standalone storage.sync key is migrated on read)
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
        logConsoleError('[Storage] getSpreadsheetUrl:', err);
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
        logConsoleError('[Storage] getGoogleSheetURL:', error);
        return sheetUrlInput();
    }
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
        logConsoleError('[Storage] getLastFilter:', err);
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
        logConsoleError('[Storage] setLastFilter:', err);
        return false;
    }
}

export async function getLastLibraryFilters(): Promise<LibraryFilters | undefined> {
    try {
        return await new Promise<LibraryFilters | undefined>((resolve, reject) => {
            ext.storage.local.get('lastLibraryFilter', (result: { lastLibraryFilter: LibraryFilters }) => {
                if (ext.runtime.lastError) return reject(new Error(ext.runtime.lastError.message));
                resolve(result?.lastLibraryFilter ?? undefined);
            });
        });
    } catch (err) {
        logConsoleError('[Storage] getLastLibraryFilters:', err);
        return undefined;
    }
}

export async function setLastLibraryFilters(lastFilter: LibraryFilters): Promise<boolean> {
    try {
        return await new Promise<boolean>((resolve, reject) => {
            ext.storage.local.set({ lastLibraryFilter: lastFilter }, () => {
                if (ext.runtime.lastError) return reject(new Error(ext.runtime.lastError.message));
                resolve(true);
            });
        });
    } catch (err) {
        logConsoleError('[Storage] setLastLibraryFilters:', err);
        return false;
    }
}

export async function getLastSortOption(): Promise<AllSortsType | undefined> {
    try {
        const filter = await getLastFilter();
        return filter?.sort ?? undefined;
    } catch (err) {
        logConsoleError('[Storage] getLastSortOption:', err);
        return undefined;
    }
}

export async function setLastSortOption(lastSortOption: AllSortsType): Promise<boolean> {
    try {
        const lastFilter = await getLastFilter();
        return setLastFilter({
            include: lastFilter?.include ?? {},
            exclude: lastFilter?.exclude ?? {},
            sort: lastSortOption,
        });
    } catch (err) {
        logConsoleError('[Storage] setLastSortOption:', err);
        return false;
    }
}

export async function getLastLibrarySortOption(): Promise<LibraryAllSortsType | undefined> {
    try {
        const filter = await getLastLibraryFilters();
        return filter?.sort ?? undefined;
    } catch (err) {
        logConsoleError('[Storage] getLastLibrarySortOption:', err);
        return undefined;
    }
}

export async function setLastLibrarySortOption(lastSortOption: LibraryAllSortsType): Promise<boolean> {
    try {
        const lastFilter = await getLastLibraryFilters();
        return setLastLibraryFilters({
            include: lastFilter?.include ?? {},
            exclude: lastFilter?.exclude ?? {},
            sort: lastSortOption,
        });
    } catch (err) {
        logConsoleError('[Storage] setLastLibrarySortOption:', err);
        return false;
    }
}
// ============================================================
// db Access
// ============================================================

/**
 * The functions above that a page may run in the background, by name.
 * The background runs the very same function, so a save does the same whoever asks for it.
 */
export const storageCalls = {
    getSettings,
    setSettings,
    getAllHermidata,
    saveHermidata,
    moveHermidata,
    removeHermidata,
    linkHermidata,
    unlinkHermidata,
    saveAllHermidata,
    setAllHermidata,
    getAllRawFeeds,
    setAllRawFeeds,
    removeRawFeedByUrl,
};
export type StorageCallName = keyof typeof storageCalls;
type StorageCalls = typeof storageCalls;
export type StorageCallMessage = { type: 'STORAGE_CALL'; fn: StorageCallName; args: unknown[] };
export type StorageCallResponse = { success: boolean; error?: string; result?: unknown };

export function isStorageCall(fn: unknown): fn is StorageCallName {
    return typeof fn === 'string' && Object.hasOwn(storageCalls, fn);
}

/** Runs one of the `storageCalls` and answers in the shape `dbAccess` expects */
export async function runStorageCall(fn: unknown, args: unknown): Promise<StorageCallResponse> {
    if (!isStorageCall(fn)) return { success: false, error: `Unknown storage call: ${String(fn)}` };
    try {
        const run = storageCalls[fn] as (...callArgs: unknown[]) => Promise<unknown>;
        return { success: true, result: await run(...(Array.isArray(args) ? args : [])) };
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
}

/**
 * How pages ( library, settings, reading list, RSS, popup ) reach IndexedDB and sync.
 * Every method has the name of the function it runs in the background ( see `storageCalls` ) and does nothing else itself.
 */
export class dbAccess {

    public getSettings(): Promise<Settings> {
        return this.call('getSettings');
    }
    public setSettings(settings: Settings): Promise<void> {
        return this.call('setSettings', settings);
    }
    public getAllHermidata(): Promise<Record<string, OnlyPlainHermidata>> {
        return this.call('getAllHermidata');
    }
    /** Write an entry under its own id. The entry you pass gets the id and `meta.updated` that were stored */
    public async saveHermidata(key: string, entry: OnlyPlainHermidata): Promise<void> {
        adoptStored(entry, await this.call('saveHermidata', key, entry));
    }
    /** Write an entry under `newKey` and remove `oldKey`. The entry you pass gets the id, image and `meta.updated` that were stored */
    public async moveHermidata(oldKey: string, newKey: string, entry: OnlyPlainHermidata): Promise<void> {
        adoptStored(entry, await this.call('moveHermidata', oldKey, newKey, entry));
    }
    public removeHermidata(id: string): Promise<void> {
        return this.call('removeHermidata', id);
    }
    /** Put `targetId` in the related titles of `id` as `type`. Returns the entries that changed, as stored */
    public linkHermidata(id: string, targetId: string, type: RelatedWorkType): Promise<OnlyPlainHermidata[]> {
        return this.call('linkHermidata', id, targetId, type);
    }
    /** Take `targetId` out of the related titles of `id`. Returns the entries that changed, as stored */
    public unlinkHermidata(id: string, targetId: string): Promise<OnlyPlainHermidata[]> {
        return this.call('unlinkHermidata', id, targetId);
    }
    public saveAllHermidata(entries: OnlyPlainHermidata[]): Promise<void> {
        return this.call('saveAllHermidata', entries);
    }
    public setAllHermidata(entries: OnlyPlainHermidata[]): Promise<void> {
        return this.call('setAllHermidata', entries);
    }
    public getAllRawFeeds(): Promise<Record<string, RawFeed>> {
        return this.call('getAllRawFeeds');
    }
    public setAllRawFeeds(feeds: RawFeed[]): Promise<void> {
        return this.call('setAllRawFeeds', feeds);
    }
    public removeRawFeedByUrl(url: string): Promise<boolean> {
        return this.call('removeRawFeedByUrl', url);
    }

    private call<Name extends StorageCallName>(fn: Name, ...args: Parameters<StorageCalls[Name]>): Promise<Awaited<ReturnType<StorageCalls[Name]>>> {
        return new Promise((resolve, reject) => {
            const message: StorageCallMessage = { type: 'STORAGE_CALL', fn, args };
            chrome.runtime.sendMessage(message, (response?: StorageCallResponse) => {
                const lastError = chrome.runtime?.lastError;
                if (lastError) return reject(new Error(`${fn}: ${lastError.message}`));
                if (!response) return reject(new Error(`${fn}: no response from the background script`));
                // only what failed, never what was sent: the item itself does not belong in an error message
                if (!response.success) return reject(new Error(`${fn}: ${response.error ?? 'failed'}`));
                resolve(response.result as Awaited<ReturnType<StorageCalls[Name]>>);
            });
        });
    }
}

/** Copy what the background stored ( id, image, `meta.updated` ) onto the caller's entry, as the direct function does */
function adoptStored(entry: OnlyPlainHermidata, stored: OnlyPlainHermidata | undefined): void {
    if (!stored) return;
    entry.id = stored.id;
    entry.meta.updated = stored.meta.updated;
    entry.meta.image = stored.meta.image;
}
