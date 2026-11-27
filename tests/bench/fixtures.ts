import { vi } from 'vitest';
import { HermidataModel } from '../../scripts/shared/utils/HermidataSelector';
import { generateHermidataHash, TrimTitle } from '../../scripts/shared/utils/StringOutput';
import type { AnyNovelType, Feed, FeedItem, Hermidata, RawFeed } from '../../scripts/shared/types';

/** Library sizes every benchmark runs at: a small library and a big one */
export const LIBRARY_SIZES = [100, 400] as const;

const SITE_COUNT = 20;
const TYPES: AnyNovelType[] = ['Novel', 'Manga'];

export const siteOf = (index: number) => `site${index % SITE_COUNT}.com`;
export const titleOf = (index: number) => `Novel Number ${index}`;
export const pageUrlOf = (index: number, chapter: number) => `https://${siteOf(index)}/novel-${index}/chapter-${chapter}`;

/** Alt titles for item `index`: 2 to 8 of them, like a library after the online alt title lookup ran */
export function altTitlesOf(index: number): string[] {
    const count = 2 + (index % 7);
    return Array.from({ length: count }, (_, k) => `Alt Title ${index} variant ${k}`);
}

function feedItem(index: number, chapter: number): FeedItem {
    const site = siteOf(index);
    return {
        id: `${site}-${index}-${chapter}`,
        rawTitle: `${titleOf(index)} Chapter ${chapter}`,
        title: `${titleOf(index)} Chapter ${chapter}`,
        link: pageUrlOf(index, chapter),
        chapter,
        pubDate: new Date('2026-11-01T00:00:00.000Z'),
        guid: `${site}-${index}-${chapter}`,
    };
}

export function makeRawFeed(index: number, chapter = 12): RawFeed {
    return {
        id: `feed-${index}`,
        title: titleOf(index),
        url: `https://${siteOf(index)}/novel-${index}/feed`,
        domain: siteOf(index),
        lastFetched: '2026-11-01T00:00:00.000Z',
        lastBuildDate: new Date('2026-11-01T00:00:00.000Z'),
        image: '',
        latestItem: feedItem(index, chapter),
        lastToken: null,
    };
}

export type LibraryOptions = {
    /** link every item to its RSS feed ( default true ) */
    withRss?: boolean;
    /** how many items are left without an RSS link, counted from the end ( default 0 ) */
    unlinkedTail?: number;
};

/** A deterministic library of `count` saved items, each with 2-8 alt titles and optionally a linked RSS feed */
export function makeLibrary(count: number, { withRss = true, unlinkedTail = 0 }: LibraryOptions = {}): Record<string, Hermidata> {
    const library: Record<string, Hermidata> = {};
    for (let i = 0; i < count; i++) {
        const type = TYPES[i % TYPES.length];
        const item = HermidataModel.from(type, 'Viewing', 'Ongoing');
        item.title = titleOf(i);
        item.id = generateHermidataHash(item.title, type);
        item.SetUrl(pageUrlOf(i, 3));
        item.SetChapter(3);
        item.chapter.latest = 3;
        item.source = siteOf(i);
        item.meta.altSources = [siteOf(i)];
        item.meta.altTitles = [titleOf(i), ...altTitlesOf(i)];
        if (withRss && i < count - unlinkedTail) {
            item.rss = [{ ...makeRawFeed(i, 3), lastFetched: '2026-10-01T00:00:00.000Z' } as unknown as Feed];
        }
        library[item.id] = item.toJSON();
    }
    return library;
}

export function makeRawFeeds(count: number): Record<string, RawFeed> {
    return Object.fromEntries(Array.from({ length: count }, (_, i) => makeRawFeed(i)).map(feed => [feed.url, feed]));
}

/** The libraries as a list, for picking an item by position */
export const itemAt = (library: Record<string, Hermidata>, index: number): Hermidata => Object.values(library)[index];

/**
 * Forgets what title trimming has cached, so the next run pays the cost of a fresh popup / page.
 * Each extension page is a new JS context, so a first load always starts with empty caches.
 * Does nothing for a cache that does not exist ( the benchmark then measures the uncached code ).
 */
export function clearTitleCaches(): void {
    const trim = TrimTitle as unknown as Record<string, Map<unknown, unknown> | undefined>;
    trim.trimCache?.clear();
    trim.regexConfigCache?.clear();
}

/** The code under test logs a lot; console output would drown the benchmark table */
export function silenceConsole(): void {
    for (const method of ['log', 'info', 'warn', 'error', 'table', 'group', 'groupCollapsed', 'groupEnd', 'time', 'timeEnd'] as const) {
        vi.spyOn(console, method).mockImplementation(() => undefined);
    }
}

