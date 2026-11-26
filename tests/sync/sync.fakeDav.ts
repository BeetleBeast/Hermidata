// An in-memory WebDAV server (fetch-compatible, real Response objects) and a fake alarms API,
// for testing WebDavBackend and the engine on top of it. Nothing here touches the network.

import type { AlarmsLike } from '../../scripts/shared/types';
import { POLL_ALARM } from '../../scripts/shared/sync/WebDavBackend';

export type LoggedRequest = {
    method: string;
    path: string;
    headers: Record<string, string>;   // lower-cased names
    body?: string;
    status?: number;                   // undefined when the request failed at the network level
};

export type FakeDavOptions = {
    folders?: string[];
    credentials?: { user: string; pass: string };
    maxBytes?: number;
};

const parentOf = (path: string) => path.slice(0, path.replace(/\/$/, '').lastIndexOf('/') + 1);
const asFolder = (path: string) => (path.endsWith('/') ? path : `${path}/`);

export class FakeDavServer {
    files = new Map<string, { body: string; etag: string }>();
    folders: Set<string>;
    requests: LoggedRequest[] = [];

    // switches
    credentials?: { user: string; pass: string };
    noEtag = false;
    weakEtag = false;
    ignorePreconditions = false;
    maxBytes?: number;
    failNext = 0;        // the next N requests fail like an unreachable server
    conflictNext = 0;    // the next N PUTs answer 412, as if someone else wrote in between

    private counter = 0;

    constructor(opts: FakeDavOptions = {}) {
        this.folders = new Set(opts.folders ?? ['/dav/']);
        this.credentials = opts.credentials;
        this.maxBytes = opts.maxBytes;
    }

    /** Requests with this method, in order. */
    sent(method: string): LoggedRequest[] {
        return this.requests.filter(r => r.method === method);
    }

    fetch: typeof fetch = async (input, init) => {
        const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
        const headers: Record<string, string> = {};
        new Headers(init?.headers).forEach((value, key) => { headers[key.toLowerCase()] = value; });
        const body = typeof init?.body === 'string' ? init.body : undefined;
        const entry: LoggedRequest = { method: (init?.method ?? 'GET').toUpperCase(), path: url.pathname, headers, body };
        this.requests.push(entry);

        if (this.failNext > 0) { this.failNext--; throw new TypeError('Failed to fetch'); }

        const res = this.handle(entry);
        entry.status = res.status;
        return res;
    };

    // -------------------------------------------------------------- routing

    private handle(req: LoggedRequest): Response {
        if (!this.authorized(req.headers['authorization'])) return this.empty(401);

        switch (req.method) {
            case 'GET':
            case 'HEAD': return this.get(req);
            case 'PUT': return this.put(req);
            case 'DELETE': return this.empty(this.files.delete(req.path) ? 204 : 404);
            case 'MKCOL': return this.mkcol(req.path);
            default: return this.empty(405);
        }
    }

    private authorized(header: string | undefined): boolean {
        if (!this.credentials) return true;
        const { user, pass } = this.credentials;
        return header === `Basic ${Buffer.from(`${user}:${pass}`, 'utf-8').toString('base64')}`;
    }

    private get(req: LoggedRequest): Response {
        const file = this.files.get(req.path);
        if (!file) return this.empty(404);
        if (!this.noEtag && req.headers['if-none-match'] === file.etag) return this.empty(304, file.etag);
        return new Response(req.method === 'HEAD' ? null : file.body, { status: 200, headers: this.etagHeader(file.etag) });
    }

    private put(req: LoggedRequest): Response {
        const existing = this.files.get(req.path);
        const data = req.body ?? '';

        if (!this.folders.has(parentOf(req.path))) return this.empty(409);
        if (this.maxBytes !== undefined && data.length > this.maxBytes) return this.empty(507);
        if (this.conflictNext > 0) { this.conflictNext--; return this.empty(412); }
        if (!this.ignorePreconditions && this.preconditionFails(req.headers, existing)) return this.empty(412);

        const etag = `"${++this.counter}"`;
        this.files.set(req.path, { body: data, etag });
        return this.empty(existing ? 204 : 201, etag);
    }

    private preconditionFails(headers: Record<string, string>, existing: { etag: string } | undefined): boolean {
        const ifMatch = headers['if-match'];
        if (ifMatch !== undefined && (!existing || ifMatch !== existing.etag)) return true;
        return headers['if-none-match'] === '*' && !!existing;
    }

    private mkcol(path: string): Response {
        const folder = asFolder(path);
        if (this.folders.has(folder)) return this.empty(405);
        if (!this.folders.has(parentOf(folder))) return this.empty(409);
        this.folders.add(folder);
        return this.empty(201);
    }

    // ------------------------------------------------------------ responses

    private etagHeader(etag: string): Record<string, string> {
        if (this.noEtag) return {};
        return { ETag: this.weakEtag ? `W/${etag}` : etag };
    }

    private empty(status: number, etag?: string): Response {
        return new Response(null, { status, headers: etag ? this.etagHeader(etag) : {} });
    }
}

// ------------------------------------------------------------ fake alarms

type AlarmListener = (alarm: { name: string }) => void;

export class FakeAlarms implements AlarmsLike {
    alarms = new Map<string, { periodInMinutes: number }>();
    created: Array<{ name: string; periodInMinutes: number }> = [];
    cleared: string[] = [];
    private listeners = new Set<AlarmListener>();

    create(name: string, info: { periodInMinutes: number }): void {
        this.alarms.set(name, { ...info });
        this.created.push({ name, ...info });
    }
    clear(name: string): boolean {
        this.cleared.push(name);
        return this.alarms.delete(name);
    }
    async get(name: string): Promise<{ periodInMinutes: number } | undefined> {
        return this.alarms.get(name);
    }
    onAlarm = {
        addListener: (cb: AlarmListener) => { this.listeners.add(cb); },
        removeListener: (cb: AlarmListener) => { this.listeners.delete(cb); },
    };

    /** Like the browser firing the alarm: every registered listener sees it. */
    fire(name = POLL_ALARM): void {
        for (const l of this.listeners) l({ name });
    }

    get listenerCount(): number { return this.listeners.size; }
}
