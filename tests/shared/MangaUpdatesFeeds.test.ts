import { describe, expect, it, vi } from 'vitest';
import { findMangaUpdatesSeriesId, isMangaUpdatesFeedsEnabled, isMangaUpdatesFeedUrl, mangaUpdatesFeedLabel, mangaUpdatesFeedUrl, scanForMangaUpdatesFeeds, seriesIdOfFeedUrl } from '../../scripts/shared/lookup/mangaUpdatesFeeds';
import { HermidataModel } from '../../scripts/shared/utils/HermidataSelector';
import type { ExternalMatch, Feed, Hermidata, Settings } from '../../scripts/shared/types';

function saved(id: string, external?: ExternalMatch, rss: Feed[] = []): Hermidata {
    const model = HermidataModel.from('Manhwa', 'Viewing', 'Ongoing');
    model.id = id;
    model.title = `Title ${id}`;
    const item = model.toJSON();
    item.rss = rss;
    if (external) item.meta.external = external;
    return item;
}

const matched = (id: string): ExternalMatch => ({ status: 'matched', source: 'mangaupdates', id, checkedAt: '2026-11-01T00:00:00.000Z' });

describe('mangaUpdatesFeedUrl', () => {
    it('builds the per-series release feed address', () => {
        expect(mangaUpdatesFeedUrl('17360452316')).toBe('https://api.mangaupdates.com/v1/series/17360452316/rss');
        expect(isMangaUpdatesFeedUrl(mangaUpdatesFeedUrl('17360452316'))).toBe(true);
        expect(isMangaUpdatesFeedUrl('https://www.mangaupdates.com/series/7z3yqqk/naruto')).toBe(false);
    });
});

describe('isMangaUpdatesFeedsEnabled', () => {
    it('is off unless switched on, also for settings saved before the option existed', () => {
        expect(isMangaUpdatesFeedsEnabled(undefined)).toBe(false);
        expect(isMangaUpdatesFeedsEnabled({ ExtensionBehaviour: {} } as Settings)).toBe(false);
        expect(isMangaUpdatesFeedsEnabled({ ExtensionBehaviour: { AltTitleLookup: { Enable: true }, MangaUpdatesFeeds: { Enable: true } } } as Settings)).toBe(true);
    });

    it('is a sub-option of the alt-title lookup: on only while the lookup is on too', () => {
        expect(isMangaUpdatesFeedsEnabled({ ExtensionBehaviour: { MangaUpdatesFeeds: { Enable: true } } } as Settings)).toBe(false);
        expect(isMangaUpdatesFeedsEnabled({ ExtensionBehaviour: { AltTitleLookup: { Enable: false }, MangaUpdatesFeeds: { Enable: true } } } as Settings)).toBe(false);
        expect(isMangaUpdatesFeedsEnabled({ ExtensionBehaviour: { AltTitleLookup: { Enable: true }, MangaUpdatesFeeds: { Enable: false } } } as Settings)).toBe(false);
    });
});

describe('seriesIdOfFeedUrl', () => {
    it('reads the series id from a MangaUpdates release feed address, and nothing else', () => {
        expect(seriesIdOfFeedUrl('https://api.mangaupdates.com/v1/series/15180124327/rss')).toBe('15180124327');
        expect(seriesIdOfFeedUrl('https://example.com/series/15180124327/rss')).toBeNull();
        expect(seriesIdOfFeedUrl('https://api.mangaupdates.com/v1/series/15180124327')).toBeNull();
    });
});

