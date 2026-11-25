// A device set to "local only": the engine never pulls, pushes or remembers deletions, and encryption is refused.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserSyncBackend } from '../../scripts/shared/sync/BrowserSyncBackend';
import { LocalBackend } from '../../scripts/shared/sync/LocalBackend';
import { SYNC_STATUS_KEY } from '../../scripts/shared/sync/syncConfig';
import { FakeCloud, makeDevice, makeNovel, resetDevices, settle } from './sync.testKit';

vi.mock('../../scripts/shared/utils/BrowserCompat', () => ({ ext: {} }));   // tests inject their own APIs

beforeEach(() => {
    resetDevices();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-11-16T12:00:00.000Z'));
});
afterEach(() => vi.useRealTimers());

describe('LocalBackend', () => {
    it('holds nothing and refuses to publish', async () => {
        const backend = new LocalBackend();
        expect(await backend.read()).toBeNull();
        await expect(backend.write()).rejects.toThrow(/local only/);
    });
});

describe('a device that is local only', () => {
    it('does not touch browser sync after switching, whatever happens to the library', async () => {
        const cloud = new FakeCloud();
        const novels = [makeNovel(1), makeNovel(2)];
        const a = makeDevice(cloud, 'A', novels);
        await a.start();
        const writes = cloud.area.setCalls;

        await a.sync.switchBackend(new LocalBackend());
        a.edit(novels[0].id, h => { h.chapter.bookmarks['bm1'].current = 50; });
        a.add(makeNovel(3));
        a.sync.refresh();
        await settle();

        expect(cloud.area.setCalls).toBe(writes);
        expect(a.notices.errors).toEqual([]);
    });

    it('stops watching the old backend and drops the "last synced" status', async () => {
        const cloud = new FakeCloud();
        const a = makeDevice(cloud, 'A', [makeNovel(1)]);
        await a.start();
        expect(cloud.listeners).toHaveLength(1);
        expect(a.local.data[SYNC_STATUS_KEY]).toBeDefined();

        await a.sync.switchBackend(new LocalBackend());
        expect(cloud.listeners).toHaveLength(0);
        expect(a.local.data[SYNC_STATUS_KEY]).toBeUndefined();
    });

    it('does not remember deletions: there is nobody to tell', async () => {
        const a = makeDevice(new FakeCloud(), 'A', [makeNovel(1)]);
        await a.start();
        await a.sync.switchBackend(new LocalBackend());

        a.sync.recordDelete('1000001');
        await settle();
        expect(a.local.data['syncTombstones'] ?? {}).toEqual({});
    });

    it('never starts syncing on a start() while local only', async () => {
        const cloud = new FakeCloud();
        const a = makeDevice(cloud, 'A', [makeNovel(1)], { backend: new LocalBackend() });
        await a.start();
        expect(cloud.area.setCalls).toBe(0);
    });

    it('refuses to change encryption', async () => {
        const a = makeDevice(new FakeCloud(), 'A', [makeNovel(1)]);
        await a.start();
        await a.sync.switchBackend(new LocalBackend());

        await expect(a.sync.setEncryption(null)).rejects.toThrow(/local only/);
        await expect(a.sync.replaceUnreadable(null)).rejects.toThrow(/local only/);
    });

    it('syncing again afterwards publishes what was added while local only', async () => {
        const cloud = new FakeCloud();
        const a = makeDevice(cloud, 'A', [makeNovel(1)]);
        await a.start();
        await a.sync.switchBackend(new LocalBackend());
        a.add(makeNovel(2));
        await settle();

        await a.sync.switchBackend(new BrowserSyncBackend(cloud.apiForDevice(), async () => 'A'));
        await settle();

        const b = makeDevice(cloud, 'B');
        await b.start();
        expect(b.list().map(h => h.id)).toEqual(['1000001', '1000002']);
        expect(a.notices.errors).toEqual([]);
    });
});
