// 1. What is specific to WebDavBackend: headers, preconditions, folders, servers without ETags, testConnection, watch.
// 2. The engine on top of WebDAV: polling, conflicts, failures.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POLL_ALARM, WebDavBackend } from '../scripts/shared/sync/WebDavBackend';
import { ConflictError, WebDavError } from '../scripts/shared/utils/dedicatedErrors';
import type { WebDavConfig } from '../scripts/shared/types';
import { FakeAlarms, FakeDavServer } from './sync.fakeDav';
import { FakeCloud, makeDevice, makeNovel, resetDevices, settle } from './sync.testKit';

vi.mock('../scripts/shared/utils/BrowserCompat', () => ({ ext: {} }));   // tests inject their own APIs

const URL_ = 'https://dav.test/dav/hermidata.sync';
const PATH = '/dav/hermidata.sync';
const PROBE = '/dav/hermidata-connection-test.tmp';

function setup(server = new FakeDavServer(), config: Partial<WebDavConfig> = {}) {
    const alarms = new FakeAlarms();
    const backend = new WebDavBackend({ url: URL_, fetch: server.fetch, alarms, ...config });
    return { server, alarms, backend };
}
const versionOf = (r: unknown) => (r as { version: string }).version;

// ------------------------------------------------------------ 1. backend

describe('WebDavBackend: requests', () => {
    it('sends Basic auth only when a username is set', async () => {
        const anon = setup();
        await anon.backend.read();
        expect(anon.server.requests[0].headers).not.toHaveProperty('authorization');

        const authed = setup(new FakeDavServer(), { username: 'me', password: 'pw' });
        await authed.backend.read();
        expect(authed.server.requests[0].headers['authorization']).toBe(`Basic ${btoa('me:pw')}`);
    });

    it('wrong credentials -> WebDavError kind auth', async () => {
        const server = new FakeDavServer({ credentials: { user: 'me', pass: 'right' } });
        const { backend } = setup(server, { username: 'me', password: 'wrong' });

        const err = await backend.read().catch(e => e);
        expect(err).toBeInstanceOf(WebDavError);
        expect(err.kind).toBe('auth');
        await expect(backend.write('x')).rejects.toMatchObject({ kind: 'auth' });
    });

    it('never sends cookies or uses the HTTP cache', async () => {
        const calls: RequestInit[] = [];
        const server = new FakeDavServer();
        const { backend } = setup(server, { fetch: (input, init) => { calls.push(init!); return server.fetch(input, init); } });
        await backend.read();
        expect(calls[0]).toMatchObject({ cache: 'no-store', credentials: 'omit' });
    });

    it("GET sends If-None-Match with the last ETag and maps 304 to 'unchanged'", async () => {
        const { server, backend } = setup();
        const v = versionOf(await backend.write('one'));
        expect(v).toBe('"1"');

        expect(await backend.read(v)).toBe('unchanged');
        const get = server.sent('GET').at(-1)!;
        expect(get.headers['if-none-match']).toBe('"1"');
        expect(get.status).toBe(304);
    });

    it('reads null when the file does not exist', async () => {
        expect(await setup().backend.read()).toBeNull();
    });
});