describe('mangaUpdatesFeedLabel', () => {
    const now = Date.parse('2026-11-25T22:00:00.000Z');
    const progress = {
        running: false, total: 30, done: 30, waiting: 0, unavailable: false,
        etaAt: null, etaCapped: false, slowdown: 1, pausedUntil: null, throttleStreak: 0, coversLeft: 0,
    };

    it('counts down to when it is done', () => {
        const running = { ...progress, running: true, done: 8, etaAt: now + 315_000 };
        expect(mangaUpdatesFeedLabel(running, now)).toBe('Linking MangaUpdates feeds: 8 of 30. Done in 5 minutes and 15 seconds.');
        expect(mangaUpdatesFeedLabel(running, now + 15_000)).toBe('Linking MangaUpdates feeds: 8 of 30. Done in 5 minutes.');
    });

    it('says how many covers are still to add', () => {
        const running = { ...progress, running: true, done: 30, etaAt: now + 120_000, coversLeft: 12 };
        expect(mangaUpdatesFeedLabel(running, now)).toBe('Linking MangaUpdates feeds: 30 of 30. 12 covers to add. Done in 2 minutes.');
        expect(mangaUpdatesFeedLabel({ ...running, coversLeft: 1 }, now)).toBe('Linking MangaUpdates feeds: 30 of 30. 1 cover to add. Done in 2 minutes.');
    });

    it('reads progress stored before covers were counted', () => {
        const { coversLeft: _left, ...old } = { ...progress, running: true, done: 8, etaAt: now + 60_000 };
        expect(mangaUpdatesFeedLabel(old as unknown as typeof progress, now)).toBe('Linking MangaUpdates feeds: 8 of 30. Done in 1 minute.');
    });

    it('says almost done when the estimate has run out but a batch is still to come', () => {
        expect(mangaUpdatesFeedLabel({ ...progress, running: true, done: 8, etaAt: now - 1000 }, now)).toBe('Linking MangaUpdates feeds: 8 of 30. Almost done.');
    });

    it('says more than the maximum when the estimate was cut off', () => {
        expect(mangaUpdatesFeedLabel({ ...progress, running: true, done: 8, etaAt: now + 7_200_000, etaCapped: true }, now)).toBe('Linking MangaUpdates feeds: 8 of 30. More than 2 hours to go.');
    });

    it('says when MangaUpdates asked to slow down, and for how long', () => {
        const paused = { ...progress, running: true, done: 8, etaAt: now + 600_000, pausedUntil: now + 120_000 };
        expect(mangaUpdatesFeedLabel(paused, now)).toBe('Linking MangaUpdates feeds: 8 of 30. Paused to give MangaUpdates a rest, continuing in 2 minutes. Done in 10 minutes.');
        expect(mangaUpdatesFeedLabel(paused, now + 120_000)).toBe('Linking MangaUpdates feeds: 8 of 30. Done in 8 minutes.'); // the pause is over
    });

    it('says what is done, and how many will be tried again', () => {
        expect(mangaUpdatesFeedLabel(progress)).toBe('MangaUpdates feeds linked for 30 of 30 items.');
        expect(mangaUpdatesFeedLabel({ ...progress, total: 1, done: 1 })).toBe('MangaUpdates feeds linked for 1 of 1 item.');
        expect(mangaUpdatesFeedLabel({ ...progress, done: 27, waiting: 3 })).toBe('MangaUpdates feeds linked for 27 of 30 items. 3 will be tried again later.');
    });

    it('says when MangaUpdates did not answer', () => {
        expect(mangaUpdatesFeedLabel({ ...progress, done: 8, unavailable: true })).toBe('MangaUpdates did not answer: 8 of 30 linked, trying again within the hour.');
    });
});

const anilist = (id: string): ExternalMatch => ({ status: 'matched', source: 'anilist', id, checkedAt: '2026-11-01T00:00:00.000Z' });

