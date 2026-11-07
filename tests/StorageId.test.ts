import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbAccess, saveHermidata, updateHermidata } from '../scripts/shared/db/Storage';
import { HermidataModel } from '../scripts/shared/utils/HermidataSelector';
import { returnHashedTitle } from '../scripts/shared/utils/StringOutput';
import { dbUpdateImageKey, deleteHermidata, putHermidata } from '../scripts/shared/db/db';
import { pushToSync, removeFromSync } from '../scripts/shared/db/sync';

vi.mock('../scripts/shared/db/db', () => ({
    getHermidataByKey: vi.fn(),
    putHermidata: vi.fn().mockResolvedValue(undefined),
    deleteHermidata: vi.fn().mockResolvedValue(undefined),
    getAllHermidata: vi.fn(),
    getSettings: vi.fn(),
    getAllRawFeeds: vi.fn(),
    putSettings: vi.fn(),
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

vi.mock('../scripts/shared/db/sync', () => ({
    pushToSync: vi.fn().mockResolvedValue(undefined),
    removeFromSync: vi.fn().mockResolvedValue(undefined),
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

        await saveHermidata('chosen-key', entry);

        expect(entry.id).toBe('chosen-key');
        expect(putHermidata).toHaveBeenCalledWith(entry, false);
        expect(pushToSync).toHaveBeenCalledWith(entry);
    });

    it('generates the ID from the entry title and type when no key or ID is supplied', async () => {
        const entry = createHermidata();
        entry.id = '';
        const expectedId = returnHashedTitle(entry.title, entry.novelType, entry.chapter.bookmarks[entry.chapter.bookmarkInUse].url);

        await saveHermidata('', entry);

        expect(entry.id).toBe(expectedId);
        expect(putHermidata).toHaveBeenCalledWith(entry, false);
    });

    it('updates the stored ID, removes the previous key, and migrates sync and image keys', async () => {
        const entry = createHermidata();

        await updateHermidata('old-key', 'new-key', entry);

        expect(entry.id).toBe('new-key');
        expect(putHermidata).toHaveBeenCalledWith(entry, false);
        expect(deleteHermidata).toHaveBeenCalledWith('old-key', false);
        expect(dbUpdateImageKey).toHaveBeenCalledWith('old-key', 'new-key');
        expect(pushToSync).toHaveBeenCalledWith(entry);
        expect(removeFromSync).toHaveBeenCalledWith('old-key');
    });

    it('changes the ID through the background database and sync operations', async () => {
        const entry = createHermidata();
        const sendMessage = vi.mocked(chrome.runtime.sendMessage);
        sendMessage.mockImplementation((message, callback) => {
            if (typeof callback === 'function') callback({ success: true, result: undefined });
            return Promise.resolve(undefined);
        });

        await new dbAccess().changeHermidata('old-key', 'new-key', entry);

        expect(entry.id).toBe('new-key');
        expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'DB_OPERATION',
            store: 'hermidata',
            call: expect.objectContaining({
                operation: 'put',
                payload: expect.objectContaining({ id: 'new-key', data: entry }),
            }),
        }), expect.any(Function));
        expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'SYNC_OPERATION',
            call: expect.objectContaining({ operation: 'removeFromSync', payload: { id: 'old-key' } }),
        }), expect.any(Function));
    });
});
