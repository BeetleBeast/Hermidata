import { describe, it, expect } from 'vitest';
import {
    getChapterFromTitle,
    getChapterFromUrl,
    detectChapter,
    getTitleAndChapterFromUrl,
} from '../scripts/shared/utils/StringOutput';

const OPAQUE_ULID = 'https://weebcentral.com/chapters/01KHYAF03QVF3MSD15Z2861F8Q';

// ---------------------------------------------------------------------------
// 1. getChapterFromUrl: accepted (55 tests incl. rejected below)
// ---------------------------------------------------------------------------
describe('getChapterFromUrl: accepts numbers backed by a chapter word', () => {
    it.each<[string, string]>([
        // basic slug shapes
        ['https://example.com/series/chapter-154', '154'],
        ['https://example.com/series/chapter-154/', '154'],              // trailing slash
        ['https://example.com/series/chapter-154?page=2', '154'],        // query string
        ['https://example.com/series/chapter-154#comments', '154'],      // hash
        ['https://example.com/series/chapter-154.html', '154'],          // extension
        ['https://example.com/series/Chapter-154', '154'],               // uppercase
        ['https://example.com/series/chapter%20154', '154'],             // encoded space
        ['https://example.com/series/chapter_154', '154'],               // underscore
        ['https://example.com/series/chapter154', '154'],                // attached
        // keyword variants
        ['https://example.com/series/ch12', '12'],
        ['https://example.com/series/ch-12', '12'],
        ['https://example.com/series/ep-7', '7'],
        ['https://example.com/series/ep7', '7'],
        ['https://example.com/series/eps-3', '3'],
        ['https://example.com/series/episode-7', '7'],
        ['https://example.com/series/chapitre-8', '8'],
        ['https://example.com/series/capitulo-9', '9'],
        ['https://example.com/series/kapitel-2', '2'],
        ['https://example.com/series/bab-4', '4'],
        ['https://example.com/series/chuong-20', '20'],
        ['https://example.com/series/capitolo-6', '6'],
        ['https://example.com/series/cap-5', '5'],
        // numbers
        ['https://example.com/series/chapter-10.5', '10.5'],
        ['https://example.com/series/chapter-10.5.html', '10.5'],
        ['https://example.com/series/chapter-12345', '12345'],           // max 5 digits
        ['https://example.com/series/chapter-10-5', '10'],               // documents: no "10-5" decimals
        // keyword in the previous segment, number is the whole last segment
        ['https://example.com/chapter/154', '154'],
        ['https://example.com/chapters/154', '154'],
        ['https://example.com/ch/12', '12'],
        ['https://example.com/episode/3', '3'],
        ['https://example.com/chapter/10.5', '10.5'],
        // other digits in the slug must not confuse it
        ['https://example.com/read/tower-of-god-2-chapter-30', '30'],
        ['https://example.com/read/volume-3-chapter-12', '12'],
        ['https://example.com/read/page-3-chapter-12', '12'],
        ['https://example.com/read/chapter-5-page-3', '5'],
        ['https://example.com/read/one-piece-chapter-1100', '1100'],
    ])('%s -> %s', (url, expected) => {
        expect(getChapterFromUrl(url)).toBe(expected);
    });
});

// ---------------------------------------------------------------------------
// 2. getChapterFromUrl: rejected
// ---------------------------------------------------------------------------
describe('getChapterFromUrl: rejects numbers with no chapter evidence', () => {
    it.each<[string]>([
        [OPAQUE_ULID],                                            // opaque ID
        ['https://example.com/series/reader-154-page-3'],         // incidental numbers
        ['https://example.com/chapters/9817342'],                 // keyword, but 7-digit DB id
        ['https://example.com/series/chapter-123456'],            // 6 digits
        ['https://example.com/series/abc/154'],                   // bare number, no keyword
        ['https://example.com/series/much-12'],                   // "ch" inside a word
        ['https://example.com/series/step-7'],                    // "ep" inside a word
        ['https://example.com/series/recap-5'],                   // "cap" inside a word
        ['https://example.com/series/volume-3'],                  // volume is not a chapter
        ['https://example.com/series/vol-3'],
        ['https://example.com/series/page-3'],
        ['https://example.com/'],                                 // no path
        [''],                                                     // empty
        ['not a url'],                                            // not parseable
        ['https://example.com/154'],                              // bare number, no previous segment
        ['https://example.com/series/154'],                       // previous segment is not a keyword
        ['https://example.com/chapters/abc-154'],                 // keyword segment, but slug is not a pure number
        ['https://example.com/chapter/a1b2c3'],                   // mixed letters and digits
        ['https://example.com/chapter-5/page-2'],                 // only the LAST segment is read
    ])('%s -> ""', (url) => {
        expect(getChapterFromUrl(url)).toBe('');
    });
});

