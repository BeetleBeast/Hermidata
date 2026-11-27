import { bench, describe, vi } from 'vitest';
import { HermidataModel } from '../../scripts/shared/utils/HermidataSelector';
import { feed } from '../../scripts/library/build/feed';
import type { Hermidata, Settings } from '../../scripts/shared/types';
import { coverStep, coversOf, FakeIntersectionObserver, LIBRARY_SIZES, makeLibrary, silenceConsole, stubLibraryPage } from './fixtures';

/*
 * Opening the library page, the part that does not need a browser:
 *  - IndexedDB hands the stored records back as structured clones ( what `getAll` pays to deserialize them )
 *  - the whole library crosses the extension messaging boundary ( JSON round trip: what Chrome does to a sendMessage payload )
 *  - the page builds a HermidataModel for every item it draws
 *  - the page draws its entries, on a stand-in DOM where every cover costs an image read and an image load of COVER_STEP_MS each
 * Reading IndexedDB from disk, real image decoding and browser layout are NOT measured here ( node: no IndexedDB, no DOM ).
 */

vi.mock('../../scripts/shared/db/Storage', async (importOriginal) => ({
    ...await importOriginal<typeof import('../../scripts/shared/db/Storage')>(),
    getImage: async () => { await coverStep(); return null; },
}));

silenceConsole();

/** The covers of the entries the first screen of the library shows */
const FIRST_SCREEN = 12;

/** Draws the library page and waits until it shows its first screen with covers */
async function drawFirstScreen(library: Record<string, Hermidata>): Promise<void> {
    const container = stubLibraryPage();
    await new feed(library, {} as Settings).build();
    const firstScreen = coversOf(container).slice(0, FIRST_SCREEN);
    FakeIntersectionObserver.all.at(-1)?.scrollTo(firstScreen);
    await Promise.all(firstScreen.map(img => img.complete ? null : new Promise(resolve => img.addEventListener('load', resolve))));
}

for (const size of LIBRARY_SIZES) {
    describe(`library load, ${size} items with 2-8 alt titles and a linked feed`, () => {
        const library = makeLibrary(size);
        const list = Object.values(library);

        bench('read the library out of IndexedDB ( structured clone )', () => {
            structuredClone(list);
        });

        bench('send the library over extension messaging ( JSON round trip )', () => {
            const received: Hermidata[] = JSON.parse(JSON.stringify(list));
            Object.fromEntries(received.map(h => [h.id, h]));
        });

        bench('build a HermidataModel for every item', () => {
            for (const entry of list) new HermidataModel(entry);
        });

        bench('draw the library until its first screen shows covers', async () => {
            await drawFirstScreen(library);
        }, { iterations: 5, time: 0 });
    });
}
