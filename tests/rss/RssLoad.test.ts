import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHermidataWithRss, linkRSSFeed } from '../../scripts/rss/load';
import { PastHermidata } from '../../scripts/popup/core/Past';
import { HermidataModel } from '../../scripts/shared/utils/HermidataSelector';
import { generateHermidataHash } from '../../scripts/shared/utils/StringOutput';
import { AmbiguousItemError } from '../../scripts/shared/utils/dedicatedErrors';
import type { Feed, FeedItem, Hermidata, RawFeed } from '../../scripts/shared/types';

const store = vi.hoisted(() => ({ items: {} as Record<string, Hermidata>, rawFeeds: {} as Record<string, RawFeed> }));

vi.mock('../../scripts/shared/db/Storage', () => ({
    getAllHermidata: vi.fn(async () => store.items),
    getAllRawFeeds: vi.fn(async () => store.rawFeeds),
    getHermidataViaKey: vi.fn(async (key: string) => store.items[key] ? structuredClone(store.items[key]) : null),
    saveHermidata: vi.fn(async (key: string, entry: Hermidata) => { store.items[key] = structuredClone({ ...entry, id: key }); }),
    getSettings: vi.fn(async () => ({ ContentTypesAndStatuses: { TYPE_OPTIONS: ['Manga', 'Novel'] } })),
}));

vi.mock('../../scripts/shared/db/db', () => ({
    getAllHermidataWithRss: vi.fn(async (all: Record<string, Hermidata>) => Object.fromEntries(Object.entries(all).filter(([, h]) => h.rss.length > 0))),
    removeRawFeeds: vi.fn(),
}));

vi.mock('../../scripts/popup/frontend/confirm', () => ({
    customConfirm: vi.fn().mockResolvedValue(false),
    confirmMigrationPrompt: vi.fn().mockResolvedValue(false),
}));

function item(chapter: number, site: string, pubDate: string): FeedItem {
    return {
        id: `${site}-${chapter}`,
        rawTitle: `Solo Leveling Chapter ${chapter}`,
        title: `Solo Leveling Chapter ${chapter}`,
        link: `https://${site}/solo-leveling/chapter-${chapter}`,
        chapter,
        pubDate: new Date(pubDate),
        guid: `${site}-${chapter}`,
    };
}

function rawFeed(site: string, latest: FeedItem): RawFeed {
    return {
        id: `feed-${site}`,
        title: 'Solo Leveling',
        url: `https://${site}/feed`,
        domain: site,
        lastFetched: '2026-11-01T00:00:00.000Z',
        lastBuildDate: new Date('2026-11-01T00:00:00.000Z'),
        image: '',
        latestItem: latest,
        lastToken: null,
    };
}

function linkedFeed(site: string, latest: FeedItem): Feed {
    return { ...rawFeed(site, latest), lastFetched: '2026-10-01T00:00:00.000Z' } as unknown as Feed;
}

function createSaved(id: string, site: string, rss: Feed[]): Hermidata {
    const hermidata = HermidataModel.from('Novel', 'Viewing', 'Ongoing');
    hermidata.title = 'Solo Leveling';
    hermidata.id = id;
    hermidata.SetUrl(`https://${site}/solo-leveling/chapter-3`);
    hermidata.source = site;
    hermidata.meta.altSources = [site];
    hermidata.meta.altTitles = ['Solo Leveling'];
    hermidata.rss = rss;
    return hermidata.toJSON();
}

// same title, same type, different sites: the second one is a separate item with a stored id
const hashId = generateHermidataHash('Solo Leveling', 'Novel');
const separateId = '6f1c2a3e-0000-4000-8000-000000000001';

beforeEach(() => {
    PastHermidata.invalidateCache();
    store.items = {};
    store.rawFeeds = {};
});

describe('getHermidataWithRss', () => {
    it('updates the feed of every same-titled item, not just one of them', async () => {
        const a = createSaved(hashId, 'a.com', [linkedFeed('a.com', item(3, 'a.com', '2026-10-01'))]);
        const b = createSaved(separateId, 'b.com', [linkedFeed('b.com', item(3, 'b.com', '2026-10-01'))]);
        store.items = { [a.id]: a, [b.id]: b };
        store.rawFeeds = {
            'https://a.com/feed': rawFeed('a.com', item(10, 'a.com', '2026-11-01')),
            'https://b.com/feed': rawFeed('b.com', item(20, 'b.com', '2026-11-01')),
        };

        const result = await getHermidataWithRss();

        expect(result[hashId].rss[0].latestItem.chapter).toBe(10);
        expect(result[separateId].rss[0].latestItem.chapter).toBe(20);
    });

    // a background refresh must never look like the newest edit to sync (last write wins on meta.updated),
    // or it would overwrite real reading progress made on another device
    it('leaves meta.updated alone when refreshing a feed', async () => {
        const saved = createSaved(hashId, 'a.com', [linkedFeed('a.com', item(3, 'a.com', '2026-10-01'))]);
        store.items = { [saved.id]: saved };
        store.rawFeeds = { 'https://a.com/feed': rawFeed('a.com', item(10, 'a.com', '2026-11-01')) };

        const result = await getHermidataWithRss();

        expect(result[hashId].rss[0].latestItem.chapter).toBe(10);
        expect(result[hashId].meta.updated).toBe(saved.meta.updated);
    });
});

describe('linkRSSFeed', () => {
    it('links the feed to the item it is given, not the first item with that title', async () => {
        const a = createSaved(hashId, 'a.com', []);
        const b = createSaved(separateId, 'b.com', []);
        store.items = { [a.id]: a, [b.id]: b };

        await linkRSSFeed('Solo Leveling', 'Novel', 'https://b.com/solo-leveling/chapter-3', rawFeed('b.com', item(20, 'b.com', '2026-11-01')), separateId);

        expect(store.items[separateId].rss.map(feed => feed.url)).toEqual(['https://b.com/feed']);
        expect(store.items[hashId].rss).toEqual([]);
    });

    it('refuses to pick between same-titled items when no item is given', async () => {
        const a = createSaved(hashId, 'a.com', []);
        const b = createSaved(separateId, 'b.com', []);
        store.items = { [a.id]: a, [b.id]: b };
        const before = structuredClone(store.items);

        const link = linkRSSFeed('Solo Leveling', 'Novel', 'https://b.com/solo-leveling/chapter-3', rawFeed('b.com', item(20, 'b.com', '2026-11-01')));

        await expect(link).rejects.toBeInstanceOf(AmbiguousItemError);
        expect(store.items).toEqual(before);
    });

    it('still links by title when only one item has that title', async () => {
        const a = createSaved(hashId, 'a.com', []);
        store.items = { [a.id]: a };

        await linkRSSFeed('Solo Leveling', 'Novel', 'https://a.com/solo-leveling/chapter-3', rawFeed('a.com', item(10, 'a.com', '2026-11-01')));

        expect(store.items[hashId].rss.map(feed => feed.url)).toEqual(['https://a.com/feed']);
    });
});
