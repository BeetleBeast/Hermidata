// 1. A contract that EVERY SyncBackend must pass (browser storage, WebDAV, in-memory).
// 2. What is specific to BrowserSyncBackend.
// 3. Proof that the engine itself does not care which backend it talks to.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SyncBackend } from '../scripts/shared/types';
import { FakeCloud, FakeRemote, makeDevice, makeNovel, resetDevices, settle } from './sync.testKit';
import { BrowserSyncBackend } from '../scripts/shared/sync/BrowserSyncBackend';
import { WebDavBackend } from '../scripts/shared/sync/WebDavBackend';
import { ConflictError } from '../scripts/shared/utils/dedicatedErrors';
import { FakeAlarms, FakeDavServer } from './sync.fakeDav';

vi.mock('../scripts/shared/utils/BrowserCompat', () => ({ ext: {} }));   // tests inject their own APIs



// deterministic, hard-to-compress text standing in for a packed snapshot
function payload(len: number, seed = 1): string {
    let a = seed >>> 0, out = '';
    while (out.length < len) {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        out += ((t ^ (t >>> 14)) >>> 0).toString(16).padStart(8, '0');
    }
    return out.slice(0, len);
}
const flush = () => new Promise<void>(r => setTimeout(r, 0));

// ------------------------------------------------------- 1. the contract

/** tick: for polling backends, what the browser would do to make watch() look (fire the poll alarm). */
type Remote = { connect(): SyncBackend; tick?: () => void };
const implementations: Array<{ name: string; make: (limit: number) => Remote }> = [
    {
        name: 'BrowserSyncBackend',
        make: limit => {
            const cloud = new FakeCloud(limit);
            let n = 0;
            return { connect: () => new BrowserSyncBackend(cloud.apiForDevice(), async () => `dev-${n++}`) };
        },
    },
    {
        name: 'FakeRemote (in-memory)',
        make: limit => new FakeRemote(limit),
    },
    {
        name: 'WebDavBackend',
        make: limit => {
            const server = new FakeDavServer({ maxBytes: limit });
            const alarms = new FakeAlarms();
            return {
                connect: () => new WebDavBackend({ url: 'https://dav.test/dav/hermidata.sync', fetch: server.fetch, alarms }),
                tick: () => alarms.fire(),
            };
        },
    },
];

describe.each(implementations)('SyncBackend contract: $name', ({ make }) => {
    const LIMIT = 20_000;

    it('reads null before anything was written', async () => {
        expect(await make(LIMIT).connect().read()).toBeNull();
    });

    it('returns what was written, with a version', async () => {
        const b = make(LIMIT).connect();
        const res = await b.write('hello world');
        expect(res.status).toBe('written');
        const got = await b.read();
        expect(got).toMatchObject({ data: 'hello world' });
        expect((got as any).version).toBe((res as any).version);
    });

    it('every write produces a new version', async () => {
        const b = make(LIMIT).connect();
        const v1 = (await b.write('one') as any).version;
        const v2 = (await b.write('two') as any).version;
        expect(v2).not.toBe(v1);
    });

    it("read() without ifNoneMatch never answers 'unchanged'", async () => {
        const b = make(LIMIT).connect();
        await b.write('same');
        expect(await b.read()).toMatchObject({ data: 'same' });
        expect(await b.read()).toMatchObject({ data: 'same' });
    });

    it("read(currentVersion) is 'unchanged', and after a newer write it returns the data again", async () => {
        const remote = make(LIMIT);
        const a = remote.connect();
        const b = remote.connect();

        const v1 = (await a.write('one') as any).version;
        expect(await b.read(v1)).toBe('unchanged');

        await a.write('two');
        expect(await b.read(v1)).toMatchObject({ data: 'two' });
    });

    it('a payload larger than one chunk survives a round trip', async () => {
        const b = make(100_000).connect();
        const big = payload(50_000);
        await b.write(big);
        expect((await b.read() as any).data).toBe(big);
    });

    it('a shorter later write replaces a longer one completely', async () => {
        const b = make(100_000).connect();
        await b.write(payload(50_000));
        await b.write('short');
        expect((await b.read() as any).data).toBe('short');
    });

    it('reports too-big and leaves the previous snapshot untouched', async () => {
        const b = make(LIMIT).connect();
        await b.write('keep me');

        const res = await b.write(payload(30_000));
        expect(res.status).toBe('too-big');
        expect((res as any).neededBytes).toBeGreaterThan(LIMIT);
        expect((await b.read() as any).data).toBe('keep me');
    });

    it('a second device sees what the first one wrote', async () => {
        const remote = make(LIMIT);
        await remote.connect().write('shared');
        expect((await remote.connect().read() as any).data).toBe('shared');
    });

    it('conditional backends reject a stale ifMatch', async () => {
        const b = make(LIMIT).connect();
        if (!b.capabilities.conditionalWrite) return;   // not every backend can promise this

        const v1 = (await b.write('one') as any).version;
        await b.write('two');
        await expect(b.write('three', v1)).rejects.toBeInstanceOf(ConflictError);
    });

    it('watch reports a write from another device', async () => {
        const remote = make(LIMIT);
        const a = remote.connect();
        const b = remote.connect();
        if (!a.watch) return;

        const onChange = vi.fn();
        a.watch(onChange);
        await b.write('from b');
        remote.tick?.();
        await flush();
        expect(onChange).toHaveBeenCalled();
    });
});

