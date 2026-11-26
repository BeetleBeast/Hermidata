import { describe, expect, it, vi } from 'vitest';
import { HermidataModel } from '../../scripts/shared/utils/HermidataSelector';
import { kindOfType, normalizeTitle, pickCandidate, titleSimilarity, type LookupCandidate } from '../../scripts/shared/lookup/matching';
import { fetchSeriesTitles, parseSeriesLink, searchAniList, searchMangaUpdates } from '../../scripts/shared/lookup/sources';
import { applyPatch, findPatch, isLookupEnabled, lookupCandidate, lookupManual, RECHECK_MS, searchSeries, shouldLookup } from '../../scripts/shared/lookup/altTitleLookup';
import type { Hermidata } from '../../scripts/shared/types';

vi.mock('../../scripts/shared/db/Storage', () => ({}));

const NOW = Date.parse('2026-11-19T12:00:00.000Z');

function item(title: string, novelType = 'Manhwa', external?: Hermidata['meta']['external']): Hermidata {
    const model = HermidataModel.from(novelType, 'Viewing', 'Ongoing');
    model.title = title;
    model.meta.altTitles = [title];
    if (external) model.meta.external = external;
    return model.toJSON();
}

function candidate(overrides: Partial<LookupCandidate> & Pick<LookupCandidate, 'id' | 'title'>): LookupCandidate {
    return { source: 'mangaupdates', kind: 'comic', titles: [], ...overrides };
}

// --- fake servers, shaped like the real answers ---

type Route = (url: string, init?: RequestInit) => unknown;
function fakeFetch(route: Route) {
    return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const result = route(String(url), init);
        if (result instanceof Response) return result;
        return new Response(JSON.stringify(result), { status: 200 });
    }) as unknown as typeof fetch;
}

const mangaUpdatesSearch = (results: Array<{ id: number; title: string; type: string; year?: string; hit: string }>) => ({
    results: results.map(r => ({ record: { series_id: r.id, title: r.title, type: r.type, year: r.year ?? '2020' }, hit_title: r.hit })),
});
const aniListSearch = (media: unknown[]) => ({ data: { Page: { media } } });

describe('normalizeTitle', () => {
    it('ignores case, punctuation and a trailing (Novel) tag, but keeps a year', () => {
        expect(normalizeTitle('Goblin Inc.')).toBe(normalizeTitle('goblin inc'));
        expect(normalizeTitle('Lord of Mysteries (Novel)')).toBe('lord of mysteries');
        expect(normalizeTitle('Lord of Mysteries (2025)')).toBe('lord of mysteries 2025');
    });
    it('keeps non-latin titles apart instead of reducing them to nothing', () => {
        expect(titleSimilarity('나 혼자만 레벨업', '俺だけレベルアップな件')).toBeLessThan(0.5);
        expect(titleSimilarity('나 혼자만 레벨업', '나 혼자만 레벨업')).toBe(1);
        expect(titleSimilarity('', 'Goblin Inc')).toBe(0);
    });
});

describe('kindOfType', () => {
    it('maps the default types and skips the ones the servers do not cover', () => {
        expect(['Manga', 'Manhwa', 'Manhua'].map(kindOfType)).toEqual(['comic', 'comic', 'comic']);
        expect(['Novel', 'Webnovel'].map(kindOfType)).toEqual(['novel', 'novel']);
        expect(kindOfType('Anime')).toBeNull();
        expect(kindOfType('TV-Series')).toBeNull();
    });
});

