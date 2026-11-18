import type { ext } from "../utils/BrowserCompat";
import type { RemoteBlob, SyncBackend, WriteResult } from "../types";

// ---------------------------------------------------------------- constants

const SETTINGS_KEY = 'Settings';
const LIB_PREFIX = 'lib:';
const META_KEY = 'lib:meta';

const CHUNK_SIZE = 7_500; // chars; per-item cap is 8192 incl. key + quotes
const DEFAULT_QUOTA_BYTES = 102_400; // used when the browser doesn't report storage.sync.QUOTA_BYTES
const SAFETY_MARGIN = 1_024;
const WARN_RATIO = 0.9;

type Meta = { rev: number; n: number; len: number; d: string };
type Items = Record<string, unknown>;

// ------------------------------------------------------------ small helpers

const itemBytes = (key: string, value: string) => key.length + value.length + 2; // quota counts JSON-stringified value

/** Quota cost of everything one set() call will write. */
const bytesNeeded = (items: Items) =>
    Object.entries(items).reduce(
        (n, [key, value]) => n + itemBytes(key, typeof value === 'string' ? value : JSON.stringify(value)),
        0,
    );

function splitChunks(packed: string): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < packed.length; i += CHUNK_SIZE) chunks.push(packed.slice(i, i + CHUNK_SIZE));
    return chunks;
}

// -------------------------------------------------------------------- class
/**
 * Keeps the snapshot in the browser's own storage.sync:
 * - split over a few `lib:N` chunk keys plus one `lib:meta` key (revision, chunk count, total length)
 * - written with a single set() call, so it lands completely or not at all
 * - a read only counts when every chunk is present and the total length matches (never half-applied)
 * - refuses to write when it would not fit, leaving the previous snapshot untouched
 * - removes the per-novel keys of the previous sync design on the first successful write
 */
export class BrowserSyncBackend implements SyncBackend {
    readonly capabilities = { conditionalWrite: false, canWatch: true };

    private lastSeenRev = 0; // keeps revisions increasing even if the cloud copy was cleared

    private readonly api: typeof ext;
    private readonly getDeviceId: () => Promise<string>;

    constructor(api: typeof ext, getDeviceId: () => Promise<string>) {
        this.api = api;
        this.getDeviceId = getDeviceId;
    }

    // ----------------------------------------------------------------- read

    async read(ifNoneMatch?: string): Promise<RemoteBlob | 'unchanged' | 'incomplete' | null> {
        const meta = await this.readMeta();
        if (!meta) return null;

        this.lastSeenRev = Math.max(this.lastSeenRev, meta.rev);
        const version = String(meta.rev);
        if (version === ifNoneMatch) return 'unchanged';

        const data = await this.readChunks(meta);
        return data === null ? 'incomplete' : { data, version };
    }

    private async readMeta(): Promise<Meta | undefined> {
        const got = await this.api.storage.sync.get(META_KEY);
        return got[META_KEY] as Meta | undefined;
    }

    /** All chunks joined, or null if any is missing or the total length is off. */
    private async readChunks(meta: Meta): Promise<string | null> {
        const keys = Array.from({ length: meta.n }, (_, i) => `${LIB_PREFIX}${i}`);
        const got = await this.api.storage.sync.get(keys);
        const parts = keys.map(k => got[k]);

        if (parts.some(p => typeof p !== 'string')) return null;
        const joined = (parts as string[]).join('');
        return joined.length === meta.len ? joined : null;
    }

    // ---------------------------------------------------------------- write

    async write(data: string, _ifMatch?: string): Promise<WriteResult> {
        const existing = await this.api.storage.sync.get(null);
        const chunks = splitChunks(data);
        const rev = Math.max(this.revOf(existing), this.lastSeenRev) + 1;
        const items = await this.buildItems(rev, data, chunks);

        const { needed, hardLimit, softLimit } = await this.capacity(items);
        if (needed > hardLimit) return { status: 'too-big', neededBytes: needed };   // old snapshot stays untouched

        await this.writeItems(existing, items, chunks.length);
        this.lastSeenRev = rev;

        const version = String(rev);
        return needed > softLimit ? { status: 'written', version, nearlyFull: needed } : { status: 'written', version };
    }

    private revOf(existing: Items): number {
        return (existing[META_KEY] as Meta | undefined)?.rev ?? 0;
    }

    /** The one set() payload: the meta key plus every chunk. */
    private async buildItems(rev: number, data: string, chunks: string[]): Promise<Items> {
        const meta: Meta = { rev, n: chunks.length, len: data.length, d: await this.getDeviceId() };
        const items: Items = { [META_KEY]: meta };
        chunks.forEach((c, i) => { items[`${LIB_PREFIX}${i}`] = c; });
        return items;
    }

    /** How much this write needs, and where the hard (refuse) and soft (warn) limits are. */
    private async capacity(items: Items): Promise<{ needed: number; hardLimit: number; softLimit: number }> {
        const quota = this.api.storage.sync.QUOTA_BYTES ?? DEFAULT_QUOTA_BYTES;
        const usable = quota - await this.api.storage.sync.getBytesInUse(SETTINGS_KEY);
        return { needed: bytesNeeded(items), hardLimit: usable - SAFETY_MARGIN, softLimit: usable * WARN_RATIO };
    }

    private async writeItems(existing: Items, items: Items, chunkCount: number): Promise<void> {
        await this.removeLegacyKeys(existing);                          // free their bytes first
        await this.api.storage.sync.set(items);                         // single call: atomic
        await this.removeStaleChunks(existing, chunkCount);
    }

    /** Old per-novel keys from the previous sync design. Never touches Settings. */
    private async removeLegacyKeys(existing: Items): Promise<void> {
        const legacy = Object.keys(existing).filter(k => k !== SETTINGS_KEY && !k.startsWith(LIB_PREFIX));
        if (legacy.length) await this.api.storage.sync.remove(legacy);
    }

    /** Chunks left over from a previous, longer snapshot. */
    private async removeStaleChunks(existing: Items, chunkCount: number): Promise<void> {
        const stale = Object.keys(existing).filter(
            k => /^lib:\d+$/.test(k) && Number(k.slice(LIB_PREFIX.length)) >= chunkCount,
        );
        if (stale.length) await this.api.storage.sync.remove(stale);
    }

    // ---------------------------------------------------------------- watch

    watch(onChange: () => void): () => void {
        const listener = (changes: Record<string, unknown>, area: string): void => {
            if (area !== 'sync') return;
            if (Object.keys(changes).some(k => k.startsWith(LIB_PREFIX))) onChange();
        };
        this.api.storage.onChanged.addListener(listener);
        return () => this.api.storage.onChanged.removeListener(listener);
    }
}