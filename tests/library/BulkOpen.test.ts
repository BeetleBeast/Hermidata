import { describe, expect, it } from 'vitest';
import { BULK_OPEN_CONFIRM_THRESHOLD, bulkOpenSummary, collectOpenableUrls } from '../../scripts/library/build/bulkOpen';
import { HermidataModel } from '../../scripts/shared/utils/HermidataSelector';
import type { Hermidata } from '../../scripts/shared/types';

function createEntry(title: string, url: string): Hermidata {
    const item = HermidataModel.from('Manga', 'Viewing', 'Ongoing');
    item.title = title;
    item.SetUrl(url);
    return item.toJSON();
}

describe('collectOpenableUrls', () => {
    it('collects the reading url of every entry in order', () => {
        const entries = [createEntry('A', 'https://example.com/a/1'), createEntry('B', 'https://example.com/b/7')];

        expect(collectOpenableUrls(entries)).toEqual({ urls: ['https://example.com/a/1', 'https://example.com/b/7'], skipped: 0 });
    });

    it('skips entries without a url and counts them', () => {
        const entries = [createEntry('A', 'https://example.com/a/1'), createEntry('B', ''), createEntry('C', '')];

        expect(collectOpenableUrls(entries)).toEqual({ urls: ['https://example.com/a/1'], skipped: 2 });
    });

    it('has nothing to open for an empty selection', () => {
        expect(collectOpenableUrls([])).toEqual({ urls: [], skipped: 0 });
    });
});

describe('bulkOpenSummary', () => {
    it.each([
        [1, 0, 'Opened 1 tab.'],
        [3, 0, 'Opened 3 tabs.'],
        [3, 2, 'Opened 3 tabs. Skipped 2 without a link.'],
        [0, 2, 'Opened 0 tabs. Skipped 2 without a link.'],
    ])('bulkOpenSummary(%i, %i) → %s', (opened, skipped, expected) => {
        expect(bulkOpenSummary(opened, skipped)).toBe(expected);
    });
});

describe('BULK_OPEN_CONFIRM_THRESHOLD', () => {
    it('is a positive tab count', () => {
        expect(BULK_OPEN_CONFIRM_THRESHOLD).toBeGreaterThan(0);
    });
});
