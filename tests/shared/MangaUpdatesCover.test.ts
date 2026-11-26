import { describe, expect, it, vi } from 'vitest';
import { fetchMangaUpdatesCover, LookupError } from '../../scripts/shared/lookup/sources';

const answer = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('fetchMangaUpdatesCover', () => {
    it('gives the full size image of the series', async () => {
        const fetcher = answer({ image: { url: { original: 'https://cdn.mangaupdates.com/image/i515366.jpg', thumb: 'https://cdn.mangaupdates.com/image/thumb/i515366.jpg' }, height: 400, width: 278 } });

        expect(await fetchMangaUpdatesCover('15180124327', fetcher)).toBe('https://cdn.mangaupdates.com/image/i515366.jpg');
        expect((fetcher.mock.calls[0] as unknown as [string])[0]).toBe('https://api.mangaupdates.com/v1/series/15180124327');
    });

    it('gives null when the series has no image, or one that is not an https link', async () => {
        expect(await fetchMangaUpdatesCover('1', answer({ image: { url: { original: null, thumb: null } } }))).toBeNull();
        expect(await fetchMangaUpdatesCover('1', answer({ title: 'No image' }))).toBeNull();
        expect(await fetchMangaUpdatesCover('1', answer({ image: { url: { original: 'http://cdn.example.com/a.jpg' } } }))).toBeNull();
        expect(await fetchMangaUpdatesCover('1', answer({ image: { url: { original: 'javascript:alert(1)' } } }))).toBeNull();
    });

    it('fails with the status when the server does not give the series', async () => {
        const error = await fetchMangaUpdatesCover('1', answer({}, 404)).catch(e => e);

        expect(error).toBeInstanceOf(LookupError);
        expect(error.status).toBe(404);
    });
});
