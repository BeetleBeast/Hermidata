import { describe, expect, it } from 'vitest';
import { hasRealImage } from '../../scripts/shared/utils/ImageSource';

describe('hasRealImage', () => {
    it('is true for a stored image, and for a link that is not the placeholder icon', () => {
        expect(hasRealImage({ kind: 'stored', id: 'abc' })).toBe(true);
        expect(hasRealImage({ kind: 'url', url: 'https://example.com/cover.jpg' })).toBe(true);
    });

    it('is false for the placeholder icon, an empty link, or no image', () => {
        expect(hasRealImage({ kind: 'url', url: '../../../assets/icon/icon48.png' })).toBe(false);
        expect(hasRealImage({ kind: 'url', url: '' })).toBe(false);
        expect(hasRealImage(undefined)).toBe(false);
    });
});
