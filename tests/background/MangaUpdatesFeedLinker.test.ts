import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HermidataModel } from '../../scripts/shared/utils/HermidataSelector';
import type { ExternalMatch, Hermidata, RawFeed, Settings } from '../../scripts/shared/types';

const store = vi.hoisted(() => ({
    items: {} as Record<string, Hermidata>,
    settings: {} as Partial<Settings>,
    rawFeeds: [] as RawFeed[],
    linked: [] as Array<{ itemId: string | undefined; feed: RawFeed; coverUrl: string | undefined }>,
    local: {} as Record<string, any>,
    alarms: { created: [] as Array<{ name: string; period: unknown }>, cleared: [] as string[], existing: new Set<string>() },
}));

vi.mock('../../scripts/shared/db/Storage', () => ({
    getAllHermidata: vi.fn(async () => store.items),
    getSettings: vi.fn(async () => store.settings),
    setAllRawFeeds: vi.fn(async (feeds: RawFeed[]) => { store.rawFeeds.push(...feeds); }),
}));
vi.mock('../../scripts/rss/load', () => ({
    linkRSSFeed: vi.fn(async (_title: string, _type: string, _url: string, feed: RawFeed, itemId?: string, coverUrl?: string) => {
        store.linked.push({ itemId, feed, coverUrl });
        if (itemId && store.items[itemId]) store.items[itemId].rss = [{ url: feed.url } as any]; // what the real link stores
    }),
}));
vi.mock('../../scripts/background/rssCache', () => ({ rebuildRssCache: vi.fn(async () => ({})) }));
vi.mock('../../scripts/background/rssNotify', () => ({ updateUnreadBadge: vi.fn(async () => {}) }));
vi.mock('../../scripts/shared/sync/syncAlarms', () => ({
    backgroundAlarms: vi.fn(() => ({
        create: vi.fn(async (name: string, info: unknown) => { store.alarms.created.push({ name, period: info }); store.alarms.existing.add(name); }),
        clear: vi.fn((name: string) => { store.alarms.cleared.push(name); store.alarms.existing.delete(name); }),
        get: vi.fn(async (name: string) => store.alarms.existing.has(name) ? { name } : undefined),
        onAlarm: { addListener: vi.fn() },
    })),
}));
vi.mock('../../scripts/shared/utils/BrowserCompat', () => ({
    ext: {
        storage: { local: { get: vi.fn(async (key: string) => ({ [key]: store.local[key] })), set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(store.local, values); }), remove: vi.fn(async (key: string) => { delete store.local[key]; }) } },
        runtime: { getURL: vi.fn((path: string) => `chrome-extension://test/${path}`) },
    },
}));

import { kickMangaUpdatesFeeds, MANGAUPDATES_ALARM, runMangaUpdatesFeedBatch } from '../../scripts/background/mangaUpdatesFeedLinker';
import { MAX_THROTTLE_PAUSE_MS, MAX_THROTTLE_STREAK } from '../../scripts/shared/lookup/mangaUpdatesPace';
import { MANGAUPDATES_BATCH_SIZE, MANGAUPDATES_PROGRESS_KEY, MANGAUPDATES_RETRY_KEY, mangaUpdatesFeedUrl } from '../../scripts/shared/lookup/mangaUpdatesFeeds';
import { updateUnreadBadge } from '../../scripts/background/rssNotify';
import { rebuildRssCache } from '../../scripts/background/rssCache';

const muFeed = (title: string, chapter: number) => `<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><channel>
  <title>${title} - Releases on MangaUpdates</title><link>https://www.mangaupdates.com/series/abc/x</link>
  <item><title>${title} c.${chapter}</title><description>Group</description></item>
</channel></rss>`;

const respond = (body: string, init: ResponseInit = { status: 200 }) => new Response(body, init);

const OWN_IMAGE = 'https://example.com/own-cover.jpg';

