// sync.test.ts
// Runs entirely against in-memory fakes: a fake storage.sync with the real quotas
// (100 KB total, 8 KB per item) shared between fake "devices", each with its own
// fake IndexedDB and storage.local. Nothing here touches Chrome or your real data.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import type { Hermidata } from '../scripts/shared/types';

vi.mock('./browser', () => ({ ext: {} }));          // sync.ts imports `ext`; tests inject their own
import { HermidataSync } from '../scripts/shared/db/sync';

// captured at module load, before fake timers replace the global
const realSetTimeout = globalThis.setTimeout;
const realTick = (ms = 1) => new Promise<void>(r => realSetTimeout(r, ms));

// ------------------------------------------------------------ fake browser

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
type Changes = Record<string, { oldValue?: unknown; newValue?: unknown }>;

class FakeSyncArea {
    data: Record<string, unknown> = {};
    failNextSet = false;

    private quota: number;
    private notify: (c: Changes) => void;

    constructor(quota: number, notify: (c: Changes) => void) {
        this.quota = quota;
        this.notify = notify;
    }
    

    private size(d: Record<string, unknown>) {
        return Object.entries(d).reduce((n, [k, v]) => n + k.length + JSON.stringify(v).length, 0);
    }
    bytes() { return this.size(this.data); }

    async get(keys?: string | string[] | null) {
        if (keys == null) return clone(this.data);
        const list = typeof keys === 'string' ? [keys] : keys;
        return clone(Object.fromEntries(list.filter(k => k in this.data).map(k => [k, this.data[k]])));
    }
    async getBytesInUse(keys?: string | string[] | null) {
        if (keys == null) return this.bytes();
        const list = typeof keys === 'string' ? [keys] : keys;
        return this.size(Object.fromEntries(list.filter(k => k in this.data).map(k => [k, this.data[k]])));
    }
    async set(items: Record<string, unknown>) {
        if (this.failNextSet) { this.failNextSet = false; throw new Error('simulated failure'); }
        for (const [k, v] of Object.entries(items)) {
            if (k.length + JSON.stringify(v).length > 8192) throw new Error('QUOTA_BYTES_PER_ITEM quota exceeded');
        }
        const next = { ...this.data, ...clone(items) };
        if (this.size(next) > this.quota) throw new Error('QUOTA_BYTES quota exceeded'); // nothing applied
        const changes: Changes = {};
        for (const k of Object.keys(items)) changes[k] = { oldValue: this.data[k], newValue: next[k] };
        this.data = next;
        this.notify(changes);
    }
    async remove(keys: string | string[]) {
        const changes: Changes = {};
        for (const k of typeof keys === 'string' ? [keys] : keys) {
            if (k in this.data) { changes[k] = { oldValue: this.data[k] }; delete this.data[k]; }
        }
        if (Object.keys(changes).length) this.notify(changes);
    }
}

class FakeLocalArea {
    data: Record<string, unknown> = {};
    async get(keys: string | string[]) {
        const list = typeof keys === 'string' ? [keys] : keys;
        return clone(Object.fromEntries(list.filter(k => k in this.data).map(k => [k, this.data[k]])));
    }
    async set(items: Record<string, unknown>) { Object.assign(this.data, clone(items)); }
}

class FakeCloud {
    listeners: Array<(c: Changes, area: string) => void> = [];
    area: FakeSyncArea;

    constructor(quota = 102400) {
        this.area = new FakeSyncArea(quota, c => {
            for (const l of this.listeners) Promise.resolve().then(() => l(c, 'sync'));
        });
    }
    /** One browser instance: shared sync storage, private local storage. */
    apiForDevice(): any {
        return {
            storage: {
                sync: this.area,
                local: new FakeLocalArea(),
                onChanged: { addListener: (fn: any) => this.listeners.push(fn) },
            },
        };
    }
}

// -------------------------------------------------------------- test data

const T0 = '2026-11-01T10:00:00.000Z';

