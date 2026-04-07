// shared/sync.ts
import { ext } from '../BrowserCompat'
import { putHermidata, deleteHermidata } from './db'
import type { Hermidata } from '../types/index'

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
    const used = (await ext.storage.sync.getKeys()).length;
    const MAX = ext.storage.sync.MAX_ITEMS;
    console.log(`[Sync] Used ${used} of ${MAX} bytes (${Math.round(used / MAX * 100)}%)`)
    if (used > MAX * 0.9) console.warn('[Sync] Approaching sync storage limit')
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
                const { _syncedBy, ...entry } = newValue
                await putHermidata(entry, false) // false to avoid re-syncing
                console.log(`[Sync] Pulled entry from another device: ${entry.title}`)
            } else if (oldValue && !newValue) {
                // Entry was deleted on another device
                // await deleteHermidata(key, false) // false to avoid re-syncing
                console.log(`[Sync] Deleted entry from another device: ${key}`)
            }
        }
    })
}