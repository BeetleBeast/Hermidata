import { getAllHermidata, getSettings } from "../shared/db/Storage";
import { backgroundAlarms } from "../shared/sync/syncAlarms";
import { ext } from "../shared/utils/BrowserCompat";
import { logConsoleError } from "../shared/utils/ErrorMessage";
import { isLookupEnabled } from "../shared/lookup/altTitleLookup";
import { BACKFILL_BATCH_SIZE, BACKFILL_STATE_KEY, dueForBackfill, type BackfillState } from "../shared/lookup/backfill";
import { runAltTitleLookup } from "./altTitles";

export const BACKFILL_ALARM = 'hermidata-alt-title-backfill';

// The browser can stop the background worker at any moment, so the backfill is a short batch once a minute.
// Every result is stored on its item right away, so a stopped worker loses nothing and the next batch carries on.

let inFlight: Promise<void> | null = null;

async function readState(): Promise<BackfillState | null> {
    const stored = await ext.storage.local.get(BACKFILL_STATE_KEY) as Record<string, BackfillState | undefined>;
    return stored?.[BACKFILL_STATE_KEY] ?? null;
}
async function writeState(state: BackfillState): Promise<void> {
    await ext.storage.local.set({ [BACKFILL_STATE_KEY]: state });
}

async function allItems() {
    return Object.values(await getAllHermidata());
}

/** How many saved items a backfill started now would look up ( for the confirmation ) */
export async function countBackfill(): Promise<number> {
    return dueForBackfill(await allItems(), Date.now()).length;
}

export async function startBackfill(): Promise<BackfillState> {
    const now = Date.now();
    const total = dueForBackfill(await allItems(), now).length;
    const state: BackfillState = { running: total > 0, total, done: 0, startedAt: new Date(now).toISOString() };
    await writeState(state);
    if (state.running) {
        backgroundAlarms()?.create(BACKFILL_ALARM, { periodInMinutes: 1 });
        void runBackfillBatch(); // the first batch right away, not a minute later
    }
    return state;
}

export async function stopBackfill(): Promise<void> {
    backgroundAlarms()?.clear(BACKFILL_ALARM);
    const state = await readState();
    if (state?.running) await writeState({ ...state, running: false });
}

/**
 * One batch: up to BACKFILL_BATCH_SIZE items, ended early by a failed lookup ( the servers get a minute's rest ).
 * A call while a batch runs gets that batch, so two never run at once.
 */
export function runBackfillBatch(): Promise<void> {
    inFlight ??= runBatch().finally(() => { inFlight = null; });
    return inFlight;
}

async function runBatch(): Promise<void> {
    try {
        let state = await readState();
        if (!state?.running) {
            backgroundAlarms()?.clear(BACKFILL_ALARM);
            return;
        }
        if (!isLookupEnabled(await getSettings())) {
            await stopBackfill();
            return;
        }

        const startedAt = Date.parse(state.startedAt);
        for (const item of dueForBackfill(await allItems(), startedAt).slice(0, BACKFILL_BATCH_SIZE)) {
            const status = await runAltTitleLookup(item.id);
            // the user may have switched the setting off meanwhile
            const latest = await readState();
            if (!latest?.running) return;
            state = { ...latest, done: Math.min(latest.total, latest.done + 1) };
            await writeState(state);
            if (status === 'error') break;
        }

        // count again: items saved during the run may have been looked up by their save, or be new
        const remaining = dueForBackfill(await allItems(), startedAt).length;
        const total = Math.max(state.total, state.done + remaining);
        const finished = remaining === 0;
        await writeState({ ...state, total, done: finished ? total : total - remaining, running: !finished });
        if (finished) backgroundAlarms()?.clear(BACKFILL_ALARM);
    } catch (error) {
        logConsoleError('[AltTitles] backfill batch failed:', error);
    }
}

/** Call in the first tick: subscribes to the shared alarm listener */
export function initBackfillAlarm(): void {
    backgroundAlarms()?.onAlarm.addListener(alarm => {
        if (alarm.name === BACKFILL_ALARM) void runBackfillBatch();
    });
}

/** Call once the data is ready: an unfinished backfill carries on ( Firefox does not keep alarms over a restart ) */
export async function resumeBackfill(): Promise<void> {
    const state = await readState();
    if (!state?.running) return;
    backgroundAlarms()?.create(BACKFILL_ALARM, { periodInMinutes: 1 });
    void runBackfillBatch();
}
