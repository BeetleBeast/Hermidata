// Pointing a device at another backend: pull-before-push starts over, and the first-run choice
// (merge, or adopt the server copy) is applied exactly once.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebDavBackend } from '../../scripts/shared/sync/WebDavBackend';
import { saveSyncConfig, SYNC_ADOPT_KEY } from '../../scripts/shared/sync/syncConfig';
import type { Hermidata } from '../../scripts/shared/types';
import { FakeAlarms, FakeDavServer } from './sync.fakeDav';
import { FakeCloud, makeDevice, makeNovel, resetDevices, settle } from './sync.testKit';

vi.mock('../../scripts/shared/utils/BrowserCompat', () => ({ ext: {} }));   // tests inject their own APIs

const URL_ = 'https://dav.test/dav/hermidata.sync';
type Device = ReturnType<typeof makeDevice>;

beforeEach(() => {
    resetDevices();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-11-16T12:00:00.000Z'));
});
afterEach(() => vi.useRealTimers());

function dav(server: FakeDavServer, alarms: FakeAlarms) {
    return new WebDavBackend({ url: URL_, fetch: server.fetch, alarms });
}

/** A device that already lives on the server, so the server holds a library. */
async function serverWithLibrary(novels: Hermidata[]) {
    const server = new FakeDavServer();
    const alarms = new FakeAlarms();
    const s = makeDevice(new FakeCloud(), 'S', novels, { backend: dav(server, alarms) });
    await s.start();
    return { server, alarms, s };
}

/** What the server holds, seen through a fresh device. */
async function serverContents(server: FakeDavServer) {
    const probe = makeDevice(new FakeCloud(), 'probe', [], { backend: dav(server, new FakeAlarms()) });
    await probe.start();
    return probe;
}

const ids = (d: Device) => [...d.db.keys()].sort();
const current = (d: Device, id: string, bm: string) => d.db.get(id)!.chapter.bookmarks[bm].current;
const adoptMode = (d: Device) => () => saveSyncConfig(d.local as any, { kind: 'webdav', url: URL_ }, 'adopt');

