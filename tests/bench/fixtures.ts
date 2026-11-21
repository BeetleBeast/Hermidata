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
