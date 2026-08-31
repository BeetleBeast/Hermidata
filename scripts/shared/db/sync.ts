// shared/sync.ts
import { ext } from '../utils/BrowserCompat'
import { putHermidata, isHermidataV10 } from './db'
import type { Hermidata, migrationReturn } from '../types'
import { HermidataMigration } from '../migration/Hermidata';
import { getHermidataViaKey } from './Storage';
import { HermidataModel } from '../utils/HermidataSelector';

let _deviceId: string | null = null;


type id = `${string}-${string}-${string}-${string}-${string}`

// The transit wrapper — only exists in storage.sync, never in IndexedDB
type SyncEntry = Hermidata & { _syncedBy: string }

async function getDeviceId(): Promise<string> {
    if (_deviceId) return _deviceId
    const result: { deviceId?: id } = await chrome.storage.local.get('deviceId')
    if (result.deviceId) {
        _deviceId = result.deviceId
        return _deviceId
    }
    const id = crypto.randomUUID()
    await chrome.storage.local.set({ deviceId: id })
    _deviceId = id
    return _deviceId
}

export async function checkSyncQuota(): Promise<void> {
    // 1. Get current usage
    const used_Items = (await ext.storage.sync.getKeys()).length;
    const used_bytes = await ext.storage.sync.getBytesInUse();
    const used_bytes_per_item = 1070 // average
    const used_write_operations = 0 // TODO
    // 2. get max usage
    const max_items = getMaxItemsCount();
    const max_bytes = getMaxByteCount();
    const max_bytes_per_item = getMaxByteCountPerItem();
    const max_write_operations = getMaxWriteOperations();
    // 3. log current usage
    console.group('[Sync] Current usage');
    
    console.log(`[Sync] Used ${used_Items} of ${max_items} items (${Math.round(used_Items / max_items * 100)}%)`);
    console.log(`[Sync] Used ${used_bytes} of ${max_bytes}bytes (${Math.round( used_bytes / max_bytes * 100)}%)`);
    console.log(`[Sync] Used ${used_bytes_per_item} of ${max_bytes_per_item} bytes per item (${Math.round( used_bytes_per_item / max_bytes_per_item * 100)}%)`);
    console.log(`[Sync] Used ${used_write_operations} of ${max_write_operations} write operations per hour (${Math.round( used_write_operations / max_write_operations * 100)}%)`);
    // 4. warn if close to limit

    if (
        used_Items >( max_items * 0.9) ||
        used_bytes > (max_bytes * 0.9) ||
        used_bytes_per_item > (max_bytes_per_item * 0.9) ||
        used_write_operations > (max_write_operations * 0.9)
    ) console.warn('[Sync] Approaching sync storage limit')

    console.groupEnd();
}
function getMaxItemsCount(): number {
    const MAX = ext.storage.sync.MAX_ITEMS ?? 512;
    return MAX;
}
function getMaxByteCount(): number {
    const MAX = ext.storage.sync.QUOTA_BYTES ?? 102400;
    return MAX;
}
function getMaxByteCountPerItem(): number {
    const MAX = ext.storage.sync.QUOTA_BYTES_PER_ITEM ?? 8192;
    return MAX;
}
function getMaxWriteOperations(): number {
    const MAX = ext.storage.sync.MAX_WRITE_OPERATIONS_PER_HOUR ?? 1800;
    return MAX;
}

/** Call after every putHermidata() — pushes just that one entry to sync */
export async function pushToSync(entry: Hermidata): Promise<void> {
    try {
        await ext.storage.sync.set({
            [entry.id]: { ...entry, _syncedBy: await getDeviceId() }
        })
    } catch (err) {
        console.error('[Sync] Failed to push entry:', err)
    }
}

/** Call after every deleteHermidata() — removes entry from sync too */
export async function removeFromSync(id: string): Promise<void> {
    try {
        await ext.storage.sync.remove(id)
    } catch (err) {
        console.error('[Sync] Failed to remove entry:', err)
    }
}

/** Register in background.ts — listens for changes from other devices */
export function initSync(): void {
    ext.storage.onChanged.addListener(async (changes, area) => {
        if (area !== 'sync') return

        for (const [key, change] of Object.entries(changes)) {
            // Skip settings key
            if (key === 'Settings') continue

            const newValue = change.newValue as SyncEntry | undefined
            const oldValue = change.oldValue as SyncEntry | undefined
            // Skip changes we made ourselves
            if (newValue?._syncedBy === await getDeviceId()) continue

            if (newValue) {
                // Strip the transit metadata before writing to IndexedDB
                let { _syncedBy, ...entry } = newValue

                // make sure to have the hermidata in the latest format before putting it in the db
                const returnObj: migrationReturn = isHermidataV10(entry) ? { result: entry, isMigratedSuccessfully: true }: HermidataMigration.migrateAllHermidataToLatest(entry);

                console.assert(isHermidataV10(returnObj.result), '[Sync] Failed to migrate entry');

                if (returnObj?.isMigratedSuccessfully) {
                    // check if the entry in the database and the one in sync is out of date
                    const existingEntry = await getHermidataViaKey(entry.id);

                    // if the entry in the database is out of date or does not exist, update it
                    if (!existingEntry || existingEntry.meta.updated < entry.meta.updated) {
                        await putHermidata(returnObj.result, false) // false to avoid re-syncing
                        continue;
                    }
                    // if the entry in the database is up to date, update it
                    const hermidata = new HermidataModel(existingEntry);

                    hermidata.UpdateOutdatedSync(new HermidataModel(returnObj.result));
                    await putHermidata(hermidata.toJSON(), false) // false to avoid re-syncing
                    

                }
                console.log(`[Sync] Pulled entry from another device: ${entry.title}`)
            } else if (oldValue && !newValue) {
                // Entry was deleted on another device
                // await deleteHermidata(key, false) // false to avoid re-syncing
                removeFromSync(key)
                console.timeStamp('[Sync] Deleted entry from another device');
                console.count('[Sync] Deleted entry from another device');
                console.log(`[Sync] Deleted entry from another device: ${key}`)
            }
        }
    })
}