describe('pickCandidate', () => {
    it('finds a work through an alt title that is nothing like its main title (Kidnapped Dragons)', () => {
        const dragonnap = candidate({ id: '29491001037', title: 'Dragonnap', titles: ['Kidnapped Dragons'] });
        const noise = candidate({ id: '1', title: 'Mission', titles: ['Kidnapped Husband'] });
        expect(pickCandidate('Kidnapped Dragons', 'comic', [dragonnap, noise])).toEqual({ status: 'matched', candidate: dragonnap });
    });

    it('ignores a trailing period (Goblin Inc) and unrelated "Goblin" results', () => {
        const goblinInc = candidate({ id: '61439289501', title: 'Goblin Inc.', titles: ['Goblin Inc.'] });
        const others = ['Goblin', 'Goblin Slayer', 'Goblin Dad'].map((title, index) => candidate({ id: String(index), title, titles: [title] }));
        expect(pickCandidate('Goblin Inc', 'comic', [...others, goblinInc])).toEqual({ status: 'matched', candidate: goblinInc });
    });

    it('drops results of the other kind, so the manhwa and the novel never mix (Solo Leveling)', () => {
        const manhwa = candidate({ id: 'm', title: 'Solo Leveling', titles: ['Solo Leveling'] });
        const novel = candidate({ id: 'n', title: 'Solo Leveling (Novel)', kind: 'novel', titles: ['Solo Leveling (Novel)'] });
        expect(pickCandidate('Solo Leveling', 'comic', [novel, manhwa])).toEqual({ status: 'matched', candidate: manhwa });
        expect(pickCandidate('Solo Leveling', 'novel', [manhwa, novel])).toEqual({ status: 'matched', candidate: novel });
    });

    it('does not take the spin-off for the work (Solo Leveling: Ragnarok)', () => {
        const ragnarok = candidate({ id: 'r', title: 'Solo Leveling: Ragnarok', titles: ['Solo Leveling : Ragnarok'] });
        expect(pickCandidate('Solo Leveling', 'comic', [ragnarok])).toEqual({ status: 'none' });
    });

    it('breaks a tie of close titles with the exactly equal one (Lord of the Mysteries vs the 2025 reboot)', () => {
        const original = candidate({ id: 'a', title: 'Lord of the Mysteries', titles: ['Lord of the Mysteries'] });
        const reboot = candidate({ id: 'b', title: 'Lord of Mysteries (2025)', titles: ['Lord of the Mysteries (2025)'] });
        expect(pickCandidate('Lord of the Mysteries', 'comic', [reboot, original])).toEqual({ status: 'matched', candidate: original });
    });

    it('stores nothing when two works of the same kind are equally good (ambiguous)', () => {
        const first = candidate({ id: 'a', title: 'Dragon Ball', titles: ['Dragon Ball'] });
        const second = candidate({ id: 'b', title: 'Dragon Ball', titles: ['Dragon Ball'] });
        expect(pickCandidate('Dragon Ball', 'comic', [first, second])).toEqual({ status: 'ambiguous', candidates: [first, second] });
    });

    it('matches nothing when no title is close', () => {
        expect(pickCandidate('Goblin Inc', 'comic', [candidate({ id: '1', title: 'Level 999 Goblin', titles: [] })])).toEqual({ status: 'none' });
    });
});

describe('parseSeriesLink', () => {
    it('reads the id from MangaUpdates and AniList links, and from nothing else', () => {
        expect(parseSeriesLink('https://www.mangaupdates.com/series/uarp82h/lord-of-the-mysteries')).toEqual({ source: 'mangaupdates', id: '65954658329' });
        expect(parseSeriesLink('https://www.mangaupdates.com/series.html?id=65954658329')).toEqual({ source: 'mangaupdates', id: '65954658329' });
        expect(parseSeriesLink('https://anilist.co/manga/105398/Solo-Leveling/')).toEqual({ source: 'anilist', id: '105398' });
        expect(parseSeriesLink('Solo Leveling')).toBeNull();
        expect(parseSeriesLink('https://example.com/series/uarp82h')).toBeNull();
    });
});

describe('sources', () => {
    it('reads MangaUpdates search results, merging a series that matched on several titles', async () => {
        const fetcher = fakeFetch(() => mangaUpdatesSearch([
            { id: 29491001037, title: 'Dragonnap', type: 'Manhwa', hit: 'Kidnapped Dragons' },
            { id: 29491001037, title: 'Dragonnap', type: 'Manhwa', hit: 'Dragonnap' },
            { id: 27671893054, title: 'Lord of Mysteries (Novel)', type: 'Novel', hit: 'Lord of the Mysteries (Novel)' },
        ]));
        const found = await searchMangaUpdates('Kidnapped Dragons', fetcher);
        expect(found).toHaveLength(2);
        expect(found[0]).toMatchObject({ id: '29491001037', kind: 'comic', titles: ['Kidnapped Dragons', 'Dragonnap'] });
        expect(found[1]).toMatchObject({ id: '27671893054', kind: 'novel' });
    });

    it('reads AniList results, with every title and synonym', async () => {
        const fetcher = fakeFetch(() => aniListSearch([{
            id: 203800, format: 'MANGA', title: { romaji: 'Dragon-eul Yugoehada', english: 'Dragonnap', native: null },
            synonyms: ['Kidnapped Dragons'], startDate: { year: 2025 },
        }]));
        const [found] = await searchAniList('Kidnapped Dragons', fetcher);
        expect(found).toMatchObject({ source: 'anilist', id: '203800', kind: 'comic', title: 'Dragonnap', year: 2025 });
        expect(found.titles).toEqual(['Dragon-eul Yugoehada', 'Dragonnap', 'Kidnapped Dragons']);
    });

    it('lists the associated titles of a MangaUpdates series', async () => {
        const fetcher = fakeFetch(() => ({ title: 'Solo Leveling', associated: [{ title: 'Only I Level Up' }, { title: '나 혼자만 레벨업' }] }));
        expect(await fetchSeriesTitles('mangaupdates', '15180124327', fetcher)).toEqual(['Solo Leveling', 'Only I Level Up', '나 혼자만 레벨업']);
    });

    it.each([
        ['an empty body', () => new Response('', { status: 200 })],
        ['a 429', () => new Response('slow down', { status: 429 })],
        ['a body that is not JSON', () => new Response('<html>', { status: 200 })],
    ])('reports %s as an error instead of an empty result', async (_name, make) => {
        await expect(searchMangaUpdates('Goblin Inc', fakeFetch(() => make()))).rejects.toThrow();
    });

    it('reports a network failure as an error', async () => {
        const fetcher = vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
        await expect(searchAniList('Goblin Inc', fetcher)).rejects.toThrow('Failed to fetch');
    });
});

