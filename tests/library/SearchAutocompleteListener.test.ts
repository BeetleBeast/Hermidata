// The library search hides its suggestions on a click elsewhere. That listener is added once, with the inputs,
// not again on every key press in the search bar.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../scripts/shared/db/Storage', () => ({ getLastLibraryFilters: vi.fn(), setLastLibraryFilters: vi.fn(), setLastLibrarySortOption: vi.fn() }));
vi.mock('../../scripts/shared/utils/Accessibility', () => ({ makeTriStateOption: vi.fn(), markAsCombobox: vi.fn(), markAsOption: vi.fn(), setActiveOption: vi.fn() }));

class FakeElement extends EventTarget {
    innerHTML = '';
    private readonly inside = new Set<unknown>();
    holds(child: unknown) { this.inside.add(child); return this; }
    contains(node: unknown) { return node === this || this.inside.has(node); }
    querySelectorAll() { return [{ textContent: 'Solo Leveling', classList: { toggle: vi.fn() } }]; }
}

class FakeDocument extends EventTarget {
    private readonly search: FakeElement;
    constructor(search: FakeElement) { super(); this.search = search; }
    querySelector(selector: string) { return selector === '#search' ? this.search : null; }
}

const searchInput = new FakeElement();
const fakeDocument = new FakeDocument(searchInput);
vi.stubGlobal('document', fakeDocument);

import { FilterLogic } from '../../scripts/library/build/filterLogic';

type SearchWiring = {
    addTextQueryInputs(input: FakeElement, box: FakeElement): void;
    setupSearchBar(e: KeyboardEvent, box: FakeElement, className: string): void;
};

/** The search wiring of a FilterLogic, without building the whole library page */
const wiring = () => Object.create(FilterLogic.prototype) as SearchWiring;
const keydown = (key: string) => ({ key, preventDefault: vi.fn() }) as unknown as KeyboardEvent;

describe('library search suggestions', () => {
    beforeEach(() => vi.restoreAllMocks());

    it('typing adds no document listener', () => {
        const add = vi.spyOn(fakeDocument, 'addEventListener');
        const suggestions = new FakeElement();

        for (const key of ['s', 'o', 'l', 'o', 'ArrowDown']) wiring().setupSearchBar(keydown(key), suggestions, '.autocomplete-item');

        expect(add).not.toHaveBeenCalled();
    });

    it('is hidden by one document listener, added with the inputs', () => {
        const add = vi.spyOn(fakeDocument, 'addEventListener');
        const suggestion = new FakeElement();
        const suggestions = new FakeElement().holds(suggestion);
        wiring().addTextQueryInputs(searchInput, suggestions);

        expect(add.mock.calls.filter(([type]) => type === 'click')).toHaveLength(1);

        /** a click that bubbled up to the document from `target` */
        const clickOn = (target: unknown) => {
            const event = new Event('click');
            Object.defineProperty(event, 'target', { value: target });
            fakeDocument.dispatchEvent(event);
        };

        suggestions.innerHTML = '<div>Solo Leveling</div>';
        clickOn(suggestion);
        expect(suggestions.innerHTML).toBe('<div>Solo Leveling</div>');   // picking a suggestion keeps the list

        clickOn(fakeDocument);
        expect(suggestions.innerHTML).toBe('');                           // a click elsewhere hides it
    });
});
