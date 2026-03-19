import { ext } from '../shared/BrowserCompat';
import { getElement, setElement } from '../utils/Selection';
import type { Hermidata, RegexConfig, TrimmedTitle } from './types/type';

export function getChapterFromTitle(title: string, url: string): number {
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
    // If no chapter found, use empty string
    // parse string to int
    const chapterNumberPartV1 = Number.parseFloat(chapterPartV1);
    const chapterNumberPartV2 = Number.parseFloat(chapterPartV2);
    const chapterNumberPartV3 = Number.parseFloat(chapterPartV3);
    return chapterNumberPartV2 || chapterNumberPartV3 || Number.NaN;
}

export function getChapterFromTitleReturn(correctTitle: string, title: string, chapter: number | undefined, url: string) {
    const isNotPartOfTitle = title?.replace(correctTitle, '');
    const finalChapter = url ? getChapterFromTitle(isNotPartOfTitle, url) : chapter;
    return isNotPartOfTitle ? finalChapter : '';
}
// input
// HermidataV3.chapter.current = getChapterFromTitleReturn(HermidataV3.title, HermidataNeededKeys.Page_Title, HermidataV3.chapter.current, HermidataV3.url) || HermidataV3.chapter.current;


// Get GoogleSheet URL
export function getGoogleSheetURL(): Promise<string> {
    return new Promise((resolve, reject) => {
        try {
            ext.storage.sync.get(["spreadsheetUrl"], (result: any) => {
                let url = result?.spreadsheetUrl?.trim();
                if (url && isValidGoogleSheetUrl(url)) return resolve(url);
                return sheetUrlInput(resolve, reject);
            });
        } catch (error) {
            console.error('Extention error inside getGoogleSheetURL: ',error)
        }
    });
}

export function isValidGoogleSheetUrl(url: string) {
    return /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+/.test(url);
}

export function sheetUrlInput(resolve: (url: string) => void, reject: (error: Error) => void) {
    setElement("#spreadsheetPrompt", el => el.style.display = "block");
    // document.getElementById('body').style.display = 'none';
    const saveBtn = getElement("#saveSheetUrlBtn");
    if (!saveBtn) return;
    saveBtn.onclick = () => {
        const url = getElement<HTMLInputElement>("#sheetUrlInput")?.value.trim();
        if (!url) return reject(new Error("Please enter a valid URL."));
        if (!isValidGoogleSheetUrl(url)) return reject(new Error("Invalid URL format."));
        try {
            ext.storage.sync.set({ spreadsheetUrl: url }, () => {
                setElement("#spreadsheetPrompt", el => el.style.display = "none")
                setElement("#body", el => el.style.display = 'block');
                return resolve(url)
            });
        } catch (error) {
            console.error('Extention error inside sheetUrlInput: ',error)
        }
    };
}

export function findByTitleOrAltV2(title: string, allData: { [key: string]: Hermidata }) {
    title = TrimTitle.trimTitle(title, '').title;
    return Object.values(allData).find(novel => 
        TrimTitle.trimTitle(novel.title, novel.url).title === title ||
        (novel.meta?.altTitles || []).some(t => TrimTitle.trimTitle(t, novel.url).title === title)
    );
}

