import { ext } from "../utils/BrowserCompat";

/** How full storage.sync is, logged with a warning near the limit ( the popup checks this ). */
export async function checkSyncQuota(): Promise<void> {
    // 1. Get current usage
    const used_Items = (await ext.storage.sync.getKeys()).length;
    const used_bytes = await ext.storage.sync.getBytesInUse();
    const used_bytes_per_item = 1070 // average
    // 2. get max usage
    const max_items = getMaxItemsCount();
    const max_bytes = getMaxByteCount();
    const max_bytes_per_item = getMaxByteCountPerItem();
    // 3. log current usage
    console.group('[Sync] Current usage');
    
    console.log(`[Sync] Used ${used_Items} of ${max_items} items (${Math.round(used_Items / max_items * 100)}%)`);
    console.log(`[Sync] Used ${used_bytes} of ${max_bytes} bytes (${Math.round( used_bytes / max_bytes * 100)}%)`);
    console.log(`[Sync] Used ${used_bytes_per_item} of ${max_bytes_per_item} bytes per item (${Math.round( used_bytes_per_item / max_bytes_per_item * 100)}%)`);
    // 4. warn if close to limit

    if (
        used_Items >( max_items * 0.9) ||
        used_bytes > (max_bytes * 0.9) ||
        used_bytes_per_item > (max_bytes_per_item * 0.9)
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
/** A size in KB as a share of the storage.sync quota, for the sync warnings */
export const kbCounter = (kb: number) => `${kb}KB --> ${Math.round(kb / getMaxByteCount() * 100)}% of max ${getMaxByteCount()}`;
