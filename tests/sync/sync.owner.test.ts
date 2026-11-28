// Only the background runs the sync engine. Pages report their writes to it by message, so every push is
// scheduled and every tombstone is written in one place.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SyncOwner } from '../../scripts/shared/types';
import { FakeCloud, makeDevice, makeNovel, resetDevices, settle } from './sync.testKit';

const browser = vi.hoisted(() => ({ sendMessage: vi.fn(), log: vi.fn() }));
vi.mock('../../scripts/shared/utils/BrowserCompat', () => ({ ext: { runtime: { sendMessage: browser.sendMessage } } }));
vi.mock('../../scripts/shared/utils/ErrorMessage', () => ({ logConsoleError: browser.log, WarningMessage: class {} }));

/** The client as a freshly loaded page sees it: no owner registered */
async function freshClient() {
    vi.resetModules();
    return import('../../scripts/shared/sync/syncClient');
}

const owner = () => ({ schedulePush: vi.fn<SyncOwner['schedulePush']>(), recordDelete: vi.fn<SyncOwner['recordDelete']>() });

describe('library writes from a page', () => {
    beforeEach(() => {
        browser.sendMessage.mockReset().mockResolvedValue(undefined);
        browser.log.mockReset();
    });

    it('tell the background about a change instead of pushing from the page', async () => {
        const { pushToSync } = await freshClient();
        pushToSync();
        expect(browser.sendMessage).toHaveBeenCalledWith({ type: 'SYNC_LOCAL_CHANGE' });
    });

    it('hand a delete to the background, which keeps the tombstone', async () => {
        const { removeFromSync } = await freshClient();
        removeFromSync('gone');
        expect(browser.sendMessage).toHaveBeenCalledWith({ type: 'SYNC_RECORD_DELETE', id: 'gone' });
    });

    it('log, never throw, when the background cannot be reached', async () => {
        const { pushToSync } = await freshClient();
        browser.sendMessage.mockRejectedValue(new Error('Receiving end does not exist'));
        expect(() => pushToSync()).not.toThrow();
        await vi.waitFor(() => expect(browser.log).toHaveBeenCalled());
    });
});

describe('library writes in the background', () => {
    beforeEach(() => browser.sendMessage.mockReset());

    it('go straight to its engine, with no message', async () => {
        const { pushToSync, removeFromSync, registerSyncOwner } = await freshClient();
        const engine = owner();
        registerSyncOwner(engine);

        pushToSync();
        removeFromSync('gone');

        expect(engine.schedulePush).toHaveBeenCalledOnce();
        expect(engine.recordDelete).toHaveBeenCalledWith('gone');
        expect(browser.sendMessage).not.toHaveBeenCalled();
    });
});

describe('the one engine', () => {
    beforeEach(() => {
        resetDevices();
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
        vi.setSystemTime(new Date('2026-11-16T12:00:00.000Z'));
    });
    afterEach(() => vi.useRealTimers());

    it('keeps every tombstone when several pages delete at once', async () => {
        const novels = [makeNovel(1), makeNovel(2), makeNovel(3)];
        const background = makeDevice(new FakeCloud(), 'A', novels);
        await background.start();

        // three deletes arriving together, as messages from the popup, library and reading list
        for (const novel of novels) background.remove(novel.id);
        await settle();

        expect(Object.keys(background.local.data['syncTombstones'] as object).sort()).toEqual(novels.map(n => n.id).sort());
    });
});
