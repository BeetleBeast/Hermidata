import { beforeEach, describe, expect, it, vi } from 'vitest';
import { feed } from '../../scripts/library/build/feed';
import { getImage } from '../../scripts/shared/db/Storage';
import type { Settings } from '../../scripts/shared/types';
import { coverStep, coversOf, FakeIntersectionObserver, makeLibrary, silenceConsole, stubLibraryPage, type FakeElement } from '../bench/fixtures';

vi.mock('../../scripts/shared/db/Storage', async (importOriginal) => ({
    ...await importOriginal<typeof import('../../scripts/shared/db/Storage')>(),
    getImage: vi.fn(async () => null),
}));

silenceConsole();

const library = makeLibrary(40);

function drawLibrary(): { page: feed; container: FakeElement; observer: FakeIntersectionObserver } {
    const container = stubLibraryPage();
    const page = new feed(library, {} as Settings);
    page.build();
    return { page, container, observer: FakeIntersectionObserver.all[0] };
}

/** Waits until the cover read and the image load are done */
const coversLoaded = async () => { await coverStep(); await coverStep(); };

describe('library page draws its entries without waiting on the covers', () => {
    beforeEach(() => vi.clearAllMocks());

    it('draws every entry at once, so filters, sort, search and selection still see the whole library', () => {
        const { container } = drawLibrary();

        expect(container.children.map(entry => entry.dataset.id)).toEqual(Object.keys(library));
        expect(getImage).not.toHaveBeenCalled();
    });

    it('loads a cover only once its entry comes near the screen', async () => {
        const { container, observer } = drawLibrary();
        const covers = coversOf(container);
        expect(observer.observed).toHaveLength(covers.length);

        observer.scrollTo(covers.slice(0, 12));
        await coversLoaded();

        expect(getImage).toHaveBeenCalledTimes(12);
        expect(covers.slice(0, 12).every(img => img.complete && img.style.objectFit)).toBe(true);
        expect(covers.slice(12).some(img => img.src)).toBe(false);
        expect(observer.observed).toHaveLength(covers.length - 12);
    });

    it('loads a cover once, however often its entry scrolls back into view', async () => {
        const { container, observer } = drawLibrary();
        const [first] = coversOf(container);

        observer.scrollTo([first]);
        observer.scrollTo([first]);
        await coversLoaded();

        expect(getImage).toHaveBeenCalledTimes(1);
    });

    it('ignores entries reported as off screen', () => {
        const { container, observer } = drawLibrary();
        const [first] = coversOf(container);

        Reflect.apply(Reflect.get(observer, 'callback'), observer, [[{ target: first, isIntersecting: false }]]);

        expect(getImage).not.toHaveBeenCalled();
        expect(observer.observed).toContain(first);
    });

    it('stops waiting on the covers of the old entries when the library reloads', async () => {
        const { page, container, observer } = drawLibrary();
        const oldCovers = coversOf(container);

        page.reload();
        const newCovers = coversOf(container);

        expect(newCovers).not.toContain(oldCovers[0]);
        expect(observer.observed).toEqual(newCovers);

        observer.scrollTo([oldCovers[0], newCovers[0]]);
        await coversLoaded();

        expect(getImage).toHaveBeenCalledTimes(1);
        expect(oldCovers[0].src).toBe('');
    });
});
