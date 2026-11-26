import { describe, expect, it } from 'vitest';
import { getMatchConfidence, resolveItem, scoreCandidate } from '../../scripts/popup/core/ItemResolver';
import { HermidataModel } from '../../scripts/shared/utils/HermidataSelector';
import { findAllByTitleOrAlt, generateHermidataHash, getSeriesUrl } from '../../scripts/shared/utils/StringOutput';
import type { AnyNovelType, Hermidata } from '../../scripts/shared/types';

function createItem(title: string, type: AnyNovelType, url: string): Hermidata {
    const hermidata = HermidataModel.from(type, 'Viewing', 'Ongoing');
    hermidata.title = title;
    hermidata.id = generateHermidataHash(title, type);
    hermidata.SetUrl(url);
    const host = new URL(url).hostname.replace(/^www\./, '');
    hermidata.source = host;
    hermidata.meta.altSources = [host];
    hermidata.meta.altTitles = [title];
    return hermidata.toJSON();
}

describe('getSeriesUrl', () => {
    it.each([
        ['https://www.site.com/series/foo/chapter-12?x=1#top', 'site.com/series/foo'],
        ['https://site.com/foo-chapter-12', 'site.com/foo'],
        ['https://site.com/foo/chapter/12', 'site.com/foo'],
        ['https://site.com/foo/ch12.html', 'site.com/foo'],
        ['https://site.com/novel/foo', 'site.com/novel/foo'],
        ['https://site.com/series/9817342/foo', 'site.com/series/9817342/foo'],
    ])('%s -> %s', (url, expected) => {
        expect(getSeriesUrl(url)).toBe(expected);
    });

    it('two chapters of one series give the same series url', () => {
        expect(getSeriesUrl('https://site.com/foo/chapter-1')).toBe(getSeriesUrl('https://site.com/foo/chapter-250'));
    });

    it('returns an empty string for an invalid url', () => {
        expect(getSeriesUrl('not a url')).toBe('');
    });
});

describe('findAllByTitleOrAlt', () => {
    it('returns every item sharing a title, not just the first', () => {
        const novel = createItem('Solo Leveling', 'Novel', 'https://novels.com/solo-leveling/chapter-3');
        const manga = createItem('Solo Leveling', 'Manga', 'https://manga.com/solo-leveling/chapter-40');
        const other = createItem('Omniscient Reader', 'Novel', 'https://novels.com/orv/chapter-3');
        const all = { [novel.id]: novel, [manga.id]: manga, [other.id]: other };

        // numeric-looking keys iterate in numeric order, so compare as a set
        expect(findAllByTitleOrAlt('Solo Leveling', all).map(item => item.id).sort()).toEqual([novel.id, manga.id].sort());
    });
});

describe('resolveItem', () => {
    const novel = createItem('Solo Leveling', 'Novel', 'https://novels.com/solo-leveling/chapter-3');
    const manga = createItem('Solo Leveling', 'Manga', 'https://manga.com/solo-leveling/chapter-40');

    it('finds nothing without candidates', () => {
        expect(resolveItem({ title: 'Solo Leveling', url: 'https://novels.com/solo-leveling/chapter-4' }, []).kind).toBe('none');
    });

    it('keeps one-click for a single candidate, even on a new site', () => {
        const result = resolveItem({ title: 'Solo Leveling', url: 'https://elsewhere.com/read/solo-leveling-12' }, [novel]);
        expect(result).toMatchObject({ kind: 'match', item: { id: novel.id } });
    });

    it('picks the candidate whose marker is on the same series page', () => {
        const result = resolveItem({ title: 'Solo Leveling', url: 'https://manga.com/solo-leveling/chapter-41' }, [novel, manga]);
        expect(result).toMatchObject({ kind: 'match', item: { id: manga.id } });
    });

    it('picks a fuzzy url match on a known site when it clearly wins', () => {
        // the site moved its series path slightly, so there is no exact match
        const result = resolveItem({ title: 'Solo Leveling', url: 'https://manga.com/solo-leveling-v2/chapter-41' }, [novel, manga]);
        expect(result).toMatchObject({ kind: 'match', item: { id: manga.id } });
    });

    it('is ambiguous when no candidate has a marker on the current site', () => {
        const result = resolveItem({ title: 'Solo Leveling', url: 'https://aggregator.com/solo-leveling/chapter-5' }, [novel, manga]);
        expect(result.kind).toBe('ambiguous');
    });

    it('is ambiguous when two candidates on one site are too close to call', () => {
        const a = createItem('Solo Leveling', 'Novel', 'https://hub.com/novel/solo-leveling/chapter-3');
        const b = createItem('Solo Leveling', 'Manga', 'https://hub.com/manga/solo-leveling/chapter-40');
        const result = resolveItem({ title: 'Solo Leveling', url: 'https://hub.com/read/solo-leveling/chapter-6' }, [a, b]);
        expect(result.kind).toBe('ambiguous');
    });

    it('is ambiguous when two candidates both have a marker on the exact series page', () => {
        const a = createItem('Solo Leveling', 'Novel', 'https://hub.com/solo-leveling/chapter-3');
        const b = createItem('Solo Leveling', 'Manga', 'https://hub.com/solo-leveling/chapter-40');
        const result = resolveItem({ title: 'Solo Leveling', url: 'https://hub.com/solo-leveling/chapter-6' }, [a, b]);
        expect(result.kind).toBe('ambiguous');
    });

    it('lists the candidates best first', () => {
        const result = resolveItem({ title: 'Solo Leveling', url: 'https://aggregator.com/solo-leveling/chapter-5' }, [novel, manga]);
        if (result.kind === 'none') throw new Error('expected candidates');
        const scores = result.candidates.map(candidate => candidate.score);
        expect(scores).toEqual([...scores].sort((a, b) => b - a));
    });
});

