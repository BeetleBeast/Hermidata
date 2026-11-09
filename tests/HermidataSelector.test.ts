import { afterEach, describe, expect, it, vi } from 'vitest';
import { HermidataModel } from '../scripts/shared/utils/HermidataSelector';
import { PastHermidata } from '../scripts/popup/core/Past';
import { generateHermidataHash } from '../scripts/shared/utils/StringOutput';
import * as Storage from '../scripts/shared/db/Storage';
import { HermidataMigration } from '../scripts/shared/migration/Hermidata';
import type { HermidataV11 } from '../scripts/shared/types';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function createHermidata(chapter: number, history: { chapter: number; at: string }[] = [], withRss = true): HermidataModel {
    const hermidata = HermidataModel.from('Manga', 'Viewing', 'Ongoing');
    hermidata.title = 'Series';
    hermidata.SetUrl('https://example.com/series/chapter-12');
    hermidata.SetChapter(chapter);
    hermidata.SetHistory(history);
    if (withRss) {
        hermidata.rss = [{
                id: 'feed',
                title: 'Series',
                url: 'https://example.com/feed',
                image: null,
                domain: 'example.com',
                lastFetched: null,
                latestItem: {
                    id: 'latest-item',
                    rawTitle: 'Series Chapter 20',
                    title: 'Series Chapter 20',
                    link: 'https://example.com/series/chapter-20',
                    chapter: 20,
                    pubDate: new Date('2025-01-01T00:00:00Z'),
                    guid: 'latest-item',
                },
            }];
    } else {
        hermidata.rss = [];
    }
    return hermidata;
}

async function mergeSavedHermidata(saved: HermidataModel, currentChapter: number): Promise<HermidataModel> {
    const current = createHermidata(currentChapter);
    const past = new PastHermidata(current);
    vi.spyOn(past, 'init').mockResolvedValue(saved.toJSON());

    await current.SetPast(past);
    return current;
}

describe('HermidataModel.SetPast', () => {
    it('preserves the RSS last-read fallback before applying the active tab chapter', async () => {
        const saved = createHermidata(5);
        expect(saved.GetLatestReadChapter()).toBe(5);

        const merged = await mergeSavedHermidata(saved, 12);

        // SetPast updates the current bookmark from the active tab, but last-read stays saved.
        expect(merged.GetChapter()).toBe(12);
        expect(merged.GetLatestReadChapter()).toBe(5);
        expect(merged.GetHistory()).toEqual([
            { chapter: 5, at: saved.getBookmark().updatedAt },
        ]);
    });

    it('does not replace existing read history with the active tab chapter', async () => {
        const saved = createHermidata(5, [
            { chapter: 4, at: '2025-01-01T00:00:00Z' },
            { chapter: 5, at: '2025-01-02T00:00:00Z' },
        ]);
        const merged = await mergeSavedHermidata(saved, 12);

        expect(merged.GetChapter()).toBe(12);
        expect(merged.GetLatestReadChapter()).toBe(5);
        expect(merged.GetHistory()).toEqual([
            { chapter: 4, at: '2025-01-01T00:00:00Z' },
            { chapter: 5, at: '2025-01-02T00:00:00Z' },
        ]);
    });

    it('keeps the non-RSS latest-chapter fallback without manufacturing read history', async () => {
        const saved = createHermidata(5, [], false);
        saved.chapter.latest = 9;
        const merged = await mergeSavedHermidata(saved, 3);

        expect(merged.GetChapter()).toBe(3);
        expect(merged.GetLatestReadChapter()).toBe(9);
        expect(merged.GetHistory()).toEqual([]);
    });
    it('seeds read history from the saved chapter for an old non-RSS record with no history and latest = 0', async () => {
        const saved = createHermidata(75, [], false);
        saved.chapter.latest = 0;
        saved.getBookmark().updatedAt = '2026-05-11T15:30:39.540Z';
        const merged = await mergeSavedHermidata(saved, 78);

        expect(merged.GetChapter()).toBe(78)
        expect(merged.GetLatestReadChapter()).toBe(75);
        expect(merged.GetHistory()).toEqual([
            { chapter: 75, at: saved.getBookmark().updatedAt },
        ]);
    })
    it('keeps the saved latest chapter as last-read when the open tab is behind it (non-RSS, no history)', async () => {
        const saved = createHermidata(5, [], false);
        saved.chapter.latest = 9;

        const merged = await mergeSavedHermidata(saved, 3);

        expect(merged.GetChapter()).toBe(3);
        expect(merged.GetLatestReadChapter()).toBe(9);
    })
    it('falls back to the saved current chapter as last-read when latest is 0 (non-RSS, no history)', async () => {
        const saved = createHermidata(75, [], false);
        saved.chapter.latest = 0;

        const merged = await mergeSavedHermidata(saved, 3);

        expect(merged.GetChapter()).toBe(3);
        expect(merged.GetLatestReadChapter()).toBe(75);
    })
    it('ignores a placeholder chapter 0 history entry and keeps the saved current chapter as last-read (RSS)', async () => {
        const saved = createHermidata(70, [{ chapter: 0, at: '2026-01-27T17:08:46.848Z' }]);
        saved.chapter.latest = 78;

        const merged = await mergeSavedHermidata(saved, 78);

        expect(merged.GetChapter()).toBe(78);
        expect(merged.GetLatestReadChapter()).toBe(70);
    });
});

