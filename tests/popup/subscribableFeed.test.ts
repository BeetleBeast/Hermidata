import { beforeEach, describe, expect, it, vi } from 'vitest';
// the real entry ( rss/main ) loads the controller first; loading Subscribe first breaks the build <-> controller import cycle
import '../../scripts/rss/controller';
import { Subscribe } from '../../scripts/rss/build/Subscribe';
import { PastHermidata } from '../../scripts/popup/core/Past';
import { HermidataModel } from '../../scripts/shared/utils/HermidataSelector';
import type { Hermidata, RawFeed } from '../../scripts/shared/types';
import { itemAt, makeLibrary, makeRawFeeds } from '../bench/fixtures';

const store = vi.hoisted(() => ({ items: {} as Record<string, Hermidata>, rawFeeds: {} as Record<string, RawFeed> }));

vi.mock('../../scripts/shared/db/Storage', () => ({
    getAllHermidata: vi.fn(async () => store.items),
    dbAccess: class {
        getAllRawFeeds = vi.fn(async () => store.rawFeeds);
    },
    getHermidataViaKey: vi.fn(async (key: string) => store.items[key] ?? null),
    saveHermidata: vi.fn(),
    getSettings: vi.fn(async () => ({})),
}));

vi.mock('../../scripts/popup/frontend/confirm', () => ({
    customConfirm: vi.fn().mockResolvedValue(false),
    confirmMigrationPrompt: vi.fn().mockResolvedValue(false),
}));

// 3 saved items: the first two are linked to their feed, the last one has a feed that is not linked yet
const library = makeLibrary(3, { unlinkedTail: 1 });
const rawFeeds = makeRawFeeds(3);
const unlinked = itemAt(library, 2);
const linked = itemAt(library, 0);

function subscribeFor(item: Hermidata): Subscribe {
    return new Subscribe(new HermidataModel(item), library);
}

beforeEach(() => {
    PastHermidata.invalidateCache();
    store.items = library;
    store.rawFeeds = rawFeeds;
});

describe('Subscribe.findSubscribableFeed', () => {
    it('finds the feed of the page that is not linked yet', async () => {
        const feed = await subscribeFor(unlinked).findSubscribableFeed();

        expect(feed?.url).toBe(Object.values(rawFeeds)[2].url);
    });

    it('finds nothing for a page whose feed is already linked', async () => {
        expect(await subscribeFor(linked).findSubscribableFeed()).toBeNull();
    });

    it('finds nothing when no feed was detected', async () => {
        store.rawFeeds = {};

        expect(await subscribeFor(unlinked).findSubscribableFeed()).toBeNull();
    });

    it('looks for the given title instead of the page title', async () => {
        const feed = await subscribeFor(linked).findSubscribableFeed(unlinked.title);

        expect(feed?.url).toBe(Object.values(rawFeeds)[2].url);
    });
});
