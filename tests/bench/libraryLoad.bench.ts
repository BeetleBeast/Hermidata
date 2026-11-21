import { bench, describe } from 'vitest';
import { HermidataModel } from '../../scripts/shared/utils/HermidataSelector';
import type { Hermidata } from '../../scripts/shared/types';
import { LIBRARY_SIZES, makeLibrary, silenceConsole } from './fixtures';

/*
 * Opening the library page, the part that does not need a browser:
 *  - the whole library crosses the extension messaging boundary ( JSON round trip: what Chrome does to a sendMessage payload )
 *  - the page builds a HermidataModel for every item it draws
 * Reading IndexedDB, loading the cover images and drawing the DOM are NOT measured here ( node: no IndexedDB, no DOM ).
 */

silenceConsole();

for (const size of LIBRARY_SIZES) {
    describe(`library load, ${size} items with 2-8 alt titles and a linked feed`, () => {
        const library = makeLibrary(size);
        const list = Object.values(library);

        bench('send the library over extension messaging ( JSON round trip )', () => {
            const received: Hermidata[] = JSON.parse(JSON.stringify(list));
            Object.fromEntries(received.map(h => [h.id, h]));
        });

        bench('build a HermidataModel for every item', () => {
            for (const entry of list) new HermidataModel(entry);
        });
    });
}