describe('shouldLookup', () => {
    const at = (offsetMs: number) => new Date(NOW - offsetMs).toISOString();

    it('looks up an item that was never checked, and one whose request failed', () => {
        expect(shouldLookup(item('Goblin Inc'), NOW)).toBe(true);
        expect(shouldLookup(item('Goblin Inc', 'Manhwa', { status: 'error', checkedAt: at(1000) }), NOW)).toBe(true);
    });
    it('never looks up a matched item again', () => {
        expect(shouldLookup(item('Goblin Inc', 'Manhwa', { status: 'matched', source: 'anilist', id: '1', checkedAt: at(10 * RECHECK_MS) }), NOW)).toBe(false);
    });
    it('waits 30 days after a miss or an ambiguous result', () => {
        expect(shouldLookup(item('Goblin Inc', 'Manhwa', { status: 'none', checkedAt: at(RECHECK_MS - 1000) }), NOW)).toBe(false);
        expect(shouldLookup(item('Goblin Inc', 'Manhwa', { status: 'none', checkedAt: at(RECHECK_MS) }), NOW)).toBe(true);
        expect(shouldLookup(item('Goblin Inc', 'Manhwa', { status: 'ambiguous', checkedAt: at(1000) }), NOW)).toBe(false);
    });
    it('skips types the servers do not cover', () => {
        expect(shouldLookup(item('Frieren', 'Anime'), NOW)).toBe(false);
    });
});

describe('isLookupEnabled', () => {
    it('is off unless the setting says so, including settings saved before it existed', () => {
        expect(isLookupEnabled(undefined)).toBe(false);
        expect(isLookupEnabled({ ExtensionBehaviour: {} } as never)).toBe(false);
        expect(isLookupEnabled({ ExtensionBehaviour: { AltTitleLookup: { Enable: false } } } as never)).toBe(false);
        expect(isLookupEnabled({ ExtensionBehaviour: { AltTitleLookup: { Enable: true } } } as never)).toBe(true);
    });
});

