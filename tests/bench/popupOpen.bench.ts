import { bench, describe, vi } from 'vitest';
import { PastHermidata } from '../../scripts/popup/core/Past';
import { HermidataModel } from '../../scripts/shared/utils/HermidataSelector';
import type { Hermidata } from '../../scripts/shared/types';
import { clearTitleCaches, itemAt, LIBRARY_SIZES, makeLibrary, pageUrlOf, silenceConsole, titleOf } from './fixtures';

/*
 * Opening the popup on a page: PastHermidata.init() looks for the saved item behind the page
 * ( title / alt title match, fuzzy "is this an alt title?" scan, candidate resolution ).
 * Drawing the popup is not measured: the benchmarks run in node, without a DOM.
 */

const store = vi.hoisted(() => ({ items: {} as Record<string, Hermidata> }));

vi.mock('../../scripts/shared/db/Storage', () => ({
    getAllHermidata: vi.fn(async () => store.items),
    getHermidataViaKey: vi.fn(async (key: string) => store.items[key] ?? null),
    saveHermidata: vi.fn(),
    getSettings: vi.fn(async () => ({ ContentTypesAndStatuses: { TYPE_OPTIONS: ['Manga', 'Novel'] } })),
}));

vi.mock('../../scripts/popup/frontend/confirm', () => ({
    customConfirm: vi.fn().mockResolvedValue(false),
    confirmMigrationPrompt: vi.fn().mockResolvedValue(false),
}));

silenceConsole();

function pageFor(title: string, url: string): HermidataModel {
    const page = HermidataModel.from('Novel', 'Viewing', 'Ongoing');
    page.SetFromTab({ pageTitle: title, url, currentChapter: 4 });
    return page;
}

/** A page never saved before: every run uses a new title, so the similarity cache never helps */
let unknownCounter = 0;

for (const size of LIBRARY_SIZES) {
    describe(`popup open, ${size} items with 2-8 alt titles`, () => {
        const library = makeLibrary(size);
        const middle = Math.floor(size / 2);
        const useThisLibrary = () => { store.items = library; PastHermidata.invalidateCache(); };

        bench('page of a saved item (cold caches)', async () => {
            useThisLibrary();
            clearTitleCaches();
            await new PastHermidata(pageFor(`${titleOf(middle)} Chapter 4`, pageUrlOf(middle, 4))).init();
        });

        bench('page of a saved item (warm caches)', async () => {
            useThisLibrary();
            await new PastHermidata(pageFor(`${titleOf(middle)} Chapter 4`, pageUrlOf(middle, 4))).init();
        });

        bench('page of an alt title of a saved item', async () => {
            useThisLibrary();
            const alt = itemAt(library, middle).meta.altTitles[2];
            await new PastHermidata(pageFor(`${alt} Chapter 4`, 'https://other-site.com/read/chapter-4')).init();
        });

        bench('page not saved yet (full fuzzy scan)', async () => {
            useThisLibrary();
            const title = `Never Saved Series ${unknownCounter++}`;
            await new PastHermidata(pageFor(`${title} Chapter 1`, 'https://other-site.com/never-saved/chapter-1')).init();
        });
    });
}
