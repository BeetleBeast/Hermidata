import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setSubscribableHint } from '../../scripts/popup/frontend/subscribableHint';

/** The popup tests run in node: just enough of an element for the hint */
function fakeElement() {
    const attributes = new Map<string, string>();
    return {
        attributes,
        hidden: true,
        title: '',
        setAttribute: (name: string, value: string) => void attributes.set(name, value),
        removeAttribute(name: string) { attributes.delete(name); if (name === 'title') this.title = ''; },
    };
}

const dot = fakeElement();
const button = fakeElement();

beforeEach(() => {
    vi.stubGlobal('document', {
        querySelector: (selector: string) => ({ '#subscribableHint': dot, '#HDRssBtn': button })[selector] ?? null,
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
    for (const element of [dot, button]) {
        element.attributes.clear();
        element.hidden = true;
        element.title = '';
    }
});

describe('setSubscribableHint', () => {
    it('shows the dot and tells assistive tech about the feed through the RSS button', () => {
        setSubscribableHint(true);

        expect(dot.hidden).toBe(false);
        expect(button.attributes.get('aria-label')).toContain('subscribe');
        expect(button.title).toBe(button.attributes.get('aria-label'));
    });

    it('takes it all away again when the page has no feed', () => {
        setSubscribableHint(true);
        setSubscribableHint(false);

        expect(dot.hidden).toBe(true);
        expect(button.attributes.has('aria-label')).toBe(false);
        expect(button.title).toBe('');
    });

    it('does nothing when the popup has no RSS button', () => {
        vi.stubGlobal('document', { querySelector: () => null });

        expect(() => setSubscribableHint(true)).not.toThrow();
    });
});