export function returnHashedTitle(title: string, type: string, url: string = '' ) {
    return type 
    ? simpleHash(`${type}:${TrimTitle.trimTitle(title, url).title.toLowerCase()}`) // V2
    : simpleHash(TrimTitle.trimTitle(title, url).title.toLowerCase()) // V1
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
        const siteName = siteMatch ? siteMatch[1] : "";

        return siteName
    }
    private static splitTitleByCommonSeparators(title: string): string[] {
        // Split title by common separators
        const cleanstring = this.CleanString(title);
        const parts = cleanstring.split(/ (?:(?:-+)|–|-|:|#|—|,|\|) /g).map(p => p.trim()).filter(Boolean);
        return parts
    }
    private static setRegexConfig(siteName: string): RegexConfig {
        // Keep words lowercase; the /gi flag handles case-insensitive matching.
        const chapterKeywords = ['episode', 'chapter', 'chap', 'ch'];
        const chapterKeywordPattern = chapterKeywords.join('|');

        const junkKeyWords = ['all page', 'novel', 'bin', 'online'];
        const junkKeywordPattern = junkKeyWords.join('|');

        const keyword = ['manga', 'novel', 'anime', 'tv-series'];
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
        String.raw`(\b\d{1,4}(?:\.\d+)?[A-Z]*\b\s*)?` + // group 1: optional leading number
        String.raw`(\b(?:${chapterKeywordPattern})\b\.?\s*)` + // group 2: keyword (required)
        String.raw`(\b\d{1,4}(?:\.\d+)?[A-Z]*\b)?`,         // group 3: optional trailing number
        'gi'
        );

        /**
         * Matches a chapter keyword + number (no leading number group).
         * Used when stripping chapter info from a secondary title part.
         * Examples: "Chapter 3"  "ch.4B"  "Episode 12"
         */
        const chapterRegex = new RegExp( String.raw`\b(?:${chapterKeywordPattern})\.?\s*\d+[A-Z]*`, 'gi' );
    
        // Regex for "read online"
        const readRegex = /^\s*read(\s+\w+)*(\s*online)?\s*$/i;
        // Regex for "novel bin"
        const junkRegex = new RegExp(String.raw`\b(${junkKeywordPattern})\b`, 'i');

        const startRemoveSiteNameKeywords = String.raw`^\s*(${keywordPattern})\b\s*`;
        const endRemoveSiteNameKeywords = String.raw`\s*\b(${keywordPattern})\s*$`;

        const cleanTitleKeywordStart = new RegExp(startRemoveSiteNameKeywords, 'i');
        const cleanTitleKeywordEnd   = new RegExp(endRemoveSiteNameKeywords, 'i');
            

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
            cleanTitleKeywordStart
        }
    }
    private static removeJunkAndSiteName(parts: string[], regexUsed: RegexConfig) {
        let filtered = parts
            .filter(p => !regexUsed.readRegex.test(p))
            .filter(p => !regexUsed.junkRegex.test(p))
            .filter(p => !regexUsed.siteNameRegex.test(p))
            .filter(p => !regexUsed.flexibleSiteNameRegex.test(p))
            .map(p => p.replace(regexUsed.cleanTitleKeywordStart, '').replace(regexUsed.cleanTitleKeywordEnd, '').trim())
            .map(p => p.replace(/^[\s:;,\-–—|]+/, "").trim()) // remove leading punctuation + spaces
            .map(p => p.replace('#', '').trim()) // remove any '#' characters
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

        const Url_filter = this.extractChapterInfo(HermidataUrl);

        let mainTitle = '';
        // Edge case: if first looks like "chapter info" but second looks like a real title → swap them
        if (
            filter.length > 1 &&
            /^\s*(chapter|ch\.?)\s*\d+/i.test(filter[0]) && // first is chapter info
            !/^\s*(chapter|ch\.?)\s*\d+/i.test(filter[1])   // second is NOT chapter info
        ) {
            [filter[0], filter[1]] = [filter[1], filter[0]]; // swap
        }
        // if first el is chapter info place it at the end
        if (filtered[0]?.replaceAll(/\s*([–—-]|:|#|\|)\s*/g,' ').toLowerCase() === Url_filter) {// flip the first to last
            filter.push(filter[0]);
            filter.shift();
        }

        mainTitle = filter[0]
        .replace(regexUsed.chapterRemoveRegexV3, '').trim() // remove optional leading/trailing numbers (int/float + optional letter) & remove the "chapter/chap/ch" part
        .replace(/^\d{1,4}(?:\.\d+)?\s*/, '') // strip stray leading chapter number // TODO: check if this is needed
        .replace(/^[\s:;,\-–—|]+/, "").trim() // remove leading punctuation + spaces
        .replace(/[:;,\-–—|]+$/,"") // remove trailing punctuation
        .trim();
        if(mainTitle === '' ) return this.makeTitle(filter.slice(1), regexUsed, HermidataUrl);
        
        if (filter.length < 2) {
            finalTrimmedTitle = { title: mainTitle };
            return finalTrimmedTitle;
        }
        let Chapter_Title = filter[1]
        .replace(regexUsed.chapterRegex, '').trim() // remove 'chapter' and any variation
        .replaceAll(/\b\d+(\.\d+)?\b/g, "") // remove numbers
        .replace(/^[\s:;,.\-–—|]+/, "").trim() // remove leading punctuation + spaces
        .replace(/[:;,.\-–—|]+$/,"") // remove trailing punctuation
        .trim();

        if (Chapter_Title === '' && filter.length == 2) {
            finalTrimmedTitle = { title: mainTitle };
            return finalTrimmedTitle;
        }
        if (Chapter_Title === '') {
            finalTrimmedTitle = { title: `${mainTitle} ${this.makeTitle(filter.slice(1), regexUsed, HermidataUrl)}` };
            return finalTrimmedTitle;
        }
        finalTrimmedTitle = { title: mainTitle, note: `Chapter Title: ${Chapter_Title}` };
        return finalTrimmedTitle;
    }

    public static trimTitle(title: string, HermidataUrl: string): TrimmedTitle {
        if (!title) return {title: '', note: ''};


        const siteName = this.extractDomainFromUrl(HermidataUrl)
    
        const parts = this.splitTitleByCommonSeparators(title);
        
        // examples
        // "Chapter 222: Illythia's Mission - The Wandering Fairy [LitRPG World-Hopping] | Royal Road"

        // --- Regex config ---
        const regexUsed: RegexConfig = this.setRegexConfig(siteName);

        // Remove junk and site name
        // can return an empty array wich causes makeTitle to return null
        const filtered = this.removeJunkAndSiteName(parts, regexUsed);

        const trimmedTitleOnly = this.makeTitle(filtered, regexUsed, HermidataUrl);
        
        const trimmedTitle: TrimmedTitle = {
            title: trimmedTitleOnly?.title.trim() || title,
            note: trimmedTitleOnly?.note || ''
        }

        return trimmedTitle;
    }
}