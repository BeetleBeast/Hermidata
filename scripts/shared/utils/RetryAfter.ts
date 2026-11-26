/** The Retry-After header is a number of seconds or an HTTP date; undefined when it is missing or unreadable */
export function retryAfterMs(header: string | null | undefined, now: number = Date.now()): number | undefined {
    const value = header?.trim();
    if (!value) return undefined;
    if (/^\d+$/.test(value)) return Number(value) * 1000;
    const date = Date.parse(value);
    return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}