/** A saved item; it has an image of its own unless `placeholderImage` is set ( then it shows the default icon ) */
function saved(id: string, external?: ExternalMatch, placeholderImage = false): Hermidata {
    const model = HermidataModel.from('Manhwa', 'Viewing', 'Ongoing');
    model.id = id;
    model.title = `Title ${id}`;
    const item = model.toJSON();
    if (external) item.meta.external = external;
    if (!placeholderImage) item.meta.image = { kind: 'url', url: OWN_IMAGE };
    return item;
}
const matched = (id: string): ExternalMatch => ({ status: 'matched', source: 'mangaupdates', id, checkedAt: '2026-11-01T00:00:00.000Z' });
const anilist = (id: string): ExternalMatch => ({ status: 'matched', source: 'anilist', id, checkedAt: '2026-11-01T00:00:00.000Z' });
const muSettings = (enabled: boolean, notLinked: Record<string, string> = {}, lookup = true) => ({
    ExtensionBehaviour: { MangaUpdatesFeeds: { Enable: enabled }, AltTitleLookup: { Enable: lookup }, AutoSubscribe: { HermidataNotLinkedToRSS: notLinked } },
}) as unknown as Settings;
const searchAnswer = (id: number, title: string) =>
    respond(JSON.stringify({ results: [{ hit_title: title, record: { series_id: id, title, type: 'Manhwa', year: '2018' } }] }));
const idle = { running: false, total: 0, done: 0, waiting: 0, unavailable: false, etaAt: null, etaCapped: false, slowdown: 1, pausedUntil: null, throttleStreak: 0 };
const manyMatched = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`i${i}`, saved(`i${i}`, matched(String(i)))]));

