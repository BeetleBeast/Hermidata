import { getHermidataViaKey, getSettings, saveHermidata } from "../shared/db/Storage";
import { logConsoleError } from "../shared/utils/ErrorMessage";
import { applyPatch, findPatch, isLookupEnabled, shouldLookup } from "../shared/lookup/altTitleLookup";

/** Pause between two lookups, so a burst of saves stays well inside the servers' rate limits */
const GAP_MS = 1000;

const waiting = new Set<string>();
let queue: Promise<void> = Promise.resolve();

/**
 * Looks up the alt titles of a saved item online, one item at a time and without holding anything up.
 * Does nothing unless the user switched the lookup on; a failed request never reaches the caller.
 */
export function scheduleAltTitleLookup(id: string): void {
    if (!id || waiting.has(id)) return;
    waiting.add(id);
    queue = queue
        .then(() => lookUp(id))
        .catch(error => logConsoleError('[AltTitles] lookup failed:', error))
        .then(() => new Promise<void>(resolve => setTimeout(resolve, GAP_MS)))
        .finally(() => { waiting.delete(id); });
}

async function lookUp(id: string): Promise<void> {
    if (!isLookupEnabled(await getSettings())) return;

    const item = await getHermidataViaKey(id);
    if (!item || !shouldLookup(item)) return;

    const patch = await findPatch(item);
    if (!patch) return;

    // the item may have been saved again while the request ran: apply the result to the freshest copy
    const fresh = await getHermidataViaKey(id);
    if (!fresh) return;
    const { item: updated, added } = applyPatch(fresh, patch);
    await saveHermidata(id, updated);
    if (added.length) console.log(`[AltTitles] Added ${added.length} alt title(s) for ${updated.title}`);
}
