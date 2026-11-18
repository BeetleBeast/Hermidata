import { HermidataMigration } from "../migration/Hermidata";
import type { Feed, Hermidata } from "../types";
import { ext } from "../utils/BrowserCompat";
import { logConsoleError, WarningMessage } from "../utils/ErrorMessage";

import { getAllHermidata, putHermidata, deleteHermidata, isHermidataLatestVersion } from '../db/db';
import { BrowserSyncBackend } from './BrowserSyncBackend';
import type { RemoteBlob, SyncBackend, WriteResult } from '../types';
import { ConflictError } from '../utils/dedicatedErrors';


// ---------------------------------------------------------------- constants

const TOMBSTONE_KEY = 'syncTombstones'; // storage.local
const BLOCKED_KEY = 'syncBlocked'; // storage.local
const WARN_AT_KEY = 'syncWarnAt'; // storage.local

const TOMBSTONE_TTL_MS = 30 * 24 * 3_600 * 1_000;
const PUSH_DEBOUNCE_MS = 3_000;
const PULL_DEBOUNCE_MS = 1_500;
const WARN_INTERVAL_MS = 24 * 3_600 * 1_000;
const MAX_INCOMPLETE_RETRIES = 4;
const MAX_PUSH_ATTEMPTS = 4;

// -------------------------------------------------------------------- types

type Snapshot = { entries: Hermidata[]; tombstones: Record<string, number> };
type ReadResult = { blob: RemoteBlob; snapshot: Snapshot } | 'none' | 'incomplete' | 'unchanged';
type Tombstones = Record<string, number>;
type LocalState = { all: Hermidata[]; tombs: Tombstones };

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

/** RSS cache (lastFetched / latestItem) is per-device and re-fetchable: don't sync it. */
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

// --------------------------------------------------------- snapshot codec

/** Library + tombstones -> one gzip+base64 string. */
async function encodePayload(all: Hermidata[], tombs: Tombstones): Promise<string> {
    return gzipB64(JSON.stringify({ e: packTs(all.map(stripRss)), t: tombs }));
}

/** The reverse of encodePayload. Throws if the string is not a valid snapshot. */
async function decodePayload(packed: string): Promise<Snapshot> {
    const payload = JSON.parse(await gunzipB64(packed)) as { e: unknown; t?: Tombstones };
    return { entries: unpackTs(payload.e) as Hermidata[], tombstones: payload.t ?? {} };
}

// ------------------------------------------------------------ small helpers

const ts = (h: Hermidata) => Date.parse(h.meta.updated) || 0;
const toKb = (bytes: number) => Math.round(bytes / 1024);

