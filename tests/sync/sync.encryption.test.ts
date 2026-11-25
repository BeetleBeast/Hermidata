// The engine with an encrypted library: turning it on and off, locked devices, rewraps, and the plaintext dedupe.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebDavBackend } from '../../scripts/shared/sync/WebDavBackend';
import { createEncryption, isEnvelope, rewrapHeader, unlockWithPassphrase } from '../../scripts/shared/sync/libraryCrypto';
import type { EnvelopeHeader } from '../../scripts/shared/types';
import { FakeAlarms, FakeDavServer } from './sync.fakeDav';
import { FakeCloud, makeDevice, makeNovel, resetDevices, settle } from './sync.testKit';

vi.mock('../../scripts/shared/utils/BrowserCompat', () => ({ ext: {} }));   // tests inject their own APIs

const URL_ = 'https://dav.test/dav/hermidata.sync';
const PATH = '/dav/hermidata.sync';
const PASS = 'correct horse battery';
const FAST = { iterations: 1_000 };
type Device = ReturnType<typeof makeDevice>;

beforeEach(() => {
    resetDevices();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-11-16T12:00:00.000Z'));
});
afterEach(() => vi.useRealTimers());

const remoteFile = (server: FakeDavServer) => server.files.get(PATH)!.body;
const current = (d: Device, id: string, bm: string) => d.db.get(id)!.chapter.bookmarks[bm].current;
const puts = (server: FakeDavServer) => server.sent('PUT').length;

async function pair() {
    const server = new FakeDavServer();
    const alarms = new FakeAlarms();
    const novels = [makeNovel(1), makeNovel(2), makeNovel(3)];
    const a = makeDevice(new FakeCloud(), 'A', novels, { backend: new WebDavBackend({ url: URL_, fetch: server.fetch, alarms }) });
    const b = makeDevice(new FakeCloud(), 'B', [], { backend: new WebDavBackend({ url: URL_, fetch: server.fetch, alarms }) });
    await a.start();
    await b.start();
    return { server, alarms, a, b, novels };
}

/** What the settings page does: create, store the key on this device, hand the header to the engine. */
async function turnOn(d: Device) {
    const created = await createEncryption(PASS, FAST);
    await d.keyStore.set(created.header.kid, created.key);
    const published = await d.sync.setEncryption(created.header);
    return { ...created, published };
}

/** Unlock on another device: what the settings page does with the passphrase. */
async function unlock(d: Device, header: EnvelopeHeader) {
    await d.keyStore.set(header.kid, await unlockWithPassphrase(header, PASS));
    d.sync.refresh();
    await settle();
}

describe('turning encryption on', () => {
    it('publishes an envelope right away; the library is not readable on the server', async () => {
        const { server, a } = await pair();
        const { published } = await turnOn(a);

        expect(published).toBe(true);
        expect(isEnvelope(remoteFile(server))).toBe(true);
        expect(remoteFile(server)).not.toContain('Novel');
        expect(a.notices.errors).toEqual([]);
    });

    it('refuses a header whose key this device does not hold', async () => {
        const { a } = await pair();
        const { header } = await createEncryption(PASS, FAST);
        await expect(a.sync.setEncryption(header)).rejects.toThrow(/does not hold the key/);
    });

    it('a device without the key is locked: reported once, writes nothing, keeps its library', async () => {
        const { server, alarms, a, b, novels } = await pair();
        await turnOn(a);
        const before = puts(server);

        b.edit(novels[0].id, h => { h.chapter.bookmarks['bm1'].current = 70; });   // B edits while locked
        alarms.fire();
        await settle();
        alarms.fire();
        await settle();

        expect(b.notices.locked).toBe(1);
        expect(puts(server)).toBe(before);                  // never overwrites, never publishes in the clear
        expect(current(b, novels[0].id, 'bm1')).toBe(70);
        expect(b.notices.errors).toEqual([]);
    });

    it('after unlocking, the locked device catches up and its edit made meanwhile is published, encrypted', async () => {
        const { server, alarms, a, b, novels } = await pair();
        const { header } = await turnOn(a);

        vi.setSystemTime(new Date('2026-11-17T12:00:00.000Z'));
        b.edit(novels[0].id, h => { h.chapter.bookmarks['bm1'].current = 70; });
        alarms.fire();
        await settle();

        await unlock(b, header);
        expect(isEnvelope(remoteFile(server))).toBe(true);

        alarms.fire();
        await settle();
        expect(current(a, novels[0].id, 'bm1')).toBe(70);
    });

    it('edits flow both ways and every write stays encrypted', async () => {
        const { server, alarms, a, b, novels } = await pair();
        const { header } = await turnOn(a);
        await unlock(b, header);

        a.edit(novels[1].id, h => { h.chapter.bookmarks['bm2'].current = 21; });
        await settle();
        alarms.fire();
        await settle();
        expect(current(b, novels[1].id, 'bm2')).toBe(21);

        b.edit(novels[2].id, h => { h.chapter.bookmarks['bm3'].current = 31; });
        await settle();
        alarms.fire();
        await settle();
        expect(current(a, novels[2].id, 'bm3')).toBe(31);

        const bodies = server.sent('PUT').filter(r => r.path === PATH && r.status! < 300).map(r => r.body!);
        expect(bodies.slice(1).every(isEnvelope)).toBe(true);   // the first is the plain publish before turning it on
    });
});

