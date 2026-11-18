import type { SyncBackendConfig, SyncSwitchMode } from "../shared/types"
import { refreshSync, switchSyncBackend } from "../shared/sync/sync.engine"

type Respond = (response?: unknown) => void;

/** From the settings page: save this device's sync backend and switch to it. */
export async function handleSetSyncBackend(config: SyncBackendConfig, mode: SyncSwitchMode, respond: Respond): Promise<void> {
    try {
        if (config?.kind !== 'browser' && config?.kind !== 'webdav') throw new Error('Unknown sync backend');
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
