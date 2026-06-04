import type { Hermidata, RegexConfig, TrimmedTitle } from '../types/index';

export function getChapterFromTitle(title: string | undefined, url: string): number {
    if (!title) return Number.NaN;
    // Regex to find the first number (optionally after "chapter", "chap", "ch")
    const chapterNumberRegex = /(?:Episode|chapter|chap|ch)[-.\s]*?(\d+[A-Z]*)|(\d+[A-Z]*)/i;

    // create chapter based on URL
    const parts = url?.split("/") || [];
    const chapterPartV1 = new RegExp(/[\d.]+/).exec(parts.at(-1) ?? '')?.[0] || ''
    // create chapter based on title
    const titleParts = title?.split(/[-–—|:]/).map(p => p.trim());
    const chapterPartV2 = titleParts.find(p => /^\d+(\.\d+)?$/.test(p)) || '';
    // create chapter based on title regex
    const chapterPartV3 = (titleParts
    .find(p => chapterNumberRegex.test(p)) || ""
    ).replaceAll(/([A-Z])/gi, '').replaceAll(/[^\d.]/g, '').trim();
    // create chapter based on title regex & chapter keywords position
    const chapterKeywords = ['episode', 'chapter', 'chap', 'ch'];
    const chapterKeywordPattern = chapterKeywords.join('|');
    const chapterRemoveRegexV3 = new RegExp(
        String.raw`(\b\d{1,5}(?:\.\d+)?[A-Z]*\b\s*)?` + // group 1: optional leading number [ id 2]
        String.raw`(\b(?:${chapterKeywordPattern})\b\.?\s*)` + // group 2: keyword (required) [ id 1]
        String.raw`(\b\d{1,5}(?:\.\d+)?[A-Z]*\b)?`,         // group 3: optional trailing number [ id 3]
        'gi'
    );
    const chapterPartV4List = chapterRemoveRegexV3.exec(title) || '';
    const chapterPartV4 = chapterPartV4List[3] || chapterPartV4List[2] || '';
    // parse string to int
    const chapterNumberPartV1 = Number.parseFloat(chapterPartV1);
    const chapterNumberPartV2 = Number.parseFloat(chapterPartV2);
    const chapterNumberPartV3 = Number.parseFloat(chapterPartV3);
    const chapterNumberPartv4 = Number.parseFloat(chapterPartV4);

    const candidates = [chapterNumberPartv4, chapterNumberPartV2, chapterNumberPartV3, chapterNumberPartV1];
    return candidates.find(n => !Number.isNaN(n) && n >= 0) ?? Number.NaN;
}

export function getChapterFromTitleReturn(correctTitle: string, title: string, chapter: number | undefined, url: string): number {
    const isNotPartOfTitle = title?.replace(correctTitle, '');
    const finalChapter = url ? getChapterFromTitle(isNotPartOfTitle, url) : chapter;
    return isNotPartOfTitle ? finalChapter ?? Number.NaN : Number.NaN;
}


export function findByTitleOrAlt(title: string, allData: { [key: string]: Hermidata }): Hermidata | undefined {
    title = TrimTitle.trimTitle(title, '').title;
    return Object.values(allData).find(novel => 
        TrimTitle.trimTitle(novel.title, novel.url).title === title ||
        (novel.meta?.altTitles || []).some(t => TrimTitle.trimTitle(t, novel.url).title === title)
    );
}

export function returnHashedTitle(title: string, type: string, url: string = '', trimTitle: boolean = true) {
    const finalTitle = trimTitle ? TrimTitle.trimTitle(title, url).title : title;
    return type 
    ? simpleHash(`${type}:${finalTitle.toLowerCase()}`) // V2
    : simpleHash(finalTitle.toLowerCase()) // V1
}
export function returnBookmarkHash(bookmarkLabel: string) {
    return simpleHash(bookmarkLabel);
}
export function returnRawFeedHash(title: string, url: string) {
    return simpleHash(title + url);
}

export function simpleHash(str: string) {
    let hash = 0, i, chr;
    if (str.length === 0) return hash.toString();
    for (i = 0; i < str.length; i++) {
        chr = str.codePointAt(i)!;
        hash = ((hash << 5) - hash) + chr;
        hash = Math.trunc(hash); // Convert to 32bit integer
    }
    return hash.toString();
}

