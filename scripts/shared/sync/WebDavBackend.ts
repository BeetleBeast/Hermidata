import type { AlarmsLike, ConnectionTest, RemoteBlob, SyncBackend, WebDavConfig, WriteResult } from "../types";
import { ext } from "../utils/BrowserCompat";
import { ConflictError, WebDavError } from "../utils/dedicatedErrors";

// ---------------------------------------------------------------- constants

export const POLL_ALARM = 'hermidata-sync-poll';
const DEFAULT_POLL_MINUTES = 5;
const PROBE_FILE = 'hermidata-connection-test.tmp';
const HASH_PREFIX = 'h:';   // versions derived from the content, for servers that give no usable ETag

// ------------------------------------------------------------ small helpers

function basicAuth(user: string, pass: string): string {
    let bin = '';
    new TextEncoder().encode(`${user}:${pass}`).forEach(b => { bin += String.fromCharCode(b); });
    return `Basic ${btoa(bin)}`;
}

/** If-Match needs a strong validator, so a weak ETag (W/"...") is treated as no ETag at all. */
const isStrong = (etag: string | null): etag is string => !!etag && !etag.startsWith('W/');
const isHashVersion = (version: string) => version.startsWith(HASH_PREFIX);

async function sha256Hex(text: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

// -------------------------------------------------------------------- class
/**
 * Keeps the snapshot as one file on a WebDAV (or plain HTTP) server:
 * - GET reads it, PUT writes it, and the ETag is the version
 * - a write based on a version sends If-Match, so a concurrent writer gets a ConflictError instead of being overwritten
 * - a read based on a version sends If-None-Match, so polling costs a 304 when nothing changed
 * - servers without usable ETags still work: the version is a hash of the content and writes are unconditional
 * - there are no change events, so watch() polls with an alarm
 */
export class WebDavBackend implements SyncBackend {
    private conditional = true;   // false once the server has shown it gives no usable ETags

    private readonly url: string;
    private readonly authHeader: string | undefined;
    private readonly pollMinutes: number;
    private readonly doFetch: typeof fetch;
    private readonly alarms: AlarmsLike | undefined;

    constructor(config: WebDavConfig) {
        this.url = config.url.trim();
        this.authHeader = config.username !== undefined ? basicAuth(config.username, config.password ?? '') : undefined;
        this.pollMinutes = config.pollMinutes ?? DEFAULT_POLL_MINUTES;
        this.doFetch = config.fetch ?? ((input, init) => fetch(input, init));
        // 'alarms' in config: an explicit `alarms: undefined` means "no alarms API" (tests, missing permission)
        const alarms: AlarmsLike | undefined = ext?.alarms;
        this.alarms = 'alarms' in config ? config.alarms : alarms;
    }

    get capabilities() {
        return { conditionalWrite: this.conditional, canWatch: true };
    }

    // ----------------------------------------------------------------- read

    async read(ifNoneMatch?: string): Promise<RemoteBlob | 'unchanged' | 'incomplete' | null> {
        const conditional = ifNoneMatch && !isHashVersion(ifNoneMatch) ? { 'If-None-Match': ifNoneMatch } : undefined;
        const res = await this.send('GET', this.url, { headers: conditional });

        if (res.status === 404) return null;
        if (res.status === 304) return 'unchanged';
        this.check(res);

        const data = await res.text();
        return { data, version: await this.versionOf(res, data) };
    }

    // ---------------------------------------------------------------- write

    async write(data: string, ifMatch?: string): Promise<WriteResult> {
        let res = await this.put(this.url, data, ifMatch);

        // a file that vanished between our read and write is a conflict, not a missing folder
        if (ifMatch && res.status === 404) throw new ConflictError();

        if (this.isMissingFolder(res) && await this.createParentFolder(this.url)) {
            res = await this.put(this.url, data, ifMatch);
        }

        if (res.status === 412) throw new ConflictError();
        if (res.status === 507 || res.status === 413) return { status: 'too-big', neededBytes: data.length };
        this.check(res);

        return { status: 'written', version: await this.versionOf(res, data, 'write') };
    }

    private put(url: string, data: string, ifMatch?: string): Promise<Response> {
        const headers: Record<string, string> = { 'Content-Type': 'text/plain; charset=utf-8' };
        if (ifMatch && !isHashVersion(ifMatch)) headers['If-Match'] = ifMatch;
        return this.send('PUT', url, { headers, body: data });
    }

    private isMissingFolder(res: Response): boolean {
        return res.status === 404 || res.status === 409;
    }

    /** One level only: the folder that should contain the file. True when it was created. */
    private async createParentFolder(fileUrl: string): Promise<boolean> {
        const res = await this.send('MKCOL', new URL('.', fileUrl).toString());
        return res.status === 201;
    }

    // ------------------------------------------------------------- versions

    /**
     * The ETag, or a content hash when the server gives none (or only a weak one).
     * Some servers send an ETag on GET but none on a PUT response, so only a read without one proves the server
     * has no usable ETags; a PUT without one only means this one version is a hash (the next read fixes it).
     */
    private async versionOf(res: Response, data: string, kind: 'read' | 'write' = 'read'): Promise<string> {
        const etag = res.headers.get('ETag');
        if (kind === 'read' || etag !== null) this.conditional = isStrong(etag);
        return isStrong(etag) ? etag : HASH_PREFIX + await sha256Hex(data);
    }

    // ------------------------------------------------------------ transport

    private send(method: string, url: string, init: { headers?: Record<string, string>; body?: string } = {}): Promise<Response> {
        const headers: Record<string, string> = { ...init.headers };
        if (this.authHeader) headers['Authorization'] = this.authHeader;
        return this.doFetch(url, { method, headers, body: init.body, cache: 'no-store', credentials: 'omit' });
    }

    private check(res: Response): void {
        if (!res.ok) throw new WebDavError(res.status);
    }

    // ----------------------------------------------------------------- watch

    /** There are no change events on a plain file, so poll: the engine answers each tick with a cheap conditional GET. */
    watch(onChange: () => void): () => void {
        const alarms = this.alarms;
        if (!alarms) return () => {};                                   // no alarms permission: startup and refresh() still pull

        let stopped = false;
        const listener = (alarm: { name: string }): void => {
            if (alarm.name === POLL_ALARM) onChange();
        };
        alarms.onAlarm.addListener(listener);                           // synchronously, so a waking alarm is not missed
        void this.ensureAlarm(alarms, () => stopped);

        return () => {
            stopped = true;
            alarms.onAlarm.removeListener(listener);
            void alarms.clear(POLL_ALARM);
        };
    }

    /**
     * Alarms outlive the MV3 service worker, and re-creating one restarts its period. Recreating it on every
     * worker start could postpone polling forever, so only create it when it is missing or has another period.
     */
    private async ensureAlarm(alarms: AlarmsLike, stopped: () => boolean): Promise<void> {
        const existing = await Promise.resolve(alarms.get?.(POLL_ALARM)).catch(() => undefined);
        if (stopped() || existing?.periodInMinutes === this.pollMinutes) return;
        await alarms.create(POLL_ALARM, { periodInMinutes: this.pollMinutes });
    }

    // ------------------------------------------------------ test connection

    /** For a "Test connection" button: can we write here, and does the server support safe concurrent updates? */
    async testConnection(): Promise<ConnectionTest> {
        const probe = new URL(PROBE_FILE, this.url).toString();
        try {
            const failure = await this.createProbe(probe);
            if (failure) return failure;

            const conditionalWrite = await this.probePreconditions(probe);
            this.conditional = conditionalWrite;
            return conditionalWrite
                ? { ok: true, conditionalWrite }
                : {
                    ok: true,
                    conditionalWrite,
                    note: 'This server does not enforce safe concurrent updates. Sync still works; simultaneous edits are merged afterwards.',
                };
        } catch (err) {
            return { ok: false, problem: 'network', message: `Could not reach the server: ${String(err)}` };
        } finally {
            await this.send('DELETE', probe).catch(() => undefined);
        }
    }

    /** Writes the probe file, creating the folder if needed. Null on success, otherwise what went wrong. */
    private async createProbe(probe: string): Promise<ConnectionTest | null> {
        let res = await this.put(probe, 'probe');
        if (this.isMissingFolder(res) && await this.createParentFolder(probe)) res = await this.put(probe, 'probe');
        return res.ok ? null : this.describeFailure(res.status);
    }

    private describeFailure(status: number): ConnectionTest {
        if (status === 401) return { ok: false, problem: 'auth', message: 'The server rejected the username or password.' };
        if (status === 403) return { ok: false, problem: 'forbidden', message: 'You are not allowed to write to this location.' };
        if (status === 404 || status === 409) {
            return { ok: false, problem: 'folder', message: 'The folder does not exist and could not be created.' };
        }
        if (status === 507 || status === 413) return { ok: false, problem: 'server', message: 'The server has no space left.' };
        return { ok: false, problem: 'server', message: `The server answered with status ${status}.` };
    }

    /** True when the server hands out strong ETags and refuses a write based on a stale one. */
    private async probePreconditions(probe: string): Promise<boolean> {
        const got = await this.send('GET', probe);
        if (!isStrong(got.headers.get('ETag'))) return false;

        const stale = await this.put(probe, 'probe', '"hermidata-stale"');
        return stale.status === 412;
    }
}