function makeNovel(i: number, over: { title?: string; updated?: string; added?: string } = {}): Hermidata {
    const bm = `bm${i}`;
    return {
        version: 12, id: `${1000000 + i}`, title: over.title ?? `Novel ${i}`,
        novelType: 'Manhwa', source: 'manhwaSite.com',
        chapter: {
            latest: 10 + i, lastChecked: T0,
            bookmarks: {
                [bm]: {
                    version: 6, id: bm, current: i, history: [{ chapter: i, at: T0 }],
                    readStatus: 'Viewing', label: 'Primary', color: '#5979d6',
                    createdAt: T0, updatedAt: T0, lastUsedAt: T0, isPrimary: true,
                    scrollPosition: 0, url: `https://example.com/${i}/chapter-${i}`,
                },
            },
            revisitingCount: 0, bookmarkInUse: bm, releaseSchedule: 'Unknown',
        },
        rss: [{
            id: `feed${i}`, title: 'RSS Feed', url: `https://example.com/${i}/rss`, image: '', domain: 'example.com',
            lastFetched: T0,
            latestItem: { id: `feed${i}`, rawTitle: `Novel ${i} Chapter ${i}`, chapter: i, title: `Novel ${i}`,
                link: `https://example.com/c/${i}`, pubDate: new Date(T0), guid: `g${i}` },
        }],
        import: null, titleTrimming: { type: 'default' },
        meta: {
            tags: ['a'], contentRating: 'Safe', contentWarnings: [], starRating: 5,
            image: { kind: 'url', url: 'x' }, readingQueue: false, relations: 'None', notes: '',
            added: over.added ?? T0, updated: over.updated ?? T0,
            altSources: ['MangaSite.to'], altTitles: [`Alt ${i}`], originalRelease: null, novelStatus: 'Ongoing',
        },
    };
}

/** Deterministic incompressible-ish text, so size tests don't flake. */
function noise(len: number, seed: number): string {
    // mulberry32: full-quality 32-bit output, unlike a plain LCG whose low bits repeat and compress well
    let a = seed >>> 0, out = '';
    while (out.length < len) {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        out += ((t ^ (t >>> 14)) >>> 0).toString(16).padStart(8, '0');
    }
    return out.slice(0, len);
}

const norm = (h: Hermidata): Hermidata => ({
    ...h,
    rss: h.rss.map(({ lastFetched, latestItem, ...c }: any) => c),
});
const sorted = (list: Hermidata[]) => [...list].sort((a, b) => a.id.localeCompare(b.id));

// -------------------------------------------------------------- fake device

const devices: Array<{ sync: HermidataSync }> = [];

function makeDevice(cloud: FakeCloud, id: string, initial: Hermidata[] = []) {
    const db = new Map<string, Hermidata>(initial.map(h => [h.id, clone(h)]));
    const notices = { tooBig: [] as number[], nearlyFull: [] as number[], errors: [] as string[] };

    const sync = new HermidataSync({
        getAll: async () => [...db.values()].map(clone),
        put: async h => { db.set(h.id, clone(h)); },
        remove: async key => { db.delete(key); },
        prepareRemote: h => h,
        getDeviceId: async () => id,
        onTooBig: kb => notices.tooBig.push(kb),
        onNearlyFull: kb => notices.nearlyFull.push(kb),
        onError: msg => notices.errors.push(msg),
    }, cloud.apiForDevice());
    devices.push({ sync });

    return {
        db, sync, notices,
        list: () => sorted([...db.values()]),
        start: async () => { sync.start(); await settle(); },
        /** a local user edit: bump meta.updated and schedule a push, like putHermidata() does */
        edit(key: string, mutate: (h: Hermidata) => void) {
            const h = clone(db.get(key)!);
            mutate(h);
            h.meta.updated = new Date().toISOString();
            db.set(key, h);
            sync.schedulePush();
        },
        add(h: Hermidata) { db.set(h.id, clone(h)); sync.schedulePush(); },
        remove(key: string) { db.delete(key); sync.recordDelete(key); },
    };
}

