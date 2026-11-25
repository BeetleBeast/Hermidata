import type { AlarmsLike, SyncBackend, SyncBackendConfig, SyncSwitchMode } from "../types";
import type { ext } from "../utils/BrowserCompat";
import { BrowserSyncBackend } from "./BrowserSyncBackend";
import { LocalBackend } from "./LocalBackend";
import { WebDavBackend } from "./WebDavBackend";

// ---------------------------------------------------------------- constants

/** storage.local: which backend this device syncs through, with its credentials. Never synced. */
export const SYNC_CONFIG_KEY = 'syncBackend';
/** storage.local: true while a switch with "use the server copy" waits for its first pull. */
export const SYNC_ADOPT_KEY = 'syncAdoptPending';
/** storage.local: the header of the newest snapshot this device knows (null = published in the clear). */
export const SYNC_SEAL_HEADER_KEY = 'syncSealHeader';
/** storage.local: { header } chosen in Settings (null = turn encryption off), until a write carrying it succeeds. */
export const SYNC_SEAL_PENDING_KEY = 'syncSealPending';

/** storage.local: a SyncStatus, rewritten by the engine after every sync attempt. */
export const SYNC_STATUS_KEY = 'syncStatus';

export const DEFAULT_SYNC_CONFIG: SyncBackendConfig = { kind: 'browser' };

// ------------------------------------------------------------------ storage

/** The two storage.local calls the config needs (structural, so test fakes fit too). */
type LocalArea = {
    get(keys: string): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void>;
};

/** The saved config, or browser sync when nothing (or nothing valid) is saved. */
export async function loadSyncConfig(local: LocalArea): Promise<SyncBackendConfig> {
    const got = await local.get(SYNC_CONFIG_KEY);
    const saved = got[SYNC_CONFIG_KEY] as Partial<SyncBackendConfig> | undefined;
    if (saved?.kind === 'local') return { kind: 'local' };
    if (saved?.kind === 'webdav' && typeof saved.url === 'string') return saved as SyncBackendConfig;
    return DEFAULT_SYNC_CONFIG;
}

/** Saves the config and the adopt flag in one set() call, so a restart never sees one without the other. */
export async function saveSyncConfig(local: LocalArea, config: SyncBackendConfig, mode: SyncSwitchMode = 'merge'): Promise<void> {
    await local.set({ [SYNC_CONFIG_KEY]: config, [SYNC_ADOPT_KEY]: mode === 'adopt' });
}

/** Same backend and same place, so switching to it again needs no first-run choice. Credentials may differ. */
export function sameTarget(a: SyncBackendConfig, b: SyncBackendConfig): boolean {
    if (a.kind !== b.kind) return false;
    if (a.kind === 'browser' || a.kind === 'local') return true;
    return a.url === (b as { url: string }).url;
}

/** Same place and same credentials: saving this again would change nothing. (The poll interval is not edited in the form.) */
export function sameConfig(a: SyncBackendConfig, b: SyncBackendConfig): boolean {
    if (!sameTarget(a, b)) return false;
    if (a.kind !== 'webdav' || b.kind !== 'webdav') return true;
    return (a.username ?? '') === (b.username ?? '') && (a.password ?? '') === (b.password ?? '');
}

export function describeTarget(config: SyncBackendConfig): string {
    if (config.kind === 'browser') return 'Browser sync';
    if (config.kind === 'local') return 'Local only (no sync)';
    try { return `WebDAV (${new URL(config.url).host})`; } catch { return 'WebDAV'; }
}

// -------------------------------------------------------------- validation

export type UrlCheck = { ok: true; url: string; warning?: string } | { ok: false; error: string };

const PRIVATE_V4 = [
    /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./,
];
const LOCAL_SUFFIXES = ['.localhost', '.local', '.lan', '.home.arpa', '.internal'];

/** localhost, loopback, private and link-local addresses, and local-only host names. */
export function isLocalOrPrivateHost(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (host === 'localhost' || LOCAL_SUFFIXES.some(s => host.endsWith(s))) return true;
    if (PRIVATE_V4.some(re => re.test(host))) return true;
    if (host === '::1') return true;
    return /^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host);   // unique local, link-local
}

/**
 * The snapshot file URL a user typed. https is required; plain http is allowed only for localhost and
 * private networks, with a warning, because the password and the library would travel unencrypted.
 */
export function validateWebDavUrl(raw: string): UrlCheck {
    const text = raw.trim();
    if (!text) return { ok: false, error: 'Enter the URL of the sync file on your server.' };

    let url: URL;
    try { url = new URL(text); } catch { return { ok: false, error: 'This is not a valid URL.' }; }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        return { ok: false, error: 'The URL must start with https://.' };
    }
    if (url.username || url.password) {
        return { ok: false, error: 'Put the username and password in their own fields, not in the URL.' };
    }
    if (url.pathname.endsWith('/')) {
        return { ok: false, error: 'The URL must point to a file (e.g. …/Hermidata/hermidata.sync), not a folder.' };
    }
    url.hash = '';

    if (url.protocol === 'http:') {
        if (!isLocalOrPrivateHost(url.hostname)) {
            return { ok: false, error: 'Use https://. Plain http:// is only allowed for localhost and private network addresses.' };
        }
        return {
            ok: true,
            url: url.toString(),
            warning: 'This connection is not encrypted. Your password and library travel in plain text, so only use it on a network you trust.',
        };
    }
    return { ok: true, url: url.toString() };
}

/** The host permission pattern for the server. Match patterns have no port, so this covers every port of the host. */
export function originPattern(url: string): string {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}/*`;
}

// ----------------------------------------------------------------- factory

export type BackendEnv = {
    api: typeof ext;
    getDeviceId: () => Promise<string>;
    /** For WebDAV polling. Leave out where nothing should be watched (e.g. a settings page probing a server). */
    alarms?: AlarmsLike;
    fetch?: typeof fetch;
};

export function createBackend(config: SyncBackendConfig, env: BackendEnv): SyncBackend {
    if (config.kind === 'browser') return new BrowserSyncBackend(env.api, env.getDeviceId);
    if (config.kind === 'local') return new LocalBackend();
    return createWebDavBackend(config, env);
}

export function createWebDavBackend(config: Extract<SyncBackendConfig, { kind: 'webdav' }>, env: Omit<BackendEnv, 'api' | 'getDeviceId'> = {}): WebDavBackend {
    return new WebDavBackend({
        url: config.url,
        username: config.username || undefined,   // an empty username means no Authorization header at all
        password: config.password,
        pollMinutes: config.pollMinutes,
        fetch: env.fetch,
        alarms: env.alarms,
    });
}
