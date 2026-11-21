import { bench, describe } from 'vitest';
import { findByTitleOrAlt, TrimTitle } from '../../scripts/shared/utils/StringOutput';
import { clearTitleCaches, LIBRARY_SIZES, makeLibrary, pageUrlOf, silenceConsole, titleOf } from './fixtures';

/*
 * Title matching is the hot path behind every other flow ( popup open, RSS view, subscribe ):
 * findByTitleOrAlt trims the main title and every alt title of every saved item.
 * "cold" = empty caches ( first load of a page ), "warm" = a second lookup in the same page.
 */

silenceConsole();

for (const size of LIBRARY_SIZES) {
    describe(`findByTitleOrAlt, one lookup per item, ${size} items with 2-8 alt titles`, () => {
        const library = makeLibrary(size);
        const items = Object.values(library);

        bench('cold caches', () => {
            clearTitleCaches();
            for (const item of items) findByTitleOrAlt(item.title, library);
        });

        bench('warm caches', () => {
            for (const item of items) findByTitleOrAlt(item.title, library);
        });
    });
}

describe('TrimTitle.trimTitle, 1000 distinct page titles', () => {
    const titles = Array.from({ length: 1000 }, (_, i) => `${titleOf(i)} - Chapter ${i % 300} | Read Online`);
    const url = pageUrlOf(0, 1);

    bench('cold caches', () => {
        clearTitleCaches();
        for (const title of titles) TrimTitle.trimTitle(title, url);
    });

    bench('warm caches', () => {
        for (const title of titles) TrimTitle.trimTitle(title, url);
    });
});