// ------------------------------------------- 2. BrowserSyncBackend only

describe('BrowserSyncBackend specifics', () => {
    const setup = (quota = 102_400) => {
        const cloud = new FakeCloud(quota);
        const backend = new BrowserSyncBackend(cloud.apiForDevice(), async () => 'dev-1');
        return { cloud, backend };
    };

    it('publishes lib:meta with the revision, chunk count, length and device', async () => {
        const { cloud, backend } = setup();
        await backend.write(payload(16_000));
        expect(cloud.area.data['lib:meta']).toEqual({ rev: 1, n: 3, len: 16_000, d: 'dev-1' });
    });

    it('writes everything in a single set() call', async () => {
        const { cloud, backend } = setup();
        await backend.write(payload(50_000));
        expect(cloud.area.setCalls).toBe(1);
    });

    it('removes the per-novel keys of the old design but never Settings', async () => {
        const { cloud, backend } = setup();
        cloud.area.data['Settings'] = { theme: 'dark' };
        cloud.area.data['1000001'] = { old: 'entry' };
        cloud.area.data['1000002'] = { old: 'entry' };

        await backend.write('new');

        expect(cloud.area.data['Settings']).toEqual({ theme: 'dark' });
        expect(cloud.area.data['1000001']).toBeUndefined();
        expect(cloud.area.data['1000002']).toBeUndefined();
    });

    it('does not remove anything when the write is refused as too big', async () => {
        const { cloud, backend } = setup(20_000);
        cloud.area.data['1000001'] = { old: 'entry' };

        const res = await backend.write(payload(30_000));
        expect(res.status).toBe('too-big');
        expect(cloud.area.data['1000001']).toEqual({ old: 'entry' });
    });

    it('deletes leftover chunk keys when a shorter snapshot follows a longer one', async () => {
        const { cloud, backend } = setup();
        await backend.write(payload(30_000));
        await backend.write(payload(5_000));
        const chunkKeys = Object.keys(cloud.area.data).filter(k => /^lib:\d+$/.test(k));
        expect(chunkKeys).toEqual(['lib:0']);
    });

    it('accounts for Settings when deciding what fits', async () => {
        const { cloud, backend } = setup(20_000);
        cloud.area.data['Settings'] = { blob: 'x'.repeat(10_000) };

        const res = await backend.write(payload(12_000));   // would fit alone, not next to Settings
        expect(res.status).toBe('too-big');
    });

    it('flags nearlyFull when it fits but is close to the limit', async () => {
        const { backend } = setup(20_000);
        const res = await backend.write(payload(18_300));
        expect(res.status).toBe('written');
        expect((res as any).nearlyFull).toBeGreaterThan(18_000);
    });

    it('does not flag nearlyFull for a small write', async () => {
        const { backend } = setup();
        expect(await backend.write('small')).not.toHaveProperty('nearlyFull');
    });

    it('treats a snapshot with missing chunks as incomplete', async () => {
        const { cloud, backend } = setup();
        cloud.area.data['lib:meta'] = { rev: 5, n: 3, len: 999, d: 'x' };
        cloud.area.data['lib:0'] = 'abc';
        expect(await backend.read()).toBe('incomplete');
    });

    it('treats a snapshot whose length does not match as incomplete', async () => {
        const { cloud, backend } = setup();
        cloud.area.data['lib:meta'] = { rev: 5, n: 1, len: 10, d: 'x' };
        cloud.area.data['lib:0'] = 'abc';                   // 3 chars, meta says 10
        expect(await backend.read()).toBe('incomplete');
    });

    it('keeps revisions increasing even if the cloud copy was cleared', async () => {
        const { cloud, backend } = setup();
        await backend.write('one');
        await backend.write('two');                         // rev 2
        cloud.area.data = {};                               // someone cleared the cloud
        const res = await backend.write('three');
        expect(Number((res as any).version)).toBeGreaterThan(2);
    });

    it('watch ignores keys that are not part of the library snapshot', async () => {
        const { cloud, backend } = setup();
        const onChange = vi.fn();
        backend.watch(onChange);

        await cloud.area.set({ Settings: { a: 1 } });
        await flush();
        expect(onChange).not.toHaveBeenCalled();

        await cloud.area.set({ 'lib:0': 'x' });
        await flush();
        expect(onChange).toHaveBeenCalledTimes(1);
    });
});

