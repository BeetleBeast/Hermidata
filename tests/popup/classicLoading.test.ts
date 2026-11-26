import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setClassicLoading } from '../../scripts/popup/frontend/classicLoading';

/** The popup tests run in node: just enough of an element for the loading state */
function fakeElement() {
    const attributes = new Map<string, string>();
    return {
        attributes,
        dataset: {} as Record<string, string>,
        setAttribute: (name: string, value: string) => void attributes.set(name, value),
        toggleAttribute: (name: string, force: boolean) => void (force ? attributes.set(name, '') : attributes.delete(name)),
    };
}

const main = fakeElement();
const fields = [fakeElement(), fakeElement(), fakeElement()];

beforeEach(() => {
    vi.stubGlobal('document', {
        querySelector: (selector: string) => selector === '.HDClassic .main' ? main : null,
        querySelectorAll: (selector: string) => selector === '.HDClassic .autoInput' ? fields : [],
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
    for (const element of [main, ...fields]) {
        element.attributes.clear();
        element.dataset = {};
    }
});

describe('setClassicLoading', () => {
    it('marks the form busy and every field as loading and unusable', () => {
        setClassicLoading(true);

        expect(main.attributes.get('aria-busy')).toBe('true');
        for (const field of fields) {
            expect(field.dataset.loading).toBe('true');
            expect(field.attributes.has('inert')).toBe(true);
        }
    });

    it('clears all of it again, so the form is usable after a load or a failed load', () => {
        setClassicLoading(true);
        setClassicLoading(false);

        expect(main.attributes.get('aria-busy')).toBe('false');
        for (const field of fields) {
            expect(field.dataset.loading).toBe('false');
            expect(field.attributes.has('inert')).toBe(false);
        }
    });

    it('does nothing when the classic form is not on the page', () => {
        vi.stubGlobal('document', { querySelector: () => null, querySelectorAll: () => [] });

        expect(() => setClassicLoading(true)).not.toThrow();
    });
});
