import type { SyncBackendConfig, SyncSwitchMode } from "../shared/types"
import { refreshSync, replaceUnreadableSync, setSyncEncryption, switchSyncBackend } from "../shared/sync/sync.engine"
import { assertHeader } from "../shared/sync/libraryCrypto"

type Respond = (response?: unknown) => void;

/** From the settings page: save this device's sync backend and switch to it. */
export async function handleSetSyncBackend(config: SyncBackendConfig, mode: SyncSwitchMode, respond: Respond): Promise<void> {
    try {
        if (config?.kind !== 'browser' && config?.kind !== 'local' && config?.kind !== 'webdav') throw new Error('Unknown sync backend');
        await switchSyncBackend(config, mode === 'adopt' ? 'adopt' : 'merge');
        respond({ success: true });
    } catch (err) {
        respond({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
}

/** From the popup: look for changes from other devices now instead of waiting for the next poll. */
export function handleRefreshSync(): void {
    refreshSync();
}

/**
 * From the settings page: publish the library sealed with this header from now on, or plain with null.
 * The page has already put the matching key in the shared IndexedDB key store. With `replace`, a synced copy that
 * cannot be opened is overwritten with this device's library (the user's explicit last resort).
 */
export async function handleSetSyncEncryption(header: unknown, replace: boolean, respond: Respond): Promise<void> {
    try {
        if (header !== null) assertHeader(header);
        const published = replace ? await replaceUnreadableSync(header) : await setSyncEncryption(header);
        respond({ success: true, published });
    } catch (err) {
        respond({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
}