describe('HermidataModel.Update ID', () => {
    it('updates the entry ID and type together when given the new key', () => {
        const saved = createHermidata(5);
        const changed = createHermidata(12);
        changed.novelType = 'Anime';
        const newId = generateHermidataHash(saved.title, changed.novelType);
        saved.Update(newId, changed, 12);

        expect(saved.novelType).toBe('Anime');
        expect(saved.id).toBe(newId);
        expect(saved.id).toBe(generateHermidataHash(saved.title, saved.novelType));
    });
});

describe('HermidataModel.UpdateBookmark', () => {
    it('records an ISO timestamp instead of the active marker ID in history', () => {
        const saved = createHermidata(5);
        const current = createHermidata(6);
        const markerId = current.chapter.bookmarkInUse;

        saved.UpdateBookmark(current, 6);

        const history = saved.GetHistory(markerId);
        expect(history).toHaveLength(1);
        expect(history[0].chapter).toBe(6);
        expect(new Date(history[0].at).toISOString()).toBe(history[0].at);
        expect(history[0].at).not.toBe(markerId);
    });
});

describe('HermidataModel image source', () => {
    it('migrates the legacy IndexedDB marker to a stored image reference', () => {
        const saved = createHermidata(5).toJSON();
        const { titleTrimming: _titleTrimming, ...v11Saved } = saved;
        const legacy: HermidataV11 = {
            ...v11Saved,
            version: 11,
            rss: null,
            chapter: {
                ...saved.chapter,
                bookmarks: Object.fromEntries(Object.entries(saved.chapter.bookmarks).map(([id, bookmark]) => {
                    const { lastUsedAt: _lastUsedAt, ...legacyBookmark } = bookmark;
                    return [id, { ...legacyBookmark, version: 5 }];
                })),
            },
            meta: { ...saved.meta, image: 'inside-indexedDB' }
        };

        const result = HermidataMigration.migrateAllHermidataToLatest(legacy);
        expect(result.isMigratedSuccessfully).toBe(true);
        if (!result.isMigratedSuccessfully) throw result.result;
        const model = new HermidataModel(result.result);

        expect(model.meta.image).toEqual({ kind: 'stored', id: saved.id });
        expect(model.rss).toEqual([]);
        expect(model.titleTrimming).toEqual({ type: 'default' });
        expect(model.version).toBe(12);
        expect(Object.values(model.chapter.bookmarks)[0].lastUsedAt).toBe(Object.values(saved.chapter.bookmarks)[0].updatedAt);
    });

    it('migrates a legacy RSS feed into a one-item list', () => {
        const saved = createHermidata(5).toJSON();
        const { titleTrimming: _titleTrimming, meta: _meta, ...v11Saved } = saved;
        
        const legacy: HermidataV11 = {
            ...v11Saved,
            version: 11,
            rss: saved.rss[0],
            chapter: {
                ...saved.chapter,
                bookmarks: Object.fromEntries(Object.entries(saved.chapter.bookmarks).map(([id, bookmark]) => {
                    const { lastUsedAt: _lastUsedAt, ...legacyBookmark } = bookmark;
                    return [id, { ...legacyBookmark, version: 5 }];
                })),
            },
            meta: { ...saved.meta, image: 'inside-indexedDB' },
        };

        const result = HermidataMigration.migrateAllHermidataToLatest(legacy);
        expect(result.isMigratedSuccessfully).toBe(true);
        if (!result.isMigratedSuccessfully) throw result.result;
        expect(result.result.rss).toEqual([saved.rss[0]]);
    });

    it('selects the most recently published feed from the RSS list', () => {
        const model = createHermidata(5);
        const olderFeed = model.rss[0];
        model.rss.push({
            ...olderFeed,
            id: 'newer-feed',
            url: 'https://example.com/newer-feed',
            latestItem: {
                ...olderFeed.latestItem,
                pubDate: new Date('2025-02-01T00:00:00Z'),
            },
        });

        expect(model.GetLatestRssFeed()?.id).toBe('newer-feed');
    });

    it('fetches URL images for their resolved image data and keeps the URL source', async () => {
        const model = createHermidata(5);
        const imageBlob = new Blob(['resolved cover'], { type: 'image/jpeg' });
        const fetchImage = vi.fn().mockResolvedValue(new Response(imageBlob));
        vi.stubGlobal('fetch', fetchImage);
        const saveImage = vi.spyOn(Storage, 'saveImage').mockResolvedValue(true);
        const removeImage = vi.spyOn(Storage, 'removeImage').mockResolvedValue(true);
        model.meta.image = { kind: 'stored', id: 'old-image-id' };

        await model.SetImage('https://example.com/cover.jpg');

        expect(fetchImage).toHaveBeenCalledWith('https://example.com/cover.jpg');
        expect(saveImage).toHaveBeenCalledWith(model.id, imageBlob);
        expect(removeImage).toHaveBeenCalledWith('old-image-id');
        expect(model.meta.image).toEqual({ kind: 'url', url: 'https://example.com/cover.jpg' });
    });

    it('stores uploaded image blobs and references them by ID', async () => {
        const model = createHermidata(5);
        const file = new Blob(['cover'], { type: 'image/jpeg' });
        const saveImage = vi.spyOn(Storage, 'saveImage').mockResolvedValue(true);
        const removeImage = vi.spyOn(Storage, 'removeImage').mockResolvedValue(true);
        model.meta.image = { kind: 'stored', id: 'previous-image-id' };

        await model.SetImage(file);

        expect(saveImage).toHaveBeenCalledWith(model.id, file);
        expect(removeImage).toHaveBeenCalledWith('previous-image-id');
        expect(model.meta.image).toEqual({ kind: 'stored', id: model.id });
    });
});