/**
 * Advance fake time in steps, and after each step wait (in real time) until every
 * device's queue is idle. Fake timers alone can't wait for gzip, which runs on real I/O.
 */
async function settle(ms = 60_000) {
    const step = 3_000;
    for (let t = 0; t < ms; t += step) {
        await vi.advanceTimersByTimeAsync(step);
        await Promise.all(devices.map(d => d.sync.idle()));
        await realTick();                       // let change events / microtasks propagate
        await Promise.all(devices.map(d => d.sync.idle()));
    }
}

beforeEach(() => {
    devices.length = 0;
    // only fake what the class uses; leave streams/microtasks alone so gzip keeps working
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-11-16T12:00:00.000Z'));
});
afterEach(() => vi.useRealTimers());

// ------------------------------------------------------------------- tests

describe('basic round trip', () => {
    it('device B receives everything device A has, losslessly', async () => {
        const cloud = new FakeCloud();
        const odd = makeNovel(3, { added: '2026-01-01T00:00:00Z' }); // timestamp without milliseconds
        const novels = [makeNovel(1), makeNovel(2), odd];

        const a = makeDevice(cloud, 'A', novels);
        const b = makeDevice(cloud, 'B');
        await a.start();
        await b.start();

        expect(b.list().map(norm)).toEqual(sorted(novels).map(norm));
        expect(b.db.get(odd.id)!.meta.added).toBe('2026-01-01T00:00:00Z'); // unchanged, not reformatted
    });

    it('does not sync the RSS cache, only the feed config', async () => {
        const cloud = new FakeCloud();
        const a = makeDevice(cloud, 'A', [makeNovel(1)]);
        const b = makeDevice(cloud, 'B');
        await a.start();
        await b.start();

        const feed = b.db.get(makeNovel(1).id)!.rss[0] as any;
        expect(feed.url).toBe('https://example.com/1/rss');
        expect(feed.latestItem).toBeUndefined();
        expect(feed.lastFetched).toBeUndefined();
    });

    it("keeps the receiving device's own RSS cache when a newer entry arrives", async () => {
        const cloud = new FakeCloud();
        const n = makeNovel(1);
        const a = makeDevice(cloud, 'A', [n]);
        const b = makeDevice(cloud, 'B');
        await a.start();
        await b.start();

        // B fetches its feed locally (cache changes, meta.updated does not)
        (b.db.get(n.id)!.rss[0] as any).latestItem = { rawTitle: 'B-cache' };

        a.edit(n.id, h => { h.chapter.bookmarks['bm1'].current = 99; });
        await settle();

        const got = b.db.get(n.id)!;
        expect(got.chapter.bookmarks['bm1'].current).toBe(99);          // edit arrived
        expect((got.rss[0] as any).latestItem).toEqual({ rawTitle: 'B-cache' }); // cache kept
    });
});

describe('safety on startup', () => {
    it('an empty device pulls first and never overwrites the cloud library', async () => {
        const cloud = new FakeCloud();
        const a = makeDevice(cloud, 'A', [makeNovel(1), makeNovel(2), makeNovel(3)]);
        await a.start();
        const revBefore = (cloud.area.data['lib:meta'] as any).rev;

        const fresh = makeDevice(cloud, 'FRESH'); // reinstall / new profile
        await fresh.start();

        expect(fresh.db.size).toBe(3);
        expect((cloud.area.data['lib:meta'] as any).rev).toBe(revBefore); // no push happened
    });

    it('an empty device with an empty cloud pushes nothing', async () => {
        const cloud = new FakeCloud();
        const a = makeDevice(cloud, 'A');
        await a.start();
        expect(cloud.area.data['lib:meta']).toBeUndefined();
    });

    it('ignores an incomplete remote snapshot and does not push over it', async () => {
        const cloud = new FakeCloud();
        cloud.area.data['lib:meta'] = { rev: 5, n: 3, len: 999, d: 'X' };
        cloud.area.data['lib:0'] = 'abc';                      // chunks 1 and 2 never arrived
        const before = clone(cloud.area.data);

        const a = makeDevice(cloud, 'A', [makeNovel(1), makeNovel(2)]);
        await a.start();
        await settle(120_000);

        expect(cloud.area.data).toEqual(before);               // untouched
        expect(a.db.size).toBe(2);                             // local untouched
        expect(a.notices.errors.length).toBeGreaterThan(0);    // reported
    });
});