beforeEach(() => {
    store.items = {};
    store.settings = {};
    store.rawFeeds = [];
    store.linked = [];
    store.local = {};
    store.alarms = { created: [], cleared: [], existing: new Set() };
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

describe('the batch', () => {
    it('sends nothing while the setting is off, and says so', async () => {
        const fetcher = vi.fn();
        vi.stubGlobal('fetch', fetcher);
        store.items = { a: saved('a', matched('111')) };
        store.settings = muSettings(false);
        const log = vi.spyOn(console, 'log');

        const more = await runMangaUpdatesFeedBatch();

        expect(more).toBe(false);
        expect(fetcher).not.toHaveBeenCalled();
        expect(log).toHaveBeenCalledWith(expect.stringContaining('MangaUpdates feeds: off'));
    });

    it('links matched items, skipping unsubscribed ones, and refreshes the popup data', async () => {
        const fetcher = vi.fn(async (url: string | URL | Request) => respond(muFeed(String(url).includes('111') ? 'Title a' : 'Title b', 45)));
        vi.stubGlobal('fetch', fetcher);
        store.items = { a: saved('a', matched('111')), b: saved('b', matched('222')), c: saved('c') };
        store.settings = muSettings(true, { b: 'feed-id' });

        const more = await runMangaUpdatesFeedBatch();

        expect(more).toBe(false);
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(store.linked.map(l => [l.itemId, l.feed.url, l.feed.latestItem.chapter, l.feed.title])).toEqual([['a', mangaUpdatesFeedUrl('111'), 45, 'Title a']]);
        expect(store.rawFeeds.map(f => f.url)).toEqual([mangaUpdatesFeedUrl('111')]);
        expect(rebuildRssCache).toHaveBeenCalledTimes(1);
        expect(updateUnreadBadge).toHaveBeenCalledTimes(1);
    });

    it(`links ${MANGAUPDATES_BATCH_SIZE} per batch and says more are left, until all are done`, async () => {
        vi.stubGlobal('fetch', vi.fn(async () => respond(muFeed('Any', 1))));
        store.items = manyMatched(MANGAUPDATES_BATCH_SIZE * 2 + 3);
        store.settings = muSettings(true);

        expect(await runMangaUpdatesFeedBatch()).toBe(true);
        expect(store.linked).toHaveLength(MANGAUPDATES_BATCH_SIZE);
        expect(await runMangaUpdatesFeedBatch()).toBe(true);
        expect(store.linked).toHaveLength(MANGAUPDATES_BATCH_SIZE * 2);
        expect(await runMangaUpdatesFeedBatch()).toBe(false);
        expect(store.linked).toHaveLength(MANGAUPDATES_BATCH_SIZE * 2 + 3);
    });

    it('two calls at once get the same batch', async () => {
        const fetcher = vi.fn(async () => respond(muFeed('Any', 1)));
        vi.stubGlobal('fetch', fetcher);
        store.items = manyMatched(3);
        store.settings = muSettings(true);

        await Promise.all([runMangaUpdatesFeedBatch(), runMangaUpdatesFeedBatch()]);

        expect(fetcher).toHaveBeenCalledTimes(3);
    });

    it('skips a feed that fails, and links the next', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => String(url).includes('/111/') ? respond('', { status: 404 }) : respond(muFeed('Title b', 3))));
        store.items = { a: saved('a', matched('111')), b: saved('b', matched('222')) };
        store.settings = muSettings(true);

        await runMangaUpdatesFeedBatch();

        expect(store.linked.map(l => l.itemId)).toEqual(['b']);
    });

    it('logs a summary of the batch, with why a title was not linked', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => String(url).includes('/111/') ? respond('<!doctype html><html></html>') : respond(muFeed('Title b', 3))));
        store.items = { a: saved('a', matched('111')), b: saved('b', matched('222')) };
        store.settings = muSettings(true);
        const group = vi.spyOn(console, 'groupCollapsed');
        const table = vi.spyOn(console, 'table');

        await runMangaUpdatesFeedBatch();

        expect(group).toHaveBeenCalledWith('[Hermidata] MangaUpdates feeds - linked 1 of 2');
        expect(table).toHaveBeenLastCalledWith([
            { title: 'Title a', result: `not linked: the answer is not a feed ${mangaUpdatesFeedUrl('111')}`, latest: '', cover: '', url: '' },
            { title: 'Title b', result: 'linked', latest: 'Title b c.3', cover: 'kept', url: mangaUpdatesFeedUrl('222') },
        ]);
    });

    it('searches MangaUpdates for a title the lookup matched on AniList, then links its feed', async () => {
        const fetcher = vi.fn(async (url: string | URL | Request) =>
            String(url).endsWith('/series/search') ? searchAnswer(555, 'Title a') : respond(muFeed('Title a', 12)));
        vi.stubGlobal('fetch', fetcher);
        store.items = { a: saved('a', anilist('99')) };
        store.settings = muSettings(true);

        await runMangaUpdatesFeedBatch();

        expect(store.linked.map(l => [l.itemId, l.feed.url, l.feed.latestItem.chapter])).toEqual([['a', mangaUpdatesFeedUrl('555'), 12]]);
    });

    it('is a sub-option of the alt-title lookup: with the lookup off nothing is sent or linked', async () => {
        const fetcher = vi.fn();
        vi.stubGlobal('fetch', fetcher);
        store.items = { a: saved('a', anilist('99')), b: saved('b', matched('111')) };
        store.settings = muSettings(true, {}, false);
        const log = vi.spyOn(console, 'log');

        expect(await runMangaUpdatesFeedBatch()).toBe(false);

        expect(fetcher).not.toHaveBeenCalled();
        expect(store.linked).toEqual([]);
        expect(log).toHaveBeenCalledWith(expect.stringContaining('needs this setting and "Look up alt titles online"'));
    });
});

