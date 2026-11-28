import { bench, describe, vi } from 'vitest';
// the real entry ( rss/main ) loads the controller first; loading Subscribe first breaks the build <-> controller import cycle
import '../../scripts/rss/controller';
import { Subscribe } from '../../scripts/rss/build/Subscribe';
import { PastHermidata } from '../../scripts/popup/core/Past';
import { HermidataModel } from '../../scripts/shared/utils/HermidataSelector';
import type { Hermidata, RawFeed } from '../../scripts/shared/types';
import { clearTitleCaches, itemAt, LIBRARY_SIZES, makeLibrary, makeRawFeed, makeRawFeeds, silenceConsole } from './fixtures';

/*
 * Subscribing to RSS feeds, the two scans behind it ( both private, called here on purpose ):
 *  - findMatchingFeed:  "is there a feed for this page?"  ( enables the Subscribe button when the RSS view opens )
 *  - findMatchingFeeds: "which unlinked items have a feed?" ( the auto-subscribe offer )
 * Drawing the buttons / confirm dialog is not measured: the benchmarks run in node, without a DOM.
 */

const store = vi.hoisted(() => ({ items: {} as Record<string, Hermidata>, rawFeeds: {} as Record<string, RawFeed> }));

vi.mock('../../scripts/shared/db/Storage', () => ({
    getAllHermidata: vi.fn(async () => store.items),
    // the RSS build classes reach storage through dbAccess ( messages to the background ): answered from the store
    dbAccess: class {
        getAllRawFeeds = vi.fn(async () => store.rawFeeds);
        removeRawFeedByUrl = vi.fn();
        getSettings = vi.fn(async () => ({ ExtensionBehaviour: { AutoSubscribe: { EnableAutoSubscribe: true, HermidataNotLinkedToRSS: {} } } }));
    },
    getHermidataViaKey: vi.fn(async (key: string) => store.items[key] ?? null),
    saveHermidata: vi.fn(),
    getSettings: vi.fn(async () => ({})),
}));

vi.mock('../../scripts/popup/frontend/confirm', () => ({
    customConfirm: vi.fn().mockResolvedValue(false),
    confirmMigrationPrompt: vi.fn().mockResolvedValue(false),
}));

silenceConsole();

/** A tenth of the library has no feed linked yet: those are the ones the scans can offer a feed for */
const unlinkedOf = (size: number) => Math.floor(size / 10);

/** Feeds whose titles match no saved item, so the similarity scan has to compare them with the whole library */
function makeUnmatchedFeeds(count: number): Record<string, RawFeed> {
    const feeds: Record<string, RawFeed> = {};
    for (let k = 0; k < count; k++) {
        const feed = makeRawFeed(10_000 + k);
        feed.latestItem = { ...feed.latestItem, title: `Completely Different Show ${k} Chapter 3`, rawTitle: `Completely Different Show ${k} Chapter 3` };
        feeds[feed.url] = feed;
    }
    return feeds;
}

type SubscribeInternals = {
    findMatchingFeed(feeds: Record<string, RawFeed>, all: Record<string, Hermidata>, title: string): Promise<RawFeed | null>;
    findMatchingFeeds(feeds: Record<string, RawFeed>, all: Record<string, Hermidata>, similarity: boolean, threshold: number): Promise<unknown[] | null>;
};

for (const size of LIBRARY_SIZES) {
    describe(`subscribe, ${size} items with 2-8 alt titles, ${unlinkedOf(size)} without a feed`, () => {
        const library = makeLibrary(size, { unlinkedTail: unlinkedOf(size) });
        const rawFeeds = makeRawFeeds(size);
        const feedsWithUnmatched = { ...rawFeeds, ...makeUnmatchedFeeds(25) };

        // the page being looked at is an item without a feed: its own feed is the match, found late in the list
        const pageItem = itemAt(library, size - 1);
        const subscribe = () => {
            PastHermidata.invalidateCache();
            return new Subscribe(new HermidataModel(pageItem), library) as unknown as SubscribeInternals;
        };
        const useThisLibrary = () => { store.items = library; store.rawFeeds = rawFeeds; };

        bench('Subscribe button: feed found for this page (cold caches)', async () => {
            useThisLibrary();
            clearTitleCaches();
            await subscribe().findMatchingFeed(rawFeeds, library, pageItem.title);
        });

        bench('Subscribe button: feed found for this page (warm caches)', async () => {
            useThisLibrary();
            await subscribe().findMatchingFeed(rawFeeds, library, pageItem.title);
        });

        bench('Subscribe button: no feed for this page ( scans every feed )', async () => {
            useThisLibrary();
            await subscribe().findMatchingFeed(rawFeeds, library, 'A Page Without Any Feed');
        });

        bench('auto-subscribe offer: exact title matches (cold caches)', async () => {
            useThisLibrary();
            clearTitleCaches();
            await subscribe().findMatchingFeeds(rawFeeds, library, false, 1.0);
        });

        bench('auto-subscribe offer: exact title matches (warm caches)', async () => {
            useThisLibrary();
            await subscribe().findMatchingFeeds(rawFeeds, library, false, 1.0);
        });

        bench('auto-subscribe offer: + similarity scan for 25 unmatched feeds', async () => {
            useThisLibrary();
            await subscribe().findMatchingFeeds(feedsWithUnmatched, library, true, 0.9);
        });
    });
}
