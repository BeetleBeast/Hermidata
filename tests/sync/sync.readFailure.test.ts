// A library read that fails ( a broken or blocked IndexedDB ) must never look like an empty library to sync:
// merging, adopting and publishing all stop, and pick up again once reads work.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SYNC_ADOPT_KEY } from '../../scripts/shared/sync/syncConfig';
import { clone, FakeCloud, makeDevice, makeNovel, resetDevices, settle } from './sync.testKit';

vi.mock('../../scripts/shared/utils/BrowserCompat', () => ({ ext: {} }));   // tests inject their own APIs

beforeEach(() => {
    resetDevices();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-11-16T12:00:00.000Z'));
});
afterEach(() => vi.useRealTimers());

type Device = ReturnType<typeof makeDevice>;
const ids = (d: Device) => [...d.db.keys()].sort();
const chapter = (d: Device, id: string) => d.db.get(id)!.chapter.bookmarks['bm1'].current;

/** What the cloud holds, seen through a fresh device */
async function cloudContents(cloud: FakeCloud): Promise<string[]> {
    const probe = makeDevice(cloud, `probe-${Math.random()}`, [], { push: false });
    await probe.start();
    return ids(probe);
}

describe('a failed library read during sync', () => {
    it('does not let an older remote entry overwrite a newer local one', async () => {
        const cloud = new FakeCloud();
        const novel = makeNovel(1);
        const a = makeDevice(cloud, 'A', [novel]);
        const b = makeDevice(cloud, 'B', [novel]);
        await a.start();
        await b.start();

        a.edit(novel.id, h => { h.chapter.bookmarks['bm1'].current = 10; });
        // B holds a later edit it has not published yet
        const newer = clone(b.db.get(novel.id)!);
        newer.chapter.bookmarks['bm1'].current = 20;
        newer.meta.updated = new Date(Date.now() + 60_000).toISOString();
        b.db.set(novel.id, newer);

        b.failReads(true);
        await settle();                                   // A publishes, B pulls and cannot read its library

        expect(chapter(b, novel.id)).toBe(20);            // the merge stopped before taking anything
        expect(b.notices.errors).toContain('[Sync] task failed');

        b.failReads(false);
        b.sync.refresh();
        await settle();

        expect(chapter(b, novel.id)).toBe(20);            // newest still wins once the read works
        expect(chapter(a, novel.id)).toBe(20);            // and B's edit reaches A
    });

    it('never publishes an empty library with only tombstones', async () => {
        const cloud = new FakeCloud();
        const [one, two] = [makeNovel(1), makeNovel(2)];
        const a = makeDevice(cloud, 'A', [one, two]);
        await a.start();

        a.failReads(true);
        a.remove(two.id);                                 // the tombstone is saved, the push cannot read the library
        await settle();
        expect(await cloudContents(cloud)).toEqual([one.id, two.id]);   // the last good snapshot stays

        a.failReads(false);
        a.sync.refresh();                                 // the failed push is retried with the next pull
        await settle();
        expect(await cloudContents(cloud)).toEqual([one.id]);
    });

    it('postpones "use the server copy" instead of adopting over an unread library', async () => {
        const cloud = new FakeCloud();
        const server = makeDevice(cloud, 'S', [makeNovel(1), makeNovel(2)]);
        await server.start();

        const onlyHere = makeNovel(3);
        const a = makeDevice(cloud, 'A', [onlyHere]);
        a.local.data[SYNC_ADOPT_KEY] = true;
        a.failReads(true);
        await a.start();

        expect(ids(a)).toEqual([onlyHere.id]);            // nothing taken, nothing removed
        expect(a.local.data[SYNC_ADOPT_KEY]).toBe(true);  // still to do

        a.failReads(false);
        a.sync.refresh();
        await settle();

        expect(ids(a)).toEqual(ids(server));              // adopted: exactly the server copy
        expect(a.local.data[SYNC_ADOPT_KEY]).toBe(false);
    });
});