// ---------------------------------------------------------------------------
// 3. detectChapter: value AND which rule produced it
// ---------------------------------------------------------------------------
describe('detectChapter: value and source', () => {
    const plain = 'https://example.com/x';

    it.each<[string, string, number, string]>([
        // title keyword (highest trust)
        ['Series - Chapter 12', 'https://example.com/chapters/9817342', 12, 'titleKeyword'],
        ['Series Chapter 12', 'https://example.com/series/chapter-99', 12, 'titleKeyword'], // beats URL
        ['Series - Chapter 12 - Title Name', plain, 12, 'titleKeyword'],
        ['Series Chapter 0', plain, 0, 'titleKeyword'],                  // zero is valid
        ['Series Chapter 10.5', plain, 10.5, 'titleKeyword'],
        ['SERIES CHAPTER 7', plain, 7, 'titleKeyword'],                  // case-insensitive
        ['Series Ch.12', plain, 12, 'titleKeyword'],
        ['Series Chap 7', plain, 7, 'titleKeyword'],
        ['Show Episode 8', plain, 8, 'titleKeyword'],
        ['Series Volume 3 Chapter 12', plain, 12, 'titleKeyword'],       // volume ignored
        ['Re:Zero 2nd Season Chapter 5', plain, 5, 'titleKeyword'],      // other numbers ignored
        ['Series Ｃｈａｐｔｅｒ １２', plain, 12, 'titleKeyword'],        // full-width via NFKC
        // title segment that is only a number
        ['Series - 45', plain, 45, 'titleSegment'],
        ['Series | 45', plain, 45, 'titleSegment'],
        ['Series – 45.5', plain, 45.5, 'titleSegment'],                  // en dash
        ['Series 2 - 45', plain, 45, 'titleSegment'],
        ['Series - 45', 'https://example.com/series/chapter-99', 45, 'titleSegment'], // beats URL
        // URL keyword
        ['Series', 'https://example.com/series/chapter-154', 154, 'urlKeyword'],
        ['Overlord 2', 'https://example.com/series/chapter-30', 30, 'urlKeyword'],    // beats lone title number
        // lone number in the title (lowest trust)
        ['Overlord 2', plain, 2, 'titleSingleNumber'],
        ['Series 第五話', plain, 5, 'titleSingleNumber'],                  // CJK numerals
        ['Series 第十二話', plain, 12, 'titleSingleNumber'],
        ['Series 第二十三話', plain, 23, 'titleSingleNumber'],
        // nothing trustworthy
        ['Overlord 2 Season 3', plain, Number.NaN, 'none'],              // ambiguous: two numbers
        ['Series', OPAQUE_ULID, Number.NaN, 'none'],
        ['Series', 'https://example.com/series/reader-154-page-3', Number.NaN, 'none'],
        // missing title
        ['', 'https://example.com/series/chapter-154', Number.NaN, 'none'],
    ])('%s | %s -> %s (%s)', (title, url, chapter, source) => {
        const result = detectChapter(title, url);
        expect(result.chapter).toBe(chapter);
        expect(result.source).toBe(source);
    });

    it('returns NaN/none when the title is undefined, even with a chapter URL (current behaviour)', () => {
        expect(detectChapter(undefined, 'https://example.com/series/chapter-154'))
            .toEqual({ chapter: Number.NaN, source: 'none' });
    });
});

// ---------------------------------------------------------------------------
// 4. getChapterFromTitle: your original suite + wrapper behaviour
// ---------------------------------------------------------------------------
describe('getChapterFromTitle URL chapter detection', () => {
    it('prefers an explicit chapter in the title over unrelated URL digits', () => {
        expect(getChapterFromTitle('Series - Chapter 12', 'https://example.com/chapters/9817342')).toBe(12);
    });

    it('detects a chapter from a structured chapter URL', () => {
        expect(getChapterFromTitle('Series', 'https://example.com/series/chapter-154')).toBe(154);
    });

    it('does not interpret the leading digits of an opaque chapter ID as the chapter', () => {
        expect(getChapterFromTitle('Series', OPAQUE_ULID)).toBeNaN();
    });

    it('does not interpret incidental numbers in an opaque URL segment as the chapter', () => {
        expect(getChapterFromTitle('Series', 'https://example.com/series/reader-154-page-3')).toBeNaN();
    });

    it('returns the same number as detectChapter', () => {
        const url = 'https://example.com/series/chapter-154';
        expect(getChapterFromTitle('Series', url)).toBe(detectChapter('Series', url).chapter);
    });
});

// ---------------------------------------------------------------------------
// 5. getTitleAndChapterFromUrl: now uses getChapterFromUrl
// ---------------------------------------------------------------------------
describe('getTitleAndChapterFromUrl', () => {
    it('reads title and chapter from a structured URL', () => {
        expect(getTitleAndChapterFromUrl('https://example.com/series/my-series/chapter-5'))
            .toEqual({ title: 'My Series', chapter: 5 });
    });

    it('keeps decimal chapters', () => {
        expect(getTitleAndChapterFromUrl('https://example.com/series/my-series/chapter-10.5').chapter).toBe(10.5);
    });

    it('returns no title and NaN for an opaque chapter ID', () => {
        expect(getTitleAndChapterFromUrl(OPAQUE_ULID)).toEqual({ title: null, chapter: Number.NaN });
    });

    it('returns no title and NaN for an empty URL', () => {
        expect(getTitleAndChapterFromUrl('')).toEqual({ title: null, chapter: Number.NaN });
    });
});

// ---------------------------------------------------------------------------
// 6. Placeholders for the next step (per-site learned rule)
// ---------------------------------------------------------------------------
describe('learned per-site rule (not implemented yet)', () => {
    it.todo('uses the stored position for a domain instead of the keyword heuristics');
    it.todo('reports source "learnedRule" when a stored rule produced the chapter');
    it.todo('falls back to the heuristics when the stored position no longer yields a number');
    it.todo('does not apply one domain\'s rule to a different domain');
});