describe('the dedupe still works although every encryption differs', () => {
    it('an RSS-only refresh performs no PUT', async () => {
        const { server, a, novels } = await pair();
        await turnOn(a);
        const before = puts(server);

        a.refreshRss(novels[0].id);
        await settle();
        expect(puts(server)).toBe(before);
    });

    it('a poll with nothing changed performs no PUT on either device', async () => {
        const { server, alarms, a, b } = await pair();
        const { header } = await turnOn(a);
        await unlock(b, header);
        const before = puts(server);

        alarms.fire();
        await settle();
        expect(puts(server)).toBe(before);
    });
});

describe('changing the passphrase or the recovery keys', () => {
    it('republishes with the new header; a device holding the key keeps syncing without unlocking again', async () => {
        const { server, alarms, a, b, novels } = await pair();
        const { header } = await turnOn(a);
        await unlock(b, header);
        const before = puts(server);

        const dek = await unlockWithPassphrase(header, PASS, true);
        const { header: next } = await rewrapHeader(header, dek, { passphrase: 'a brand new passphrase' });
        expect(await a.sync.setEncryption(next)).toBe(true);
        expect(puts(server)).toBe(before + 1);                 // published although the library did not change

        alarms.fire();
        await settle();
        b.edit(novels[0].id, h => { h.chapter.bookmarks['bm1'].current = 12; });
        await settle();
        alarms.fire();
        await settle();

        expect(b.notices.locked).toBe(0);
        expect(current(a, novels[0].id, 'bm1')).toBe(12);
        expect(isEnvelope(remoteFile(server))).toBe(true);
    });
});

describe('turning encryption off', () => {
    it('publishes plain, and other devices follow instead of re-encrypting', async () => {
        const { server, alarms, a, b, novels } = await pair();
        const { header } = await turnOn(a);
        await unlock(b, header);

        expect(await a.sync.setEncryption(null)).toBe(true);
        expect(isEnvelope(remoteFile(server))).toBe(false);

        alarms.fire();
        await settle();
        b.edit(novels[0].id, h => { h.chapter.bookmarks['bm1'].current = 99; });
        await settle();
        expect(isEnvelope(remoteFile(server))).toBe(false);
        alarms.fire();
        await settle();
        expect(current(a, novels[0].id, 'bm1')).toBe(99);
    });
});

describe('robustness', () => {
    it('a choice that could not be published is kept and goes out with the next push', async () => {
        const { server, a, novels } = await pair();
        server.failNext = 1;
        const { published } = await turnOn(a);

        expect(published).toBe(false);
        expect(isEnvelope(remoteFile(server))).toBe(false);
        expect(a.local.data['syncSealPending']).toBeTruthy();

        a.edit(novels[0].id, h => { h.meta.notes = 'later'; });
        await settle();
        expect(isEnvelope(remoteFile(server))).toBe(true);
        expect(a.local.data['syncSealPending']).toBe(false);
    });

    it('an envelope its key cannot open is reported and never overwritten', async () => {
        const { server, a, b, alarms } = await pair();
        const { header } = await turnOn(a);
        const impostor = await createEncryption(PASS, FAST);
        await b.keyStore.set(header.kid, impostor.key);          // right id, wrong key
        const file = remoteFile(server);

        b.sync.refresh();
        await settle();
        b.add(makeNovel(9));
        await settle();
        alarms.fire();
        await settle();

        expect(b.notices.errors).toContain('[Sync] could not decrypt remote snapshot');
        expect(remoteFile(server)).toBe(file);
    });

    it('without its key, a device never publishes the library in the clear, even to an empty backend', async () => {
        const { a } = await pair();
        const { header } = await turnOn(a);

        // the same device after a restart with the site data (and so the key store) cleared
        const empty = new FakeDavServer();
        const c = makeDevice(new FakeCloud(), 'A', [...a.db.values()], {
            backend: new WebDavBackend({ url: URL_, fetch: empty.fetch, alarms: new FakeAlarms() }),
        });
        c.local.data['syncSealHeader'] = header;
        await c.start();

        expect(empty.files.size).toBe(0);
        expect(c.notices.locked).toBe(1);
    });

    it('switching to an empty backend keeps the library encrypted', async () => {
        const { a } = await pair();
        await turnOn(a);

        const other = new FakeDavServer();
        await a.sync.switchBackend(new WebDavBackend({ url: URL_, fetch: other.fetch, alarms: new FakeAlarms() }));
        await settle();
        expect(isEnvelope(other.files.get(PATH)!.body)).toBe(true);
    });
});