describe('conflicts and convergence', () => {
    it('edits to different novels on two devices end up on both', async () => {
        const cloud = new FakeCloud();
        const base = [makeNovel(1), makeNovel(2), makeNovel(3)];
        const a = makeDevice(cloud, 'A', base);
        const b = makeDevice(cloud, 'B');
        await a.start();
        await b.start();

        a.edit(base[0].id, h => { h.chapter.bookmarks['bm1'].current = 50; });
        b.edit(base[1].id, h => { h.chapter.bookmarks['bm2'].current = 60; });
        await settle();

        for (const dev of [a, b]) {
            expect(dev.db.get(base[0].id)!.chapter.bookmarks['bm1'].current).toBe(50);
            expect(dev.db.get(base[1].id)!.chapter.bookmarks['bm2'].current).toBe(60);
        }
        expect(a.list().map(norm)).toEqual(b.list().map(norm));
    });

    it('for the same novel the newer edit wins', async () => {
        const cloud = new FakeCloud();
        const n = makeNovel(1);
        const a = makeDevice(cloud, 'A', [n]);
        const b = makeDevice(cloud, 'B');
        await a.start();
        await b.start();

        a.edit(n.id, h => { h.chapter.bookmarks['bm1'].current = 10; });
        await vi.advanceTimersByTimeAsync(1000);
        b.edit(n.id, h => { h.chapter.bookmarks['bm1'].current = 20; }); // later
        await settle();

        expect(a.db.get(n.id)!.chapter.bookmarks['bm1'].current).toBe(20);
        expect(b.db.get(n.id)!.chapter.bookmarks['bm1'].current).toBe(20);
    });

    it('a novel added on one device appears on the other', async () => {
        const cloud = new FakeCloud();
        const a = makeDevice(cloud, 'A', [makeNovel(1)]);
        const b = makeDevice(cloud, 'B');
        await a.start();
        await b.start();

        b.add(makeNovel(2));
        await settle();
        expect(a.db.has(makeNovel(2).id)).toBe(true);
    });
});

describe('deletes', () => {
    it('a delete propagates', async () => {
        const cloud = new FakeCloud();
        const base = [makeNovel(1), makeNovel(2)];
        const a = makeDevice(cloud, 'A', base);
        const b = makeDevice(cloud, 'B');
        await a.start();
        await b.start();

        a.remove(base[0].id);
        await settle();
        expect(b.db.has(base[0].id)).toBe(false);
        expect(b.db.has(base[1].id)).toBe(true);
    });

    it('a stale device that was offline does not resurrect a deleted novel', async () => {
        const cloud = new FakeCloud();
        const base = [makeNovel(1), makeNovel(2), makeNovel(3)];
        const a = makeDevice(cloud, 'A', base);
        const stale = makeDevice(cloud, 'STALE', base);   // same old library, not started yet
        await a.start();

        a.remove(base[0].id);
        await settle();

        await stale.start();                               // comes online later
        await settle();

        expect(stale.db.has(base[0].id)).toBe(false);      // removed there, not pushed back
        expect(a.db.has(base[0].id)).toBe(false);
        expect(sorted([...a.db.values()]).map(norm)).toEqual(stale.list().map(norm));
    });
});

