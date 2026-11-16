import { HermidataMigration } from "../migration/Hermidata";
import type { Feed, Hermidata } from "../types";
import { ext } from "../utils/BrowserCompat";
import { logConsoleError } from "../utils/ErrorMessage";

import { getAllHermidata, putHermidata, deleteHermidata, isHermidataLatestVersion } from './db';


// ---------------------------------------------------------------- constants

const LIB_PREFIX = 'lib:';
const META_KEY = 'lib:meta';
const TOMBSTONE_KEY = 'syncTombstones'; // storage.local
const BLOCKED_KEY = 'syncBlocked'; // storage.local
const WARN_AT_KEY = 'syncWarnAt'; // storage.local

const CHUNK_SIZE = 7_500; // chars; per-item cap is 8192 incl. key + quotes
const QUOTA_BYTES = 102_400;
const SAFETY_MARGIN = 1_024;
const WARN_RATIO = 0.9;
const TOMBSTONE_TTL_MS = 30 * 24 * 3_600 * 1_000;
const PUSH_DEBOUNCE_MS = 3_000;
const PULL_DEBOUNCE_MS = 1_500;
const WARN_INTERVAL_MS = 24 * 3_600 * 1_000;
const MAX_INCOMPLETE_RETRIES = 4;

// -------------------------------------------------------------------- types

type SnapshotMeta = { rev: number; n: number; len: number; d: string };
type Snapshot = { entries: Hermidata[]; tombstones: Record<string, number> };
type ReadResult = { meta: SnapshotMeta; snapshot: Snapshot } | 'none' | 'incomplete';

export interface SyncDeps {
    getAll(): Promise<Hermidata[]>;
    /** Must NOT trigger a re-sync (your putHermidata(h, false)). */
    put(h: Hermidata): Promise<void>;
    /** Must NOT trigger a re-sync (your deleteHermidata(id, false)). */
    remove(id: string): Promise<void>;
    /** Migrate to the latest version; null if it can't be migrated. */
    prepareRemote(h: Hermidata): Hermidata | null;
    getDeviceId(): Promise<string>;
    onTooBig(neededKb: number): void;
    onNearlyFull(neededKb: number): void;
    onError(message: string, err: unknown): void;
}

// ------------------------------------------------------ compression helpers

async function gzipB64(text: string): Promise<string> {
    const buf = await new Response(
        new Blob([text]).stream().pipeThrough(new CompressionStream('gzip')),
    ).arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
}

async function gunzipB64(b64: string): Promise<string> {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return new Response(
        new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),
    ).text();
}

// ------------------------------------------------- lossless transformations

const TS_KEYS = new Set(['added', 'updated', 'lastChecked', 'createdAt', 'updatedAt', 'lastUsedAt', 'at']);

function walk(v: unknown, fn: (key: string, val: unknown) => unknown, key = ''): unknown {
    if (Array.isArray(v)) return v.map(x => walk(x, fn, key));
    if (v && typeof v === 'object') {
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, fn, k)]));
    }
    return fn(key, v);
}

/** ISO string -> epoch ms, only when the round trip is exact. */
const packTs = (v: unknown) => walk(v, (k, x) => {
    if (TS_KEYS.has(k) && typeof x === 'string') {
        const ms = Date.parse(x);
        if (!isNaN(ms) && new Date(ms).toISOString() === x) return ms;
    }
    return x;
});

const unpackTs = (v: unknown) => walk(v, (k, x) =>
    TS_KEYS.has(k) && typeof x === 'number' ? new Date(x).toISOString() : x);

/** RSS cache (lastFetched / latestItem) is per-device and refetchable: don't sync it. */
const stripRss = (h: Hermidata): Hermidata => ({
    ...h,
    rss: h.rss.map(({ lastFetched, latestItem, ...config }: any) => config as Feed),
});