describe('the cover', () => {
    const COVER = 'https://cdn.mangaupdates.com/image/i515366.jpg';
    const seriesRecord = (original: string | null) => respond(JSON.stringify({ image: { url: { original, thumb: original } }, title: 'Any' }));
    /** search, series record ( /series/<id> ) and feed ( /series/<id>/rss ) of MangaUpdates */
    const mangaUpdates = (record: () => Response) => vi.fn(async (url: string | URL | Request) => {
        const address = String(url);
        if (address.endsWith('/series/search')) return searchAnswer(555, 'Title a');
        if (/\/series\/\d+$/.test(address)) return record();
        return respond(muFeed('Title a', 7));
    });

    it('gives a title without an image the MangaUpdates cover when its feed is linked', async () => {
        const fetcher = mangaUpdates(() => seriesRecord(COVER));
        vi.stubGlobal('fetch', fetcher);
        store.items = { a: saved('a', matched('555'), true) };
        store.settings = muSettings(true);
        const table = vi.spyOn(console, 'table');

        await runMangaUpdatesFeedBatch();

        expect(store.linked.map(l => [l.itemId, l.coverUrl])).toEqual([['a', COVER]]);
        expect(table).toHaveBeenLastCalledWith([expect.objectContaining({ result: 'linked', cover: 'set' })]);
    });

    it('also for a title the lookup matched on AniList: its id comes from the search', async () => {
        vi.stubGlobal('fetch', mangaUpdates(() => seriesRecord(COVER)));
        store.items = { a: saved('a', anilist('99'), true) };
        store.settings = muSettings(true);

        await runMangaUpdatesFeedBatch();

        expect(store.linked.map(l => l.coverUrl)).toEqual([COVER]);
    });

    it('leaves a title that has an image alone, and does not ask for a cover', async () => {
        const fetcher = mangaUpdates(() => seriesRecord(COVER));
        vi.stubGlobal('fetch', fetcher);
        store.items = { a: saved('a', matched('555')) };
        store.settings = muSettings(true);
        const table = vi.spyOn(console, 'table');

        await runMangaUpdatesFeedBatch();

        expect(fetcher).toHaveBeenCalledTimes(1); // the feed only
        expect(store.linked.map(l => l.coverUrl)).toEqual([undefined]);
        expect(table).toHaveBeenLastCalledWith([expect.objectContaining({ result: 'linked', cover: 'kept' })]);
    });

    it('links the feed anyway when the series has no cover, or its answer can not be read', async () => {
        store.items = { a: saved('a', matched('555'), true), b: saved('b', matched('556'), true), c: saved('c', matched('557'), true) };
        store.settings = muSettings(true);
        const answers = [() => seriesRecord(null), () => respond('not json'), () => respond('', { status: 404 })];
        let call = 0;
        vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
            const address = String(url);
            if (/\/series\/\d+$/.test(address)) return answers[call++]();
            return respond(muFeed('Any', 7));
        }));
        const table = vi.spyOn(console, 'table');

        await runMangaUpdatesFeedBatch();

        expect(store.linked.map(l => [l.itemId, l.coverUrl])).toEqual([['a', undefined], ['b', undefined], ['c', undefined]]);
        expect(table).toHaveBeenLastCalledWith([
            expect.objectContaining({ result: 'linked', cover: 'none' }),
            expect.objectContaining({ result: 'linked', cover: 'none' }),
            expect.objectContaining({ result: 'linked', cover: 'none' }),
        ]);
    });

    it('pauses on a 429 for the cover, before the feed is linked: the title is tried again later', async () => {
        const fetcher = vi.fn(async (url: string | URL | Request) =>
            /\/series\/\d+$/.test(String(url)) ? respond('', { status: 429, headers: { 'Retry-After': '90' } }) : respond(muFeed('Any', 7)));
        vi.stubGlobal('fetch', fetcher);
        store.items = { a: saved('a', matched('555'), true), b: saved('b', matched('556'), true) };
        store.settings = muSettings(true);

        const more = await runMangaUpdatesFeedBatch();

        expect(more).toBe(true);
        expect(store.linked).toEqual([]); // not linked yet, so it gets its cover with its feed next time
        expect(fetcher).toHaveBeenCalledTimes(1); // the batch ended there
        expect(store.local[MANGAUPDATES_PROGRESS_KEY]).toMatchObject({ running: true, throttleStreak: 1, done: 0 });
        expect(store.local[MANGAUPDATES_RETRY_KEY] ?? {}).toEqual({});
    });

    it('stops the batch when MangaUpdates refuses the cover request', async () => {
        const fetcher = vi.fn(async () => respond('', { status: 403 }));
        vi.stubGlobal('fetch', fetcher);
        store.items = { a: saved('a', matched('555'), true), b: saved('b', matched('556'), true) };
        store.settings = muSettings(true);

        expect(await runMangaUpdatesFeedBatch()).toBe(false);

        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(store.linked).toEqual([]);
    });
});

