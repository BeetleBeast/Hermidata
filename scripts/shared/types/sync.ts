import type { Hermidata } from "./popup";


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


/** The published snapshot. `version` is opaque: a revision number, an ETag, anything that changes per write. */
export type RemoteBlob = { data: string; version: string };

interface WrittenResult {
    status: 'written';
    version: string;
    /** Set when the write fit but the backend is getting full; the value is the bytes it needed. */
    nearlyFull?: number;
}

interface TooBigResult {
    /** Nothing was written and the previous snapshot is untouched. */
    status: 'too-big';
    neededBytes: number;
}

export type WriteResult = WrittenResult | TooBigResult

interface Capabilities {
    maxBytes?: number;
    /** True when write() honors ifMatch and throws ConflictError on a stale version. */
    conditionalWrite: boolean;
    /** True when watch() reports changes made by other devices. Otherwise the engine has to poll. */
    canWatch: boolean;
}

export interface SyncBackend {
    readonly capabilities: Capabilities;
    /**
     * The current snapshot.
     * - null: nothing has been published yet
     * - 'unchanged': the remote still has version `ifNoneMatch`
     * - 'incomplete': something is there but cannot be read whole yet (another device is mid-write)
     */
    read(ifNoneMatch?: string): Promise<RemoteBlob | 'unchanged' | 'incomplete' | null>;

    /**
     * Publishes the snapshot, all or nothing. Backends with conditionalWrite compare `ifMatch` with the
     * remote's current version and throw ConflictError when it differs.
     */
    write(data: string, ifMatch?: string): Promise<WriteResult>;

    /** Calls onChange when another device may have written. Returns a function that stops watching. */
    watch?(onChange: () => void): () => void;
}


//---

/** The part of the extension alarms API that polling needs (injectable for tests). */
export interface AlarmsLike {
    create(name: string, info: { periodInMinutes: number }): unknown;
    clear(name: string): unknown;
    /** Optional: lets watch() keep an existing alarm instead of restarting its period on every worker start. */
    get?(name: string): Promise<{ periodInMinutes?: number } | undefined> | undefined;
    onAlarm: {
        addListener(callback: (alarm: { name: string }) => void): void;
        removeListener(callback: (alarm: { name: string }) => void): void;
    };
}

export type WebDavConfig = {
    /** Full URL of the snapshot file, e.g. https://cloud.example.com/remote.php/dav/files/me/hermidata.sync */
    url: string;
    username?: string;
    password?: string;
    pollMinutes?: number;
    fetch?: typeof fetch;
    alarms?: AlarmsLike;
};

export type WebDavProblem = 'auth' | 'forbidden' | 'folder' | 'server' | 'network';

export type ConnectionTest =
    | { ok: true; conditionalWrite: boolean; note?: string }
    | { ok: false; problem: WebDavProblem; message: string };