/** When a remote entry wins, keep this device's RSS cache for feeds it already has. */
function withLocalRssCache(remote: Hermidata, local?: Hermidata): Hermidata {
    if (!local) return remote;
    const cache = new Map(local.rss.map(f => [f.id, f]));
    return {
        ...remote,
        rss: remote.rss.map(f => {
            const l = cache.get(f.id);
            return l ? { ...f, lastFetched: l.lastFetched, latestItem: l.latestItem } : f;
        }),
    };
}

const ts = (h: Hermidata) => Date.parse(h.meta.updated) || 0;
const itemBytes = (key: string, value: string) => key.length + value.length + 2; // quota counts JSON-stringified value

// -------------------------------------------------------------------- class
/**
 * All-or-nothing library sync over storage.sync:
 * - the whole library is one gzip+base64 snapshot, split over a few chunk keys
 * - written with a single set() call, so it either lands completely or not at all
 * - per-novel conflict resolution by newest meta.updated
 * - deletes are tombstones, so merging never resurrects a deleted novel
 * - nothing is ever pushed before the first pull has finished
 */
export class HermidataSync {
    private pushTimer: ReturnType<typeof setTimeout> | undefined;
    private pullTimer: ReturnType<typeof setTimeout> | undefined;
    private queue: Promise<void> = Promise.resolve();   // serializes pull / merge / push
    private ready = false;                              // true once the first pull has finished
    private dirty = false;                              // local changes made before ready
    private knownRev = 0;                               // newest remote revision we have merged or written
    private incompleteRetries = 0;

    private readonly deps: SyncDeps;
    private readonly api: typeof ext;

    constructor(deps: SyncDeps, api: typeof ext = ext) {
        this.deps = deps;
        this.api = api;
    }

    // ------------------------------------------------------------ public API

    /** Call synchronously at the top level of the background script (MV3 requirement). */
    start(): void {
        this.api.storage.onChanged.addListener(this.onChanged);
        this.enqueue(() => this.initialSync());
    }

    /** Call after every local put. Cheap: debounced into one write per burst. */
    schedulePush(): void {
        if (!this.ready) { this.dirty = true; return; }
        clearTimeout(this.pushTimer);
        this.pushTimer = setTimeout(() => this.enqueue(() => this.pushSnapshot()), PUSH_DEBOUNCE_MS);
    }

    /** Resolves when all currently queued work (pull / merge / push) has finished. Used by tests. */
    idle(): Promise<void> {
        return this.queue;
    }

    /** Call after every local delete. Records a tombstone, then schedules a push. */
    recordDelete(id: string): void {
        this.enqueue(async () => {
            const tombs = await this.loadTombstones();
            tombs[id] = Date.now();
            await this.api.storage.local.set({ [TOMBSTONE_KEY]: tombs });
        }).then(() => this.schedulePush());
    }

    // ------------------------------------------------------------ plumbing

    private enqueue(task: () => Promise<void>): Promise<void> {
        this.queue = this.queue
            .then(task)
            .catch(err => this.deps.onError('[Sync] task failed', err));
        return this.queue;
    }

    private onChanged = (changes: Record<string, unknown>, area: string): void => {
        if (area !== 'sync') return;
        if (!Object.keys(changes).some(k => k.startsWith(LIB_PREFIX))) return;
        this.schedulePull();
    };

    private schedulePull(): void {
        clearTimeout(this.pullTimer);
        this.pullTimer = setTimeout(() => this.enqueue(() => this.pull()), PULL_DEBOUNCE_MS);
    }

    private async loadTombstones(): Promise<Record<string, number>> {
        const got = await this.api.storage.local.get(TOMBSTONE_KEY);
        return (got[TOMBSTONE_KEY] as Record<string, number> | undefined) ?? {};
    }

    private pruneTombstones(t: Record<string, number>): Record<string, number> {
        const cutoff = Date.now() - TOMBSTONE_TTL_MS;
        return Object.fromEntries(Object.entries(t).filter(([, at]) => at > cutoff));
    }

    // -------------------------------------------------------------- startup

