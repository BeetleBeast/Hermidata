import { HermidataMigration } from "../migration/Hermidata";
import type { Feed, Hermidata } from "../types";
import { ext } from "../utils/BrowserCompat";
import { logConsoleError, WarningMessage } from "../utils/ErrorMessage";
import { isNewerItem } from "../utils/Unread";

import { getAllHermidata, putHermidata, deleteHermidata, isHermidataLatestVersion, getSettings } from '../db/db';
import { resolveTombstoneTtlDays } from '../utils/SettingsValues';
import { BrowserSyncBackend } from './BrowserSyncBackend';
import { LocalBackend } from './LocalBackend';
import type { EnvelopeHeader, KeyStore, RemoteBlob, SyncBackend, SyncBackendConfig, SyncStatus, SyncSwitchMode, WriteResult } from '../types';
import { ConflictError } from '../utils/dedicatedErrors';
import { headerRev, isEnvelope, openSnapshot, readEnvelopeHeader, sealSnapshot } from './libraryCrypto';
import { IdbKeyStore } from './keyStore';
import {
    createBackend, loadSyncConfig, saveSyncConfig, SYNC_ADOPT_KEY, SYNC_SEAL_HEADER_KEY, SYNC_SEAL_PENDING_KEY, SYNC_STATUS_KEY, validateWebDavUrl,
} from './syncConfig';
import { backgroundAlarms } from './syncAlarms';
import { POLL_ALARM } from './WebDavBackend';


// ---------------------------------------------------------------- constants

const TOMBSTONE_KEY = 'syncTombstones'; // storage.local
const BLOCKED_KEY = 'syncBlocked'; // storage.local
const WARN_AT_KEY = 'syncWarnAt'; // storage.local
const SEAL_HEADER_KEY = SYNC_SEAL_HEADER_KEY;
const SEAL_PENDING_KEY = SYNC_SEAL_PENDING_KEY;

const DAY_MS = 24 * 3_600 * 1_000;
const PUSH_DEBOUNCE_MS = 3_000;
const PULL_DEBOUNCE_MS = 1_500;
const WARN_INTERVAL_MS = 24 * 3_600 * 1_000;
const MAX_INCOMPLETE_RETRIES = 4;
const MAX_PUSH_ATTEMPTS = 4;

// -------------------------------------------------------------------- types

type Snapshot = { entries: Hermidata[]; tombstones: Record<string, number> };
/** A published snapshot as this device knows it: what is stored, what it decrypts to, and how it was sealed. */
type Known = { blob: RemoteBlob; plain: string; header: EnvelopeHeader | null };
type ReadResult = { known: Known; snapshot: Snapshot } | 'none' | 'incomplete' | 'unchanged' | 'locked';
type Opened = { plain: string; header: EnvelopeHeader | null } | 'locked' | 'undecodable';
type SealTarget = { header: null } | { header: EnvelopeHeader; key: CryptoKey } | 'locked';
type Outgoing = { data: string; plain: string; header: EnvelopeHeader | null };
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
    /** How many days a deletion is remembered. Defaults to DEFAULT_TOMBSTONE_TTL_DAYS. */
    getTombstoneTtlDays?(): Promise<number | undefined>;
    /** Unlocked data keys for encrypted libraries. Defaults to the extension's IndexedDB store. */
    keyStore?: KeyStore;
    /** The synced library is encrypted and this device does not hold its key yet. Called once per key. */
    onLocked?(): void;
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

/**
 * When a remote entry wins, keep this device's RSS cache for feeds it already has.
 * `seen` ( what the user cleared ) keeps whichever side is further along, so a remote copy without it doesn't bring cleared notifications back.
 */
