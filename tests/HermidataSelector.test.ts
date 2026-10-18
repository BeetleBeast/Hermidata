import { describe, expect, it, vi } from 'vitest';
import { HermidataModel } from '../scripts/shared/utils/HermidataSelector';
import { PastHermidata } from '../scripts/popup/core/Past';

function createHermidata(chapter: number, history: { chapter: number; at: string }[] = [], withRss = true): HermidataModel {
    const hermidata = HermidataModel.from('Manga', 'Viewing', 'Ongoing');
    hermidata.title = 'Series';
    hermidata.SetUrl('https://example.com/series/chapter-12');
    hermidata.SetChapter(chapter);
    hermidata.SetHistory(history);
    if (withRss) {
        hermidata.rss = {
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
        };
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
});
