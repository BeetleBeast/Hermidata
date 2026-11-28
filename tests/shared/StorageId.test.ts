import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbAccess, moveHermidata, removeHermidata, runStorageCall, saveHermidata, storageCalls } from '../../scripts/shared/db/Storage';
import { HermidataModel } from '../../scripts/shared/utils/HermidataSelector';
import { generateHermidataHash } from '../../scripts/shared/utils/StringOutput';
import { dbUpdateImageKey, deleteHermidata, putHermidata, putSettings } from '../../scripts/shared/db/db';
import { pushToSync, removeFromSync } from '../../scripts/shared/sync/syncClient';
import { loadSyncConfig } from '../../scripts/shared/sync/syncConfig';
import type { OnlyPlainHermidata, Settings } from '../../scripts/shared/types';

vi.mock('../../scripts/shared/db/db', () => ({
    getHermidataByKey: vi.fn(),
    putHermidata: vi.fn().mockResolvedValue(undefined),
    deleteHermidata: vi.fn().mockResolvedValue(undefined),
    getAllHermidata: vi.fn(),
    getSettings: vi.fn(),
    getAllRawFeeds: vi.fn(),
    putSettings: vi.fn().mockResolvedValue(undefined),
    putAllRawFeeds: vi.fn(),
    putAllHermidata: vi.fn(),
    deleteRawFeed: vi.fn(),
    dbGetAllImages: vi.fn(),
    dbDeleteImage: vi.fn(),
    dbSaveImage: vi.fn(),
    dbGetImage: vi.fn(),
    dbSaveAllImages: vi.fn(),
    dbUpdateImageKey: vi.fn().mockResolvedValue(undefined),
    updateImageKey: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../scripts/shared/sync/syncClient', () => ({
    pushToSync: vi.fn().mockResolvedValue(undefined),
    removeFromSync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../scripts/shared/sync/syncConfig', () => ({
    loadSyncConfig: vi.fn().mockResolvedValue({ kind: 'browser' }),
}));

function createHermidata() {
    const hermidata = HermidataModel.from('Manga', 'Viewing', 'Ongoing');
    hermidata.title = 'Series';
    hermidata.SetUrl('https://example.com/series/chapter-12');
    return hermidata.toJSON();
}

describe('Hermidata storage ID changes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('saves under the requested key and keeps the entry ID in sync', async () => {
        const entry = createHermidata();

        const stored = await saveHermidata('chosen-key', entry);

        expect(stored).toBe(entry);
        expect(entry.id).toBe('chosen-key');
        expect(putHermidata).toHaveBeenCalledWith(entry, false);
        expect(pushToSync).toHaveBeenCalledWith(entry);
    });

    it('generates the ID from the entry title and type when no key or ID is supplied', async () => {
        const entry = createHermidata();
        entry.id = '';
        const expectedId = generateHermidataHash(entry.title, entry.novelType, entry.chapter.bookmarks[entry.chapter.bookmarkInUse].url);

        await saveHermidata('', entry);

        expect(entry.id).toBe(expectedId);
        expect(putHermidata).toHaveBeenCalledWith(entry, false);
    });

    it('moves an entry to a new ID: writes the new key, removes the previous key, and migrates sync and image keys', async () => {
        const entry = createHermidata();

        const stored = await moveHermidata('old-key', 'new-key', entry);

        expect(stored).toBe(entry);
        expect(entry.id).toBe('new-key');
        expect(putHermidata).toHaveBeenCalledWith(entry, false);
        expect(deleteHermidata).toHaveBeenCalledWith('old-key', false);
        expect(dbUpdateImageKey).toHaveBeenCalledWith('old-key', 'new-key');
        expect(pushToSync).toHaveBeenCalledWith(entry);
        expect(removeFromSync).toHaveBeenCalledWith('old-key');
    });

    it('writes the new key before it removes the old one, so a failure in between never loses the entry', async () => {
        const order: string[] = [];
        vi.mocked(putHermidata).mockImplementationOnce(async () => { order.push('put'); });
        vi.mocked(deleteHermidata).mockImplementationOnce(async () => { order.push('delete'); });

        await moveHermidata('old-key', 'new-key', createHermidata());

        expect(order).toEqual(['put', 'delete']);
    });

    it('keeps the entry when it is moved to the key it already has', async () => {
        const entry = createHermidata();
        entry.id = 'same-key';

        const stored = await moveHermidata('same-key', 'same-key', entry);

        expect(stored.id).toBe('same-key');
        expect(putHermidata).toHaveBeenCalledWith(entry, false);
        expect(pushToSync).toHaveBeenCalledWith(entry);
        // the old key IS the new key: removing it would remove the entry that was just written
        expect(deleteHermidata).not.toHaveBeenCalled();
        expect(removeFromSync).not.toHaveBeenCalled();
        expect(dbUpdateImageKey).not.toHaveBeenCalled();
    });

    it('stamps the entry as updated when it is moved to the same key, so sync carries the change', async () => {
        const entry = createHermidata();
        entry.meta.updated = '2000-01-01T00:00:00.000Z';

        await moveHermidata('same-key', 'same-key', entry);

        expect(entry.meta.updated).not.toBe('2000-01-01T00:00:00.000Z');
    });

    it('leaves a stored image reference alone when the key does not change', async () => {
        const entry = createHermidata();
        entry.meta.image = { kind: 'stored', id: 'same-key' };

        await moveHermidata('same-key', 'same-key', entry);

        expect(entry.meta.image).toEqual({ kind: 'stored', id: 'same-key' });
    });

    it('points a stored image at the new key when the key changes', async () => {
        const entry = createHermidata();
        entry.meta.image = { kind: 'stored', id: 'old-key' };

        await moveHermidata('old-key', 'new-key', entry);

        expect(entry.meta.image).toEqual({ kind: 'stored', id: 'new-key' });
    });

    it('removes an entry from IndexedDB and from sync', async () => {
        await removeHermidata('gone');

        expect(deleteHermidata).toHaveBeenCalledWith('gone', false);
        expect(removeFromSync).toHaveBeenCalledWith('gone');
    });
});