describe('searchSeries / findPatch', () => {
    const dragonnap = {
        id: 203800, format: 'MANGA', title: { romaji: 'Dragon-eul Yugoehada', english: 'Dragonnap', native: null }, synonyms: ['Kidnapped Dragons'],
    };
    const dragonnapAniList = aniListSearch([dragonnap]);
    // the search and the lookup of one series are two different AniList queries
    const aniListServer = (_url: string, init?: RequestInit) =>
        String(init?.body).includes('Media(id') ? { data: { Media: dragonnap } } : dragonnapAniList;

    it('learns the alt titles of "Dragonnap" from the search for "Kidnapped Dragons"', async () => {
        const fetcher = fakeFetch(aniListServer);
        const patch = await findPatch(item('Kidnapped Dragons'), fetcher, NOW);
        expect(patch?.external).toEqual({ status: 'matched', source: 'anilist', id: '203800', checkedAt: new Date(NOW).toISOString() });

        const { item: updated, added } = applyPatch(item('Kidnapped Dragons'), patch!);
        expect(added).toEqual(['Dragon-eul Yugoehada', 'Dragonnap']);
        expect(updated.meta.altTitles).toEqual(['Kidnapped Dragons', 'Dragon-eul Yugoehada', 'Dragonnap']);
    });

    it('falls back to MangaUpdates for a novel AniList does not have', async () => {
        const fetcher = fakeFetch(url => {
            if (url.includes('anilist')) return aniListSearch([]);
            if (url.endsWith('/series/search')) return mangaUpdatesSearch([{ id: 27671893054, title: 'Lord of Mysteries (Novel)', type: 'Novel', hit: 'Lord of the Mysteries (Novel)' }]);
            return { title: 'Lord of Mysteries (Novel)', associated: [{ title: 'Guimi Zhi Zhu (Novel)' }] };
        });
        const outcome = await searchSeries('Lord of the Mysteries', 'Novel', fetcher);
        expect(outcome).toMatchObject({ status: 'matched', candidate: { source: 'mangaupdates', id: '27671893054' } });
    });

    it('records a miss as none, and an unreadable answer as an error, never as a miss', async () => {
        const none = await findPatch(item('Goblin Inc'), fakeFetch(url => url.includes('anilist') ? aniListSearch([]) : mangaUpdatesSearch([])), NOW);
        expect(none).toEqual({ external: { status: 'none', checkedAt: new Date(NOW).toISOString() }, titles: [] });

        const broken = await findPatch(item('Goblin Inc'), fakeFetch(() => new Response('', { status: 200 })), NOW);
        expect(broken?.external.status).toBe('error');
    });

    it('records an error when only one source failed and the other found nothing', async () => {
        const fetcher = fakeFetch(url => url.includes('anilist') ? new Response('', { status: 429 }) : mangaUpdatesSearch([]));
        expect((await searchSeries('Goblin Inc', 'Manhwa', fetcher)).status).toBe('error');
    });

    it('makes no request for an item that is not due', async () => {
        const fetcher = fakeFetch(() => dragonnapAniList);
        const matched = item('Kidnapped Dragons', 'Manhwa', { status: 'matched', source: 'anilist', id: '1', checkedAt: new Date(NOW).toISOString() });
        expect(await findPatch(matched, fetcher, NOW)).toBeNull();
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('reports ambiguity instead of picking', async () => {
        const twin = (id: number) => ({ id, format: 'MANGA', title: { romaji: 'Dragon Ball', english: null, native: null }, synonyms: [] });
        const outcome = await searchSeries('Dragon Ball', 'Manga', fakeFetch(() => aniListSearch([twin(1), twin(2)])));
        expect(outcome.status).toBe('ambiguous');
    });
});

describe('manual lookup', () => {
    it('uses a pasted link directly, without searching', async () => {
        const fetcher = fakeFetch(url => {
            expect(url).toContain('/series/65954658329');
            return { title: 'Lord of the Mysteries', associated: [{ title: 'Lord of Mysteries' }] };
        });
        const outcome = await lookupManual(item('LOTM', 'Manhua'), 'https://www.mangaupdates.com/series/uarp82h/lord-of-the-mysteries', fetcher, NOW);
        expect(outcome).toMatchObject({ status: 'applied', patch: { external: { status: 'matched', source: 'mangaupdates', id: '65954658329' } } });
    });

    it('offers the candidates when a typed title is ambiguous, and applies the one picked', async () => {
        const twin = (id: number, year: number) => ({ id, format: 'MANGA', title: { romaji: 'Dragon Ball', english: null, native: null }, synonyms: [], startDate: { year } });
        const search = fakeFetch(() => aniListSearch([twin(1, 1984), twin(2, 2025)]));
        const outcome = await lookupManual(item('Dragon Ball', 'Manga'), 'Dragon Ball', search, NOW);
        expect(outcome.status).toBe('pick');
        const candidates = (outcome as { candidates: LookupCandidate[] }).candidates;
        expect(candidates.map(c => c.year)).toEqual([1984, 2025]);

        const picked = await lookupCandidate(candidates[1], fakeFetch(() => aniListSearch([])), NOW);
        expect(picked.status).toBe('error'); // AniList answered without the series
    });

    it('turns a failed request into an error message', async () => {
        const outcome = await lookupManual(item('Goblin Inc'), 'Goblin Inc', fakeFetch(() => new Response('', { status: 500 })), NOW);
        expect(outcome.status).toBe('error');
    });
});

describe('applyPatch', () => {
    it('skips titles the item already has, however they are spelled, and keeps the typed ones', () => {
        const saved = item('Goblin Inc', 'Manhwa');
        saved.meta.altTitles = ['Goblin Inc', 'Goblins Incorporated'];
        const { item: updated, added } = applyPatch(saved, {
            external: { status: 'matched', source: 'anilist', id: '214220', checkedAt: new Date(NOW).toISOString() },
            titles: ['Goblin Inc.', 'goblin inc', 'Goblin Corporation', 'Goblin Corporation'],
        });
        expect(added).toEqual(['Goblin Corporation']);
        expect(updated.meta.altTitles).toEqual(['Goblin Inc', 'Goblins Incorporated', 'Goblin Corporation']);
        expect(updated.meta.external).toMatchObject({ status: 'matched', id: '214220' });
        expect(saved.meta.external).toBeUndefined(); // the input is not touched
    });
});