function withLocalRssCache(remote: Hermidata, local?: Hermidata): Hermidata {
    if (!local) return remote;
    const cache = new Map(local.rss.map(f => [f.id, f]));
    return {
        ...remote,
        rss: remote.rss.map(f => {
            const l = cache.get(f.id);
            if (!l) return f;
            const seen = !f.seen ? l.seen : !l.seen ? f.seen : isNewerItem(l.seen, f.seen) ? l.seen : f.seen;
            return { ...f, lastFetched: l.lastFetched, latestItem: l.latestItem, ...(seen && { seen }) };
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
 * - switching backends starts over: pull first, then publish (or adopt the remote copy when asked to)
 */
export class HermidataSync {
    private pushTimer: ReturnType<typeof setTimeout> | undefined;
    private pullTimer: ReturnType<typeof setTimeout> | undefined;
    private queue: Promise<void> = Promise.resolve();   // serializes pull / merge / push
    private ready = false;                              // true once the first pull has finished
    private dirty = false;                              // local changes made before ready
    private pendingPush = false;                        // a push failed (e.g. server down): retry on the next pull, even when the remote is unchanged
    private known: Known | null = null;                 // newest published snapshot we have merged or written
    private readonly keyCache = new Map<string, CryptoKey>();
    private lockedKid: string | null = null;            // the key we last reported as missing
    private sealRevStored: string | null | undefined;   // what SEAL_HEADER_KEY holds, once known
    private unreadableVersion: string | undefined;      // version of a published snapshot that could not be opened
    private incompleteRetries = 0;

    private readonly deps: SyncDeps;
    private readonly api: typeof ext;                   // device-local state: tombstones, flags
    private backend: SyncBackend;
    private localOnly = false;                          // this device does not sync: nothing is pulled, pushed or remembered
    private stopWatching: (() => void) | undefined;

    constructor(deps: SyncDeps, api: typeof ext = ext, backend?: SyncBackend) {
        this.deps = deps;
        this.api = api;
        this.backend = backend ?? new BrowserSyncBackend(api, () => deps.getDeviceId());
    }

    // ------------------------------------------------------------ public API

    /** Call synchronously at the top level of the background script (MV3 requirement). */
    start(): void {
        if (this.localOnly) return;
        this.stopWatching = this.backend.watch?.(() => this.schedulePull());
        this.enqueue(() => this.pull());
    }

    /**
     * Points this device at another backend and starts over with pull-before-push: an empty remote gets this
     * device's library, an empty device gets the remote's, and when both have one they are merged, unless
     * storage.local holds the adopt flag, in which case the remote copy replaces the local library.
     * `persist` runs inside the queue, after any work on the old backend, so the saved choice and the
     * running backend never disagree.
     */
    switchBackend(backend: SyncBackend, opts: { persist?: () => Promise<void> } = {}): Promise<void> {
        return this.enqueue(async () => {
            this.stopWatching?.();
            clearTimeout(this.pushTimer);
            clearTimeout(this.pullTimer);
            await opts.persist?.();

            this.backend = backend;
            this.localOnly = backend instanceof LocalBackend;
            this.known = null;
            this.ready = false;
            this.pendingPush = false;                                   // the first pull on the new backend decides what to publish
            this.incompleteRetries = 0;
            if (this.localOnly) { await this.api.storage.local.remove(SYNC_STATUS_KEY); return; }   // nothing left to report
            this.stopWatching = backend.watch?.(() => this.schedulePull());
            await this.pull();
        });
    }

    /** Call after every local put. Cheap: debounced into one write per burst. */
    schedulePush(): void {
        if (this.localOnly) return;
        if (!this.ready) { this.dirty = true; return; }
        clearTimeout(this.pushTimer);
        this.pushTimer = setTimeout(() => this.enqueue(() => this.pushSnapshot()), PUSH_DEBOUNCE_MS);
    }

    /** Check the remote for changes now (e.g. when the popup opens). Debounced like a watch event. */
    refresh(): void {
        this.schedulePull();
    }

    /**
     * How the library is published from now on: sealed with `header` (its key must already be in the key store),
     * or plain with null. The choice is kept in storage.local until a write carrying it succeeds, so a failed
     * write is retried with the next push. Resolves true when it was published right away.
     */
    async setEncryption(header: EnvelopeHeader | null): Promise<boolean> {
        this.assertSyncing();
        if (header && !await this.keyFor(header.kid)) throw new Error('This device does not hold the key for that encryption.');

        let published = false;
        await this.enqueue(async () => {
            await this.api.storage.local.set({ [SEAL_PENDING_KEY]: { header } });
            if (!this.ready) { this.dirty = true; return; }
            await this.pushSnapshot();
            published = await this.loadPendingSeal() === undefined;
        });
        return published;
    }

    /**
     * Last resort when the published snapshot cannot be opened (passphrase and every recovery key lost, or the file
     * is damaged): publish this device's library over it, sealed with `header` (or plain). Nothing of the
     * unreadable copy is merged; other devices merge their own libraries back in once they can read the new one.
     */
    async replaceUnreadable(header: EnvelopeHeader | null): Promise<boolean> {
        this.assertSyncing();
        if (header && !await this.keyFor(header.kid)) throw new Error('This device does not hold the key for that encryption.');

        let published = false;
        await this.enqueue(async () => {
            await this.api.storage.local.set({ [SEAL_PENDING_KEY]: { header, replace: true } });
            this.ready = true;                                          // the user chose to skip the pull that cannot succeed
            await this.pushSnapshot();
            published = await this.loadPendingSeal() === undefined;
        });
        return published;
    }

    /** Resolves when all currently queued work (pull / merge / push) has finished. Used by tests. */
    idle(): Promise<void> {
        return this.queue;
    }

    /** Call after every local delete. Records a tombstone, then schedules a push. */
    recordDelete(id: string): void {
        if (this.localOnly) return;                                     // no remote to tell, so nothing to remember
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
            .catch(async err => {
                this.deps.onError('[Sync] task failed', err);
                await this.recordStatus(false).catch(() => undefined);  // must never reject: it would break the queue
            });
        return this.queue;
    }

    /** Remembers for Settings whether the last attempt worked; a failure keeps the time of the last success. */
    private async recordStatus(ok: boolean): Promise<void> {
        const got = await this.api.storage.local.get(SYNC_STATUS_KEY);
        const previous = got[SYNC_STATUS_KEY] as SyncStatus | undefined;
        const status: SyncStatus = { ok, lastSyncAt: ok ? Date.now() : previous?.lastSyncAt };
        await this.api.storage.local.set({ [SYNC_STATUS_KEY]: status });
    }

    private assertSyncing(): void {
        if (this.localOnly) throw new Error('This device is local only, so there is no synced library to encrypt.');
    }

    private schedulePull(): void {
        if (this.localOnly) return;
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

    private async pruneTombstones(t: Tombstones): Promise<Tombstones> {
        const days = resolveTombstoneTtlDays(await this.deps.getTombstoneTtlDays?.());
        const cutoff = Date.now() - days * DAY_MS;
        return Object.fromEntries(Object.entries(t).filter(([, at]) => at > cutoff));
    }

    // ----------------------------------------------------------------- pull

    /** One poll: read the remote, then retry a push that failed earlier. A poll that cannot reach the remote throws. */
    private async pull(): Promise<void> {
        await this.pullRemote();
        if (!this.pendingPush) await this.recordStatus(true);           // reachable, but unpublished edits are not "synced" yet
        else this.schedulePush();                                       // pendingPush is only ever set once ready
    }

    /** The first pull is also the startup sync: only after it finishes is pushing allowed. */
    private async pullRemote(): Promise<void> {
        const result = await this.readRemote();

        // remote exists but isn't fully readable yet: stay not-ready so we never overwrite it
        if (result === 'incomplete') { this.retryIncomplete(); return; }
        if (result === 'locked') return;                                // encrypted and no key yet: wait for unlock
        this.incompleteRetries = 0;
        if (result === 'none') {
            if (!this.ready) { await this.clearAdoptIfPending(); this.markReady(true); }
            return;
        }

        // our own write, or a version we already merged
        if (result === 'unchanged') { if (!this.ready) this.markReady(false); return; }

        if (!this.ready && await this.adoptPending()) await this.adoptRemote(result.snapshot, result.known);
        else await this.mergeRemote(result.snapshot, result.known);
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
        const blob = await this.backend.read(this.known?.blob.version);

        if (blob === null) return 'none';
        if (blob === 'incomplete' || blob === 'unchanged') return blob;
        if (blob.version === this.known?.blob.version) return 'unchanged';  // backend without conditional reads

        return this.decodeSnapshot(blob);
    }

    private async decodeSnapshot(blob: RemoteBlob): Promise<ReadResult> {
        const opened = await this.openBlob(blob);
        if (opened === 'locked' || opened === 'undecodable') this.unreadableVersion = blob.version;
        if (opened === 'locked') return 'locked';
        if (opened === 'undecodable') return 'incomplete';
        try {
            return { known: { blob, ...opened }, snapshot: await decodePayload(opened.plain) };
        } catch (err) {
            this.deps.onError('[Sync] could not decode remote snapshot', err);
            return 'incomplete';
        }
    }

    // ------------------------------------------------------------ encryption

    /** The packed snapshot inside a blob: as is when plain, decrypted when sealed. */
    private async openBlob(blob: RemoteBlob): Promise<Opened> {
        if (!isEnvelope(blob.data)) return { plain: blob.data, header: null };
        try {
            const header = readEnvelopeHeader(blob.data);
            const key = await this.keyFor(header.kid);
            if (!key) { this.reportLocked(header.kid); return 'locked'; }
            this.lockedKid = null;
            return { plain: await openSnapshot(blob.data, key), header };
        } catch (err) {
            this.deps.onError('[Sync] could not decrypt remote snapshot', err);
            return 'undecodable';
        }
    }

    private keyStore(): KeyStore {
        return this.deps.keyStore ??= new IdbKeyStore();
    }

    /** Misses are not cached: unlocking in Settings stores the key, and the next read must find it. */
    private async keyFor(kid: string): Promise<CryptoKey | undefined> {
        const cached = this.keyCache.get(kid);
        if (cached) return cached;
        const key = await this.keyStore().get(kid);
        if (key) this.keyCache.set(kid, key);
        return key;
    }

    private reportLocked(kid: string): void {
        if (this.lockedKid === kid) return;
        this.lockedKid = kid;
        this.deps.onLocked?.();
    }

    /** The choice made in Settings that is not published yet. undefined: none. */
    private async loadPendingSeal(): Promise<EnvelopeHeader | null | undefined> {
        return (await this.pendingRecord())?.header;
    }

    private async pendingRecord(): Promise<{ header: EnvelopeHeader | null; replace?: boolean } | undefined> {
        const got = await this.api.storage.local.get(SEAL_PENDING_KEY);
        return (got[SEAL_PENDING_KEY] as { header: EnvelopeHeader | null; replace?: boolean } | false | undefined) || undefined;
    }

    /**
     * How this write is sealed: a pending choice from Settings wins; otherwise do what the published snapshot does,
     * so a device follows when another one turns encryption on or off; with nothing published, keep the last way.
     */
    private async sealTarget(base: Known | null): Promise<SealTarget> {
        const pending = await this.loadPendingSeal();
        const header = pending !== undefined ? pending : base ? base.header : await this.lastSeal();
        if (!header) return { header: null };

        const key = await this.keyFor(header.kid);
        if (!key) { this.reportLocked(header.kid); return 'locked'; }
        return { header, key };
    }

    private async lastSeal(): Promise<EnvelopeHeader | null> {
        const got = await this.api.storage.local.get(SEAL_HEADER_KEY);
        return (got[SEAL_HEADER_KEY] as EnvelopeHeader | null | undefined) ?? null;
    }

    private async setKnown(known: Known): Promise<void> {
        this.known = known;
        const rev = headerRev(known.header);
        if (rev === this.sealRevStored) return;
        this.sealRevStored = rev;
        await this.api.storage.local.set({ [SEAL_HEADER_KEY]: known.header });
    }

    // ----------------------------------------------------------------- merge

    /** Folds a remote snapshot into the local library. pushIfBehind=false when the caller is about to write anyway. */
    private async mergeRemote(remote: Snapshot, known: Known, pushIfBehind = true): Promise<void> {
        const local = await this.loadLocalMap();
        const tombs = await this.loadTombstones();

        await this.applyRemoteDeletes(remote.tombstones, local, tombs);
        const behindOnEntries = await this.applyRemoteEntries(remote.entries, local, tombs);
        const missingLocal = this.remoteLacksLocal(remote.entries, local);

        await this.saveTombstones(await this.pruneTombstones(tombs));
        await this.setKnown(known);

        // converges: after one push the remote is not behind
        if (pushIfBehind && (behindOnEntries || missingLocal)) this.schedulePush();
    }

    // ------------------------------------------------------------------ adopt

    private async adoptPending(): Promise<boolean> {
        const got = await this.api.storage.local.get(SYNC_ADOPT_KEY);
        return got[SYNC_ADOPT_KEY] === true;
    }

    private async clearAdoptIfPending(): Promise<void> {
        if (await this.adoptPending()) await this.api.storage.local.set({ [SYNC_ADOPT_KEY]: false });
    }

    /** "Use the server copy": this device's library becomes exactly the published one, newer local edits included. */
    private async adoptRemote(remote: Snapshot, known: Known): Promise<void> {
        const local = await this.loadLocalMap();
        const remoteIds = new Set(remote.entries.map(r => r.id));

        for (const id of local.keys()) {
            if (!remoteIds.has(id)) await this.deps.remove(id);            // no tombstone: the remote never had it
        }
        for (const r of remote.entries) await this.takeRemoteEntry(r, local.get(r.id), {});

        await this.saveTombstones(await this.pruneTombstones({ ...remote.tombstones }));
        await this.setKnown(known);
        await this.api.storage.local.set({ [SYNC_ADOPT_KEY]: false });
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

        this.pendingPush = true;                                        // cleared only by a push that got through
        for (let attempt = 0; attempt < MAX_PUSH_ATTEMPTS; attempt++) {
            if (await this.tryPush() === 'done') { await this.pushSucceeded(); return; }
        }
        this.pendingPush = false;                                       // conflicts are not an outage: the next change or write retries
        this.deps.onError('[Sync] gave up publishing after repeated conflicts', null);
    }

    private async pushSucceeded(): Promise<void> {
        this.pendingPush = false;
        await this.recordStatus(true);
    }

    /** One read-merge-write round. 'conflict' means someone else wrote in between, so go again. */
    private async tryPush(): Promise<'done' | 'conflict'> {
        let base = await this.readBase();
        let ifMatch = base === 'unusable' ? undefined : base?.blob.version;
        if (base === 'unusable') {
            // never write over what we cannot read, unless the user chose to replace it (replaceUnreadable)
            if (this.unreadableVersion === undefined || !(await this.pendingRecord())?.replace) return 'done';
            base = null;
            ifMatch = this.unreadableVersion;
        }

        const state = await this.collectLocalState();
        if (!state) return 'done';                                      // never publish an empty library

        const packed = await encodePayload(state.all, state.tombs);
        const target = await this.sealTarget(base);
        if (target === 'locked') return 'done';                         // cannot seal: never publish in the clear instead

        // e.g. an RSS-only refresh. Plaintext is compared because every encryption uses a fresh IV.
        if (base?.plain === packed && headerRev(base.header) === headerRev(target.header)) return 'done';

        const data = target.header ? await sealSnapshot(packed, target.header, target.key) : packed;
        return this.publish({ data, plain: packed, header: target.header }, ifMatch);
    }

    /** What the write will be based on, after merging it. Null when nothing is published yet. */
    private async readBase(): Promise<Known | null | 'unusable'> {
        this.unreadableVersion = undefined;
        const blob = await this.backend.read(this.known?.blob.version);

        if (blob === null) return null;
        if (blob === 'unchanged') return this.known;                    // we hold exactly what is published
        if (blob === 'incomplete') { this.retryIncomplete(); return 'unusable'; }
        if (blob.version === this.known?.blob.version) return this.known;

        const decoded = await this.decodeSnapshot(blob);
        if (typeof decoded !== 'object') return 'unusable';             // undecodable or locked: leave the remote alone
        await this.mergeRemote(decoded.snapshot, decoded.known, false); // fold in what others wrote
        return decoded.known;
    }

    private async publish(out: Outgoing, ifMatch: string | undefined): Promise<'done' | 'conflict'> {
        try {
            await this.afterWrite(await this.backend.write(out.data, ifMatch), out);
            return 'done';
        } catch (err) {
            if (err instanceof ConflictError) return 'conflict';
            throw err;
        }
    }

    /** Local library plus live tombstones, or null when there is nothing worth publishing. */
    private async collectLocalState(): Promise<LocalState | null> {
        const all = await this.deps.getAll();
        const tombs = await this.pruneTombstones(await this.loadTombstones());
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

    private async afterWrite(result: WriteResult, out: Outgoing): Promise<void> {
        if (result.status === 'too-big') { await this.markBlocked(result.neededBytes); return; }

        await this.setKnown({ blob: { data: out.data, version: result.version }, plain: out.plain, header: out.header });
        const pending = await this.loadPendingSeal();
        if (pending !== undefined && headerRev(pending) === headerRev(out.header)) {
            await this.api.storage.local.set({ [SEAL_PENDING_KEY]: false });
        }
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
    // 2. get max usage
    const max_items = getMaxItemsCount();
    const max_bytes = getMaxByteCount();
    const max_bytes_per_item = getMaxByteCountPerItem();
    // 3. log current usage
    console.group('[Sync] Current usage');
    
    console.log(`[Sync] Used ${used_Items} of ${max_items} items (${Math.round(used_Items / max_items * 100)}%)`);
    console.log(`[Sync] Used ${used_bytes} of ${max_bytes} bytes (${Math.round( used_bytes / max_bytes * 100)}%)`);
    console.log(`[Sync] Used ${used_bytes_per_item} of ${max_bytes_per_item} bytes per item (${Math.round( used_bytes_per_item / max_bytes_per_item * 100)}%)`);
    // 4. warn if close to limit

    if (
        used_Items >( max_items * 0.9) ||
        used_bytes > (max_bytes * 0.9) ||
        used_bytes_per_item > (max_bytes_per_item * 0.9)
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
function notifySyncLocked(): void {
    const message = '[Sync] Paused: the synced library is encrypted. Enter the passphrase in Settings → Account & Connection to keep syncing.';
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
    getTombstoneTtlDays: async () => (await getSettings())?.ExtensionBehaviour.TombstoneTtlDays,
    onTooBig: kb => notifySyncTooBig(kbCounter(kb)),
    onNearlyFull: kb => notifySyncNearlyFull(kbCounter(kb)),
    onError: (msg, err) => logConsoleError(msg, err),
    keyStore: new IdbKeyStore(),
    onLocked: () => notifySyncLocked(),
});

/** Call after every putHermidata() — pushes just that one entry to sync */
export const pushToSync = (_entry?: Hermidata) => sync.schedulePush();
/** Call after every deleteHermidata() — removes entry from sync too */
export const removeFromSync = (id: string) => sync.recordDelete(id);
const backendEnv = () => ({ api: ext, getDeviceId, alarms: backgroundAlarms() });

/** Register in background.ts — starts syncing through the backend this device is configured for */
export const initSync = () => { void startConfiguredSync(); };

async function startConfiguredSync(): Promise<void> {
    const config = await loadSyncConfig(ext.storage.local);
    if (config.kind === 'browser') {
        void backgroundAlarms()?.clear(POLL_ALARM);                 // a poll alarm left over from WebDAV
        sync.start();
        return;
    }
    if (config.kind === 'local') void backgroundAlarms()?.clear(POLL_ALARM);
    await sync.switchBackend(createBackend(config, backendEnv()));
}

/** Check the remote for changes now, e.g. when the popup opens. */
export const refreshSync = () => sync.refresh();

/** Publish sealed with this header from now on (its key is already in the key store), or plain with null. Background only. */
export const setSyncEncryption = (header: EnvelopeHeader | null) => sync.setEncryption(header);

/** Last resort: publish this device's library over a synced copy that cannot be opened. Background only. */
export const replaceUnreadableSync = (header: EnvelopeHeader | null) => sync.replaceUnreadable(header);

/** Saves the new backend for this device and switches to it. Background only. */
export async function switchSyncBackend(config: SyncBackendConfig, mode: SyncSwitchMode = 'merge'): Promise<void> {
    if (config.kind === 'webdav') {
        const check = validateWebDavUrl(config.url);
        if (!check.ok) throw new Error(check.error);
        config = { ...config, url: check.url };
    } else {
        void backgroundAlarms()?.clear(POLL_ALARM);
    }
    await sync.switchBackend(createBackend(config, backendEnv()), {
        persist: () => saveSyncConfig(ext.storage.local, config, config.kind === 'local' ? 'merge' : mode),
    });
}