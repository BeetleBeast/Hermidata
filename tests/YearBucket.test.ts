


import { describe, it, expect, vi } from 'vitest'
import { SortLogic } from '../scripts/rss/build/SortLogic';
import { FilterLogic } from '../scripts/library/build/filterLogic';

vi.mock('../scripts/rss/build', () => ({
    RssBuild: class {},
}));

describe('getYearBucket', () => {
    it.each([
        [new Date().toISOString(), `${Math.floor(new Date().getFullYear() / 10) * 10}s`],
        ['2021-01-01', '2020s'],
        ['2020-01-01', '2020s'],
        ['2019-01-01', '2010s'],
    ])('getYearBucket(%s) → %s', (input, expected) => {
        const bucketState = { amountOfYearBuckets: 15, maxYearBuckets: 15 };
        const rssSort: SortLogic = Object.assign(Object.create(SortLogic.prototype), bucketState);
        const libraryFilter: FilterLogic = Object.assign(Object.create(FilterLogic.prototype), bucketState);

        expect(rssSort.getYearBucket(input)).toBe(expected);
        expect(libraryFilter.getYearBucket(input)).toBe(expected);
    });
});