describe('Settings saved through the background', () => {
    const settings = { version: 1 } as unknown as Settings;
    const sync = { set: vi.fn().mockResolvedValue(undefined) };
    const localSet = vi.fn().mockResolvedValue(undefined);

    beforeEach(() => {
        vi.clearAllMocks();
        Reflect.set(chrome.storage, 'sync', sync);
        Reflect.set(chrome.storage.local, 'set', localSet);
    });

    it('writes IndexedDB and storage.sync, like the direct call', async () => {
        const response = await runStorageCall('setSettings', [settings]);

        expect(response.success).toBe(true);
        expect(putSettings).toHaveBeenCalledWith(settings);
        expect(sync.set).toHaveBeenCalledWith({ Settings: settings });
    });

    it('keeps a device that does not sync off storage.sync', async () => {
        vi.mocked(loadSyncConfig).mockResolvedValueOnce({ kind: 'local' } as Awaited<ReturnType<typeof loadSyncConfig>>);

        await runStorageCall('setSettings', [settings]);

        expect(sync.set).not.toHaveBeenCalled();
        expect(localSet).toHaveBeenCalledWith({ Settings: settings });
    });
});

describe('dbAccess', () => {
    const sendMessage = vi.mocked(chrome.runtime.sendMessage);

    /** The background answers every message with `answer` */
    function backgroundAnswers(answer: unknown): void {
        sendMessage.mockImplementation(((_message: unknown, callback?: unknown) => {
            if (typeof callback === 'function') callback(answer);
            return Promise.resolve(undefined);
        }) as never);
    }

    beforeEach(() => {
        vi.clearAllMocks();
        Reflect.set(chrome.runtime, 'lastError', undefined);
    });

    it('has a method for every function it runs in the background, with the same name', () => {
        for (const name of Object.keys(storageCalls)) expect(typeof Reflect.get(dbAccess.prototype, name), name).toBe('function');
    });

    it('has no other way to reach the database: nothing but those methods', () => {
        const methods = Object.getOwnPropertyNames(dbAccess.prototype).filter(name => name !== 'constructor' && name !== 'call');
        expect(methods.sort()).toEqual(Object.keys(storageCalls).sort());
    });

    it('asks the background to run saveHermidata with the same arguments', async () => {
        const entry = createHermidata();
        backgroundAnswers({ success: true, result: { ...entry, id: 'chosen-key' } });

        await new dbAccess().saveHermidata('chosen-key', entry);

        expect(sendMessage).toHaveBeenCalledTimes(1);
        expect(sendMessage).toHaveBeenCalledWith({ type: 'STORAGE_CALL', fn: 'saveHermidata', args: ['chosen-key', entry] }, expect.any(Function));
    });

    it('gives the entry the id and update time that were stored, as the direct call does', async () => {
        const entry = createHermidata();
        backgroundAnswers({ success: true, result: { ...entry, id: 'chosen-key', meta: { ...entry.meta, updated: '2030-05-05T00:00:00.000Z' } } });

        await new dbAccess().saveHermidata('', entry);

        expect(entry.id).toBe('chosen-key');
        expect(entry.meta.updated).toBe('2030-05-05T00:00:00.000Z');
    });

    it('asks the background to move an entry, and gives the entry its new id and image', async () => {
        const entry = createHermidata();
        entry.meta.image = { kind: 'stored', id: 'old-key' };
        backgroundAnswers({ success: true, result: { ...entry, id: 'new-key', meta: { ...entry.meta, image: { kind: 'stored', id: 'new-key' } } } });

        await new dbAccess().moveHermidata('old-key', 'new-key', entry);

        expect(sendMessage).toHaveBeenCalledWith({ type: 'STORAGE_CALL', fn: 'moveHermidata', args: ['old-key', 'new-key', entry] }, expect.any(Function));
        expect(entry.id).toBe('new-key');
        expect(entry.meta.image).toEqual({ kind: 'stored', id: 'new-key' });
    });

    it('sends one message per call: sync is done by the function it runs, not asked for again', async () => {
        backgroundAnswers({ success: true, result: undefined });

        await new dbAccess().removeHermidata('gone');

        expect(sendMessage).toHaveBeenCalledTimes(1);
        expect(sendMessage).toHaveBeenCalledWith({ type: 'STORAGE_CALL', fn: 'removeHermidata', args: ['gone'] }, expect.any(Function));
    });

    it('returns what the function returned', async () => {
        const feeds = { 'https://example.com/feed': { url: 'https://example.com/feed' } };
        backgroundAnswers({ success: true, result: feeds });

        await expect(new dbAccess().getAllRawFeeds()).resolves.toEqual(feeds);
    });

    it('rejects with the reason only: the item that was sent is not part of the message', async () => {
        const entry = createHermidata();
        backgroundAnswers({ success: false, error: 'DataError: Data provided to an operation does not meet requirements.' });

        const failure = await new dbAccess().saveHermidata('k', entry).catch((error: Error) => error);

        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).message).toContain('DataError');
        expect((failure as Error).message).not.toContain(entry.title);
        expect((failure as Error).message.length).toBeLessThan(200);
    });

    it('rejects when the background does not answer', async () => {
        backgroundAnswers(undefined);

        await expect(new dbAccess().getSettings()).rejects.toThrow('no response');
    });

    it('rejects when the message could not be delivered', async () => {
        Reflect.set(chrome.runtime, 'lastError', { message: 'Could not establish connection.' });
        backgroundAnswers(undefined);

        await expect(new dbAccess().getSettings()).rejects.toThrow('Could not establish connection.');
    });
});

