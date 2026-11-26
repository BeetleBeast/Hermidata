import { describe, expect, it } from 'vitest';
import {
    estimateRemainingMs, formatDuration, MANGAUPDATES_CYCLE_MS, MAX_ETA_MS, MAX_THROTTLE_PAUSE_MS, MAX_SLOWDOWN, nextSlowdown, throttlePauseMs,
} from '../../scripts/shared/lookup/mangaUpdatesPace';
import { retryAfterMs } from '../../scripts/shared/utils/RetryAfter';

const MINUTE = 60_000;

describe('estimateRemainingMs', () => {
    const base = { batchSize: 8, lastBatchMs: 5_000, slowdown: 1, pauseMs: 0 };

    it('is one minute per batch left', () => {
        expect(estimateRemainingMs({ ...base, remaining: 22 })).toEqual({ ms: 3 * MINUTE, capped: false }); // 8 + 8 + 6
        expect(estimateRemainingMs({ ...base, remaining: 8 })).toEqual({ ms: MINUTE, capped: false });
        expect(estimateRemainingMs({ ...base, remaining: 0 })).toEqual({ ms: 0, capped: false });
    });

    it('grows with a batch that takes longer than the minute', () => {
        expect(estimateRemainingMs({ ...base, remaining: 16, lastBatchMs: 90_000 }).ms).toBe(2 * 90_000);
    });

    it('grows with the slowdown, and with a pause', () => {
        expect(estimateRemainingMs({ ...base, remaining: 16, slowdown: 1.5 }).ms).toBe(3 * MINUTE);
        expect(estimateRemainingMs({ ...base, remaining: 16, pauseMs: 2 * MINUTE }).ms).toBe(4 * MINUTE);
    });

    it('stops at the maximum, and says it was cut off', () => {
        const estimate = estimateRemainingMs({ ...base, remaining: 8 * 1000, slowdown: MAX_SLOWDOWN });
        expect(estimate).toEqual({ ms: MAX_ETA_MS, capped: true });
    });
});

describe('nextSlowdown', () => {
    it('grows by half after a 429, up to the maximum', () => {
        expect(nextSlowdown(1, true, 1000)).toBe(1.5);
        expect(nextSlowdown(1.5, true, 1000)).toBe(2.25);
        expect(nextSlowdown(MAX_SLOWDOWN, true, 1000)).toBe(MAX_SLOWDOWN);
        expect(nextSlowdown(3.5, true, 1000)).toBe(MAX_SLOWDOWN);
    });

    it('grows a little after a batch that outlasted the minute', () => {
        expect(nextSlowdown(1, false, MANGAUPDATES_CYCLE_MS + 1)).toBe(1.2);
    });

    it('eases back after calm batches, never below 1', () => {
        expect(nextSlowdown(2, false, 5_000)).toBe(1.6);
        expect(nextSlowdown(1.1, false, 5_000)).toBe(1);
        expect(nextSlowdown(1, false, 5_000)).toBe(1);
    });
});

describe('throttlePauseMs', () => {
    it('is what MangaUpdates asked for, at least a minute', () => {
        expect(throttlePauseMs(180_000, 1)).toBe(180_000);
        expect(throttlePauseMs(10_000, 1)).toBe(MINUTE);
        expect(throttlePauseMs(undefined, 1)).toBe(MINUTE);
    });

    it('is longer for each 429 in a row, up to the maximum', () => {
        expect(throttlePauseMs(undefined, 2)).toBe(90_000);
        expect(throttlePauseMs(undefined, 3)).toBe(135_000);
        expect(throttlePauseMs(undefined, 20)).toBe(MAX_THROTTLE_PAUSE_MS);
        expect(throttlePauseMs(60 * MINUTE, 1)).toBe(MAX_THROTTLE_PAUSE_MS); // however long it asks
    });
});

describe('formatDuration', () => {
    it.each<[number, string]>([
        [45_000, '45 seconds'],
        [1_000, '1 second'],
        [60_000, '1 minute'],
        [315_000, '5 minutes and 15 seconds'],
        [61_000, '1 minute and 1 second'],
        [3_600_000, '1 hour'],
        [3_900_000, '1 hour and 5 minutes'],
        [7_200_000, '2 hours'],
        [500, '1 second'], // rounds up: never "0 seconds" while something is left
    ])('%i ms -> %s', (ms, text) => {
        expect(formatDuration(ms)).toBe(text);
    });
});

describe('retryAfterMs', () => {
    it('reads seconds and dates, and nothing else', () => {
        expect(retryAfterMs('120')).toBe(120_000);
        expect(retryAfterMs('Wed, 25 Nov 2026 22:02:00 GMT', Date.parse('Wed, 25 Nov 2026 22:00:00 GMT'))).toBe(120_000);
        expect(retryAfterMs('Wed, 25 Nov 2026 21:00:00 GMT', Date.parse('Wed, 25 Nov 2026 22:00:00 GMT'))).toBe(0);
        expect(retryAfterMs('soon')).toBeUndefined();
        expect(retryAfterMs(null)).toBeUndefined();
        expect(retryAfterMs('')).toBeUndefined();
    });
});
