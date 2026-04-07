// shared/sync.ts
import { ext } from './BrowserCompat'
import { putHermidata, deleteHermidata } from './db'
import type { Hermidata } from './types/popupType'

const DEVICE_ID = await getOrCreateDeviceId()

type id = `${string}-${string}-${string}-${string}-${string}`

// The transit wrapper — only exists in storage.sync, never in IndexedDB
type SyncEntry = Hermidata & { _syncedBy: string }

async function getOrCreateDeviceId(): Promise<string> {
    const result: { deviceId?: id } = await ext.storage.local.get('deviceId')
    if (result.deviceId) return result.deviceId
    const id = crypto.randomUUID()
    await ext.storage.local.set({ deviceId: id })
    return id
}

const used = await ext.storage.sync.getBytesInUse()
const MAX = ext.storage.sync.QUOTA_BYTES // 102400
if (used > MAX * 0.9) console.warn('[Sync] Approaching sync storage limit')

/** Call after every putHermidata() — pushes just that one entry to sync */
export async function pushToSync(entry: Hermidata): Promise<void> {
    try {
        await ext.storage.sync.set({
            [entry.id]: { ...entry, _syncedBy: DEVICE_ID }
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
            if (newValue?._syncedBy === DEVICE_ID) continue

            if (newValue) {
                // Strip the transit metadata before writing to IndexedDB
                const { _syncedBy, ...entry } = newValue
                await putHermidata(entry)
                console.log(`[Sync] Pulled entry from another device: ${entry.title}`)
            } else if (oldValue && !newValue) {
                // Entry was deleted on another device
                await deleteHermidata(key)
                console.log(`[Sync] Deleted entry from another device: ${key}`)
            }
        }
    })
}