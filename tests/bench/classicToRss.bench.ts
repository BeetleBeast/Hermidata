import { bench, describe, vi } from 'vitest';
import { getHermidataWithRss } from '../../scripts/rss/load';
import { PastHermidata } from '../../scripts/popup/core/Past';
import { HermidataModel } from '../../scripts/shared/utils/HermidataSelector';
import { findByTitleOrAlt } from '../../scripts/shared/utils/StringOutput';
import type { Hermidata, RawFeed } from '../../scripts/shared/types';
import { clearTitleCaches, LIBRARY_SIZES, makeLibrary, makeRawFeeds, silenceConsole } from './fixtures';

/*
 * Switching the popup from classic to RSS:
 *  1. the background loads every saved item with its RSS feeds ( getHermidataWithRss, answers GET_RSS )
 *  2. the RSS view resolves the title of every item it draws ( getItemInfo -> findByTitleOrAlt )
 * Drawing the DOM itself is not measured: the benchmarks run in node, without a DOM.
 */

const store = vi.hoisted(() => ({ items: {} as Record<string, Hermidata>, rawFeeds: {} as Record<string, RawFeed> }));

vi.mock('../../scripts/shared/db/Storage', () => ({
    getAllHermidata: vi.fn(async () => store.items),
    getAllRawFeeds: vi.fn(async () => store.rawFeeds),
    getHermidataViaKey: vi.fn(async (key: string) => store.items[key] ?? null),
    saveHermidata: vi.fn(),
    getSettings: vi.fn(async () => ({})),
}));

vi.mock('../../scripts/shared/db/db', () => ({
    getAllHermidataWithRss: vi.fn(async (all: Record<string, Hermidata>) => Object.fromEntries(Object.entries(all).filter(([, h]) => h.rss.length > 0))),
    removeRawFeeds: vi.fn(),
}));

vi.mock('../../scripts/popup/frontend/confirm', () => ({
    customConfirm: vi.fn().mockResolvedValue(false),
    confirmMigrationPrompt: vi.fn().mockResolvedValue(false),
}));

silenceConsole();

for (const size of LIBRARY_SIZES) {
    describe(`classic -> RSS, ${size} items with 2-8 alt titles and a linked feed`, () => {
        const library = makeLibrary(size);
        const rawFeeds = makeRawFeeds(size);
        // describe bodies all run before any bench: point the mocked storage at this size's data when a bench runs
        const useThisLibrary = () => { store.items = library; store.rawFeeds = rawFeeds; };

        bench('background load: getHermidataWithRss (cold caches)', async () => {
            useThisLibrary();
            clearTitleCaches();
            PastHermidata.invalidateCache();
            await getHermidataWithRss();
        });

        bench('background load: getHermidataWithRss (warm caches)', async () => {
            useThisLibrary();
            PastHermidata.invalidateCache();
            await getHermidataWithRss();
        });

        bench('RSS view: resolve every item title (cold caches)', () => {
            clearTitleCaches();
            for (const item of Object.values(library)) {
                findByTitleOrAlt(item.title, library);
                new HermidataModel(library[item.id]);
            }
        });

        bench('RSS view: resolve every item title (warm caches)', () => {
            for (const item of Object.values(library)) {
                findByTitleOrAlt(item.title, library);
                new HermidataModel(library[item.id]);
            }
        });
    });
}