    /** Pull first. Only after this finishes is pushing allowed. */
    private async initialSync(): Promise<void> {
        const result = await this.readSnapshot();

        if (result === 'incomplete') {
            // Remote exists but isn't fully readable yet: stay not-ready so we never overwrite it.
            this.retryIncomplete();
            return;
        }
        if (result !== 'none') await this.mergeRemote(result.snapshot, result.meta.rev);
        this.markReady(result === 'none');
    }

    private markReady(remoteWasEmpty: boolean): void {
        this.ready = true;
        this.incompleteRetries = 0;
        if (this.dirty || remoteWasEmpty) {
            this.dirty = false;
            this.schedulePush();
        }
    }

    private retryIncomplete(): void {
        if (this.incompleteRetries++ >= MAX_INCOMPLETE_RETRIES) {
            this.deps.onError('[Sync] remote snapshot stayed incomplete, giving up until nthis.api change', null);
            return;
        }
        setTimeout(() => this.schedulePull(), 5000 * this.incompleteRetries);
    }

    // ----------------------------------------------------------------- pull

    private async pull(): Promise<void> {
        const result = await this.readSnapshot();

        if (result === 'incomplete') { this.retryIncomplete(); return; }
        if (result === 'none') { if (!this.ready) this.markReady(true); return; }

        // our own write, or a revision we already merged
        if (result.meta.rev <= this.knownRev) { if (!this.ready) this.markReady(false); return; }

        await this.mergeRemote(result.snapshot, result.meta.rev);
        if (!this.ready) this.markReady(false);
    }

    private async readSnapshot(): Promise<ReadResult> {
        const metaRaw = (await this.api.storage.sync.get(META_KEY))[META_KEY] as SnapshotMeta | undefined;
        if (!metaRaw) return 'none';

        const keys = Array.from({ length: metaRaw.n }, (_, i) => `${LIB_PREFIX}${i}`);
        const got = await this.api.storage.sync.get(keys);
        const parts = keys.map(k => got[k]);

        // never half-apply: every chunk present and total length matching
        if (parts.some(p => typeof p !== 'string')) return 'incomplete';
        const joined = (parts as string[]).join('');
        if (joined.length !== metaRaw.len) return 'incomplete';

        try {
            const payload = JSON.parse(await gunzipB64(joined)) as { e: unknown; t: Record<string, number> };
            const entries = unpackTs(payload.e) as Hermidata[];
            return { meta: metaRaw, snapshot: { entries, tombstones: payload.t ?? {} } };
        } catch (err) {
            this.deps.onError('[Sync] could not decode remote snapshot', err);
            return 'incomplete';
        }
    }

    private async mergeRemote(remote: Snapshot, rev: number): Promise<void> {
        const local = new Map((await this.deps.getAll()).map(h => [h.id, h]));
        const tombs = await this.loadTombstones();
        let remoteBehind = false;

        // 1. deletes
        for (const [id, at] of Object.entries(remote.tombstones)) {
            const l = local.get(id);
            if (l && ts(l) < at) {
                await this.deps.remove(id);
                local.delete(id);
            }
            tombs[id] = Math.max(tombs[id] ?? 0, at);
        }

        // 2. additions and updates, newest wins per novel
        const remoteIds = new Set<string>();
        for (const r of remote.entries) {
            remoteIds.add(r.id);

            if ((tombs[r.id] ?? 0) > ts(r)) { remoteBehind = true; continue; } // deleted here after that edit

            const l = local.get(r.id);
            if (!l || ts(r) > ts(l)) {
                const ready = this.deps.prepareRemote(r);
                if (!ready) { this.deps.onError(`[Sync] could not migrate ${r.id}, skipped`, null); continue; }
                await this.deps.put(withLocalRssCache(ready, l));
                if ((tombs[r.id] ?? 0) <= ts(r)) delete tombs[r.id]; // re-added after deletion
            } else if (ts(l) > ts(r)) {
                remoteBehind = true;
            }
        }

        // 3. anything local that the remote lacks
        for (const l of local.values()) if (!remoteIds.has(l.id)) remoteBehind = true;

        await this.api.storage.local.set({ [TOMBSTONE_KEY]: this.pruneTombstones(tombs) });
        this.knownRev = Math.max(this.knownRev, rev);

        if (remoteBehind) this.schedulePush(); // converges: after one push the remote is not behind
    }

