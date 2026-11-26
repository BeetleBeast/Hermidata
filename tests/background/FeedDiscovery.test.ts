import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Hermidata, RawFeed, Settings } from '../../scripts/shared/types';

const store = vi.hoisted(() => ({
    items: {} as Record<string, Hermidata>,
    settings: {} as Partial<Settings>,
    putRawFeeds: [] as RawFeed[],
    linked: [] as Array<{ itemId: string | undefined; feed: RawFeed }>,
    local: {} as Record<string, any>,
}));

vi.mock('../../scripts/shared/db/Storage', () => ({
    getAllHermidata: vi.fn(async () => store.items),
    getAllRawFeeds: vi.fn(async () => ({})),
    getSettings: vi.fn(async () => store.settings),
    setAllHermidata: vi.fn(),
    setAllRawFeeds: vi.fn(async (feeds: RawFeed[]) => { store.putRawFeeds.push(...feeds); }),
}));
vi.mock('../../scripts/shared/db/db', () => ({
    dbUpdateImageKey: vi.fn(),
    getDb: vi.fn(),
    putAllRawFeeds: vi.fn(async (feeds: RawFeed[]) => { store.putRawFeeds.push(...feeds); }),
}));
vi.mock('../../scripts/rss/load', () => ({
    getHermidataWithRss: vi.fn(async () => ({})),
    removeChapterLinkedRawFeeds: vi.fn(async () => {}),
    linkRSSFeed: vi.fn(async (_title: string, _type: string, _url: string, feed: RawFeed, itemId?: string) => { store.linked.push({ itemId, feed }); }),
}));
vi.mock('../../scripts/background/rssNotify', () => ({
    initRssNotificationClicks: vi.fn(),
    notifyNewReleases: vi.fn(async () => {}),
    updateUnreadBadge: vi.fn(async () => {}),
}));
vi.mock('../../scripts/background/auth', () => ({ getToken: vi.fn() }));
vi.mock('../../scripts/background/bookmarks', () => ({ updateCurrentBookmarkAndIcon: vi.fn(), writeToBookmarks: vi.fn() }));
vi.mock('../../scripts/background/sheets', () => ({ writeToSheet: vi.fn() }));
vi.mock('../../scripts/background/altTitles', () => ({ scheduleAltTitleLookup: vi.fn(), storedKeyOf: vi.fn() }));
vi.mock('../../scripts/shared/sync/sync.engine', () => ({ pushToSync: vi.fn(), removeFromSync: vi.fn() }));
vi.mock('../../scripts/shared/sync/syncAlarms', () => ({ backgroundAlarms: vi.fn(() => undefined) }));
vi.mock('../../scripts/shared/utils/BrowserCompat', () => ({
    ext: { storage: { local: { get: vi.fn(async (key: string) => ({ [key]: store.local[key] })), set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(store.local, values); }) }, onChanged: { addListener: vi.fn() } }, runtime: { sendMessage: vi.fn(async () => {}), getURL: vi.fn((path: string) => `chrome-extension://test/${path}`) } },
}));

import { handleBuildAndSaveRawFeeds } from '../../scripts/background/rssCache';

const SITE_FEED = `<?xml version="1.0"?><rss version="2.0"><channel>
  <title>Shadow Slave</title><link>https://example.com/series/shadow-slave</link>
  <item><title>Shadow Slave Chapter 2100</title><link>https://example.com/series/shadow-slave/chapter-2100</link><guid>ss-2100</guid></item>
</channel></rss>`;

function respond(body: string, init: ResponseInit = { status: 200 }) {
    return new Response(body, init);
}

beforeEach(() => {
    store.items = {};
    store.settings = {};
    store.putRawFeeds = [];
    store.linked = [];
    store.local = {};
    vi.unstubAllGlobals();
});

describe('feed discovery ( BUILD_AND_SAVE_FEEDS )', () => {
    it("stores a feed under its own address, not under its newest chapter's link", async () => {
        vi.stubGlobal('fetch', vi.fn(async () => respond(SITE_FEED)));
        const sendResponse = vi.fn();

        await handleBuildAndSaveRawFeeds([{ title: 'Shadow Slave', url: 'https://example.com/series/shadow-slave/rss', domain: 'example.com' }], sendResponse);

        expect(sendResponse).toHaveBeenCalledWith({ status: 'ok' });
        expect(store.putRawFeeds).toHaveLength(1);
        expect(store.putRawFeeds[0].url).toBe('https://example.com/series/shadow-slave/rss');
        expect(store.putRawFeeds[0].latestItem.link).toBe('https://example.com/series/shadow-slave/chapter-2100');
        expect(store.putRawFeeds[0].latestItem.chapter).toBe(2100);
    });

    it('stores nothing for a page that is not a feed', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => respond('<!doctype html><html><body>hi</body></html>')));
        const sendResponse = vi.fn();

        await handleBuildAndSaveRawFeeds([{ title: 'x', url: 'https://example.com/feed', domain: 'example.com' }], sendResponse);

        expect(sendResponse).toHaveBeenCalledWith({ status: 'failed' });
        expect(store.putRawFeeds).toEqual([]);
    });
});