// ---------------------------- 3. the engine on a backend that is not storage.sync

describe('engine on a generic backend', () => {
    beforeEach(() => {
        resetDevices();
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
        vi.setSystemTime(new Date('2026-11-16T12:00:00.000Z'));
    });
    afterEach(() => vi.useRealTimers());

    async function pair(remote: FakeRemote, count = 3) {
        const cloud = new FakeCloud();   // only provides each device's local storage here
        const novels = Array.from({ length: count }, (_, i) => makeNovel(i + 1));
        const a = makeDevice(cloud, 'A', novels, { backend: remote.connect() });
        const b = makeDevice(cloud, 'B', [], { backend: remote.connect() });
        await a.start();
        await b.start();
        return { a, b, novels };
    }

    it('a library published by one device arrives on the other', async () => {
        const { b, novels } = await pair(new FakeRemote());
        expect([...b.db.keys()].sort()).toEqual(novels.map(n => n.id).sort());
    });

    it('edits and deletes flow both ways', async () => {
        const { a, b, novels } = await pair(new FakeRemote());

        b.edit(novels[0].id, h => { h.chapter.bookmarks['bm1'].current = 77; });
        await settle();
        expect(a.db.get(novels[0].id)!.chapter.bookmarks['bm1'].current).toBe(77);

        a.remove(novels[1].id);
        await settle();
        expect(b.db.has(novels[1].id)).toBe(false);
    });

    it('an RSS-only refresh publishes nothing', async () => {
        const remote = new FakeRemote();
        const { a, novels } = await pair(remote);
        const writes = remote.writes;

        a.refreshRss(novels[0].id);
        await settle();
        expect(remote.writes).toBe(writes);
    });

    it('a snapshot that is too big for the backend is reported and nothing is published', async () => {
        const remote = new FakeRemote(2_000);                  // far too small for any real snapshot
        const cloud = new FakeCloud();
        const a = makeDevice(cloud, 'A', Array.from({ length: 30 }, (_, i) => makeNovel(i + 1)), { backend: remote.connect() });
        await a.start();

        expect(a.notices.tooBig.length).toBeGreaterThan(0);
        expect(remote.blob).toBeNull();
    });
});