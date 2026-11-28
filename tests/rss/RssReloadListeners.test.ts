// Every reload of the RSS view runs the sort and footer setup again over the same, long-lived nodes.
// Their listeners must be replaced, not stacked: one click is one action, however often the view was reloaded.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const page = vi.hoisted(() => ({
    openLink: vi.fn(),
    onMessageListeners: new Set<unknown>(),
    elements: new Map<string, unknown>(),
}));

vi.mock('../../scripts/rss/build', () => ({ RssBuild: class {} }));
vi.mock('../../scripts/rss/load', () => ({ clearNotifications: vi.fn(), getHermidataNotification: vi.fn(async () => ({})) }));
vi.mock('../../scripts/rss/build/feed', () => ({ refreshNotificationSection: vi.fn() }));
vi.mock('../../scripts/shared/utils/StringOutput', () => ({ openLink: page.openLink }));
vi.mock('../../scripts/shared/db/Storage', () => ({ getLastFilter: vi.fn(async () => undefined), setLastFilter: vi.fn() }));
vi.mock('../../scripts/shared/utils/BrowserCompat', () => ({
    ext: {
        runtime: {
            sendMessage: vi.fn(),
            onMessage: {
                addListener: (fn: unknown) => page.onMessageListeners.add(fn),
                hasListener: (fn: unknown) => page.onMessageListeners.has(fn),
            },
        },
    },
}));

/** Enough of a DOM element to add listeners to and dispatch real events on ( node has EventTarget, not Element ) */
class FakeElement extends EventTarget {
    textContent = '';
    readonly dataset: Record<string, string> = {};
    private readonly found: Record<string, FakeElement | null>;
    constructor(found: Record<string, FakeElement | null> = {}) { super(); this.found = found; }
    querySelectorAll(): FakeElement[] { return []; }
    querySelector(selector: string) { return this.found[selector] ?? null; }
    closest(selector: string) { return this.found[selector] ?? null; }
}

vi.stubGlobal('Element', FakeElement);
vi.stubGlobal('document', { querySelector: (selector: string) => page.elements.get(selector) ?? null, querySelectorAll: () => [] });
vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn(), getManifest: () => ({ version: '1.0.0' }), onMessage: { addListener: (fn: unknown) => page.onMessageListeners.add(fn) } } });

import { SortLogic } from '../../scripts/rss/build/SortLogic';
import { Footer } from '../../scripts/rss/build/footer';

const click = (target: EventTarget) => target.dispatchEvent(new Event('click'));

describe('RSS filter section after reloads', () => {
    it('handles a filter click once, however often the section was set up', async () => {
        const checkbox = new FakeElement();
        const option = new FakeElement({ '.custom-checkbox': checkbox });
        const section = new FakeElement({ '.filter-item-list': option });  // the click lands on an option row inside it

        const logic = new (SortLogic as unknown as new () => SortLogic)();
        const onClick = vi.fn();
        Object.assign(logic, { eventOnClick: onClick, applySavedFilters: vi.fn() });

        for (let reload = 0; reload < 3; reload++) await logic.sortOptionLogic(section as unknown as HTMLElement);
        click(section);

        expect(onClick).toHaveBeenCalledOnce();
    });
});

describe('RSS footer after reloads', () => {
    beforeEach(() => {
        page.openLink.mockReset();
        page.elements.clear();
        for (const selector of ['#clear-notifications', '.library-btn', '#RSS-latest-sync-div', '#lastSync', '#RSS-sync-Manual', '#version']) {
            page.elements.set(selector, new FakeElement());
        }
    });

    it('opens the library in one tab, however often the footer was built', () => {
        const footer = new (Footer as unknown as new () => Footer)();
        for (let reload = 0; reload < 3; reload++) footer.makeFooterSection();

        click(page.elements.get('.library-btn') as FakeElement);

        expect(page.openLink).toHaveBeenCalledOnce();
    });

    it('listens for "sync completed" with one handler, however often the footer was built', () => {
        page.onMessageListeners.clear();
        const footer = new (Footer as unknown as new () => Footer)();
        for (let reload = 0; reload < 3; reload++) footer.makeFooterSection();

        expect(page.onMessageListeners.size).toBe(1);
    });
});