describe('switching from browser sync to WebDAV', () => {
    it('an empty server gets this device library; browser storage is not written afterwards', async () => {
        const cloud = new FakeCloud();
        const novels = [makeNovel(1), makeNovel(2)];
        const a = makeDevice(cloud, 'A', novels);
        await a.start();
        const browserWrites = cloud.area.setCalls;

        const server = new FakeDavServer();
        await a.sync.switchBackend(dav(server, new FakeAlarms()));
        await settle();
        expect(ids(await serverContents(server))).toEqual(novels.map(n => n.id).sort());

        a.edit(novels[0].id, h => { h.chapter.bookmarks['bm1'].current = 50; });
        await settle();
        expect(cloud.area.setCalls).toBe(browserWrites);
        expect(current(await serverContents(server), novels[0].id, 'bm1')).toBe(50);
        expect(a.notices.errors).toEqual([]);
    });

    it('stops watching the old backend', async () => {
        const cloud = new FakeCloud();
        const a = makeDevice(cloud, 'A', [makeNovel(1)]);
        await a.start();
        expect(cloud.listeners).toHaveLength(1);

        await a.sync.switchBackend(dav(new FakeDavServer(), new FakeAlarms()));
        expect(cloud.listeners).toHaveLength(0);
    });

    it('an empty device joining a server with a library pulls it and writes nothing', async () => {
        const novels = [makeNovel(1), makeNovel(2), makeNovel(3)];
        const { server, alarms } = await serverWithLibrary(novels);
        const puts = server.sent('PUT').length;

        const b = makeDevice(new FakeCloud(), 'B');
        await b.start();
        await b.sync.switchBackend(dav(server, alarms));
        await settle();

        expect(ids(b)).toEqual(novels.map(n => n.id).sort());
        expect(server.sent('PUT').length).toBe(puts);
    });

    it('both with a library, merge: union of both, newest edit wins', async () => {
        const { server, alarms, s } = await serverWithLibrary([makeNovel(1), makeNovel(2), makeNovel(3)]);

        vi.setSystemTime(new Date('2026-11-17T12:00:00.000Z'));
        const newer3 = makeNovel(3, { updated: new Date().toISOString() });
        newer3.chapter.bookmarks['bm3'].current = 333;
        const a = makeDevice(new FakeCloud(), 'A', [newer3, makeNovel(4)]);
        await a.start();

        await a.sync.switchBackend(dav(server, alarms));
        await settle();
        expect(ids(a)).toEqual(['1000001', '1000002', '1000003', '1000004']);
        expect(current(a, '1000003', 'bm3')).toBe(333);

        alarms.fire();                                    // the server device polls
        await settle();
        expect(ids(s)).toEqual(['1000001', '1000002', '1000003', '1000004']);
        expect(current(s, '1000003', 'bm3')).toBe(333);
    });

    it('both with a library, adopt: this device becomes exactly the server copy', async () => {
        const { server, alarms } = await serverWithLibrary([makeNovel(1), makeNovel(2), makeNovel(3)]);
        const puts = server.sent('PUT').length;

        vi.setSystemTime(new Date('2026-11-17T12:00:00.000Z'));
        const newer3 = makeNovel(3, { updated: new Date().toISOString() });
        newer3.chapter.bookmarks['bm3'].current = 333;
        const a = makeDevice(new FakeCloud(), 'A', [newer3, makeNovel(4)]);
        await a.start();

        await a.sync.switchBackend(dav(server, alarms), { persist: adoptMode(a) });
        await settle();

        expect(ids(a)).toEqual(['1000001', '1000002', '1000003']);
        expect(current(a, '1000003', 'bm3')).toBe(3);    // the server version, although the local one was newer
        expect(a.db.get('1000003')!.rss[0]).toHaveProperty('lastFetched');   // this device keeps its RSS cache
        expect(server.sent('PUT').length).toBe(puts);    // nothing to publish: we hold what is published
        expect(a.local.data[SYNC_ADOPT_KEY]).toBe(false);
        expect(a.local.data['syncTombstones']).toEqual({});   // the dropped entry is not a deletion to spread
    });

    it('after adopting, later edits publish normally (adopt happens once)', async () => {
        const { server, alarms } = await serverWithLibrary([makeNovel(1)]);
        const a = makeDevice(new FakeCloud(), 'A', [makeNovel(9)]);
        await a.start();
        await a.sync.switchBackend(dav(server, alarms), { persist: adoptMode(a) });
        await settle();

        a.add(makeNovel(10));
        await settle();
        alarms.fire();
        await settle();
        expect(ids(a)).toEqual(['1000001', '1000010']);
        expect(ids(await serverContents(server))).toEqual(['1000001', '1000010']);
    });

    it('adopt stays pending until a pull succeeds', async () => {
        const { server, alarms } = await serverWithLibrary([makeNovel(1)]);
        const a = makeDevice(new FakeCloud(), 'A', [makeNovel(9)]);
        await a.start();

        server.failNext = 1;
        await a.sync.switchBackend(dav(server, alarms), { persist: adoptMode(a) });
        await settle();
        expect(a.notices.errors).toEqual(['[Sync] task failed']);
        expect(ids(a)).toEqual(['1000009']);
        expect(a.local.data[SYNC_ADOPT_KEY]).toBe(true);

        alarms.fire();
        await settle();
        expect(ids(a)).toEqual(['1000001']);
        expect(a.local.data[SYNC_ADOPT_KEY]).toBe(false);
    });

    it('adopt against an empty server publishes this device library and clears the flag', async () => {
        const server = new FakeDavServer();
        const a = makeDevice(new FakeCloud(), 'A', [makeNovel(1)]);
        await a.start();

        await a.sync.switchBackend(dav(server, new FakeAlarms()), { persist: adoptMode(a) });
        await settle();
        expect(a.local.data[SYNC_ADOPT_KEY]).toBe(false);
        expect(ids(await serverContents(server))).toEqual(['1000001']);
    });

    it('an edit made just before the switch is not lost', async () => {
        const { server, alarms } = await serverWithLibrary([makeNovel(1)]);
        const cloud = new FakeCloud();
        const a = makeDevice(cloud, 'A', [makeNovel(1)]);
        await a.start();

        a.edit('1000001', h => { h.chapter.bookmarks['bm1'].current = 77; });   // push still debounced
        await a.sync.switchBackend(dav(server, alarms));
        await settle();
        expect(current(await serverContents(server), '1000001', 'bm1')).toBe(77);
    });
});

describe('switching from WebDAV back to browser sync', () => {
    it('pull-before-push applies again: the browser copy is merged, not overwritten', async () => {
        const cloud = new FakeCloud();
        const b = makeDevice(cloud, 'B', [makeNovel(5)]);
        await b.start();                                  // browser storage holds novel 5

        const { server, alarms } = await serverWithLibrary([makeNovel(1)]);
        const a = makeDevice(cloud, 'A', [], { backend: dav(server, alarms) });
        await a.start();
        expect(ids(a)).toEqual(['1000001']);

        const { BrowserSyncBackend } = await import('../../scripts/shared/sync/BrowserSyncBackend');
        await a.sync.switchBackend(new BrowserSyncBackend(cloud.apiForDevice(), async () => 'A'));
        await settle();
        expect(ids(a)).toEqual(['1000001', '1000005']);
        expect(ids(b)).toEqual(['1000001', '1000005']);  // B saw the merged publish through storage.onChanged
    });
});
