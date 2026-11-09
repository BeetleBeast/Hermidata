import { afterEach, describe, expect, it, vi } from 'vitest';
import { HermidataModel } from '../scripts/shared/utils/HermidataSelector';
import { HermidataMigration } from '../scripts/shared/migration/Hermidata';

const mocks = vi.hoisted(() => ({
    addListener: vi.fn(),
    getLocal: vi.fn().mockResolvedValue({ deviceId: 'local-device' }),
    putHermidata: vi.fn().mockResolvedValue(undefined),
    getHermidataViaKey: vi.fn().mockResolvedValue(null),
}));

vi.mock('../scripts/shared/utils/BrowserCompat', () => ({
    ext: {
        storage: {
            onChanged: { addListener: mocks.addListener },
            local: { get: mocks.getLocal, set: vi.fn() },
            sync: { set: vi.fn(), remove: vi.fn() },
        },
    },
}));

vi.mock('../scripts/shared/db/db', async importOriginal => ({
    ...await importOriginal<typeof import('../scripts/shared/db/db')>(),
    putHermidata: mocks.putHermidata,
}));

vi.mock('../scripts/shared/db/Storage', async importOriginal => ({
    ...await importOriginal<typeof import('../scripts/shared/db/Storage')>(),
    getHermidataViaKey: mocks.getHermidataViaKey,
}));

import { initSync } from '../scripts/shared/db/sync';

afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
});

describe('sync model version guard', () => {
    it('does not re-migrate entries already at the models current version', async () => {
        const model = HermidataModel.from('Manga', 'Viewing', 'Ongoing');
        const migrate = vi.spyOn(HermidataMigration, 'migrateAllHermidataToLatest');
        mocks.getHermidataViaKey.mockRejectedValueOnce(new Error('stop after version guard'));
        initSync();
        const onChanged = mocks.addListener.mock.calls[0][0] as (
            changes: Record<string, chrome.storage.StorageChange>,
            area: string
        ) => Promise<void>;
        vi.stubGlobal('chrome', {
            storage: { local: { get: mocks.getLocal, set: vi.fn() } },
        });

        await expect(onChanged({
                [model.id]: {
                    newValue: { ...model.toJSON(), _syncedBy: 'remote-device' },
                    oldValue: undefined,
                },
            }, 'sync'))
            .rejects.toThrow('stop after version guard');

        expect(model.IsLatestVersion()).toBe(true);
        expect(migrate).not.toHaveBeenCalled();
        expect(mocks.getHermidataViaKey).toHaveBeenCalledWith(model.id);
    });
});
