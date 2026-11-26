import { afterEach, describe, expect, it, vi } from 'vitest';
import { LookupError, LookupTimeoutError, searchAniList, searchMangaUpdates } from '../../scripts/shared/lookup/sources';

afterEach(() => vi.useRealTimers());

/** A server that answers after `delayMs`, or never ( no delay ): the request also ends when its signal is aborted, as fetch does */
const server = (body: unknown, delayMs?: number) => vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('signal is aborted without reason', 'AbortError')));
    if (delayMs !== undefined) setTimeout(() => resolve(new Response(JSON.stringify(body), { status: 200 })), delayMs);
}));

describe('the MangaUpdates search is given time', () => {
    it('waits for a slow answer: a title that takes 15 seconds still gets its result', async () => {
        vi.useFakeTimers();
        const found = { results: [{ hit_title: '??? Rank no Ura Soubi Musou', record: { series_id: 29224771414, title: 'The Unparalleled Hidden Rank Equipment', type: 'Manga', year: '2020' } }] };
        const search = searchMangaUpdates('??? Rank no Ura Soubi Musou', server(found, 15_000));

        await vi.advanceTimersByTimeAsync(15_000);

        expect(await search).toEqual([expect.objectContaining({ id: '29224771414', source: 'mangaupdates' })]);
    });

    it('sends the title as it is saved, symbols included', async () => {
        const fetcher = server({ results: [] }, 0);
        vi.useFakeTimers();

        const search = searchMangaUpdates('Re:Zero ??? Fate/Zero', fetcher);
        await vi.advanceTimersByTimeAsync(0);
        await search;

        const body = JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body));
        expect(body).toEqual({ search: 'Re:Zero ??? Fate/Zero' });
    });

    it('gives up after 25 seconds, with an error that says so, not the browser wording', async () => {
        vi.useFakeTimers();
        const failure = searchMangaUpdates('Solo Leveling', server({})).catch(error => error);

        await vi.advanceTimersByTimeAsync(25_000);
        const error = await failure;

        expect(error).toBeInstanceOf(LookupTimeoutError);
        expect(error).toBeInstanceOf(LookupError);
        expect(error.message).toBe('no answer within 25 seconds');
        expect(error.message).not.toContain('aborted');
    });

    it('sends nothing for a title of only symbols', async () => {
        const fetcher = vi.fn();

        expect(await searchMangaUpdates('??? !!!', fetcher)).toEqual([]);
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('is not a timeout when the network fails', async () => {
        const fetcher = vi.fn(async () => { throw new TypeError('Failed to fetch'); });

        const error = await searchMangaUpdates('Solo Leveling', fetcher).catch(e => e);

        expect(error).toBeInstanceOf(LookupError);
        expect(error).not.toBeInstanceOf(LookupTimeoutError);
        expect(error.message).toBe('Failed to fetch');
    });
});

describe('the other lookups keep the 10 seconds', () => {
    it('AniList gives up after 10 seconds', async () => {
        vi.useFakeTimers();
        const failure = searchAniList('Solo Leveling', server({})).catch(error => error);

        await vi.advanceTimersByTimeAsync(10_000);

        expect((await failure).message).toBe('no answer within 10 seconds');
    });
});