describe('the progress', () => {
    it('counts the linked items against all that can have a feed, and follows each batch', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => respond(muFeed('Any', 1))));
        store.items = { ...manyMatched(MANGAUPDATES_BATCH_SIZE + 2), unmatched: saved('unmatched'), declined: saved('declined', matched('777')) };
        store.settings = muSettings(true, { declined: 'feed-id' });
        const total = MANGAUPDATES_BATCH_SIZE + 2; // not the unmatched item, not the declined one

        await runMangaUpdatesFeedBatch();
        expect(store.local[MANGAUPDATES_PROGRESS_KEY]).toMatchObject({ running: true, total, done: MANGAUPDATES_BATCH_SIZE, waiting: 0, unavailable: false });

        await runMangaUpdatesFeedBatch();
        expect(store.local[MANGAUPDATES_PROGRESS_KEY]).toMatchObject({ running: false, total, done: total, waiting: 0, unavailable: false, etaAt: null, pausedUntil: null });
    });

    it('counts a feed that would not link as waiting', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => String(url).includes('/series/1/') ? respond('', { status: 404 }) : respond(muFeed('Any', 1))));
        store.items = { a: saved('a', matched('1')), b: saved('b', matched('2')) };
        store.settings = muSettings(true);

        await runMangaUpdatesFeedBatch();

        expect(store.local[MANGAUPDATES_PROGRESS_KEY]).toMatchObject({ running: false, total: 2, done: 1, waiting: 1, unavailable: false });
    });

    it('says when MangaUpdates did not answer', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => respond('', { status: 403 })));
        store.items = manyMatched(3);
        store.settings = muSettings(true);

        await runMangaUpdatesFeedBatch();

        expect(store.local[MANGAUPDATES_PROGRESS_KEY]).toMatchObject({ running: false, total: 3, done: 0, waiting: 0, unavailable: true, etaAt: null });
    });

    it('estimates when it is done: a minute per batch left', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => respond(muFeed('Any', 1))));
        store.items = manyMatched(MANGAUPDATES_BATCH_SIZE * 3);
        store.settings = muSettings(true);

        const before = Date.now();
        await runMangaUpdatesFeedBatch();
        const after = Date.now();

        const { etaAt, etaCapped, slowdown } = store.local[MANGAUPDATES_PROGRESS_KEY];
        expect(etaCapped).toBe(false);
        expect(slowdown).toBe(1);
        expect(etaAt).toBeGreaterThanOrEqual(before + 2 * 60_000); // two batches are left
        expect(etaAt).toBeLessThanOrEqual(after + 2 * 60_000);
    });

    it('is removed when the setting is switched off, so the bar disappears', async () => {
        store.items = manyMatched(2);
        store.settings = muSettings(false);
        store.local[MANGAUPDATES_PROGRESS_KEY] = { ...idle, running: true, total: 2, done: 1 };

        await runMangaUpdatesFeedBatch();

        expect(store.local).not.toHaveProperty(MANGAUPDATES_PROGRESS_KEY);
    });
});

describe('when MangaUpdates does not answer', () => {
    it('stops at the first 403 and logs what MangaUpdates answered', async () => {
        const fetcher = vi.fn(async () => respond('{"status":"exception","reason":"Forbidden"}', { status: 403 }));
        vi.stubGlobal('fetch', fetcher);
        store.items = { a: saved('a', anilist('1')), b: saved('b', anilist('2')), c: saved('c', anilist('3')) };
        store.settings = muSettings(true);
        const table = vi.spyOn(console, 'table');
        const warn = vi.spyOn(console, 'warn');

        const more = await runMangaUpdatesFeedBatch();

        expect(more).toBe(false); // no minute clock against a server that refuses us
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(table).toHaveBeenLastCalledWith([
            { title: 'Title a', result: 'not linked: searching MangaUpdates failed: HTTP 403: {"status":"exception","reason":"Forbidden"}', latest: '', cover: '', url: '' },
        ]);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('MangaUpdates did not answer'));
        expect(store.local[MANGAUPDATES_RETRY_KEY] ?? {}).not.toHaveProperty('a'); // a refusal is not the title's fault
    });

    it('stops when MangaUpdates cannot be reached at all', async () => {
        const fetcher = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
        vi.stubGlobal('fetch', fetcher);
        store.items = { a: saved('a', matched('1')), b: saved('b', matched('2')) };
        store.settings = muSettings(true);

        expect(await runMangaUpdatesFeedBatch()).toBe(false);

        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(store.local[MANGAUPDATES_RETRY_KEY] ?? {}).toEqual({});
    });
});

