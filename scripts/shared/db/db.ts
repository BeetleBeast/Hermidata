import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Hermidata, NovelType, ReadStatus, RawFeed } from '../types/index';
import { ext } from '../BrowserCompat';

// ============================================================
// Types
// ============================================================

// TODO: set it up inside Settings in the future
export interface Settings {
    spreadsheetUrl: string;
    darkMode: boolean;
    AllowContextMenu: boolean;
    DefaultChoiceText_Menu: {
        Type: NovelType;
        status: ReadStatus;
        tags: string[];
        notes: string;
    };
    FolderMapping: Record<string, Record<string, { path: string }>>;
}

// ============================================================
// Schema
// ============================================================

interface HermidataSchema extends DBSchema {
    hermidata: {
        key: string;
        value: Hermidata;
        indexes: {
            'by-title': string;
            'by-type': NovelType;
            'by-status': ReadStatus;
            'by-source': string;
            'by-updated': string;
        };
    };
    feeds: {
        key: string;           // hashed title key
        value: RawFeed;
        indexes: {
            'by-domain': string;
            'by-url': string;
        };
    };
    settings: {
        key: string;           // single record: 'Settings'
        value: Settings;
    };
}

// ============================================================
// DB init — singleton promise so every module shares one connection
// ============================================================

const DB_NAME = 'Hermidata';
const DB_VERSION = 1;

let _db: IDBPDatabase<HermidataSchema> | null = null;

async function getDb(): Promise<IDBPDatabase<HermidataSchema>> {
    if (_db) return _db;

    _db = await openDB<HermidataSchema>(DB_NAME, DB_VERSION, {
        upgrade(db) {
            // ---- hermidata store ----
            if (!db.objectStoreNames.contains('hermidata')) {
                const hermidataStore = db.createObjectStore('hermidata', { keyPath: 'id' });
                hermidataStore.createIndex('by-title',   'title',          { unique: false });
                hermidataStore.createIndex('by-type',    'type',           { unique: false });
                hermidataStore.createIndex('by-status',  'status',         { unique: false });
                hermidataStore.createIndex('by-source',  'source',         { unique: false });
                hermidataStore.createIndex('by-updated', 'meta.updated',   { unique: false });
            }

            // ---- feeds store ----
            if (!db.objectStoreNames.contains('feeds')) {
                const feedsStore = db.createObjectStore('feeds', { keyPath: 'url' });
                feedsStore.createIndex('by-domain', 'domain', { unique: false });
                feedsStore.createIndex('by-url',    'url',    { unique: true  });
            }

            // ---- settings store ----
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings');
            }
        },
        blocked() {
            console.warn('[Hermidata DB] Upgrade blocked — close other tabs using the extension');
        },
        blocking() {
            // Another tab wants to upgrade — release our connection
            _db?.close();
            _db = null;
            console.warn('[Hermidata DB] Closing connection to allow upgrade in another tab');
        },
        terminated() {
            _db = null;
            console.error('[Hermidata DB] Connection terminated unexpectedly');
        },
    });

    return _db;
}

// ============================================================
// Hermidata — CRUD
// ============================================================

/** Get a single entry by its hashed id key */
export async function getHermidataByKey(key: string): Promise<Hermidata | null> {
    try {
        const db = await getDb();
        return await db.get('hermidata', key) ?? null;
    } catch (err) {
        console.error('[DB] getHermidataByKey:', err);
        return null;
    }
}

/** Get all entries as a Record keyed by id — matches your existing usage pattern */
export async function getAllHermidata(): Promise<Record<string, Hermidata>> {
    try {
        const db = await getDb();
        const all = await db.getAll('hermidata');
        return Object.fromEntries(all.map(h => [h.id, h]));
    } catch (err) {
        console.error('[DB] getAllHermidata:', err);
        return {};
    }
}

/** Add or replace an entry */
export async function putHermidata(entry: Hermidata): Promise<void> {
    try {
        const db = await getDb();
        await db.put('hermidata', entry);
    } catch (err) {
        console.error('[DB] putHermidata:', err);
    }
}