describe('quota and atomicity', () => {
    it('removes the old per-novel keys on success but never touches Settings', async () => {
        const cloud = new FakeCloud();
        cloud.area.data['Settings'] = { theme: 'dark' };
        cloud.area.data['1000001'] = { old: 'full entry' };
        cloud.area.data['1000002'] = { old: 'full entry' };

        const a = makeDevice(cloud, 'A', [makeNovel(1), makeNovel(2)]);
        await a.start();

        expect(cloud.area.data['Settings']).toEqual({ theme: 'dark' });
        expect(cloud.area.data['1000001']).toBeUndefined();
        expect(cloud.area.data['1000002']).toBeUndefined();
        expect(cloud.area.data['lib:meta']).toBeDefined();
    });

    it('when the library no longer fits, writes nothing and tells you', async () => {
        const cloud = new FakeCloud(30_000);
        const a = makeDevice(cloud, 'A', Array.from({ length: 10 }, (_, i) => makeNovel(i)));
        await a.start();
        const before = clone(cloud.area.data);

        // preconditions: the small library must have synced fine, otherwise this test proves nothing
        expect(a.notices.errors).toEqual([]);
        expect(a.notices.tooBig).toHaveLength(0);
        expect(before['lib:meta']).toBeDefined();

        // ~200 KB of incompressible text can never fit in a 30 KB quota
        for (let i = 100; i < 300; i++) a.add(makeNovel(i, { title: noise(1000, i) }));
        await settle();

        expect(a.notices.errors).toEqual([]);              // a thrown error would hide the real cause
        expect(a.notices.tooBig.length).toBeGreaterThan(0);
        expect(cloud.area.data).toEqual(before);           // old snapshot untouched, nothing half-written
        expect(a.db.size).toBe(210);                       // local data intact
    });

    it('a failed write leaves the cloud snapshot and local data intact, and the next push retries', async () => {
        const cloud = new FakeCloud();
        const a = makeDevice(cloud, 'A', [makeNovel(1)]);
        await a.start();
        const before = clone(cloud.area.data);

        cloud.area.failNextSet = true;
        a.add(makeNovel(2));
        await settle();
        expect(cloud.area.data).toEqual(before);
        expect(a.notices.errors.length).toBeGreaterThan(0);

        a.add(makeNovel(3));                               // next change triggers a retry
        await settle();
        const b = makeDevice(cloud, 'B');
        await b.start();
        expect(b.db.size).toBe(3);
    });
});

// --------------------------------------------- your real library (optional)
// Export your library to test-data/library.json (add test-data/ to .gitignore).
// Accepts an array of entries, or a record keyed by id. Skipped when the file isn't there.

const LIB_PATH = resolve(__dirname, 'test-data/library.json');

describe.skipIf(!existsSync(LIB_PATH))('your real library (in memory only)', () => {
    const raw = existsSync(LIB_PATH) ? JSON.parse(readFileSync(LIB_PATH, 'utf8')) : [];
    const library: Hermidata[] = Array.isArray(raw) ? raw : Object.values(raw);

    it('fits in the real quota with Settings present and round-trips exactly', async () => {
        const cloud = new FakeCloud(102400);
        cloud.area.data['Settings'] = { blob: 'x'.repeat(3300) };   // roughly your 3,398 bytes

        const a = makeDevice(cloud, 'A', library);
        const b = makeDevice(cloud, 'B');
        await a.start();
        await b.start();

        const used = cloud.area.bytes();
        console.log(`[real library] ${library.length} novels, ${(used / 1024).toFixed(1)} KB of 100 KB used`);

        expect(a.notices.tooBig).toHaveLength(0);
        expect(used).toBeLessThanOrEqual(102400);
        expect(b.list().map(norm)).toEqual(sorted(library).map(norm));
    });

    it('a second sync of an unchanged library writes nothing new', async () => {
        const cloud = new FakeCloud(102400);
        const a = makeDevice(cloud, 'A', library);
        const b = makeDevice(cloud, 'B');
        await a.start();
        await b.start();
        const rev = (cloud.area.data['lib:meta'] as any).rev;

        await settle(120_000);
        expect((cloud.area.data['lib:meta'] as any).rev).toBe(rev);  // converged, no ping-pong
    });
});