describe('when MangaUpdates asks us to slow down ( 429 )', () => {
    const tooMany = (seconds = '120') => vi.fn(async () => respond('', { status: 429, headers: { 'Retry-After': seconds } }));

    it('pauses the clock for what it asked, and the estimate grows', async () => {
        vi.stubGlobal('fetch', tooMany());
        store.items = manyMatched(MANGAUPDATES_BATCH_SIZE * 3);
        store.settings = muSettings(true);

        const before = Date.now();
        const more = await runMangaUpdatesFeedBatch();
        const after = Date.now();

        expect(more).toBe(true); // the clock keeps running, it only pauses
        const progress = store.local[MANGAUPDATES_PROGRESS_KEY];
        expect(progress).toMatchObject({ running: true, unavailable: false, throttleStreak: 1, slowdown: 1.5, waiting: 0, done: 0 });
        expect(progress.pausedUntil).toBeGreaterThanOrEqual(before + 120_000);
        expect(progress.pausedUntil).toBeLessThanOrEqual(after + 120_000);
        // the pause, then three batches that are slower than planned: well beyond the three minutes of a calm run
        expect(progress.etaAt - after).toBeGreaterThan(120_000 + 3 * 60_000);
        expect(store.local[MANGAUPDATES_RETRY_KEY] ?? {}).toEqual({}); // a 429 or a timeout is not the title's fault
    });

    it('does nothing while paused, and goes on once the pause is over', async () => {
        const fetcher = vi.fn(async () => respond(muFeed('Any', 1)));
        vi.stubGlobal('fetch', fetcher);
        store.items = manyMatched(3);
        store.settings = muSettings(true);
        store.local[MANGAUPDATES_PROGRESS_KEY] = { ...idle, running: true, total: 3, slowdown: 1.5, throttleStreak: 1, pausedUntil: Date.now() + 60_000 };

        expect(await runMangaUpdatesFeedBatch()).toBe(true);
        expect(fetcher).not.toHaveBeenCalled();

        store.local[MANGAUPDATES_PROGRESS_KEY].pausedUntil = Date.now() - 1;
        await runMangaUpdatesFeedBatch();
        expect(store.linked).toHaveLength(3);
        expect(store.local[MANGAUPDATES_PROGRESS_KEY]).toMatchObject({ throttleStreak: 0, pausedUntil: null, slowdown: 1.2 }); // 1.5 eased back by a calm batch
    });

    it('also handles a 429 on the search of a title matched on AniList', async () => {
        vi.stubGlobal('fetch', tooMany('30'));
        store.items = { a: saved('a', anilist('1')), b: saved('b', anilist('2')) };
        store.settings = muSettings(true);

        expect(await runMangaUpdatesFeedBatch()).toBe(true);

        expect(store.local[MANGAUPDATES_PROGRESS_KEY]).toMatchObject({ throttleStreak: 1 });
        expect(store.local[MANGAUPDATES_PROGRESS_KEY].pausedUntil - Date.now()).toBeGreaterThan(55_000); // at least a minute, though it asked for 30 seconds
    });

    it('pauses longer for each 429 in a row, up to the maximum', async () => {
        vi.stubGlobal('fetch', tooMany('1'));
        store.items = manyMatched(MANGAUPDATES_BATCH_SIZE);
        store.settings = muSettings(true);
        store.local[MANGAUPDATES_PROGRESS_KEY] = { ...idle, running: true, total: 8, slowdown: 3, throttleStreak: 3 };

        await runMangaUpdatesFeedBatch();

        const progress = store.local[MANGAUPDATES_PROGRESS_KEY];
        expect(progress.throttleStreak).toBe(4);
        expect(progress.pausedUntil - Date.now()).toBeGreaterThan(200_000); // 60 s x 1.5^3 = 202 s
        expect(progress.pausedUntil - Date.now()).toBeLessThanOrEqual(MAX_THROTTLE_PAUSE_MS);
        expect(progress.slowdown).toBe(4); // 3 x 1.5, held at the maximum
    });

    it('gives up after too many in a row: the clock stops and the feed check tries again', async () => {
        vi.stubGlobal('fetch', tooMany());
        store.items = manyMatched(MANGAUPDATES_BATCH_SIZE * 2);
        store.settings = muSettings(true);
        store.local[MANGAUPDATES_PROGRESS_KEY] = { ...idle, running: true, total: 16, throttleStreak: MAX_THROTTLE_STREAK };

        expect(await runMangaUpdatesFeedBatch()).toBe(false);

        expect(store.local[MANGAUPDATES_PROGRESS_KEY]).toMatchObject({ running: false, unavailable: true, pausedUntil: null, etaAt: null });
    });

    it('keeps the minute clock running through a pause', async () => {
        vi.stubGlobal('fetch', tooMany());
        store.items = manyMatched(MANGAUPDATES_BATCH_SIZE * 2);
        store.settings = muSettings(true);

        await kickMangaUpdatesFeeds();

        expect(store.alarms.created).toEqual([{ name: MANGAUPDATES_ALARM, period: { periodInMinutes: 1 } }]);
        expect(store.alarms.existing.has(MANGAUPDATES_ALARM)).toBe(true);
    });
});

