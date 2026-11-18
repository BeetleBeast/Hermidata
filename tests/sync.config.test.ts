// Per-device sync configuration: URL validation, storage, the backend factory, and the background alarm hub.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FakeAlarms } from './sync.fakeDav';
import { FakeLocalArea } from './sync.testKit';

// vi.mock is hoisted above everything, so the mocked `ext` is a slot that gets its alarms below
const extSlot = vi.hoisted(() => ({ alarms: undefined as unknown }));
vi.mock('../scripts/shared/utils/BrowserCompat', () => ({ ext: extSlot }));
const fakeAlarms = new FakeAlarms();
extSlot.alarms = fakeAlarms;

import {
    createBackend, DEFAULT_SYNC_CONFIG, describeTarget, isLocalOrPrivateHost, loadSyncConfig, originPattern,
    sameTarget, saveSyncConfig, SYNC_ADOPT_KEY, SYNC_CONFIG_KEY, validateWebDavUrl,
} from '../scripts/shared/sync/syncConfig';
import { BrowserSyncBackend } from '../scripts/shared/sync/BrowserSyncBackend';
import { POLL_ALARM, WebDavBackend } from '../scripts/shared/sync/WebDavBackend';
import { backgroundAlarms, initSyncAlarmListener } from '../scripts/shared/sync/syncAlarms';

// ------------------------------------------------------------ validation

describe('validateWebDavUrl', () => {
    it('accepts an https file URL as is', () => {
        expect(validateWebDavUrl(' https://cloud.example.com/remote.php/dav/files/me/hermidata.sync '))
            .toEqual({ ok: true, url: 'https://cloud.example.com/remote.php/dav/files/me/hermidata.sync' });
    });

    it('drops a #fragment, keeps a query and a port', () => {
        expect(validateWebDavUrl('https://nas:5006/dav/h.sync?x=1#frag')).toEqual({ ok: true, url: 'https://nas:5006/dav/h.sync?x=1' });
    });

    it.each([
        'http://localhost:8080/h.sync',
        'http://127.0.0.1/h.sync',
        'http://192.168.1.20/dav/h.sync',
        'http://10.0.0.5/h.sync',
        'http://172.20.1.1/h.sync',
        'http://nas.local/h.sync',
        'http://[::1]:8080/h.sync',
    ])('allows plain http for a local or private address, with a warning: %s', raw => {
        const res = validateWebDavUrl(raw);
        expect(res.ok).toBe(true);
        expect((res as { warning?: string }).warning).toMatch(/not encrypted/);
    });

    it.each([
        ['', /Enter the URL/],
        ['not a url', /not a valid URL/],
        ['ftp://example.com/h.sync', /https/],
        ['http://example.com/h.sync', /Use https/],
        ['http://172.32.0.1/h.sync', /Use https/],          // just outside 172.16.0.0/12
        ['https://me:pw@example.com/h.sync', /own fields/],
        ['https://example.com/dav/', /point to a file/],
        ['https://example.com', /point to a file/],
    ])('rejects %j', (raw, message) => {
        const res = validateWebDavUrl(raw);
        expect(res.ok).toBe(false);
        expect((res as { error: string }).error).toMatch(message);
    });

    it('https to a private address needs no warning', () => {
        expect(validateWebDavUrl('https://192.168.1.20/h.sync')).toEqual({ ok: true, url: 'https://192.168.1.20/h.sync' });
    });
});

describe('isLocalOrPrivateHost', () => {
    it.each(['localhost', 'app.localhost', '127.0.0.1', '10.1.2.3', '192.168.0.1', '172.16.0.1', '172.31.255.255',
        '169.254.1.1', '[::1]', '[fd12:3456::1]', '[fe80::1]', 'nas.lan', 'box.home.arpa'])('%s is local', host => {
        expect(isLocalOrPrivateHost(host)).toBe(true);
    });
    it.each(['example.com', '8.8.8.8', '172.15.0.1', '192.169.0.1', '[2001:db8::1]', 'localhost.example.com'])('%s is not', host => {
        expect(isLocalOrPrivateHost(host)).toBe(false);
    });
});

describe('originPattern', () => {
    it('is the scheme and host, without port or path', () => {
        expect(originPattern('https://cloud.example.com:8443/dav/h.sync?x')).toBe('https://cloud.example.com/*');
        expect(originPattern('http://localhost:8080/h.sync')).toBe('http://localhost/*');
    });
});

// --------------------------------------------------------------- storage