/** Add or replace multiple entries in a single transaction — use this for bulk imports */
export async function putAllHermidata(entries: Hermidata[]): Promise<void> {
    try {
        const db = await getDb();
        const tx = db.transaction('hermidata', 'readwrite');
        await Promise.all([
            ...entries.map(e => tx.store.put(e)),
            tx.done,
        ]);
    } catch (err) {
        console.error('[DB] putAllHermidata:', err);
    }
}

/** Delete a single entry */
export async function deleteHermidata(key: string): Promise<void> {
    try {
        const db = await getDb();
        await db.delete('hermidata', key);
    } catch (err) {
        console.error('[DB] deleteHermidata:', err);
    }
}

// ============================================================
// Hermidata — Index queries
// ============================================================

/** Get all entries of a given type */
export async function getHermidataByType(type: NovelType): Promise<Hermidata[]> {
    try {
        const db = await getDb();
        return await db.getAllFromIndex('hermidata', 'by-type', type);
    } catch (err) {
        console.error('[DB] getHermidataByType:', err);
        return [];
    }
}

/** Get all entries with a given read status */
export async function getHermidataByStatus(status: ReadStatus): Promise<Hermidata[]> {
    try {
        const db = await getDb();
        return await db.getAllFromIndex('hermidata', 'by-status', status);
    } catch (err) {
        console.error('[DB] getHermidataByStatus:', err);
        return [];
    }
}

/** Get all entries from a given source domain */
export async function getHermidataBySource(source: string): Promise<Hermidata[]> {
    try {
        const db = await getDb();
        return await db.getAllFromIndex('hermidata', 'by-source', source);
    } catch (err) {
        console.error('[DB] getHermidataBySource:', err);
        return [];
    }
}

/** Get all entries that have an RSS feed linked */
export async function getHermidataWithRss(): Promise<Record<string, Hermidata>> {
    try {
        const all = await getAllHermidata();
        return Object.fromEntries(
            Object.entries(all).filter(([_, h]) => h.rss !== null)
        );
    } catch (err) {
        console.error('[DB] getHermidataWithRss:', err);
        return {};
    }
}

// ============================================================
// Feeds — CRUD
// ============================================================

/** Get a single raw feed by URL */
export async function getRawFeedByUrl(url: string): Promise<RawFeed | null> {
    try {
        const db = await getDb();
        return await db.getFromIndex('feeds', 'by-url', url) ?? null;
    } catch (err) {
        console.error('[DB] getRawFeedByUrl:', err);
        return null;
    }
}

/** Get all raw feeds as a Record keyed by URL */
export async function getAllRawFeeds(): Promise<Record<string, RawFeed>> {
    try {
        const db = await getDb();
        const all = await db.getAll('feeds');
        return Object.fromEntries(all.map(f => [f.url, f]));
    } catch (err) {
        console.error('[DB] getAllRawFeeds:', err);
        return {};
    }
}

/** Get all feeds for a given domain */
export async function getRawFeedsByDomain(domain: string): Promise<RawFeed[]> {
    try {
        const db = await getDb();
        return await db.getAllFromIndex('feeds', 'by-domain', domain);
    } catch (err) {
        console.error('[DB] getRawFeedsByDomain:', err);
        return [];
    }
}

/** Add or replace a raw feed */
export async function putRawFeed(feed: RawFeed): Promise<void> {
    try {
        const db = await getDb();
        await db.put('feeds', feed);
    } catch (err) {
        console.error('[DB] putRawFeed:', err);
    }
}

/** Add or replace multiple feeds in a single transaction */
export async function putAllRawFeeds(feeds: RawFeed[]): Promise<void> {
    try {
        const db = await getDb();
        const tx = db.transaction('feeds', 'readwrite');
        await Promise.all([
            ...feeds.map(f => tx.store.put(f)),
            tx.done,
        ]);
    } catch (err) {
        console.error('[DB] putAllRawFeeds:', err);
    }
}

/** Delete a feed by URL */
export async function deleteRawFeed(url: string): Promise<void> {
    try {
        const db = await getDb();
        await db.delete('feeds', url);
    } catch (err) {
        console.error('[DB] deleteRawFeed:', err);
    }
}

// ============================================================
// Settings
// ============================================================

