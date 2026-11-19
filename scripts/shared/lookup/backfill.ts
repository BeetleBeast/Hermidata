import type { Hermidata } from "../types";
import { shouldLookup } from "./altTitleLookup";
import { kindOfType } from "./matching";

/** Where the background keeps the backfill progress ( storage.local: every device runs its own ) */
export const BACKFILL_STATE_KEY = 'altTitleBackfill';
/** Items looked up per alarm tick; the alarm fires once a minute */
export const BACKFILL_BATCH_SIZE = 8;

export interface BackfillState {
    running: boolean;
    total: number;
    done: number;
    startedAt: string;
}

/**
 * The saved items a backfill still has to look up, items with an RSS feed first.
 * An item whose lookup failed during this run is not tried again in it.
 */
export function dueForBackfill(items: Hermidata[], startedAt: number, now: number = Date.now()): Hermidata[] {
    return items
        .filter(item => item?.id && shouldLookup(item, now))
        .filter(item => {
            const external = item.meta?.external;
            return external?.status !== 'error' || Date.parse(external.checkedAt) < startedAt;
        })
        .sort((a, b) => Number((b.rss?.length ?? 0) > 0) - Number((a.rss?.length ?? 0) > 0));
}

/** Items that already have their alt titles from an earlier lookup: they count as done from the start */
export function alreadyMatched(items: Hermidata[]): number {
    return items.filter(item => item?.id && kindOfType(item.novelType) && item.meta?.external?.status === 'matched').length;
}

/** Rough duration shown in the confirmation */
export function backfillMinutes(count: number): number {
    return Math.max(1, Math.ceil(count / BACKFILL_BATCH_SIZE));
}

/** Text for the progress line under the setting */
export function backfillLabel(state: BackfillState): string {
    if (state.running) return `Looking up alt titles: ${state.done} of ${state.total}`;
    if (state.done >= state.total) return `Alt titles looked up for ${state.total} item${state.total === 1 ? '' : 's'}.`;
    return `Stopped at ${state.done} of ${state.total}.`;
}