export function getTitleAndChapterFromUrl(url: string): { title: string | null, chapter: number } {
    if (!url) return { title: null, chapter: Number.NaN };
    if (!url.trim()) return { title: null, chapter: Number.NaN };
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const titleSlug = parts.includes('read') ? parts[parts.indexOf('read') + 1] : parts[2] || parts[1];
    if (!titleSlug) return { title: null, chapter: Number.NaN };
    const chapter = parts.at(-1)?.includes('chapter') ? Number.parseFloat(parts.at(-1)?.replace('chapter-', '') || '0') : Number.NaN;
    const potentialTitle = titleSlug
        .split('.')[0]             // remove Site's ID code (.yvov1)
        .replace(/(.)\1$/, '$1')   // Remove last char if second to last is the same
        // .split('-')[0]             // remove possible advert's 
        .replaceAll('-', ' ')        // hyphens to spaces
        .replaceAll(/\b\w/g, c => c.toUpperCase()); // capitalize words

        const isATitle = new RegExp(/^(?![A-Z0-9]+$).+/);

        const title = isATitle.test(potentialTitle) ? potentialTitle : null;

    return {
        title,
        chapter
    };
}

export class TrimTitle {
    
    private static CleanString(str: string) {
        if (!str) return "";

        const cleanString = str
        // Remove all control characters (C0 + C1), zero-width chars, and formatting chars
        .replaceAll(/[\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, '')
        // Normalize multiple spaces to a single space
        .replaceAll(/\s{2,}/g, ' ')
        .trim();

        return cleanString
    }
    private static extractDomainFromUrl(HermidataUrl: string): string {
        // Extract domain name from url
        const siteMatch = new RegExp(/:\/\/(?:www\.)?([^./]+)/i).exec(HermidataUrl);
        const siteName = siteMatch ? siteMatch[1] : "DummySite";

        return siteName
    }
    private static looksLikeTitleContinuation(prev: string, curr: string): boolean {
        // A real boundary segment tends to be short (site name, "Vol 3", "Chapter 2")
        // or starts with a known keyword. A continuation tends to be long prose.
        const SHORT_THRESHOLD = 30; // chars — tune as needed
        const chapterLike  = /^\s*(?:episode|chapter|chap|ch|vol|volume)[\s.]*\d+/i;
        const numberOnly   = /^\d+(\.\d+)?[A-Z]?$/i;

        // If either side is clearly chapter/volume info, it's a real boundary
        if (chapterLike.test(curr) || chapterLike.test(prev)) return false;
        if (numberOnly.test(curr)  || numberOnly.test(prev))  return false;

        // If the second part is very short it's probably a tag/label, not a continuation
        if (curr.length < SHORT_THRESHOLD) return false;

        // Both sides are long prose → continuation dash
        return true;
    }
    private static splitTitleByCommonSeparators(title: string): string[] {
        const cleanstring = TrimTitle.CleanString(title);

        // Split only on strong separators first (em-dash, pipe, colon, hash, comma)
        // Leave plain ' - ' for a second pass with smarter logic
        const strongSplit = cleanstring.split(/ (?:–|—|:|#|\|) /g).map(p => p.trim()).filter(Boolean);

        // Now handle ' - ' within each strong-split part
        const result: string[] = [];
        for (const part of strongSplit) {
            const dashParts = part.split(/ -+ /g).map(p => p.trim()).filter(Boolean);
            if (dashParts.length === 1) {
                result.push(part);
                continue;
            }
            // Merge adjacent parts if both look like title content (long, no keywords)
            const merged = [dashParts[0]];
            for (let i = 1; i < dashParts.length; i++) {
                const prev = merged[merged.length - 1];
                const curr = dashParts[i];
                if (TrimTitle.looksLikeTitleContinuation(prev, curr)) {
                    merged[merged.length - 1] = `${prev} - ${curr}`; // re-join
                } else {
                    merged.push(curr);
                }
            }
            result.push(...merged);
        }
        return result;
    }
    private static setRegexConfig(siteName: string): RegexConfig {
        // Keep words lowercase; the /gi flag handles case-insensitive matching.
        const chapterKeywords = ['episode', 'chapter', 'chap', 'ch', 'vol', 'volume'];
        const chapterKeywordPattern = chapterKeywords.join('|');

        const junkKeyWords = ['all page', 'bin', 'page'];
        const junkKeywordPattern = junkKeyWords.join('|');

        const keyword = ['manga', 'novel', 'anime', 'tv-series', 'comic', 'webtoon', 'ln'];
        const keywordPattern = keyword.join('|');

        /**
         * Matches a full chapter reference, including optional leading/trailing numbers.
         * Examples matched:  "Chapter 3"  "12 Chapter 3A"  "ch.4"  "Episode 10"
         *
         * Group 1 — optional number BEFORE the keyword  (e.g. "12 ")
         * Group 2 — the keyword itself                  (e.g. "Chapter")
         * Group 3 — optional number AFTER the keyword   (e.g. "3A")
         */
        const chapterRemoveRegexV3 = new RegExp(
        String.raw`(\b\d{1,5}(?:\.\d+)?[A-Z]*\b\s*)?` + // group 1: optional leading number
        String.raw`(\b(?:${chapterKeywordPattern})\b\.?\s*)` + // group 2: keyword (required)
        String.raw`(\b\d{1,5}(?:\.\d+)?[A-Z]*\b)?`,         // group 3: optional trailing number
        'gi'
        );

        /**
         * Matches a chapter keyword + number (no leading number group).
         * Used when stripping chapter info from a secondary title part.
         * Examples: "Chapter 3"  "ch.4B"  "Episode 12"
         */
        const chapterRegex = new RegExp( String.raw`\b(?:${chapterKeywordPattern})\.?\s*\d+[A-Z]*`, 'gi' );
    
        // Regex for "read online"
        // Matches ONLY bare "read online" / "read now" with no embedded title content
        // const readRegex = /^\s*read(\s+\w+)*(\s*online)?\s*$/i;
        const readRegex = /^\s*read(\s+online|\s+now)?\s*$/i;

        // Regex for "novel bin"
        const junkRegex = new RegExp(String.raw`\b(${junkKeywordPattern})\b`, 'i');

        const startRemoveSiteNameKeywords = String.raw`^\s*(${keywordPattern})\b\s*`;
        const endRemoveSiteNameKeywords = String.raw`\s*\b(${keywordPattern})\s*$`;

        const cleanTitleKeywordStart = new RegExp(startRemoveSiteNameKeywords, 'i');
        const cleanTitleKeywordEnd   = new RegExp(endRemoveSiteNameKeywords, 'i');
        
        const stripReadOnline = /^\s*read\s+(.+?)\s+online\s*$/i;

        const siteNameRegex = new RegExp(String.raw`\b${siteName}\b`, 'i');
        const flexibleSiteNameRegex = new RegExp(String.raw`\b${siteName
            .replaceAll(/[-/\\^$*+?.()|[\]{}]/g, "").split("")
            .map(ch => ch.replace(/\s+/, ""))
            .map(ch => String.raw`${ch}[\s._-]*`)
            .join("")}\b`, 'i');

        return {
            chapterRemoveRegexV3,
            chapterRegex,
            readRegex,
            junkRegex,
            siteNameRegex,
            flexibleSiteNameRegex,
            cleanTitleKeywordEnd,
            cleanTitleKeywordStart,
            stripReadOnline
        }
    }
    private static removeJunkAndSiteName(parts: string[], regexUsed: RegexConfig) {
        let filtered = parts
            .map(p => {
                const m = regexUsed.stripReadOnline.exec(p);
                return m ? m[1] : p; // if it matches "read X online", keep "X"
            })
            .filter(p => !regexUsed.readRegex.test(p))
            .filter(p => !regexUsed.junkRegex.test(p))
            .filter(p => !regexUsed.siteNameRegex.test(p))
            .filter(p => !regexUsed.flexibleSiteNameRegex.test(p))
            .map(p => p.replace(regexUsed.cleanTitleKeywordStart, '').replace(regexUsed.cleanTitleKeywordEnd, '').trim())
            .map(p => p.replace(/^[\s:;,\-–—|]+/, "").trim()) // remove leading punctuation + spaces
            .map(p => p.replace('#', ' ').trim()) // remove any '#' characters
            .map(p => p.replace('／', " ").trim()) // remove trailing punctuation + spaces
            .map(p => p.replace('•', " ").trim()) // remove trailing punctuation + spaces
            .filter(Boolean)

        // Remove duplicates
        filtered = filtered.filter((item, index, array) => array.findIndex(i => i.toLowerCase() === item.toLowerCase()) === index );

        return filtered
    }
    private static extractChapterInfo(HermidataUrl: string): string {
        // Extract main title (remove chapter info)
        const Url_filter_parts = HermidataUrl.split('/')
        const Url_filter = Url_filter_parts.at(-1)?.replaceAll('-',' ').toLowerCase().trim() || '';
        return Url_filter
    }

    private static makeTitle(filter: string[], regexUsed: RegexConfig, HermidataUrl: string): TrimmedTitle | null {
        if (!filter.length) return null;
        let finalTrimmedTitle: TrimmedTitle | undefined;
        const filtered = filter;

        const Url_filter = TrimTitle.extractChapterInfo(HermidataUrl);

        let mainTitle = '';
        // Edge case: if first looks like "chapter info" but second looks like a real title → swap them
        const isChapterLike = (s: string) => /^\s*(chapter|ch\.?)\s*\d+/i.test(s);

        const isSpecialMarker = (s: string) => /^\s*(prologue|epilogue|interlude|extra|bonus|side\s*story|omake)\b/i.test(s);

        const isSubTitle = (s: string) => isChapterLike(s) || isSpecialMarker(s);
        if (
            filter.length > 1 &&
            isSubTitle(filter[0]) &&   // first part looks like a subtitle
            !isSubTitle(filter[1])     // second part looks like a real title
        ) {
            [filter[0], filter[1]] = [filter[1], filter[0]]; // swap
        }
        // if first el is chapter info place it at the end
        if (filtered[0]?.replaceAll(/\s*([–—-]|:|#|\|)\s*/g,' ').toLowerCase() === Url_filter) {// flip the first to last
            filter.push(filter[0]);
            filter.shift();
        }
        // early strip first string if its a leading number
        if (/^\d{1,4}(?:\.\d+)?$/.test(filter[0])) return TrimTitle.makeTitle(filter.slice(1), regexUsed, HermidataUrl);

        mainTitle = filter[0]
        .replace(regexUsed.chapterRemoveRegexV3, '').trim() // remove optional leading/trailing numbers (int/float + optional letter) & remove the "chapter/chap/ch" part
        .replace(/^\d{1,4}(?:\.\d+)?\s+(?=[A-Za-z\u3040-\u9FFF])/, '') // remove leading numbers if followed by text (to catch cases like "12 Monkeys" where "12" is not a chapter number)
        .replace(/^[\s:;,\-–—|]+/, "").trim() // remove leading punctuation + spaces
        .replace(/[:;,\-–—|]+$/,"") // remove trailing punctuation
        .trim();
        if(mainTitle === '' ) return TrimTitle.makeTitle(filter.slice(1), regexUsed, HermidataUrl);
        
        if (filter.length < 2) {
            finalTrimmedTitle = { title: mainTitle };
            return finalTrimmedTitle;
        }
        let Chapter_Title = filter[1]
        .replace(regexUsed.chapterRegex, '').trim() // remove 'chapter' and any variation
        .replaceAll(/\b\d+(\.\d+)?\b/g, "") // remove numbers
        .replace(/^[\s:;,\-–—|]+/, "").trim() // remove leading punctuation + spaces
        .replace(/[:;,\-–—|]+$/,"") // remove trailing punctuation
        .trim();
        if (Chapter_Title === '' && filter.length == 2) {
            finalTrimmedTitle = { title: mainTitle };
            return finalTrimmedTitle;
        }
        if (Chapter_Title === '') {
            finalTrimmedTitle = { title: mainTitle };
            return finalTrimmedTitle;
        }
        finalTrimmedTitle = { title: mainTitle, note: `Chapter Title: ${Chapter_Title}` };
        return finalTrimmedTitle;
    }
    private static TakeLongestPartsBackup(parts: string[], regexUsed: RegexConfig, HermidataUrl: string): TrimmedTitle | null {
        return TrimTitle.makeTitle(parts // pre-filter parts
                .filter(p => !regexUsed.siteNameRegex.test(p) && !regexUsed.flexibleSiteNameRegex.test(p))
                .sort((a, b) => b.length - a.length)       // longest first = most likely the real title
                .slice(0, 1),
            regexUsed,
            HermidataUrl
        );
    }

    public static trimTitle(title: string, HermidataUrl: string): TrimmedTitle {
        if (!title) return {title: '', note: ''};

        // --- Site name ---
        const siteName = TrimTitle.extractDomainFromUrl(HermidataUrl);
        
        // --- Regex config ---
        const regexUsed: RegexConfig = TrimTitle.setRegexConfig(siteName);

        // spilt title
        const parts = TrimTitle.splitTitleByCommonSeparators(title);
        
        // Remove junk and site name
        const filtered = TrimTitle.removeJunkAndSiteName(parts, regexUsed);

        // make title and note. 
        // If no title is found, try to take longest parts as backup
        const trimmedTitleOnly = TrimTitle.makeTitle(filtered, regexUsed, HermidataUrl) ?? TrimTitle.TakeLongestPartsBackup(parts, regexUsed, HermidataUrl);

        const trimmedTitle: TrimmedTitle = {
            title: trimmedTitleOnly?.title.trim() || title,
            note: trimmedTitleOnly?.note || ''
        }

        return trimmedTitle;
    }
}