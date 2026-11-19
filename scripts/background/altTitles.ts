import { getHermidataViaKey, getSettings, saveHermidata } from "../shared/db/Storage";
import { logConsoleError } from "../shared/utils/ErrorMessage";
import { generateHermidataHash } from "../shared/utils/StringOutput";
import type { ExternalLookupStatus, Hermidata } from "../shared/types";
import { applyPatch, findPatch, isLookupEnabled, shouldLookup } from "../shared/lookup/altTitleLookup";

/** Pause between two lookups, so a burst of saves stays well inside the servers' rate limits */
const GAP_MS = 1000;

const waiting = new Set<string>();
let queue: Promise<unknown> = Promise.resolve();

const pause = () => new Promise<void>(resolve => setTimeout(resolve, GAP_MS));

/** Runs lookups one at a time, with a pause after each, whoever asked for them ( a save or the backfill ) */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task);
    queue = run.then(pause, pause);
    return run;
}

/**
 * The key a just-saved item is stored under. A new item from the popup still has no id ( "" ):
 * the popup stores it under the hash of its title and type, so look there.
 */
export function storedKeyOf(item: Pick<Hermidata, 'id' | 'title' | 'novelType'>): string {
    if (item.id) return item.id;
    return item.title ? generateHermidataHash(item.title, item.novelType, '', false) : '';
}

/**
 * Looks up the alt titles of a saved item online, in the background and without holding anything up.
 * Does nothing unless the user switched the lookup on; a failed request never reaches the caller.
 */
export function scheduleAltTitleLookup(id: string): void {
    if (!id || waiting.has(id)) return;
    waiting.add(id);
    runAltTitleLookup(id)
        .catch(error => logConsoleError('[AltTitles] lookup failed:', error))
        .finally(() => { waiting.delete(id); });
}

/** Looks up one saved item through the queue; resolves with what was stored, or null when nothing was due */
export function runAltTitleLookup(id: string): Promise<ExternalLookupStatus | null> {
    return enqueue(() => lookUp(id));
}

async function lookUp(id: string): Promise<ExternalLookupStatus | null> {
    if (!isLookupEnabled(await getSettings())) return null;

    const item = await getHermidataViaKey(id);
    if (!item || !shouldLookup(item)) return null;

    const patch = await findPatch(item);
    if (!patch) return null;

    // the item may have been saved again while the request ran: apply the result to the freshest copy
    const fresh = await getHermidataViaKey(id);
    if (!fresh) return null;
    const { item: updated, added } = applyPatch(fresh, patch);
    await saveHermidata(id, updated);
    if (added.length) console.log(`[AltTitles] Added ${added.length} alt title(s) for ${updated.title}`);
    return patch.external.status;
}