describe('when a search gets no answer in time', () => {
    afterEach(() => vi.useRealTimers());

    /** "Title a" never gets an answer, as with a title the search chokes on; "Title b" is fine */
    const stickyTitle = () => vi.fn((url: string | URL | Request, init?: RequestInit) => {
        if (String(init?.body).includes('Title a')) {
            return new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => reject(new DOMException('signal is aborted without reason', 'AbortError')));
            });
        }
        return Promise.resolve(String(url).endsWith('/series/search') ? searchAnswer(555, 'Title b') : respond(muFeed('Title b', 3)));
    });

    it('pauses and tries again, like a 429: the clock is not stopped for the hour', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('fetch', stickyTitle());
        store.items = { a: saved('a', anilist('1')), b: saved('b', anilist('2')) };
        store.settings = muSettings(true);
        const table = vi.spyOn(console, 'table');

        const pending = runMangaUpdatesFeedBatch();
        await vi.advanceTimersByTimeAsync(25_000);
        const more = await pending;

        expect(more).toBe(true); // paused, not stopped
        expect(table).toHaveBeenLastCalledWith([
            { title: 'Title a', result: 'not linked: searching MangaUpdates failed: no answer within 25 seconds', latest: '', cover: '', url: '' },
        ]); // the batch ended at the first one
        const progress = store.local[MANGAUPDATES_PROGRESS_KEY];
        expect(progress).toMatchObject({ running: true, unavailable: false, throttleStreak: 1, slowdown: 1.5, waiting: 1 });
        expect(progress.pausedUntil).toBeGreaterThan(Date.now() + 55_000);
    });

    it('a title that times out waits an hour, so the one behind it is linked once the pause is over', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('fetch', stickyTitle());
        store.items = { a: saved('a', anilist('1')), b: saved('b', anilist('2')) };
        store.settings = muSettings(true);

        const pending = runMangaUpdatesFeedBatch();
        await vi.advanceTimersByTimeAsync(25_000);
        await pending;
        expect(Date.parse(store.local[MANGAUPDATES_RETRY_KEY].a)).toBeGreaterThan(Date.now() + 59 * 60_000);

        store.local[MANGAUPDATES_PROGRESS_KEY].pausedUntil = Date.now() - 1; // the pause is over
        expect(await runMangaUpdatesFeedBatch()).toBe(false);

        expect(store.linked.map(l => l.itemId)).toEqual(['b']); // not 'a' again
        expect(store.local[MANGAUPDATES_PROGRESS_KEY]).toMatchObject({ running: false, done: 1, total: 2, waiting: 1, throttleStreak: 0 });
    });
});

