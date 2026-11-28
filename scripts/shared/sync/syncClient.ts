import type { Hermidata, SyncClientMessage, SyncOwner } from '../types';
import { ext } from '../utils/BrowserCompat';
import { logConsoleError } from '../utils/ErrorMessage';

/**
 * Where library writes report to sync, from any context. Only the background runs the sync engine: it alone
 * schedules pushes and edits the tombstones, so two contexts never race on them. The background registers its
 * engine here at startup; every other page ( popup, library, reading list, settings ) has none and sends the
 * background a message instead, which feeds the same engine.
 */
let owner: SyncOwner | null = null;

/** Background only, before anything can write to the library. */
export function registerSyncOwner(engine: SyncOwner): void {
    owner = engine;
}

/** Call after every putHermidata(): publishes the change, debounced into one write per burst */
export function pushToSync(_entry?: Hermidata): void {
    if (owner) owner.schedulePush();
    else void tellBackground({ type: 'SYNC_LOCAL_CHANGE' });
}

/** Call after every deleteHermidata(): records a tombstone, so the entry is removed on other devices too */
export function removeFromSync(id: string): void {
    if (owner) owner.recordDelete(id);
    else void tellBackground({ type: 'SYNC_RECORD_DELETE', id });
}

async function tellBackground(message: SyncClientMessage): Promise<void> {
    try {
        await ext.runtime.sendMessage(message);
    } catch (err) {
        logConsoleError(`[Sync] could not reach the background for ${message.type}`, err);
    }
}
