/**
 * Converts a date (string, Date, or number) into a decade label bucket.
 * @param {string|Date|number} dateInput
 * @returns {string} decadeLabel
*/
export function getYearBucket(dateInput: string): string {
    if (!dateInput) return "Unknown";
    
    const dacade = createYearBucket(dateInput) ?? '';
    
    return dacade;
}
function createYearBucket(dateInput: string): string | void {
    const year = getYearNumber(dateInput)
    if (Number.isNaN(year)) return;

    const dacade = year.slice(0, -1).concat('0s');

    return dacade;
}

function getYearNumber(dateInput: string): string {
    const isISOString = !!new Date(dateInput)?.getHours();
    const splitDatum = dateInput.split('/')[2]
    return isISOString ? dateInput.split('-')[0] : splitDatum || new Date()?.toISOString().split('-')[0];
}




import { describe, it, expect } from 'vitest'

describe('getYearBucket', () => {
    it.each([
        ['New Date()', '2020s'],
        ['2021-01-01', '2020s'],
        ['2020-01-01', '2020s'],
        ['2019-01-01', '2010s'],
    ])('getYearBucket(%s) → %s', (input, expected) => {
            expect(getYearBucket(input)).toBe(expected)
        })
    })