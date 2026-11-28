import { beforeEach, describe, expect, it, vi } from 'vitest';
import { linkHermidata, moveHermidata, removeHermidata, resolveIdRedirect, runStorageCall, unlinkHermidata } from '../../scripts/shared/db/Storage';
import { pushToSync } from '../../scripts/shared/sync/syncClient';
import { HermidataModel } from '../../scripts/shared/utils/HermidataSelector';
import { getRelatedWorks } from '../../scripts/shared/utils/Relations';
import type { Hermidata, Relation } from '../../scripts/shared/types';

const store = vi.hoisted(() => ({ items: {} as Record<string, Hermidata>, local: {} as Record<string, unknown> }));

vi.mock('../../scripts/shared/db/db', () => ({
    getHermidataByKey: vi.fn(async (key: string) => store.items[key] ? structuredClone(store.items[key]) : null),
    putHermidata: vi.fn(async (entry: Hermidata) => { store.items[entry.id] = structuredClone(entry); }),
    putAllHermidata: vi.fn(async (entries: Hermidata[]) => { for (const entry of entries) store.items[entry.id] = structuredClone(entry); }),
    deleteHermidata: vi.fn(async (key: string) => { delete store.items[key]; }),
    getAllHermidata: vi.fn(async () => structuredClone(store.items)),
    getSettings: vi.fn(),
    getAllRawFeeds: vi.fn(),
    putSettings: vi.fn(),
    putAllRawFeeds: vi.fn(),
    deleteRawFeed: vi.fn(),
    dbGetAllImages: vi.fn(),
    dbDeleteImage: vi.fn(),
    dbSaveImage: vi.fn(),
    dbGetImage: vi.fn(),
    dbSaveAllImages: vi.fn(),
    dbUpdateImageKey: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../scripts/shared/sync/syncClient', () => ({
    pushToSync: vi.fn(),
    removeFromSync: vi.fn(),
}));

vi.mock('../../scripts/shared/sync/syncConfig', () => ({
    loadSyncConfig: vi.fn().mockResolvedValue({ kind: 'browser' }),
}));

const OLD = '2000-01-01T00:00:00.000Z';

function seed(id: string, relations: Relation | 'None' = 'None'): Hermidata {
    const hermidata = HermidataModel.from('Manga', 'Viewing', 'Ongoing').toJSON();
    hermidata.id = id;
    hermidata.title = `Title ${id}`;
    hermidata.meta.relations = relations;
    hermidata.meta.updated = OLD;
    store.items[id] = structuredClone(hermidata);
    return hermidata;
}

const links = (id: string) => store.items[id]?.meta.relations;

beforeEach(() => {
    vi.clearAllMocks();
    store.items = {};
    store.local = {};
    Reflect.set(chrome.storage.local, 'get', (key: string, callback: (result: Record<string, unknown>) => void) => callback({ [key]: store.local[key] }));
    Reflect.set(chrome.storage.local, 'set', (items: Record<string, unknown>, callback?: () => void) => { Object.assign(store.local, items); callback?.(); });
});

describe('linkHermidata', () => {
    it('puts two titles in one group, each listed with its own type, and stamps both for sync', async () => {
        seed('a');
        seed('b');

        const stored = await linkHermidata('a', 'b', 'sequel');

        expect(links('a')).toEqual({ relatedWorks: [{ type: 'sequel', id: 'b' }] });
        expect(links('b')).toEqual({ relatedWorks: [{ type: 'mainStory', id: 'a' }] });
        expect(stored.map(entry => entry.id).sort()).toEqual(['a', 'b']);
        expect(store.items.a.meta.updated).not.toBe(OLD);
        expect(store.items.b.meta.updated).not.toBe(OLD);
        expect(pushToSync).toHaveBeenCalled();
    });

    it('adds a title to every title of the group', async () => {
        seed('a', { relatedWorks: [{ type: 'sequel', id: 'b' }] });
        seed('b', { relatedWorks: [{ type: 'mainStory', id: 'a' }] });
        seed('c');

        await linkHermidata('b', 'c', 'sideStory');

        expect(links('a')).toEqual({ relatedWorks: [{ type: 'sequel', id: 'b' }, { type: 'sideStory', id: 'c' }] });
        expect(links('b')).toEqual({ relatedWorks: [{ type: 'mainStory', id: 'a' }, { type: 'sideStory', id: 'c' }] });
        expect(links('c')).toEqual({ relatedWorks: [{ type: 'sequel', id: 'b' }, { type: 'mainStory', id: 'a' }] });
    });

    it('changes the type of any title of the group, the one of the page itself too, everywhere it is listed', async () => {
        seed('a', { relatedWorks: [{ type: 'sequel', id: 'b' }, { type: 'sideStory', id: 'c' }] });
        seed('b', { relatedWorks: [{ type: 'mainStory', id: 'a' }, { type: 'sideStory', id: 'c' }] });
        seed('c', { relatedWorks: [{ type: 'mainStory', id: 'a' }, { type: 'sequel', id: 'b' }] });

        const changed = await linkHermidata('c', 'b', 'sideStory');
        await linkHermidata('c', 'c', 'summary');

        expect(changed.map(entry => entry.id)).toEqual(['c', 'a']); // b does not list itself, so it did not change
        expect(links('a')).toEqual({ relatedWorks: [{ type: 'sideStory', id: 'b' }, { type: 'summary', id: 'c' }] });
        expect(links('b')).toEqual({ relatedWorks: [{ type: 'mainStory', id: 'a' }, { type: 'summary', id: 'c' }] });
    });

    it('joins two groups when a title that has related titles of its own is added', async () => {
        seed('a', { relatedWorks: [{ type: 'sequel', id: 'b' }] });
        seed('b', { relatedWorks: [{ type: 'mainStory', id: 'a' }] });
        seed('x', { relatedWorks: [{ type: 'sideStory', id: 'y' }] });
        seed('y', { relatedWorks: [{ type: 'mainStory', id: 'x' }] });

        await linkHermidata('a', 'x', 'spinOff');

        for (const id of ['a', 'b', 'x', 'y']) expect(getRelatedWorks(links(id)).map(work => work.id).sort()).toEqual(['a', 'b', 'x', 'y'].filter(other => other !== id));
        expect(getRelatedWorks(links('b')).find(work => work.id === 'x')?.type).toBe('spinOff');
        expect(getRelatedWorks(links('b')).find(work => work.id === 'y')?.type).toBe('sideStory');
    });

    it('refuses a title that does not exist, and a type for a title that has no related titles yet', async () => {
        seed('a');

        await expect(linkHermidata('a', 'missing', 'sequel')).rejects.toThrow();
        await expect(linkHermidata('a', 'a', 'sequel')).rejects.toThrow();
        expect(links('a')).toBe('None');
    });

    it('can be run from a page through the background', async () => {
        seed('a');
        seed('b');

        const response = await runStorageCall('linkHermidata', ['a', 'b', 'sideStory']);

        expect(response.success).toBe(true);
        expect(links('a')).toEqual({ relatedWorks: [{ type: 'sideStory', id: 'b' }] });
    });
});