const SETTINGS_KEY = 'Settings';

export async function getSettings(): Promise<Settings | null> {
    try {
        const db = await getDb();
        return await db.get('settings', SETTINGS_KEY) ?? null;
    } catch (err) {
        console.error('[DB] getSettings:', err);
        return null;
    }
}

export async function putSettings(settings: Settings): Promise<void> {
    try {
        const db = await getDb();
        await db.put('settings', settings, SETTINGS_KEY);
    } catch (err) {
        console.error('[DB] putSettings:', err);
    }
}

// ============================================================
// Migration — import from storage.sync / storage.local
// ============================================================

/**
 * One-time migration from chrome.storage to IndexedDB.
 * Call this on extension startup — it checks a flag so it only runs once.
 */
export async function migrateFromChromeStorage(): Promise<void> {
    const db = await getDb();
    const alreadyMigrated = await db.get('settings', 'migrated_v1');
    if (alreadyMigrated) return;

    console.log('[DB] Starting migration from chrome.storage...');

    await new Promise<void>((resolve) => {
        ext.storage.sync.get(null, async (syncData) => {
            const entries: Hermidata[] = [];
            const settings = syncData['Settings'] as Settings;

            for (const [key, value] of Object.entries(syncData)) {
                if (key === 'Settings' || key === 'spreadsheetUrl') continue;
                if (typeof value === 'object' && value !== null && 'title' in value) {
                    // Ensure id is set — old entries may use the key as their id
                    entries.push({ id: key, ...value } as Hermidata);
                }
            }

            if (entries.length) await putAllHermidata(entries);
            if (settings) await putSettings(settings);

            // Mark as done
            await db.put('settings', true as unknown as Settings, 'migrated_v1');
            console.log(`[DB] Migrated ${entries.length} entries from chrome.storage.sync`);
            resolve();
        });
    });
}

// ============================================================
// Export / Import (for backup & cross-browser restore)
// ============================================================

export type HermidataExport = {
    version: number;
    exportedAt: string;
    hermidata: Hermidata[];
    feeds: RawFeed[];
    settings: Settings | null;
};

/** Export everything as a plain object — serialize to JSON and let the user download it */
export async function exportAll(): Promise<HermidataExport> {
    const db = await getDb();
    const [hermidata, feeds, settings] = await Promise.all([
        db.getAll('hermidata'),
        db.getAll('feeds'),
        getSettings(),
    ]);
    return {
        version: DB_VERSION,
        exportedAt: new Date().toISOString(),
        hermidata,
        feeds,
        settings,
    };
}

/* Export Hermidata as a plain object — serialize to JSON and let the user download it*/
export async function exportHermidataOnly(): Promise<{ version: number; exportedAt: string; items: Hermidata[] }> {
    const db = await getDb();
    const AllHermidata = await db.getAll('hermidata');
    return {
        version: DB_VERSION,
        exportedAt: new Date().toISOString(),
        items: AllHermidata,
    };
}

/* Export RawFeeds as a plain object — serialize to JSON and let the user download it*/
export async function exportRawFeedsOnly(): Promise<{ version: number; exportedAt: string; items: RawFeed[] }> {
    const db = await getDb();
    const AllRawFeeds = await db.getAll('feeds');
    return {
        version: DB_VERSION,
        exportedAt: new Date().toISOString(),
        items: AllRawFeeds,
    };
}

/* Export Settings as a plain object — serialize to JSON and let the user download it*/
export async function exportSettingsOnly(): Promise<{ version: number; exportedAt: string; items: Settings | null }> {
    const settings = await getSettings()
    return {
        version: DB_VERSION,
        exportedAt: new Date().toISOString(),
        items: settings,
    };
}

/** Import from a previously exported JSON — merges by id, existing entries are overwritten */
export async function importAll(data: HermidataExport): Promise<void> {
    if (data.hermidata?.length) await putAllHermidata(data.hermidata);
    if (data.feeds?.length)     await putAllRawFeeds(data.feeds);
    if (data.settings)          await putSettings(data.settings);
    console.log(`[DB] Imported ${data.hermidata?.length ?? 0} entries, ${data.feeds?.length ?? 0} feeds`);
}