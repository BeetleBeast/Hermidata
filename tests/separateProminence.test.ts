import { describe, expect, it } from 'vitest';
import { getSeparateProminence } from '../scripts/popup/core/separateProminence';
import type { SeparateProminenceState } from '../scripts/shared/types';

const matched: SeparateProminenceState = { hasSameTitled: true, declinedAll: false, exactMatch: false, typeChanged: false };

describe('getSeparateProminence', () => {
    it('hides the option when no saved item has this title', () => {
        expect(getSeparateProminence({ ...matched, hasSameTitled: false })).toBe('hidden');
    });

    it('keeps it nearly out of sight when the page is clearly the saved item', () => {
        expect(getSeparateProminence({ ...matched, exactMatch: true })).toBe('subtle');
    });

    it('shows it as a quiet link for a match that is not certain', () => {
        expect(getSeparateProminence(matched)).toBe('visible');
    });

    it('shows it clearly once the Type differs from the saved item, even on an exact match', () => {
        expect(getSeparateProminence({ ...matched, exactMatch: true, typeChanged: true })).toBe('visible');
    });

    it('makes it the main path when the user said the page is none of the saved items', () => {
        expect(getSeparateProminence({ ...matched, declinedAll: true })).toBe('primary');
        expect(getSeparateProminence({ ...matched, declinedAll: true, typeChanged: true })).toBe('primary');
    });
});