describe('WebDavBackend: writes', () => {
    it('PUT sends If-Match for an ETag version; 412 -> ConflictError', async () => {
        const { server, backend } = setup();
        const v1 = versionOf(await backend.write('one'));
        await backend.write('two', v1);
        expect(server.sent('PUT').at(-1)!.headers['if-match']).toBe(v1);

        await expect(backend.write('three', v1)).rejects.toBeInstanceOf(ConflictError);
        expect(server.files.get(PATH)!.body).toBe('two');
    });

    it('a file deleted meanwhile -> ConflictError', async () => {
        const { server, backend } = setup();
        const v = versionOf(await backend.write('one'));
        server.files.delete(PATH);
        await expect(backend.write('two', v)).rejects.toBeInstanceOf(ConflictError);
    });

    it('a 404 to a conditional PUT is a conflict, not a missing folder', async () => {
        const server = new FakeDavServer();
        const fetch404: typeof fetch = async (input, init) =>
            init?.method === 'PUT' ? new Response(null, { status: 404 }) : server.fetch(input, init);
        const { backend } = setup(server, { fetch: fetch404 });

        await expect(backend.write('x', '"7"')).rejects.toBeInstanceOf(ConflictError);
        expect(server.sent('MKCOL')).toHaveLength(0);
    });

    it('a write without a base version sends no precondition', async () => {
        const { server, backend } = setup();
        await backend.write('one');
        await backend.write('two');
        for (const put of server.sent('PUT')) {
            expect(put.headers).not.toHaveProperty('if-match');
            expect(put.headers).not.toHaveProperty('if-none-match');
        }
    });

    it('missing parent folder: PUT, MKCOL, PUT, success', async () => {
        const server = new FakeDavServer();
        const { backend } = setup(server, { url: 'https://dav.test/dav/sub/hermidata.sync' });

        const res = await backend.write('hello');
        expect(res.status).toBe('written');
        expect(server.requests.map(r => `${r.method} ${r.path} ${r.status}`)).toEqual([
            'PUT /dav/sub/hermidata.sync 409',
            'MKCOL /dav/sub/ 201',
            'PUT /dav/sub/hermidata.sync 201',
        ]);
    });

    it('a folder that cannot be created is an error, tried once', async () => {
        const server = new FakeDavServer();
        const { backend } = setup(server, { url: 'https://dav.test/dav/a/b/hermidata.sync' });

        await expect(backend.write('hello')).rejects.toBeInstanceOf(WebDavError);
        expect(server.requests.map(r => r.method)).toEqual(['PUT', 'MKCOL']);
    });

    it('507 -> too-big, and the previous file is untouched', async () => {
        const { server, backend } = setup(new FakeDavServer({ maxBytes: 10 }));
        await backend.write('small');
        const res = await backend.write('much more than ten bytes');
        expect(res).toEqual({ status: 'too-big', neededBytes: 24 });
        expect(server.files.get(PATH)!.body).toBe('small');
    });

    it('network failure rejects', async () => {
        const { server, backend } = setup();
        server.failNext = 2;
        await expect(backend.read()).rejects.toBeInstanceOf(TypeError);
        await expect(backend.write('x')).rejects.toBeInstanceOf(TypeError);
    });
});

describe.each([
    { name: 'without ETags', tweak: (s: FakeDavServer) => { s.noEtag = true; } },
    { name: 'with weak ETags', tweak: (s: FakeDavServer) => { s.weakEtag = true; } },
])('WebDavBackend: server $name', ({ tweak }) => {
    it('uses h: content-hash versions and never sends preconditions', async () => {
        const server = new FakeDavServer();
        tweak(server);
        const { backend } = setup(server);

        const v1 = versionOf(await backend.write('one'));
        expect(v1).toMatch(/^h:[0-9a-f]{32}$/);

        const read1 = await backend.read(v1);
        expect(read1).toEqual({ data: 'one', version: v1 });          // read and write agree on the version

        const v2 = versionOf(await backend.write('two', v1));
        expect(v2).toMatch(/^h:/);
        expect(v2).not.toBe(v1);
        expect(await backend.read(v2)).toEqual({ data: 'two', version: v2 });

        for (const r of server.requests) {
            expect(r.headers).not.toHaveProperty('if-match');
            expect(r.headers).not.toHaveProperty('if-none-match');
        }
        expect(backend.capabilities.conditionalWrite).toBe(false);
    });
});

describe('WebDavBackend: a server that sends ETags on GET but not on PUT', () => {
    it('stays conditional; the next read brings the real ETag back', async () => {
        const server = new FakeDavServer();
        const fetchNoPutEtag: typeof fetch = async (input, init) => {
            const res = await server.fetch(input, init);
            return init?.method === 'PUT' ? new Response(null, { status: res.status }) : res;
        };
        const { backend } = setup(server, { fetch: fetchNoPutEtag });

        expect(versionOf(await backend.write('one'))).toMatch(/^h:/);
        expect(backend.capabilities.conditionalWrite).toBe(true);
        expect(versionOf(await backend.read())).toBe('"1"');
    });
});

