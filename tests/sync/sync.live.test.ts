// WebDavBackend against a REAL WebDAV server. Skipped unless HERMIDATA_DAV_URL points to a folder the test may
// write to; it only touches files whose names start with "hermidata-live-" and deletes them afterwards.
//
//   npm run sync:server   (second terminal, needs rclone)
//   HERMIDATA_DAV_URL=http://127.0.0.1:8080/ HERMIDATA_DAV_USER=hermidata HERMIDATA_DAV_PASS=hermidata npx vitest run tests/sync/sync.live.test.ts --reporter=verbose

import { describe, it, expect, vi, afterAll } from 'vitest';
import { WebDavBackend } from '../../scripts/shared/sync/WebDavBackend';
import { ConflictError, WebDavError } from '../../scripts/shared/utils/dedicatedErrors';

vi.mock('../../scripts/shared/utils/BrowserCompat', () => ({ ext: {} }));

const base = process.env.HERMIDATA_DAV_URL?.trim();
const folder = base ? (base.endsWith('/') ? base : `${base}/`) : undefined;
const user = process.env.HERMIDATA_DAV_USER || undefined;
const pass = process.env.HERMIDATA_DAV_PASS ?? '';

// keeps an unconfigured run green instead of "no tests found"
it.skipIf(!!folder)('is skipped: set HERMIDATA_DAV_URL to a writable WebDAV folder to run it', () => {});

describe.skipIf(!folder)('live WebDAV server', () => {
    const run = `hermidata-live-${Date.now().toString(36)}`;
    // a skipped describe still runs its body while collecting, so it needs some base even when unconfigured
    const root = folder ?? 'http://unconfigured.invalid/';
    const fileUrl = new URL(`${run}.sync`, root).toString();
    const subFolder = new URL(`${run}/`, root).toString();
    const nestedUrl = new URL('nested.sync', subFolder).toString();

    const connect = (url = fileUrl, password = pass) =>
        new WebDavBackend({ url, username: user, password, alarms: undefined });

    const authHeader: Record<string, string> = user ? { Authorization: `Basic ${btoa(`${user}:${pass}`)}` } : {};
    const remove = (url: string) => fetch(url, { method: 'DELETE', headers: authHeader }).catch(() => undefined);

    afterAll(async () => {
        await remove(fileUrl);
        await remove(nestedUrl);
        await remove(subFolder);
    });

    it('testConnection succeeds', async () => {
        const result = await connect().testConnection();
        console.info(`[live] ${folder}: ${JSON.stringify(result)}`);
        expect(result.ok).toBe(true);
    });

    it('round trip: write, read back, the same version on another device', async () => {
        const a = connect();
        expect(await a.read()).toBeNull();

        const written = await a.write('hello from hermidata');
        expect(written.status).toBe('written');
        const version = (written as { version: string }).version;

        const b = connect();
        expect(await b.read()).toEqual({ data: 'hello from hermidata', version });

        const again = await b.read(version);
        // 'unchanged' needs a strong ETag; servers without one return the data and the same h: version
        if (again !== 'unchanged') expect(again).toEqual({ data: 'hello from hermidata', version });
        console.info(`[live] version ${version}, conditional read: ${again === 'unchanged'}`);
    });

    it('every write produces a new version', async () => {
        const a = connect();
        const v1 = (await a.write('one') as { version: string }).version;
        const v2 = (await a.write('two') as { version: string }).version;
        expect(v2).not.toBe(v1);
    });

    it('a stale If-Match is rejected when the server supports it', async () => {
        const a = connect();
        const probe = await a.testConnection();
        if (!probe.ok || !probe.conditionalWrite) {
            console.info('[live] server does not enforce If-Match; skipping the conflict check');
            return;
        }
        const v1 = (await a.write('base') as { version: string }).version;
        await connect().write('someone else', v1);
        await expect(a.write('stale', v1)).rejects.toBeInstanceOf(ConflictError);
        expect(await a.read()).toMatchObject({ data: 'someone else' });
    });

    it('creates a missing folder on the first write', async () => {
        const res = await connect(nestedUrl).write('nested');
        expect(res.status).toBe('written');
        expect(await connect(nestedUrl).read()).toMatchObject({ data: 'nested' });
    });

    it.skipIf(!user)('a wrong password is reported as auth', async () => {
        const err = await connect(fileUrl, `${pass}-wrong`).read().catch(e => e);
        expect(err).toBeInstanceOf(WebDavError);
        expect(err.kind).toBe('auth');
    });
});
