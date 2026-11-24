import { DEFAULT_RSS_CHECK_INTERVAL, DEFAULT_TOMBSTONE_TTL_DAYS, MAX_TOMBSTONE_TTL_DAYS, RSS_CHECK_INTERVALS } from "../constants";
import type { AutoSetStatusMode, AutoSetStatusSettings, LegacyAutoSetStatusSettings } from "../types";

/*
Turn a stored settings value into one that is safe to use: stored settings can be missing a field, hold an old shape,
or carry a value from a form, so each reader falls back to the default instead of trusting it.
*/

/** Whole days within 1..MAX_TOMBSTONE_TTL_DAYS; anything else falls back to the default */
export function resolveTombstoneTtlDays(days: number | undefined): number {
    return Number.isFinite(days) && days! >= 1 ? Math.min(Math.floor(days!), MAX_TOMBSTONE_TTL_DAYS) : DEFAULT_TOMBSTONE_TTL_DAYS;
}

/** One of RSS_CHECK_INTERVALS; anything else falls back to the default */
export function resolveRssCheckInterval(minutes: number | undefined): number {
    return (RSS_CHECK_INTERVALS as readonly number[]).includes(minutes as number) ? minutes! : DEFAULT_RSS_CHECK_INTERVAL;
}

/**
 * The auto status mode from settings of any version: the current { mode } shape, or the two flags used before version 10
 * ( only RSS wins when both were set ). Anything unreadable counts as off, so a stray value never changes a status.
 */
export function resolveAutoSetStatusMode(value: unknown): AutoSetStatusMode {
    if (!value || typeof value !== 'object') return 'off';
    const current = value as Partial<AutoSetStatusSettings>;
    if (current.mode === 'off' || current.mode === 'rss' || current.mode === 'all') return current.mode;
    const legacy = value as Partial<LegacyAutoSetStatusSettings>;
    if (legacy.onlyRSS === true) return 'rss';
    if (legacy.allowAllDateFields === true) return 'all';
    return 'off';
}