describe('unlinkHermidata', () => {
    it('takes a title out of the group on every title, and the title forgets the group', async () => {
        seed('a', { relatedWorks: [{ type: 'sequel', id: 'b' }, { type: 'sideStory', id: 'c' }] });
        seed('b', { relatedWorks: [{ type: 'mainStory', id: 'a' }, { type: 'sideStory', id: 'c' }] });
        seed('c', { relatedWorks: [{ type: 'mainStory', id: 'a' }, { type: 'sequel', id: 'b' }] });

        const changed = await unlinkHermidata('c', 'b');

        expect(changed.map(entry => entry.id).sort()).toEqual(['a', 'b', 'c']);
        expect(links('a')).toEqual({ relatedWorks: [{ type: 'sideStory', id: 'c' }] });
        expect(links('c')).toEqual({ relatedWorks: [{ type: 'mainStory', id: 'a' }] });
        expect(links('b')).toBe('None');
    });

    it('leaves the last title alone with None', async () => {
        seed('a', { relatedWorks: [{ type: 'sequel', id: 'b' }] });
        seed('b', { relatedWorks: [{ type: 'mainStory', id: 'a' }] });

        await unlinkHermidata('a', 'b');

        expect(links('a')).toBe('None');
        expect(links('b')).toBe('None');
    });

    it('drops a link to a title that is gone', async () => {
        seed('a', { relatedWorks: [{ type: 'sequel', id: 'gone' }, { type: 'sideStory', id: 'b' }] });
        seed('b', { relatedWorks: [{ type: 'mainStory', id: 'a' }] });

        await unlinkHermidata('a', 'gone');

        expect(links('a')).toEqual({ relatedWorks: [{ type: 'sideStory', id: 'b' }] });
        expect(store.items.b.meta.updated).toBe(OLD); // its links did not change
    });
});

describe('links follow an entry that is deleted, moved or merged', () => {
    it('drops the links to a deleted entry from every other entry', async () => {
        seed('gone', { relatedWorks: [{ type: 'sequel', id: 'b' }] });
        seed('b', { relatedWorks: [{ type: 'prequel', id: 'gone' }, { type: 'sideStory', id: 'c' }] });
        seed('c', { relatedWorks: [{ type: 'sideStory', id: 'b' }] });

        await removeHermidata('gone');

        expect(store.items.gone).toBeUndefined();
        expect(links('b')).toEqual({ relatedWorks: [{ type: 'sideStory', id: 'c' }] });
        expect(store.items.b.meta.updated).not.toBe(OLD); // so sync carries the cleanup
        expect(store.items.c.meta.updated).toBe(OLD);     // not linked to the deleted entry: untouched
    });

    it('points the links at the entry a merged one moved into, without a second link to it', async () => {
        seed('merged', { relatedWorks: [{ type: 'sequel', id: 'b' }] });
        seed('b', { relatedWorks: [{ type: 'mainStory', id: 'merged' }, { type: 'mainStory', id: 'kept' }] });
        seed('kept', { relatedWorks: [{ type: 'sequel', id: 'b' }] });

        await moveHermidata('kept', 'merged', structuredClone(store.items.merged));

        expect(store.items.kept).toBeUndefined();
        expect(links('b')).toEqual({ relatedWorks: [{ type: 'mainStory', id: 'merged' }] });
        expect(await resolveIdRedirect('kept')).toBe('merged');
    });

    it('points the links at the new id of an entry that moved', async () => {
        seed('old', { relatedWorks: [{ type: 'sequel', id: 'b' }] });
        seed('b', { relatedWorks: [{ type: 'prequel', id: 'old' }] });
        const entry = structuredClone(store.items.old);

        await moveHermidata('old', 'new', entry);

        expect(store.items.old).toBeUndefined();
        expect(links('new')).toEqual({ relatedWorks: [{ type: 'sequel', id: 'b' }] });
        expect(links('b')).toEqual({ relatedWorks: [{ type: 'prequel', id: 'new' }] });
    });

    it('changes no other entry when the moved entry keeps its id', async () => {
        seed('a', { relatedWorks: [{ type: 'sequel', id: 'b' }] });
        seed('b', { relatedWorks: [{ type: 'prequel', id: 'a' }] });

        await moveHermidata('a', 'a', structuredClone(store.items.a));

        expect(store.items.b.meta.updated).toBe(OLD);
    });
});
