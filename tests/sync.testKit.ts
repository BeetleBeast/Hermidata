// Shared in-memory fakes for the sync tests: a fake storage.sync with the real quotas that is shared
// between "devices", and per-device fake IndexedDB + storage.local. Nothing here touches a real browser.

import { vi } from 'vitest';
import type { Hermidata, SyncBackend } from '../scripts/shared/types';
import { HermidataSync } from '../scripts/shared/sync/sync.engine';
import { ConflictError } from '../scripts/shared/utils/dedicatedErrors';

export const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
type Changes = Record<string, { oldValue?: unknown; newValue?: unknown }>;

// ------------------------------------------------------------ fake browser

export class FakeSyncArea {
    data: Record<string, unknown> = {};
    setCalls = 0;                 // successful set() calls: the number of real cloud writes
    failNextSet = false;

    private quota: number;
    private notify: (c: Changes) => void;

    constructor(quota: number, notify: (c: Changes) => void) {
        this.quota = quota;
        this.notify = notify;
    }
    /** Like the real storage.sync.QUOTA_BYTES, so code that reads the limit from the API sees the fake one. */
    get QUOTA_BYTES(): number { return this.quota; }

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
        if (this.size(next) > this.quota) throw new Error('QUOTA_BYTES quota exceeded');
        const changes: Changes = {};
        for (const k of Object.keys(items)) changes[k] = { oldValue: this.data[k], newValue: next[k] };
        this.data = next;
        this.setCalls++;
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

export class FakeLocalArea {
    data: Record<string, unknown> = {};
    async get(keys: string | string[]) {
        const list = typeof keys === 'string' ? [keys] : keys;
        return clone(Object.fromEntries(list.filter(k => k in this.data).map(k => [k, this.data[k]])));
    }
    async set(items: Record<string, unknown>) { Object.assign(this.data, clone(items)); }
}

export class FakeCloud {
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
                onChanged: {
                    addListener: (fn: any) => this.listeners.push(fn),
                    removeListener: (fn: any) => { this.listeners = this.listeners.filter(l => l !== fn); },
                },
            },
        };
    }
    get rev(): number { return (this.area.data['lib:meta'] as any)?.rev ?? 0; }
}



// -------------------------------------------------------------- test data

export const T0 = '2026-11-01T10:00:00.000Z';