describe('runStorageCall', () => {
    beforeEach(() => vi.clearAllMocks());

    it('runs the same function as a direct call, so a page save and a background save do the same', async () => {
        const viaBackground = createHermidata();
        const direct = createHermidata();

        const response = await runStorageCall('saveHermidata', ['chosen-key', viaBackground]);
        await saveHermidata('chosen-key', direct);

        expect(response.success).toBe(true);
        expect(putHermidata).toHaveBeenNthCalledWith(1, viaBackground, false);
        expect(putHermidata).toHaveBeenNthCalledWith(2, direct, false);
        expect(pushToSync).toHaveBeenCalledTimes(2);
        expect(viaBackground.id).toBe(direct.id);
        expect((response.result as OnlyPlainHermidata).id).toBe('chosen-key');
    });

    it('moves an entry to the same key without removing it', async () => {
        const entry = createHermidata();

        const response = await runStorageCall('moveHermidata', ['same-key', 'same-key', entry]);

        expect(response.success).toBe(true);
        expect(deleteHermidata).not.toHaveBeenCalled();
        expect(removeFromSync).not.toHaveBeenCalled();
    });

    it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty', 'nope', '', undefined, 42])('refuses to run %s', async (name) => {
        const response = await runStorageCall(name, []);

        expect(response.success).toBe(false);
        expect(response.error).toContain('Unknown storage call');
        expect(putHermidata).not.toHaveBeenCalled();
    });

    it('answers with the reason when the function throws', async () => {
        vi.mocked(putHermidata).mockRejectedValueOnce(new Error('disk is full'));

        const response = await runStorageCall('saveHermidata', ['k', createHermidata()]);

        expect(response).toEqual({ success: false, error: 'disk is full' });
    });
});