    // ----------------------------------------------------------------- push

    private async pushSnapshot(): Promise<void> {
        if (!this.ready) { this.dirty = true; return; }

        const all = await this.deps.getAll();
        const byId = new Map(all.map(h => [h.id, h]));

        // drop tombstones that were pruned or superseded by a re-add
        const tombs = this.pruneTombstones(await this.loadTombstones());
        for (const [id, at] of Object.entries(tombs)) {
            const h = byId.get(id);
            if (h && ts(h) > at) delete tombs[id];
        }

        // never publish an empty library over a real one
        if (all.length === 0 && Object.keys(tombs).length === 0) return;

        const payload = JSON.stringify({ e: packTs(all.map(stripRss)), t: tombs });
        const packed = await gzipB64(payload);

        const chunks: string[] = [];
        for (let i = 0; i < packed.length; i += CHUNK_SIZE) chunks.push(packed.slice(i, i + CHUNK_SIZE));

        const existing = await this.api.storage.sync.get(null);
        const prevRev = (existing[META_KEY] as SnapshotMeta | undefined)?.rev ?? 0;
        const rev = Math.max(prevRev, this.knownRev) + 1;

        const meta: SnapshotMeta = { rev, n: chunks.length, len: packed.length, d: await this.deps.getDeviceId() };
        const items: Record<string, unknown> = { [META_KEY]: meta };
        chunks.forEach((c, i) => { items[`${LIB_PREFIX}${i}`] = c; });

        // size check: all or nothing
        const settingsBytes = await this.api.storage.sync.getBytesInUse("Settings");
        const needed = chunks.reduce((n, c, i) => n + itemBytes(`${LIB_PREFIX}${i}`, c), 0)
            + itemBytes(META_KEY, JSON.stringify(meta));
        const usable = QUOTA_BYTES - settingsBytes;

        if (needed > usable - SAFETY_MARGIN) {
            await this.api.storage.local.set({ [BLOCKED_KEY]: true });
            this.deps.onTooBig(Math.round(needed / 1024));
            return; // old snapshot stays untouched
        }
        if (needed > usable * WARN_RATIO) await this.maybeWarn(needed);

        // free the old per-novel keys first, otherwise their bytes count against us
        const legacy = Object.keys(existing).filter(k => k !== "Settings" && !k.startsWith(LIB_PREFIX));
        if (legacy.length) await this.api.storage.sync.remove(legacy);

        await this.api.storage.sync.set(items); // single call: atomic

        const stale = Object.keys(existing).filter(
            k => /^lib:\d+$/.test(k) && Number(k.slice(LIB_PREFIX.length)) >= chunks.length,
        );
        if (stale.length) await this.api.storage.sync.remove(stale);

        this.knownRev = rev;
        await this.api.storage.local.set({ [BLOCKED_KEY]: false });
    }

    private async maybeWarn(neededBytes: number): Promise<void> {
        const got = await this.api.storage.local.get(WARN_AT_KEY);
        const last = (got[WARN_AT_KEY] as number | undefined) ?? 0;
        if (Date.now() - last < WARN_INTERVAL_MS) return;
        await this.api.storage.local.set({ [WARN_AT_KEY]: Date.now() });
        this.deps.onNearlyFull(Math.round(neededBytes / 1024));
    }
}

// ------------------------------------------------------------------ wiring



let _deviceId: string | null = null;


type id = `${string}-${string}-${string}-${string}-${string}`

async function getDeviceId(): Promise<string> {
    if (_deviceId) return _deviceId
    const result: { deviceId?: id } = await chrome.storage.local.get('deviceId')
    if (result.deviceId) {
        _deviceId = result.deviceId
        return _deviceId
    }
    const id = crypto.randomUUID()
    await chrome.storage.local.set({ deviceId: id })
    _deviceId = id
    return _deviceId
}

