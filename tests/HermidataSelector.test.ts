import { describe, expect, it, vi } from 'vitest';
import { HermidataModel } from '../scripts/shared/utils/HermidataSelector';
import { PastHermidata } from '../scripts/popup/core/Past';

function createHermidata(chapter: number, history: { chapter: number; at: string }[] = []): HermidataModel {
    const hermidata = HermidataModel.from('Manga', 'Viewing', 'Ongoing');
    hermidata.title = 'Series';
    hermidata.SetUrl('https://example.com/series/chapter-12');
    hermidata.SetChapter(chapter);
    hermidata.SetHistory(history);
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
    it('preserves the saved read chapter when history is empty', async () => {
        const saved = createHermidata(5);
        const merged = await mergeSavedHermidata(saved, 12);

        expect(merged.GetChapter()).toBe(12);
        expect(merged.GetLatestReadChapter()).toBe(5);
    });

    it('does not replace existing read history with the active tab chapter', async () => {
        const saved = createHermidata(5, [
            { chapter: 4, at: '2025-01-01T00:00:00Z' },
            { chapter: 5, at: '2025-01-02T00:00:00Z' },
        ]);
        const merged = await mergeSavedHermidata(saved, 12);

        expect(merged.GetChapter()).toBe(12);
        expect(merged.GetLatestReadChapter()).toBe(5);
        expect(merged.GetHistory()).toHaveLength(2);
    });
});