describe('items that fail wait, so the others get their turn', () => {
    it('a batch of broken feeds does not hold up the title behind it', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => String(url).includes('/series/9999/') ? respond(muFeed('Last', 5)) : respond('', { status: 404 })));
        store.items = Object.fromEntries([
            ...Array.from({ length: MANGAUPDATES_BATCH_SIZE }, (_, i) => [`broken${i}`, saved(`broken${i}`, matched(String(i)))]),
            ['last', saved('last', matched('9999'))],
        ]);
        store.settings = muSettings(true);

        expect(await runMangaUpdatesFeedBatch()).toBe(true); // 'last' is still left
        expect(store.linked).toEqual([]);
        expect(Object.keys(store.local[MANGAUPDATES_RETRY_KEY])).toHaveLength(MANGAUPDATES_BATCH_SIZE);

        expect(await runMangaUpdatesFeedBatch()).toBe(false);
        expect(store.linked.map(l => l.itemId)).toEqual(['last']);
    });

    it('a waiting item is not tried again until its wait is over', async () => {
        const fetcher = vi.fn(async () => respond(muFeed('Title a', 1)));
        vi.stubGlobal('fetch', fetcher);
        store.items = { a: saved('a', matched('111')) };
        store.settings = muSettings(true);
        store.local[MANGAUPDATES_RETRY_KEY] = { a: new Date(Date.now() + 60_000).toISOString() };

        await runMangaUpdatesFeedBatch();
        expect(fetcher).not.toHaveBeenCalled();

        store.local[MANGAUPDATES_RETRY_KEY] = { a: new Date(Date.now() - 60_000).toISOString() };
        await runMangaUpdatesFeedBatch();
        expect(store.linked.map(l => l.itemId)).toEqual(['a']);
        expect(store.local[MANGAUPDATES_RETRY_KEY]).not.toHaveProperty('a');
    });

    it('a title MangaUpdates has no match for waits about 30 days', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => respond(JSON.stringify({ results: [] }))));
        store.items = { a: saved('a', anilist('99')) };
        store.settings = muSettings(true);

        await runMangaUpdatesFeedBatch();

        expect(store.linked).toEqual([]);
        expect(Date.parse(store.local[MANGAUPDATES_RETRY_KEY].a)).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
    });
});

describe('the minute clock', () => {
    it('starts when items are left, once, and stops when none are', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => respond(muFeed('Any', 1))));
        store.items = manyMatched(MANGAUPDATES_BATCH_SIZE + 2);
        store.settings = muSettings(true);

        await kickMangaUpdatesFeeds();
        expect(store.alarms.created).toEqual([{ name: MANGAUPDATES_ALARM, period: { periodInMinutes: 1 } }]);
        expect(store.linked).toHaveLength(MANGAUPDATES_BATCH_SIZE); // the first batch right away

        await kickMangaUpdatesFeeds(); // the next batch, as an alarm tick does it: the clock is not created a second time
        expect(store.alarms.created).toHaveLength(1);

        expect(store.linked).toHaveLength(MANGAUPDATES_BATCH_SIZE + 2);
        expect(store.alarms.cleared).toContain(MANGAUPDATES_ALARM);
        expect(store.alarms.existing.has(MANGAUPDATES_ALARM)).toBe(false);
    });

    it('does not start with the setting off, and stops a running clock', async () => {
        store.items = manyMatched(3);
        store.settings = muSettings(false);
        store.alarms.existing.add(MANGAUPDATES_ALARM);

        await kickMangaUpdatesFeeds();

        expect(store.alarms.created).toEqual([]);
        expect(store.alarms.existing.has(MANGAUPDATES_ALARM)).toBe(false);
    });

    it('does not start against a server that refuses', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => respond('', { status: 403 })));
        store.items = manyMatched(MANGAUPDATES_BATCH_SIZE * 2);
        store.settings = muSettings(true);

        await kickMangaUpdatesFeeds();

        expect(store.alarms.created).toEqual([]);
    });
});
