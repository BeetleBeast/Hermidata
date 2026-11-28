import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../scripts/shared/sync/sync.engine', () => ({
    pushLocalChange: vi.fn(),
    recordLocalDelete: vi.fn(),
    refreshSync: vi.fn(),
    replaceUnreadableSync: vi.fn(),
    setSyncEncryption: vi.fn(),
    switchSyncBackend: vi.fn(),
}));

import { pushLocalChange, recordLocalDelete } from '../../scripts/shared/sync/sync.engine';
import { handleSyncLocalChange, handleSyncRecordDelete } from '../../scripts/background/syncSettings';

describe('sync messages from pages', () => {
    beforeEach(() => vi.clearAllMocks());

    it('a local change makes the background engine push', () => {
        handleSyncLocalChange();
        expect(pushLocalChange).toHaveBeenCalledOnce();
    });

    it('a delete is recorded by the background engine', () => {
        handleSyncRecordDelete('gone');
        expect(recordLocalDelete).toHaveBeenCalledWith('gone');
    });

    it('a delete without an id is refused, so no empty tombstone is written', () => {
        expect(() => handleSyncRecordDelete(undefined)).toThrow();
        expect(() => handleSyncRecordDelete('')).toThrow();
        expect(recordLocalDelete).not.toHaveBeenCalled();
    });
});