describe('WebDavBackend: testConnection', () => {
    it('healthy server: ok, conditional, no probe file left behind', async () => {
        const { server, backend } = setup();
        expect(await backend.testConnection()).toEqual({ ok: true, conditionalWrite: true });
        expect(server.files.has(PROBE)).toBe(false);
        expect(server.sent('DELETE').map(r => r.path)).toEqual([PROBE]);
        expect(server.sent('PUT').at(-1)!.headers['if-match']).toBe('"hermidata-stale"');
    });

    it('server ignoring preconditions: ok, not conditional, with a note', async () => {
        const server = new FakeDavServer();
        server.ignorePreconditions = true;
        const { backend } = setup(server);

        const res = await backend.testConnection();
        expect(res).toMatchObject({ ok: true, conditionalWrite: false });
        expect((res as { note?: string }).note).toBeTruthy();
        expect(backend.capabilities.conditionalWrite).toBe(false);
        expect(server.files.has(PROBE)).toBe(false);
    });

    it('wrong password -> auth', async () => {
        const server = new FakeDavServer({ credentials: { user: 'me', pass: 'right' } });
        const { backend } = setup(server, { username: 'me', password: 'wrong' });
        expect(await backend.testConnection()).toMatchObject({ ok: false, problem: 'auth' });
    });

    it('a missing folder gets created', async () => {
        const server = new FakeDavServer();
        const { backend } = setup(server, { url: 'https://dav.test/dav/sub/hermidata.sync' });

        expect(await backend.testConnection()).toMatchObject({ ok: true });
        expect(server.folders.has('/dav/sub/')).toBe(true);
        expect(server.files.size).toBe(0);
    });

    it('a folder that cannot be created -> folder', async () => {
        const { backend } = setup(new FakeDavServer(), { url: 'https://dav.test/dav/a/b/hermidata.sync' });
        expect(await backend.testConnection()).toMatchObject({ ok: false, problem: 'folder' });
    });

    it('unreachable -> network', async () => {
        const server = new FakeDavServer();
        server.failNext = 100;
        const { backend } = setup(server);
        expect(await backend.testConnection()).toMatchObject({ ok: false, problem: 'network' });
    });

    it('full server -> server', async () => {
        const { backend } = setup(new FakeDavServer({ maxBytes: 1 }));
        expect(await backend.testConnection()).toMatchObject({ ok: false, problem: 'server' });
    });

    it('the probe sits next to the snapshot file, also with a query string', async () => {
        const server = new FakeDavServer();
        const { backend } = setup(server, { url: 'https://dav.test/dav/hermidata.sync?x=1' });
        await backend.testConnection();
        expect(server.sent('PUT')[0].path).toBe(PROBE);
    });
});