describe('last resort: replacing a synced copy nobody can open', () => {
    it('a locked device that lost every secret publishes its library under a new passphrase; others merge back in', async () => {
        const { server, alarms, a, b, novels } = await pair();
        const { header: lost } = await turnOn(a);              // B never unlocks, and the secrets are lost

        b.add(makeNovel(7));
        const fresh = await createEncryption('a completely new passphrase', FAST);
        await b.keyStore.set(fresh.header.kid, fresh.key);
        expect(await b.sync.replaceUnreadable(fresh.header)).toBe(true);

        const file = remoteFile(server);
        expect(isEnvelope(file)).toBe(true);
        expect(file).not.toContain(lost.kid);

        // A still holds the old key only: it is locked out of the new copy and does not overwrite it
        alarms.fire();
        await settle();
        expect(remoteFile(server)).toBe(file);
        expect(a.notices.locked).toBe(1);

        // A unlocks with the new passphrase: its entries are merged into the new copy
        await a.keyStore.set(fresh.header.kid, await unlockWithPassphrase(fresh.header, 'a completely new passphrase'));
        a.sync.refresh();
        await settle();
        alarms.fire();
        await settle();
        expect([...b.db.keys()].sort()).toEqual([...novels.map(n => n.id), '1000007'].sort());
        expect([...a.db.keys()].sort()).toEqual([...novels.map(n => n.id), '1000007'].sort());
    });

    it('replaces a damaged envelope, which a normal push leaves alone', async () => {
        const { server, a, novels } = await pair();
        const { header } = await turnOn(a);
        server.files.set(PATH, { body: 'HMENC1.garbage.x.y', etag: '"999"' });

        a.edit(novels[0].id, h => { h.meta.notes = 'x'; });
        await settle();
        expect(remoteFile(server)).toBe('HMENC1.garbage.x.y');

        expect(await a.sync.replaceUnreadable(header)).toBe(true);
        expect(isEnvelope(remoteFile(server))).toBe(true);
        expect(remoteFile(server)).not.toBe('HMENC1.garbage.x.y');
        expect(server.sent('PUT').at(-1)!.headers['if-match']).toBe('"999"');   // still conditional on what it replaced
    });

    it('does not replace a copy that becomes readable meanwhile; it merges instead', async () => {
        const { server, alarms, a, b, novels } = await pair();
        const { header } = await turnOn(a);
        await unlock(b, header);                               // B can read the copy after all

        b.add(makeNovel(8));
        expect(await b.sync.replaceUnreadable(header)).toBe(true);
        alarms.fire();
        await settle();
        expect([...a.db.keys()].sort()).toEqual([...novels.map(n => n.id), '1000008'].sort());
        expect(isEnvelope(remoteFile(server))).toBe(true);
    });
});

describe('on browser sync', () => {
    it('an encrypted library fits, round-trips between devices, and stays encrypted in storage.sync', async () => {
        const cloud = new FakeCloud();
        const novels = Array.from({ length: 10 }, (_, i) => makeNovel(i + 1));
        const a = makeDevice(cloud, 'A', novels);
        const b = makeDevice(cloud, 'B');
        await a.start();
        await b.start();

        const { header } = await turnOn(a);
        await settle();
        const stored = Object.entries(cloud.area.data).filter(([k]) => /^lib:\d+$/.test(k)).map(([, v]) => v).join('');
        expect(isEnvelope(stored)).toBe(true);

        await b.keyStore.set(header.kid, await unlockWithPassphrase(header, PASS));
        a.edit(novels[4].id, h => { h.chapter.bookmarks['bm5'].current = 55; });
        await settle();
        expect(current(b, novels[4].id, 'bm5')).toBe(55);
        expect(a.notices.tooBig).toEqual([]);
        expect(b.notices.errors).toEqual([]);
    });
});
