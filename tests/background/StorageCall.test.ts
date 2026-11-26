import { beforeEach, describe, expect, it, vi } from 'vitest';

const runStorageCall = vi.hoisted(() => vi.fn());

vi.mock('../../scripts/shared/db/Storage', () => ({ runStorageCall }));

// what rssCache imports and this test does not use
vi.mock('../../scripts/rss/load', () => ({}));
vi.mock('../../scripts/shared/db/db', () => ({}));
vi.mock('../../scripts/background/auth', () => ({}));
vi.mock('../../scripts/background/bookmarks', () => ({}));
vi.mock('../../scripts/background/sheets', () => ({}));
vi.mock('../../scripts/background/rssNotify', () => ({}));
vi.mock('../../scripts/background/feedFetch', () => ({}));
vi.mock('../../scripts/background/parseXML', () => ({}));
vi.mock('../../scripts/background/altTitles', () => ({}));

import { handleStorageCall, onSettingsSaved } from '../../scripts/background/rssCache';

describe('STORAGE_CALL in the background', () => {
    const settingsSaved = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        onSettingsSaved(settingsSaved);
    });

    it('runs the call and answers with what it returned', async () => {
        runStorageCall.mockResolvedValue({ success: true, result: 'stored' });
        const respond = vi.fn();

        await handleStorageCall('saveHermidata', ['key', { id: 'key' }], respond);

        expect(runStorageCall).toHaveBeenCalledWith('saveHermidata', ['key', { id: 'key' }]);
        expect(respond).toHaveBeenCalledWith({ success: true, result: 'stored' });
    });

    it('tells the background listeners when a page saved the settings', async () => {
        runStorageCall.mockResolvedValue({ success: true, result: undefined });
        const respond = vi.fn();

        await handleStorageCall('setSettings', [{}], respond);

        expect(respond).toHaveBeenCalledTimes(1);
        expect(settingsSaved).toHaveBeenCalledTimes(1);
    });

    it('does not tell them about anything else', async () => {
        runStorageCall.mockResolvedValue({ success: true, result: undefined });

        await handleStorageCall('saveHermidata', ['key', {}], vi.fn());
        await handleStorageCall('getSettings', [], vi.fn());

        expect(settingsSaved).not.toHaveBeenCalled();
    });

    it('does not tell them when the settings were not saved', async () => {
        runStorageCall.mockResolvedValue({ success: false, error: 'disk is full' });
        const respond = vi.fn();

        await handleStorageCall('setSettings', [{}], respond);

        expect(respond).toHaveBeenCalledWith({ success: false, error: 'disk is full' });
        expect(settingsSaved).not.toHaveBeenCalled();
    });
});