describe('WebDavBackend: watch', () => {
    it('creates the alarm, calls onChange on its tick, ignores other alarms', async () => {
        const { alarms, backend } = setup(new FakeDavServer(), { pollMinutes: 7 });
        const onChange = vi.fn();
        backend.watch(onChange);
        await Promise.resolve(); await Promise.resolve();

        expect(alarms.created).toEqual([{ name: POLL_ALARM, periodInMinutes: 7 }]);
        alarms.fire('something-else');
        expect(onChange).not.toHaveBeenCalled();
        alarms.fire();
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('defaults to every 5 minutes', async () => {
        const { alarms, backend } = setup();
        backend.watch(() => {});
        await vi.waitFor(() => expect(alarms.created).toEqual([{ name: POLL_ALARM, periodInMinutes: 5 }]));
    });

    it('keeps an existing alarm with the same period (MV3 worker restarts)', async () => {
        const { alarms, backend } = setup();
        alarms.create(POLL_ALARM, { periodInMinutes: 5 });
        alarms.created.length = 0;

        backend.watch(() => {});
        await new Promise(r => setTimeout(r, 0));
        expect(alarms.created).toEqual([]);
    });

    it('dispose removes the listener and clears the alarm', async () => {
        const { alarms, backend } = setup();
        const onChange = vi.fn();
        const stop = backend.watch(onChange);
        await new Promise(r => setTimeout(r, 0));

        stop();
        alarms.fire();
        expect(onChange).not.toHaveBeenCalled();
        expect(alarms.cleared).toEqual([POLL_ALARM]);
        expect(alarms.alarms.has(POLL_ALARM)).toBe(false);
        expect(alarms.listenerCount).toBe(0);
    });

    it('without an alarms API it is a harmless no-op', () => {
        const backend = new WebDavBackend({ url: URL_, fetch: new FakeDavServer().fetch, alarms: undefined });
        const stop = backend.watch(() => { throw new Error('should never be called'); });
        expect(() => stop()).not.toThrow();
    });
});

// ------------------------------------------------- 2. the engine on WebDAV

describe('engine on WebDAV', () => {
    beforeEach(() => {
        resetDevices();
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
        vi.setSystemTime(new Date('2026-11-16T12:00:00.000Z'));
    });
    afterEach(() => vi.useRealTimers());

    const cloud = () => new FakeCloud();   // only provides each device's storage.local here

    function device(server: FakeDavServer, alarms: FakeAlarms, id: string, novels = [] as ReturnType<typeof makeNovel>[], config: Partial<WebDavConfig> = {}) {
        const backend = new WebDavBackend({ url: URL_, fetch: server.fetch, alarms, ...config });
        return makeDevice(cloud(), id, novels, { backend });
    }

    async function pair(count = 3) {
        const server = new FakeDavServer();
        const alarms = new FakeAlarms();
        const novels = Array.from({ length: count }, (_, i) => makeNovel(i + 1));
        const a = device(server, alarms, 'A', novels);
        const b = device(server, alarms, 'B');
        await a.start();
        await b.start();
        return { server, alarms, a, b, novels };
    }
    const bmCurrent = (d: ReturnType<typeof makeDevice>, id: string, bm: string) => d.db.get(id)!.chapter.bookmarks[bm].current;

    it('publishes and receives', async () => {
        const { server, a, b, novels } = await pair();
        expect([...b.db.keys()].sort()).toEqual(novels.map(n => n.id).sort());
        expect(server.files.size).toBe(1);
        expect(a.notices.errors).toEqual([]);
        expect(b.notices.errors).toEqual([]);
    });

    it('a poll tick makes another device pick up an edit', async () => {
        const { alarms, a, b, novels } = await pair();

        a.edit(novels[0].id, h => { h.chapter.bookmarks['bm1'].current = 42; });
        await settle();
        expect(bmCurrent(b, novels[0].id, 'bm1')).toBe(1);            // no change events on a plain file

        alarms.fire();
        await settle();
        expect(bmCurrent(b, novels[0].id, 'bm1')).toBe(42);
    });

    it('refresh() picks up an edit without waiting for the alarm', async () => {
        const { a, b, novels } = await pair();
        a.edit(novels[0].id, h => { h.chapter.bookmarks['bm1'].current = 43; });
        await settle();

        b.sync.refresh();
        await settle();
        expect(bmCurrent(b, novels[0].id, 'bm1')).toBe(43);
    });

    it('simultaneous edits to different novels both survive, in a single remote file', async () => {
        const { server, alarms, a, b, novels } = await pair();

        a.edit(novels[0].id, h => { h.chapter.bookmarks['bm1'].current = 100; });
        b.edit(novels[1].id, h => { h.chapter.bookmarks['bm2'].current = 200; });
        await settle();
        alarms.fire();
        await settle();

        for (const d of [a, b]) {
            expect(bmCurrent(d, novels[0].id, 'bm1')).toBe(100);
            expect(bmCurrent(d, novels[1].id, 'bm2')).toBe(200);
            expect(d.notices.errors).toEqual([]);
        }
        expect(server.files.size).toBe(1);
        expect(server.sent('PUT').filter(r => r.status === 412).length).toBeGreaterThan(0);   // the race really happened
    });

    it('conflictNext = 2: retries and succeeds', async () => {
        const { server, alarms, a, b, novels } = await pair();
        const puts = server.sent('PUT').length;

        server.conflictNext = 2;
        a.edit(novels[0].id, h => { h.chapter.bookmarks['bm1'].current = 9; });
        await settle();

        expect(server.sent('PUT').length - puts).toBe(3);
        expect(a.notices.errors).toEqual([]);
        alarms.fire();
        await settle();
        expect(bmCurrent(b, novels[0].id, 'bm1')).toBe(9);
    });

    it('conflictNext = 100: gives up, reports it, and recovers on the next change', async () => {
        const { server, alarms, a, b, novels } = await pair();
        const puts = server.sent('PUT').length;

        server.conflictNext = 100;
        a.edit(novels[0].id, h => { h.chapter.bookmarks['bm1'].current = 11; });
        await settle();
        expect(server.sent('PUT').length - puts).toBe(4);
        expect(a.notices.errors).toEqual(['[Sync] gave up publishing after repeated conflicts']);

        server.conflictNext = 0;
        a.edit(novels[1].id, h => { h.chapter.bookmarks['bm2'].current = 22; });
        await settle();
        alarms.fire();
        await settle();
        expect(bmCurrent(b, novels[0].id, 'bm1')).toBe(11);
        expect(bmCurrent(b, novels[1].id, 'bm2')).toBe(22);
    });

    it('wrong credentials: reports an error and writes nothing', async () => {
        const server = new FakeDavServer({ credentials: { user: 'me', pass: 'right' } });
        const a = device(server, new FakeAlarms(), 'A', [makeNovel(1)], { username: 'me', password: 'wrong' });
        await a.start();

        a.edit(makeNovel(1).id, h => { h.meta.notes = 'x'; });
        await settle();
        expect(a.notices.errors.length).toBeGreaterThan(0);
        expect(server.files.size).toBe(0);
        expect(server.sent('PUT')).toHaveLength(0);
    });

    it('a network failure during push is reported and the next change retries', async () => {
        const { server, alarms, a, b, novels } = await pair();

        server.failNext = 1;
        a.edit(novels[0].id, h => { h.chapter.bookmarks['bm1'].current = 31; });
        await settle();
        expect(a.notices.errors).toEqual(['[Sync] task failed']);

        a.edit(novels[1].id, h => { h.chapter.bookmarks['bm2'].current = 32; });
        await settle();
        alarms.fire();
        await settle();
        expect(bmCurrent(b, novels[0].id, 'bm1')).toBe(31);
        expect(bmCurrent(b, novels[1].id, 'bm2')).toBe(32);
    });

    it('an RSS-only refresh performs no PUT', async () => {
        const { server, a, novels } = await pair();
        const puts = server.sent('PUT').length;

        a.refreshRss(novels[0].id);
        await settle();
        expect(server.sent('PUT').length).toBe(puts);
    });

    it('a poll when nothing changed is a conditional GET that returns 304', async () => {
        const { server, alarms } = await pair();
        server.requests.length = 0;

        alarms.fire();
        await settle();
        expect(server.requests.map(r => `${r.method} ${r.status}`)).toEqual(['GET 304', 'GET 304']);   // A and B
        expect(server.requests.every(r => r.headers['if-none-match'] === '"1"')).toBe(true);
    });

    it('never overwrites a remote it cannot decode', async () => {
        const { server, a, novels } = await pair();
        server.files.set(PATH, { body: 'not a snapshot', etag: '"999"' });

        a.edit(novels[0].id, h => { h.meta.notes = 'local'; });
        await settle();
        expect(server.files.get(PATH)!.body).toBe('not a snapshot');
        expect(a.notices.errors).toContain('[Sync] could not decode remote snapshot');
    });
});