export async function checkSyncQuota(): Promise<void> {
    // 1. Get current usage
    const used_Items = (await ext.storage.sync.getKeys()).length;
    const used_bytes = await ext.storage.sync.getBytesInUse();
    const used_bytes_per_item = 1070 // average
    const used_write_operations = 0 // TODO
    // 2. get max usage
    const max_items = getMaxItemsCount();
    const max_bytes = getMaxByteCount();
    const max_bytes_per_item = getMaxByteCountPerItem();
    const max_write_operations = getMaxWriteOperations();
    // 3. log current usage
    console.group('[Sync] Current usage');
    
    console.log(`[Sync] Used ${used_Items} of ${max_items} items (${Math.round(used_Items / max_items * 100)}%)`);
    console.log(`[Sync] Used ${used_bytes} of ${max_bytes} bytes (${Math.round( used_bytes / max_bytes * 100)}%)`);
    console.log(`[Sync] Used ${used_bytes_per_item} of ${max_bytes_per_item} bytes per item (${Math.round( used_bytes_per_item / max_bytes_per_item * 100)}%)`);
    console.log(`[Sync] Used ${used_write_operations} of ${max_write_operations} write operations per hour (${Math.round( used_write_operations / max_write_operations * 100)}%)`);
    // 4. warn if close to limit

    if (
        used_Items >( max_items * 0.9) ||
        used_bytes > (max_bytes * 0.9) ||
        used_bytes_per_item > (max_bytes_per_item * 0.9) ||
        used_write_operations > (max_write_operations * 0.9)
    ) console.warn('[Sync] Approaching sync storage limit')

    console.groupEnd();
}
function getMaxItemsCount(): number {
    const MAX = ext.storage.sync.MAX_ITEMS ?? 512;
    return MAX;
}
function getMaxByteCount(): number {
    const MAX = ext.storage.sync.QUOTA_BYTES ?? 102400;
    return MAX;
}
function getMaxByteCountPerItem(): number {
    const MAX = ext.storage.sync.QUOTA_BYTES_PER_ITEM ?? 8192;
    return MAX;
}
function getMaxWriteOperations(): number {
    const MAX = ext.storage.sync.MAX_WRITE_OPERATIONS_PER_HOUR ?? 1800;
    return MAX;
}

function notifySyncTooBig(kb: number): void {
    console.warn(`[Sync] Too big: ${kb}KB  --=> ${Math.round(kb / getMaxByteCount() * 100)}% of max ${getMaxByteCount()}  `);
}
function notifySyncNearlyFull(kb: number): void {
    console.warn(`[Sync] Nearly full: ${kb}KB  --=> ${Math.round(kb / getMaxByteCount() * 100)}% of max ${getMaxByteCount()}  `);
}


const sync = new HermidataSync({
    getAll: async () => Object.values(await getAllHermidata()),
    put: h => putHermidata(h, false),          // false = don't re-sync
    remove: id => deleteHermidata(id, false),  // false = don't re-sync
    prepareRemote: h => {
        const res = isHermidataLatestVersion(h)
            ? { result: h, isMigratedSuccessfully: true }
            : HermidataMigration.migrateAllHermidataToLatest(h);
        return res.isMigratedSuccessfully && isHermidataLatestVersion(res.result) ? res.result : null;
    },
    getDeviceId,
    onTooBig: kb => notifySyncTooBig(kb),
    onNearlyFull: kb => notifySyncNearlyFull(kb),
    onError: (msg, err) => logConsoleError(msg, err),
});

/** Call after every putHermidata() — pushes just that one entry to sync */
export const pushToSync = (_entry?: Hermidata) => sync.schedulePush();
/** Call after every deleteHermidata() — removes entry from sync too */
export const removeFromSync = (id: string) => sync.recordDelete(id);
/** Register in background.ts — listens for changes from other devices */
export const initSync = () => sync.start();