export function makeNovel(i: number, over: { title?: string; updated?: string; added?: string } = {}): Hermidata {
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
export function noise(len: number, seed: number): string {
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

/** Same data minus the per-device RSS cache, for comparing two devices. */
export const norm = (h: Hermidata): Hermidata => ({
    ...h,
    rss: h.rss.map(({ lastFetched, latestItem, ...c }: any) => c),
});
export const sorted = (list: Hermidata[]) => [...list].sort((a, b) => a.id.localeCompare(b.id));

// -------------------------------------------------------------- fake device

export const devices: Array<{ sync: HermidataSync }> = [];
export const resetDevices = () => { devices.length = 0; };

export function makeDevice(cloud: FakeCloud, id: string, initial: Hermidata[] = [], opts: { push?: boolean; backend?: SyncBackend } = {}) {
    const db = new Map<string, Hermidata>(initial.map(h => [h.id, clone(h)]));
    const notices = { tooBig: [] as number[], nearlyFull: [] as number[], errors: [] as string[] };
    let fetchCount = 0;
    const api = cloud.apiForDevice();

    const sync = new HermidataSync({
        getAll: async () => [...db.values()].map(clone),
        put: async h => { db.set(h.id, clone(h)); },
        remove: async key => { db.delete(key); },
        prepareRemote: h => h,
        getDeviceId: async () => id,
        onTooBig: kb => notices.tooBig.push(kb),
        onNearlyFull: kb => notices.nearlyFull.push(kb),
        onError: msg => notices.errors.push(msg),
    }, api, opts.backend);
    devices.push({ sync });

    return {
        db, sync, notices,
        /** this device's own storage.local (tombstones, flags, sync config) */
        local: api.storage.local as FakeLocalArea,
        list: () => sorted([...db.values()]),
        start: async () => {
            // newer builds have a pull-only first run; this is a no-op on builds without enablePush
            if (opts.push !== false) void (sync as any).enablePush?.();
            sync.start();
            await settle();
        },
        /** a user edit: bump meta.updated and schedule a push, like putHermidata() does */
        edit(key: string, mutate: (h: Hermidata) => void) {
            const h = clone(db.get(key)!);
            mutate(h);
            h.meta.updated = new Date().toISOString();
            db.set(key, h);
            sync.schedulePush();
        },
        add(h: Hermidata) { db.set(h.id, clone(h)); sync.schedulePush(); },
        /** a user delete: remove locally and record a tombstone, like deleteHermidata() does */
        remove(key: string) { db.delete(key); sync.recordDelete(key); },
        /**
         * An RSS refresh: only the per-device cache (lastFetched / latestItem) changes, then the app calls
         * putHermidata(h), which calls pushToSync(). If the RSS path also stamps meta.updated, pass bumpUpdated.
         */
        refreshRss(key: string, o: { bumpUpdated?: boolean } = {}) {
            const h = clone(db.get(key)!);
            fetchCount++;
            const now = new Date().toISOString();
            h.rss = h.rss.map((f: any) => ({
                ...f,
                lastFetched: now,
                latestItem: { ...f.latestItem, rawTitle: `fetched #${fetchCount}`, pubDate: now },
            }));
            if (o.bumpUpdated) h.meta.updated = now;
            db.set(key, h);
            sync.schedulePush();
        },
    };
}

/**
 * Advance fake time in steps and, after each, wait in real time until every device's queue is idle
 * (gzip runs on real I/O, which fake timers can't wait for).
 */
export async function settle(ms = 60_000) {
    const step = 3_000;
    for (let t = 0; t < ms; t += step) {
        await vi.advanceTimersByTimeAsync(step);
        await Promise.all(devices.map(d => d.sync.idle()));
        await new Promise<void>(r => realSetTimeout(r, 1));
        await Promise.all(devices.map(d => d.sync.idle()));
    }
}
export const realSetTimeout = globalThis.setTimeout; // captured at import, before fake timers replace it
export const realTick = (ms = 1) => new Promise<void>(r => realSetTimeout(r, ms));

// ------------------------------------------------ a generic in-memory backend

/**
 * A shared remote that speaks the SyncBackend interface with ETag-style versions, like a WebDAV file would.
 * Each device calls connect() to get its own view of it.
 */
export class FakeRemote {
    blob: string | null = null;
    version = 0;
    writes = 0;                       // successful writes: the number of real publishes
    private watchers = new Set<() => void>();

    private readonly maxBytes?: number;

    constructor(maxBytes?: number) {
        this.maxBytes = maxBytes;
    }

    connect(): SyncBackend {
        return {
            capabilities: { conditionalWrite: true, canWatch: true },
            read: async (ifNoneMatch?: string) => {
                if (this.blob === null) return null;
                const version = String(this.version);
                if (ifNoneMatch === version) return 'unchanged' as const;
                return { data: this.blob, version };
            },
            write: async (data: string, ifMatch?: string) => {
                if (ifMatch !== undefined && ifMatch !== String(this.version)) throw new ConflictError();
                if (this.maxBytes !== undefined && data.length > this.maxBytes) {
                    return { status: 'too-big' as const, neededBytes: data.length };
                }
                this.blob = data;
                this.version++;
                this.writes++;
                for (const w of this.watchers) Promise.resolve().then(w);
                return { status: 'written' as const, version: String(this.version) };
            },
            watch: (onChange: () => void) => {
                this.watchers.add(onChange);
                return () => { this.watchers.delete(onChange); };
            },
        };
    }
}