describe('sync config storage', () => {
    it('defaults to browser sync', async () => {
        expect(await loadSyncConfig(new FakeLocalArea())).toEqual(DEFAULT_SYNC_CONFIG);
    });

    it('ignores a malformed saved value', async () => {
        const local = new FakeLocalArea();
        local.data[SYNC_CONFIG_KEY] = { kind: 'webdav' };   // no url
        expect(await loadSyncConfig(local)).toEqual(DEFAULT_SYNC_CONFIG);
    });

    it('round-trips a WebDAV config and writes the adopt flag in the same set() call', async () => {
        const local = new FakeLocalArea();
        const set = vi.spyOn(local, 'set');
        const config = { kind: 'webdav' as const, url: 'https://x.test/h.sync', username: 'me', password: 'pw' };

        await saveSyncConfig(local, config, 'adopt');
        expect(set).toHaveBeenCalledTimes(1);
        expect(local.data[SYNC_ADOPT_KEY]).toBe(true);
        expect(await loadSyncConfig(local)).toEqual(config);

        await saveSyncConfig(local, config);
        expect(local.data[SYNC_ADOPT_KEY]).toBe(false);
    });

    it('sameTarget compares where, not the credentials', () => {
        const a = { kind: 'webdav' as const, url: 'https://x.test/h.sync', password: 'old' };
        expect(sameTarget(a, { ...a, password: 'new' })).toBe(true);
        expect(sameTarget(a, { ...a, url: 'https://x.test/other.sync' })).toBe(false);
        expect(sameTarget(a, { kind: 'browser' })).toBe(false);
        expect(sameTarget({ kind: 'browser' }, { kind: 'browser' })).toBe(true);
    });

    it('describes the target for the UI', () => {
        expect(describeTarget({ kind: 'browser' })).toBe('Browser sync');
        expect(describeTarget({ kind: 'webdav', url: 'https://cloud.example.com:8443/h.sync' })).toBe('WebDAV (cloud.example.com:8443)');
    });
});

// --------------------------------------------------------------- factory

describe('createBackend', () => {
    const env = { api: {} as any, getDeviceId: async () => 'dev' };

    it('builds the matching backend', () => {
        expect(createBackend({ kind: 'browser' }, env)).toBeInstanceOf(BrowserSyncBackend);
        expect(createBackend({ kind: 'webdav', url: 'https://x.test/h.sync' }, env)).toBeInstanceOf(WebDavBackend);
    });

    it('an empty username sends no Authorization header', async () => {
        const seen: Array<Record<string, string>> = [];
        const fetch: typeof globalThis.fetch = async (_input, init) => {
            seen.push(init!.headers as Record<string, string>);
            return new Response(null, { status: 404 });
        };
        await createBackend({ kind: 'webdav', url: 'https://x.test/h.sync', username: '' }, { ...env, fetch }).read();
        expect(seen[0]).not.toHaveProperty('Authorization');
    });

    it('without alarms in the env, watch() does nothing (e.g. on the settings page)', () => {
        const backend = createBackend({ kind: 'webdav', url: 'https://x.test/h.sync' }, env);
        backend.watch!(() => {});
        expect(fakeAlarms.created).toEqual([]);
    });
});

// ------------------------------------------------------ background alarms

describe('background alarm hub', () => {
    beforeEach(() => { fakeAlarms.created.length = 0; });

    it('registers exactly one real listener, however often it is called', () => {
        initSyncAlarmListener();
        initSyncAlarmListener();
        expect(fakeAlarms.listenerCount).toBe(1);
    });

    it('forwards alarms to subscribers added later, and stops after they unsubscribe', async () => {
        initSyncAlarmListener();
        const hub = backgroundAlarms()!;
        const onAlarm = vi.fn();
        hub.onAlarm.addListener(onAlarm);

        fakeAlarms.fire();
        expect(onAlarm).toHaveBeenCalledWith({ name: POLL_ALARM });

        hub.onAlarm.removeListener(onAlarm);
        fakeAlarms.fire();
        expect(onAlarm).toHaveBeenCalledTimes(1);
    });

    it('drives WebDAV polling end to end', async () => {
        initSyncAlarmListener();
        const backend = new WebDavBackend({ url: 'https://x.test/h.sync', fetch: async () => new Response(null, { status: 404 }), alarms: backgroundAlarms() });
        const onChange = vi.fn();
        backend.watch(onChange);
        await vi.waitFor(() => expect(fakeAlarms.created).toEqual([{ name: POLL_ALARM, periodInMinutes: 5 }]));

        fakeAlarms.fire();
        expect(onChange).toHaveBeenCalledTimes(1);
    });
});
