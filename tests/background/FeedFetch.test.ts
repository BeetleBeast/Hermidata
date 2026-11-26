import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFeedText } from '../../scripts/background/feedFetch';

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

const tooMany = (seconds: string) => new Response('', { status: 429, headers: { 'Retry-After': seconds } });

describe('fetchFeedText on a 429', () => {
    it('comes back at once with what it asked for, when the caller does not want to wait', async () => {
        const fetcher = vi.fn(async () => tooMany('30'));
        vi.stubGlobal('fetch', fetcher);

        const result = await fetchFeedText('https://api.example.com/rss', { etag: null, lastModified: null }, { waitOnRateLimit: false });

        expect(result).toEqual({ status: 'failed', httpStatus: 429, retryAfterMs: 30_000 });
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('waits it out and tries again by default ( the feed check )', async () => {
        vi.useFakeTimers();
        const fetcher = vi.fn()
            .mockResolvedValueOnce(tooMany('2'))
            .mockResolvedValueOnce(new Response('<rss/>', { status: 200 }));
        vi.stubGlobal('fetch', fetcher);

        const pending = fetchFeedText('https://api.example.com/rss');
        await vi.advanceTimersByTimeAsync(2_000);
        const result = await pending;

        expect(fetcher).toHaveBeenCalledTimes(2);
        expect(result.status).toBe('ok');
    });
});