// -------------------------------------------------------------------- class
/**
 * All-or-nothing library sync. The engine decides WHAT to publish; a SyncBackend decides WHERE.
 * - the whole library is one compressed snapshot, published in a single write
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
    private known: RemoteBlob | null = null;            // newest published snapshot we have merged or written
    private incompleteRetries = 0;

    private readonly deps: SyncDeps;
    private readonly api: typeof ext;                   // device-local state: tombstones, flags
    private readonly backend: SyncBackend;

    constructor(deps: SyncDeps, api: typeof ext = ext, backend?: SyncBackend) {
        this.deps = deps;
        this.api = api;
        this.backend = backend ?? new BrowserSyncBackend(api, () => deps.getDeviceId());
    }

    // ------------------------------------------------------------ public API

    /** Call synchronously at the top level of the background script (MV3 requirement). */
    start(): void {
        this.backend.watch?.(() => this.schedulePull());
        this.enqueue(() => this.pull());
    }

    /** Call after every local put. Cheap: debounced into one write per burst. */
    schedulePush(): void {
        if (!this.ready) { this.dirty = true; return; }
        clearTimeout(this.pushTimer);
        this.pushTimer = setTimeout(() => this.enqueue(() => this.pushSnapshot()), PUSH_DEBOUNCE_MS);
    }

    /** Check the remote for changes now (e.g. when the popup opens). Debounced like a watch event. */
    refresh(): void {
        this.schedulePull();
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
            await this.saveTombstones(tombs);
        }).then(() => this.schedulePush());
    }

    // ------------------------------------------------------------ plumbing

    private enqueue(task: () => Promise<void>): Promise<void> {
        this.queue = this.queue
            .then(task)
            .catch(err => this.deps.onError('[Sync] task failed', err));
        return this.queue;
    }

    private schedulePull(): void {
        clearTimeout(this.pullTimer);
        this.pullTimer = setTimeout(() => this.enqueue(() => this.pull()), PULL_DEBOUNCE_MS);
    }

    // ------------------------------------------------------------ tombstones

    private async loadTombstones(): Promise<Tombstones> {
        const got = await this.api.storage.local.get(TOMBSTONE_KEY);
        return (got[TOMBSTONE_KEY] as Tombstones | undefined) ?? {};
    }

    private async saveTombstones(tombs: Tombstones): Promise<void> {
        await this.api.storage.local.set({ [TOMBSTONE_KEY]: tombs });
    }

    private pruneTombstones(t: Tombstones): Tombstones {
        const cutoff = Date.now() - TOMBSTONE_TTL_MS;
        return Object.fromEntries(Object.entries(t).filter(([, at]) => at > cutoff));
    }

    // ----------------------------------------------------------------- pull

    /** The first pull is also the startup sync: only after it finishes is pushing allowed. */
    private async pull(): Promise<void> {
        const result = await this.readRemote();

        // remote exists but isn't fully readable yet: stay not-ready so we never overwrite it
        if (result === 'incomplete') { this.retryIncomplete(); return; }
        this.incompleteRetries = 0;
        if (result === 'none') { if (!this.ready) this.markReady(true); return; }

        // our own write, or a version we already merged
        if (result === 'unchanged') { if (!this.ready) this.markReady(false); return; }

        await this.mergeRemote(result.snapshot, result.blob);
        if (!this.ready) this.markReady(false);
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
            this.deps.onError('[Sync] remote snapshot stayed incomplete, giving up until the next change', null);
            return;
        }
        setTimeout(() => this.schedulePull(), 5000 * this.incompleteRetries);
    }

    // -------------------------------------------------------- reading remote

    private async readRemote(): Promise<ReadResult> {
        const blob = await this.backend.read(this.known?.version);

        if (blob === null) return 'none';
        if (blob === 'incomplete' || blob === 'unchanged') return blob;
        if (blob.version === this.known?.version) return 'unchanged';  // backend without conditional reads

        return this.decodeSnapshot(blob);
    }

    private async decodeSnapshot(blob: RemoteBlob): Promise<ReadResult> {
        try {
            return { blob, snapshot: await decodePayload(blob.data) };
        } catch (err) {
            this.deps.onError('[Sync] could not decode remote snapshot', err);
            return 'incomplete';
        }
    }

    // ----------------------------------------------------------------- merge

    /** Folds a remote snapshot into the local library. pushIfBehind=false when the caller is about to write anyway. */
    private async mergeRemote(remote: Snapshot, blob: RemoteBlob, pushIfBehind = true): Promise<void> {
        const local = await this.loadLocalMap();
        const tombs = await this.loadTombstones();

        await this.applyRemoteDeletes(remote.tombstones, local, tombs);
        const behindOnEntries = await this.applyRemoteEntries(remote.entries, local, tombs);
        const missingLocal = this.remoteLacksLocal(remote.entries, local);

        await this.saveTombstones(this.pruneTombstones(tombs));
        this.known = blob;

        // converges: after one push the remote is not behind
        if (pushIfBehind && (behindOnEntries || missingLocal)) this.schedulePush();
    }

    private async loadLocalMap(): Promise<Map<string, Hermidata>> {
        return new Map((await this.deps.getAll()).map(h => [h.id, h]));
    }

    /** Remote tombstones: remove local novels not edited since, and remember the tombstones. */
    private async applyRemoteDeletes(
        remoteTombs: Tombstones,
        local: Map<string, Hermidata>,
        tombs: Tombstones,
    ): Promise<void> {
        for (const [id, at] of Object.entries(remoteTombs)) {
            const l = local.get(id);
            if (l && ts(l) < at) {
                await this.deps.remove(id);
                local.delete(id);
            }
            tombs[id] = Math.max(tombs[id] ?? 0, at);
        }
    }

    /** Applies every remote entry. True if the remote is behind this device for at least one of them. */
    private async applyRemoteEntries(
        entries: Hermidata[],
        local: Map<string, Hermidata>,
        tombs: Tombstones,
    ): Promise<boolean> {
        let remoteBehind = false;
        for (const r of entries) {
            if (await this.applyRemoteEntry(r, local.get(r.id), tombs)) remoteBehind = true;
        }
        return remoteBehind;
    }

    /** One entry, newest wins. True if the remote is behind this device for it. */
    private async applyRemoteEntry(r: Hermidata, l: Hermidata | undefined, tombs: Tombstones): Promise<boolean> {
        if ((tombs[r.id] ?? 0) > ts(r)) return true;                    // deleted here after that edit
        if (!l || ts(r) > ts(l)) { await this.takeRemoteEntry(r, l, tombs); return false; }
        return ts(l) > ts(r);                                           // local is newer
    }

    private async takeRemoteEntry(r: Hermidata, l: Hermidata | undefined, tombs: Tombstones): Promise<void> {
        const ready = this.deps.prepareRemote(r);
        if (!ready) { this.deps.onError(`[Sync] could not migrate ${r.id}, skipped`, null); return; }

        await this.deps.put(withLocalRssCache(ready, l));
        delete tombs[r.id];                                             // re-added after a deletion
    }

    private remoteLacksLocal(remoteEntries: Hermidata[], local: Map<string, Hermidata>): boolean {
        const remoteIds = new Set(remoteEntries.map(r => r.id));
        return [...local.values()].some(l => !remoteIds.has(l.id));
    }

    // ----------------------------------------------------------------- push

    /** Read, merge, write: a push folds in whatever is newer on the remote first, so it never replaces unseen changes. */
    private async pushSnapshot(): Promise<void> {
        if (!this.ready) { this.dirty = true; return; }

        for (let attempt = 0; attempt < MAX_PUSH_ATTEMPTS; attempt++) {
            if (await this.tryPush() === 'done') return;
        }
        this.deps.onError('[Sync] gave up publishing after repeated conflicts', null);
    }

    /** One read-merge-write round. 'conflict' means someone else wrote in between, so go again. */
    private async tryPush(): Promise<'done' | 'conflict'> {
        const base = await this.readBase();
        if (base === 'unusable') return 'done';                         // never write over what we cannot read

        const state = await this.collectLocalState();
        if (!state) return 'done';                                      // never publish an empty library

        const packed = await encodePayload(state.all, state.tombs);
        if (base?.data === packed) return 'done';                       // e.g. an RSS-only refresh

        return this.publish(packed, base?.version);
    }

    /** What the write will be based on, after merging it. Null when nothing is published yet. */
    private async readBase(): Promise<RemoteBlob | null | 'unusable'> {
        const blob = await this.backend.read(this.known?.version);

        if (blob === null) return null;
        if (blob === 'unchanged') return this.known;                    // we hold exactly what is published
        if (blob === 'incomplete') { this.retryIncomplete(); return 'unusable'; }
        if (blob.version === this.known?.version) return blob;

        const decoded = await this.decodeSnapshot(blob);
        if (typeof decoded !== 'object') return 'unusable';             // undecodable: leave the remote alone
        await this.mergeRemote(decoded.snapshot, blob, false);          // fold in what others wrote
        return blob;
    }

    private async publish(packed: string, ifMatch: string | undefined): Promise<'done' | 'conflict'> {
        try {
            await this.afterWrite(await this.backend.write(packed, ifMatch), packed);
            return 'done';
        } catch (err) {
            if (err instanceof ConflictError) return 'conflict';
            throw err;
        }
    }

    /** Local library plus live tombstones, or null when there is nothing worth publishing. */
    private async collectLocalState(): Promise<LocalState | null> {
        const all = await this.deps.getAll();
        const tombs = this.pruneTombstones(await this.loadTombstones());
        this.dropSupersededTombstones(tombs, all);

        const nothingToPublish = all.length === 0 && Object.keys(tombs).length === 0;
        return nothingToPublish ? null : { all, tombs };
    }

    /** A tombstone is obsolete once the novel was re-added after the deletion. */
    private dropSupersededTombstones(tombs: Tombstones, all: Hermidata[]): void {
        const byId = new Map(all.map(h => [h.id, h]));
        for (const [id, at] of Object.entries(tombs)) {
            const h = byId.get(id);
            if (h && ts(h) > at) delete tombs[id];
        }
    }

    private async afterWrite(result: WriteResult, packed: string): Promise<void> {
        if (result.status === 'too-big') { await this.markBlocked(result.neededBytes); return; }

        this.known = { data: packed, version: result.version };
        await this.api.storage.local.set({ [BLOCKED_KEY]: false });
        if (result.nearlyFull !== undefined) await this.maybeWarn(result.nearlyFull);
    }

    // ----------------------------------------------------------------- quota

    private async markBlocked(neededBytes: number): Promise<void> {
        await this.api.storage.local.set({ [BLOCKED_KEY]: true });
        this.deps.onTooBig(toKb(neededBytes));
    }

    private async maybeWarn(neededBytes: number): Promise<void> {
        if (await this.warnedRecently()) return;
        await this.api.storage.local.set({ [WARN_AT_KEY]: Date.now() });
        this.deps.onNearlyFull(toKb(neededBytes));
    }

    private async warnedRecently(): Promise<boolean> {
        const got = await this.api.storage.local.get(WARN_AT_KEY);
        const last = (got[WARN_AT_KEY] as number | undefined) ?? 0;
        return Date.now() - last < WARN_INTERVAL_MS;
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

const kbCounter = (kb: number) => `${kb}KB --> ${Math.round(kb / getMaxByteCount() * 100)}% of max ${getMaxByteCount()}`;

function notifySyncTooBig(kbCounter: string): void {
    const message = `[Sync] Too big: ${kbCounter}`;
    console.warn(message);
    void new WarningMessage(message, undefined, {
        notificationTarget: 'toast',
    }).sendMessage();
}
function notifySyncNearlyFull(kbCounter: string): void {
    const message = `[Sync] Nearly full: ${kbCounter}`;
    console.warn(message);
    void new WarningMessage(message, undefined, {
        notificationTarget: 'toast',
    }).sendMessage();
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
    onTooBig: kb => notifySyncTooBig(kbCounter(kb)),
    onNearlyFull: kb => notifySyncNearlyFull(kbCounter(kb)),
    onError: (msg, err) => logConsoleError(msg, err),
});

/** Call after every putHermidata() — pushes just that one entry to sync */
export const pushToSync = (_entry?: Hermidata) => sync.schedulePush();
/** Call after every deleteHermidata() — removes entry from sync too */
export const removeFromSync = (id: string) => sync.recordDelete(id);
/** Register in background.ts — listens for changes from other devices */
export const initSync = () => sync.start();