describe('scanForMangaUpdatesFeeds', () => {
    it('uses the id of items matched on MangaUpdates', () => {
        const scan = scanForMangaUpdatesFeeds([saved('a', matched('111'))], {}, {});
        expect(scan.candidates.map(c => [c.item.id, c.seriesId])).toEqual([['a', '111']]);
    });

    it('takes items matched on AniList too, to be searched on MangaUpdates', () => {
        const scan = scanForMangaUpdatesFeeds([saved('a', anilist('5'))], {}, {});
        expect(scan.candidates.map(c => [c.item.id, c.seriesId])).toEqual([['a', null]]);
    });

    it('counts why the other items are left out', () => {
        const now = Date.parse('2026-11-25T00:00:00.000Z');
        const items = [
            saved('linked', matched('1'), [{ url: mangaUpdatesFeedUrl('1') } as Feed]),
            saved('unsubscribed', matched('2')),
            saved('none', { status: 'none', checkedAt: '2026-11-01T00:00:00.000Z' }),
            saved('never'),
            saved('waitingAniList', anilist('3')),
            saved('waitingMangaUpdates', matched('5')),
            saved('waitOver', anilist('4')),
        ];
        const retryAfter = {
            waitingAniList: new Date(now + 1000).toISOString(),
            waitingMangaUpdates: new Date(now + 1000).toISOString(),
            waitOver: new Date(now - 1000).toISOString(),
        };

        const scan = scanForMangaUpdatesFeeds(items, { unsubscribed: 'feed-id' }, retryAfter, now);

        expect(scan.candidates.map(c => c.item.id)).toEqual(['waitOver']);
        expect(scan.coverOnly.map(c => c.item.id)).toEqual(['linked']); // it has the feed and no image
        expect({ ...scan, candidates: undefined, coverOnly: undefined }).toEqual({ candidates: undefined, coverOnly: undefined, linked: 1, unsubscribed: 1, notMatched: 2, waiting: 2 });
    });

    describe('titles that have the feed already', () => {
        const feed = (id: string) => [{ url: mangaUpdatesFeedUrl(id) } as Feed];
        const withImage = (item: Hermidata): Hermidata => ({ ...item, meta: { ...item.meta, image: { kind: 'url', url: 'https://example.com/own.jpg' } } });
        const now = Date.parse('2026-11-25T00:00:00.000Z');

        it('want their cover when they have no image, with the series id from the feed address', () => {
            const scan = scanForMangaUpdatesFeeds([saved('a', matched('555'), feed('555')), saved('b', anilist('9'), feed('777'))], {}, {}, now);

            expect(scan.coverOnly.map(c => [c.item.id, c.seriesId, c.coverOnly])).toEqual([['a', '555', true], ['b', '777', true]]); // not the AniList id
            expect(scan.candidates).toEqual([]);
            expect(scan.linked).toBe(2);
        });

        it('are left alone when they have an image, or while their cover is waiting', () => {
            const waiting = saved('waiting', matched('1'), feed('1'));
            const scan = scanForMangaUpdatesFeeds(
                [withImage(saved('has', matched('2'), feed('2'))), waiting],
                {}, { waiting: new Date(now + 1000).toISOString() }, now,
            );

            expect(scan.coverOnly).toEqual([]);
            expect(scan.linked).toBe(2); // still counted as linked, and not as waiting for a feed
            expect(scan.waiting).toBe(0);
        });
    });

    it('a site feed does not count as the MangaUpdates feed', () => {
        const siteFeed = { url: 'https://example.com/series/solo-leveling/rss' } as Feed;
        expect(scanForMangaUpdatesFeeds([saved('b', matched('222'), [siteFeed])], {}, {}).candidates).toHaveLength(1);
    });
});

const searchAnswer = (results: Array<{ id: number; title: string; type: string; hit?: string }>) =>
    new Response(JSON.stringify({ results: results.map(r => ({ hit_title: r.hit ?? r.title, record: { series_id: r.id, title: r.title, type: r.type, year: '2018' } })) }), { status: 200 });

describe('findMangaUpdatesSeriesId', () => {
    it('finds the series by title', async () => {
        const fetcher = vi.fn(async () => searchAnswer([{ id: 42, title: 'Title a', type: 'Manhwa' }]));
        expect(await findMangaUpdatesSeriesId(saved('a', anilist('5')), fetcher)).toBe('42');
    });

    it('tries the alt titles when the title has no match', async () => {
        const item = saved('a', anilist('5'));
        item.meta.altTitles = ['Na Honjaman Level-Up'];
        const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
            String(init?.body).includes('Level-Up') ? searchAnswer([{ id: 7, title: 'Solo Leveling', type: 'Manhwa', hit: 'Na Honjaman Level-Up' }]) : searchAnswer([]));
        expect(await findMangaUpdatesSeriesId(item, fetcher)).toBe('7');
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('gives null for no match, or a novel when looking for a comic', async () => {
        const fetcher = vi.fn(async () => searchAnswer([{ id: 9, title: 'Title a', type: 'Novel' }]));
        expect(await findMangaUpdatesSeriesId(saved('a', anilist('5')), fetcher)).toBeNull();
    });
});