/** Gives the active tab a scroll position, the way a real browser answers getPagePosition ( vitest.setup.ts only stubs chrome.runtime ) */
export function stubActiveTab(scrollY = 120): void {
    Object.assign(globalThis.chrome, {
        tabs: { query: async () => [{ id: 1 }] },
        scripting: { executeScript: async () => [{ result: scrollY }] },
    });
}

/** How long each of the two steps of a cover takes: the IndexedDB image read and the image load ( Windows rounds timers up to ~15ms ) */
export const COVER_STEP_MS = 2;

/** Waits one cover step */
export const coverStep = (): Promise<void> => new Promise(resolve => setTimeout(resolve, COVER_STEP_MS));

/** Just enough of a DOM element for the library entry builder ( node has no DOM ) */
export class FakeElement {
    public children: FakeElement[] = [];
    public readonly dataset: Record<string, string> = {};
    public readonly style: Record<string, string> = {};
    public readonly attributes: Record<string, string> = {};
    public className = '';
    public textContent = '';
    public ariaHidden: string | null = null;
    private readonly listeners = new Map<string, Set<EventListener>>();
    public readonly tagName: string;

    constructor(tagName: string) {
        this.tagName = tagName;
    }

    addEventListener(type: string, listener: EventListener): void {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type)!.add(listener);
    }
    removeEventListener(type: string, listener: EventListener): void {
        this.listeners.get(type)?.delete(listener);
    }
    dispatch(type: string): void {
        for (const listener of [...this.listeners.get(type) ?? []]) listener({ type } as Event);
    }
    setAttribute(name: string, value: string): void {
        this.attributes[name] = value;
    }
    append(...nodes: FakeElement[]): void {
        for (const node of nodes) this.appendChild(node);
    }
    appendChild(node: FakeElement): FakeElement {
        // a fragment hands over its children, as a real DocumentFragment does
        this.children.push(...(node.tagName === '#fragment' ? node.children : [node]));
        return node;
    }
    replaceChildren(...nodes: FakeElement[]): void {
        this.children = [];
        this.append(...nodes);
    }
}

/** A cover image: setting `src` loads it one cover step later, like a decoded image firing `load` */
export class FakeImage extends FakeElement {
    public alt = '';
    public sizes = '';
    public loading = '';
    public complete = false;
    public naturalWidth = 0;
    public naturalHeight = 0;
    private source = '';

    constructor() { super('img'); }

    get src(): string { return this.source; }
    set src(value: string) {
        this.source = value;
        void coverStep().then(() => {
            this.complete = true;
            this.naturalWidth = 250;
            this.naturalHeight = 350;
            this.dispatch('load');
        });
    }
}

/** Stands in for IntersectionObserver: nothing is on screen until `scrollTo` says which observed elements are */
export class FakeIntersectionObserver {
    public static readonly all: FakeIntersectionObserver[] = [];
    public readonly observed: FakeElement[] = [];
    private readonly callback: (entries: { target: FakeElement; isIntersecting: boolean }[]) => void;

    constructor(callback: (entries: { target: FakeElement; isIntersecting: boolean }[]) => void) {
        this.callback = callback;
        FakeIntersectionObserver.all.push(this);
    }

    observe(target: FakeElement): void {
        if (!this.observed.includes(target)) this.observed.push(target);
    }
    unobserve(target: FakeElement): void {
        const index = this.observed.indexOf(target);
        if (index !== -1) this.observed.splice(index, 1);
    }
    disconnect(): void {
        this.observed.length = 0;
    }
    /** Reports the given observed elements as on screen */
    scrollTo(targets: FakeElement[]): void {
        this.callback(targets.filter(target => this.observed.includes(target)).map(target => ({ target, isIntersecting: true })));
    }
}

/** The library page the entry builder draws into: the entries container, `document` and `IntersectionObserver` */
export function stubLibraryPage(): FakeElement {
    const container = new FakeElement('div');
    FakeIntersectionObserver.all.length = 0;
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    vi.stubGlobal('document', {
        body: new FakeElement('body'),
        querySelector: (selector: string) => selector === '#library-entries-container' ? container : null,
        querySelectorAll: () => [],
        createDocumentFragment: () => new FakeElement('#fragment'),
        createElement: (tagName: string) => tagName === 'img' ? new FakeImage() : new FakeElement(tagName),
        createElementNS: (_namespace: string, tagName: string) => new FakeElement(tagName),
    });
    return container;
}

/** Every cover image the library page drew, in page order */
export function coversOf(container: FakeElement): FakeImage[] {
    return container.children.map(entry => entry.children.find(child => child instanceof FakeImage)).filter(img => img instanceof FakeImage);
}
