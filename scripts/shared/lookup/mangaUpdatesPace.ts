/*
How long the MangaUpdates linking will take, for the countdown in the settings page.
The estimate follows what really happens: a batch that runs long, or MangaUpdates asking us to slow down ( HTTP 429 ),
makes it grow; calm batches bring it back. Every part has a maximum, so a bad stretch can't push it out of reach.
*/

/** The alarm fires once a minute: one batch per cycle at best */
export const MANGAUPDATES_CYCLE_MS = 60_000;
/** The slowest the estimate assumes: a cycle takes at most this many times as long as usual */
export const MAX_SLOWDOWN = 4;
/** Beyond this the estimate only says "more than ..." */
export const MAX_ETA_MS = 2 * 60 * 60 * 1000;
/** The longest the clock pauses after a 429 or a timeout, whatever MangaUpdates asks for */
export const MAX_THROTTLE_PAUSE_MS = 10 * 60 * 1000;
/** After this many 429s or timeouts in a row the clock stops; the next feed check ( within the hour ) tries again */
export const MAX_THROTTLE_STREAK = 5;

const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * How much slower than planned the batches run.
 * - a 429, or a request that timed out: 1.5 times more
 * - a batch that took longer than a cycle ( slow answers, many searches ): 1.2 times more
 * - a calm batch: eases back, 0.8 times
 */
export function nextSlowdown(previous: number, throttled: boolean, batchMs: number): number {
    if (throttled) return round(Math.min(MAX_SLOWDOWN, previous * 1.5));
    if (batchMs > MANGAUPDATES_CYCLE_MS) return round(Math.min(MAX_SLOWDOWN, previous * 1.2));
    return round(Math.max(1, previous * 0.8));
}

/** How long to pause after a 429: what MangaUpdates asked for ( a cycle when it said nothing ), longer for each 429 in a row */
export function throttlePauseMs(retryAfterMs: number | undefined, streak: number): number {
    const asked = Math.max(retryAfterMs ?? 0, MANGAUPDATES_CYCLE_MS);
    return Math.min(MAX_THROTTLE_PAUSE_MS, Math.round(asked * 1.5 ** Math.max(0, streak - 1)));
}

export interface PaceInput {
    /** items still to link */
    remaining: number;
    batchSize: number;
    /** how long the last batch took */
    lastBatchMs: number;
    slowdown: number;
    /** the clock is paused for this long first */
    pauseMs: number;
}

/** Time until the last batch is done; `capped` when the real estimate is beyond MAX_ETA_MS */
export function estimateRemainingMs({ remaining, batchSize, lastBatchMs, slowdown, pauseMs }: PaceInput): { ms: number; capped: boolean } {
    if (remaining <= 0) return { ms: 0, capped: false };
    const batches = Math.ceil(remaining / batchSize);
    const cycleMs = Math.max(MANGAUPDATES_CYCLE_MS, lastBatchMs);
    const raw = pauseMs + batches * cycleMs * slowdown;
    return { ms: Math.min(raw, MAX_ETA_MS), capped: raw > MAX_ETA_MS };
}

const plural = (count: number, unit: string): string => `${count} ${unit}${count === 1 ? '' : 's'}`;

/** "5 minutes and 15 seconds", "1 hour and 5 minutes", "45 seconds" */
export function formatDuration(ms: number): string {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    const parts = hours > 0
        ? [plural(hours, 'hour'), minutes ? plural(minutes, 'minute') : '']
        : minutes > 0
            ? [plural(minutes, 'minute'), rest ? plural(rest, 'second') : '']
            : [plural(rest, 'second')];
    return parts.filter(Boolean).join(' and ');
}
