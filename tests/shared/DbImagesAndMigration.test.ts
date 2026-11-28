import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../../scripts/shared/constants';
import type { Settings } from '../../scripts/shared/types';

// In-memory stand-in for the IndexedDB stores db.ts uses
const fake = vi.hoisted(() => {
    const stores = new Map<string, Map<string, unknown>>();
    const storeOf = (name: string) => {
        if (!stores.has(name)) stores.set(name, new Map());
        return stores.get(name)!;
    };
    // the hermidata store is keyed by its `id` field, the others by an explicit key
    const put = (name: string, value: unknown, key?: string) => {
        storeOf(name).set(key ?? (value as { id: string }).id, value);
        return Promise.resolve(key);
    };
    const db = {
        get: async (name: string, key: string) => storeOf(name).get(key),
        put,
        transaction: (name: string) => ({
            store: { put: (value: unknown, key?: string) => put(name, value, key) },
            done: Promise.resolve(),
        }),
    };
    return { stores, storeOf, db, syncData: {} as Record<string, unknown> };
});

vi.mock('idb', () => ({ openDB: vi.fn(async () => fake.db) }));
vi.mock('../../scripts/shared/sync/sync.engine', () => ({ pushToSync: vi.fn(), removeFromSync: vi.fn() }));
vi.mock('../../scripts/shared/utils/BrowserCompat', () => ({
    ext: { storage: { sync: { get: (_keys: null, cb: (data: Record<string, unknown>) => void) => cb(fake.syncData) } } },
}));

import { dbSaveAllImages, migrateFromChromeStorage } from '../../scripts/shared/db/db';

const userSettings = { ...defaultSettings, version: defaultSettings.version, marker: 'user' } as unknown as Settings;

describe('dbSaveAllImages', () => {
    beforeEach(() => fake.stores.clear());

    it('stores every blob under its own id', async () => {
        const first = new Blob(['first']);
        const second = new Blob(['second']);

        await dbSaveAllImages({ 'item-a': first, 'item-b': second });

        expect(fake.storeOf('images').get('item-a')).toBe(first);
        expect(fake.storeOf('images').get('item-b')).toBe(second);
    });
});

describe('migrateFromChromeStorage', () => {
    beforeEach(() => {
        fake.stores.clear();
        fake.syncData = {};
    });

    it('keeps the settings migrateSettings already stored', async () => {
        fake.storeOf('settings').set('Settings', userSettings);
        fake.syncData = { Settings: { old: true } };

        await migrateFromChromeStorage();

        expect(fake.storeOf('settings').get('Settings')).toBe(userSettings);
        expect(fake.storeOf('settings').get('migrated_v1')).toBe(true);
    });

    it('copies the stored settings from storage.sync when IndexedDB has none', async () => {
        fake.syncData = { Settings: userSettings };

        await migrateFromChromeStorage();

        expect(fake.storeOf('settings').get('Settings')).toBe(userSettings);
    });

    it('falls back to the default settings when there are none anywhere', async () => {
        await migrateFromChromeStorage();

        expect(fake.storeOf('settings').get('Settings')).toBe(defaultSettings);
    });

    it('moves the saved items over without treating Settings as one', async () => {
        fake.syncData = { Settings: userSettings, 'item-a': { title: 'Series' } };

        await migrateFromChromeStorage();

        expect([...fake.storeOf('hermidata').keys()]).toEqual(['item-a']);
    });
});