describe('getMatchConfidence', () => {
    const novel = createItem('Solo Leveling', 'Novel', 'https://novels.com/solo-leveling/chapter-3');
    const manga = createItem('Solo Leveling', 'Manga', 'https://manga.com/solo-leveling/chapter-40');
    const confidence = (url: string, items: Hermidata[]) => getMatchConfidence(resolveItem({ title: 'Solo Leveling', url }, items));

    it('is exact when a marker is on the same series page', () => {
        expect(confidence('https://novels.com/solo-leveling/chapter-9', [novel, manga])).toBe('exact');
    });

    it('is likely for a similar page on a known site', () => {
        expect(confidence('https://novels.com/solo-leveling-v2/chapter-9', [novel])).toBe('likely');
    });

    it('is unsure when only the title matches, even for a single candidate', () => {
        expect(confidence('https://elsewhere.com/read/solo-leveling-12', [novel])).toBe('unsure');
    });

    it('is null when nothing matched or the match is ambiguous', () => {
        expect(getMatchConfidence(null)).toBeNull();
        expect(confidence('https://novels.com/solo-leveling/chapter-9', [])).toBeNull();
        expect(confidence('https://aggregator.com/solo-leveling/chapter-5', [novel, manga])).toBeNull();
    });
});

describe('HermidataModel.GetMarkerUrls', () => {
    it('returns the url of every marker and skips empty ones', () => {
        const model = new HermidataModel(createItem('Solo Leveling', 'Novel', 'https://novels.com/solo-leveling/chapter-3'));
        const [first] = Object.values(model.chapter.bookmarks);
        model.chapter.bookmarks = {
            a: first,
            b: { ...first, id: 'b', url: 'https://other.com/solo-leveling/chapter-9' },
            c: { ...first, id: 'c', url: '' },
        };
        expect(model.GetMarkerUrls()).toEqual([
            'https://novels.com/solo-leveling/chapter-3',
            'https://other.com/solo-leveling/chapter-9',
        ]);
    });
});

describe('scoreCandidate', () => {
    it('stays between 0 and 1', () => {
        const item = createItem('Solo Leveling', 'Novel', 'https://novels.com/solo-leveling/chapter-3');
        const { score } = scoreCandidate({ title: 'Solo Leveling', url: 'https://novels.com/solo-leveling/chapter-3' }, item);
        expect(score).toBeGreaterThan(0);
        expect(score).toBeLessThanOrEqual(1);
    });

    it('gives no url credit for a different site', () => {
        const item = createItem('Solo Leveling', 'Novel', 'https://novels.com/solo-leveling/chapter-3');
        const same = scoreCandidate({ title: 'Solo Leveling', url: 'https://novels.com/solo-leveling/chapter-9' }, item);
        const other = scoreCandidate({ title: 'Solo Leveling', url: 'https://other.com/solo-leveling/chapter-9' }, item);
        expect(other.score).toBeLessThan(same.score - 0.5);
    });
});
