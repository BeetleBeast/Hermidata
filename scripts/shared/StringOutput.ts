import { ext } from '../shared/BrowserCompat';
import { getElement } from '../utils/Selection';
import type { RegexConfig, TrimmedTitle } from './types/type';

export function getChapterFromTitle(title: string, url: string): number {
    // Regex to find the first number (optionally after "chapter", "chap", "ch")
    const chapterNumberRegex = /(?:Episode|chapter|chap|ch)[-.\s]*?(\d+[A-Z]*)|(\d+[A-Z]*)/i;

    // create chapter based on URL
    const parts = url?.split("/") || [];
    const chapterPartV1 = parts.at(-1)?.match(/[\d.]+/)?.[0] || ''
    // create chapter based on title
    const titleParts = title?.split(/[-–—|:]/).map(p => p.trim());
    const chapterPartV2 = titleParts.find(p => /^\d+(\.\d+)?$/.test(p)) || '';
    // create chapter based on title regex
    const chapterPartV3 = (titleParts
    .find(p => chapterNumberRegex.test(p)) || ""
    ).replace(/([A-Z])/gi, '').replace(/[^\d.]/g, '').trim();
    // If no chapter found, use empty string
    // parse string to int
    const chapterNumberPartV1 = parseFloat(chapterPartV1);
    const chapterNumberPartV2 = parseFloat(chapterPartV2);
    const chapterNumberPartV3 = parseFloat(chapterPartV3);
    return chapterNumberPartV2 || chapterNumberPartV3 || Number.NaN;
}

// Get GoogleSheet URL
export function getGoogleSheetURL() {
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
    getElement("#spreadsheetPrompt").style.display = "block";
    // document.getElementById('body').style.display = 'none';
    const saveBtn = getElement("#saveSheetUrlBtn");
    saveBtn.onclick = () => {
        const url = getElement<HTMLInputElement>("#sheetUrlInput").value.trim();
        if (!isValidGoogleSheetUrl(url)) return reject(new Error("Invalid URL format."));
        try {
            ext.storage.sync.set({ spreadsheetUrl: url }, () => {
                getElement("#spreadsheetPrompt").style.display = "none";
                getElement('#body').style.display = 'block';
                return resolve(url)
            });
        } catch (error) {
            console.error('Extention error inside sheetUrlInput: ',error)
        }
    };
}


export class TrimTitle {

    private static title: string;

    private static HermidataUrl: string;

    private static HermidataNotes: string | null;
    
    private static CleanString(str: string) {
        if (!str) return "";

        const cleanString = str
        // Remove all control characters (C0 + C1), zero-width chars, and formatting chars
        .replace(/[\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, '')
        // Normalize multiple spaces to a single space
        .replace(/\s{2,}/g, ' ')
        .trim();

        return cleanString
    }
    private static extractDomainFromUrl(): string {
        // Extract domain name from url
        const siteMatch = new RegExp(/:\/\/(?:www\.)?([^./]+)/i).exec(this.HermidataUrl);
        const siteName = siteMatch ? siteMatch[1] : "";

        return siteName
    }
    private static splitTitleByCommonSeparators(title: string): string[] {
        // Split title by common separators
        let cleanstring = this.CleanString(title);
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
        `(\\b\\d{1,4}(?:\\.\\d+)?[A-Z]*\\b\\s*)?` + // group 1: optional leading number
        `(\\b(?:${chapterKeywordPattern})\\b\\.?\\s*)` + // group 2: keyword (required)
        `(\\b\\d{1,4}(?:\\.\\d+)?[A-Z]*\\b)?`,         // group 3: optional trailing number
        'gi'
        );

        // old regex remove if needed
        const chapterRemoveRegexV2 = /(\b\d{1,4}(?:\.\d+)?[A-Z]*\b\s*)?(\b(?:Episode|chapter|chap|ch)\b\.?\s*)(\b\d{1,4}(?:\.\d+)?[A-Z]*\b)?/gi

        /**
         * Matches a chapter keyword + number (no leading number group).
         * Used when stripping chapter info from a secondary title part.
         * Examples: "Chapter 3"  "ch.4B"  "Episode 12"
         */
        const chapterRegex = new RegExp( `\\b(?:${chapterKeywordPattern})\\.?\\s*\\d+[A-Z]*`, 'gi' );
    
        // Regex for "read online"
        const readRegex = /^\s*read(\s+\w+)*(\s*online)?\s*$/i;
        // Regex for "novel bin"
        const junkRegex = new RegExp(String.raw`\b(${junkKeywordPattern})\b`, 'i');

        const startRemoveSiteNameKeywords = String.raw`^\s*(${keywordPattern})\b\s*`;
        const endRemoveSiteNameKeywords = String.raw`\s*\b(${keywordPattern})\s*$`;

        const cleanTitleKeyword = new RegExp((startRemoveSiteNameKeywords + endRemoveSiteNameKeywords).trim(), 'i');

        const siteNameRegex = new RegExp(String.raw`\b${siteName}\b`, 'i');
        const flexibleSiteNameRegex = new RegExp(String.raw`\b${siteName
            .replace(/[-/\\^$*+?.()|[\]{}]/g, "").split("")
            .map(ch => ch.replace(/\s+/, ""))
            .map(ch => String.raw`${ch}[\s._-]*`)
            .join("")}\b`, 'i');

        return {
            chapterRemoveRegexV3,
            chapterRemoveRegexV2,
            chapterRegex,
            readRegex,
            junkRegex,
            siteNameRegex,
            flexibleSiteNameRegex,
            cleanTitleKeyword
        }
    }
    private static removeJunkAndSiteName(parts: string[], regexUsed: RegexConfig) {
        let filtered = parts
            .filter(p => !regexUsed.readRegex.test(p))
            .filter(p => !regexUsed.junkRegex.test(p))
            .filter(p => !regexUsed.siteNameRegex.test(p))
            .filter(p => !regexUsed.flexibleSiteNameRegex.test(p))
            .filter(p => !regexUsed.cleanTitleKeyword.test(p))
            .map(p => p.replace(/^[\s:;,\-–—|]+/, "").trim()) // remove leading punctuation + spaces
            .map(p => p.replace('#', '').trim()) // remove any '#' characters
            .filter(Boolean)

        // Remove duplicates
        filtered = filtered.filter((item, index, array) => array.findIndex(i => i.toLowerCase() === item.toLowerCase()) === index );

        return filtered
    }

    private static makeTitle(filter: string[], Url_filter: string, regexUsed: RegexConfig): string | null {
        if (!filter.length) return null;
        const filtered = filter;
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
        if (filtered[0]?.replace(/\s*([–—-]|:|#|\|)\s*/g,' ').toLowerCase() === Url_filter) {// fip the first to last
            filter[filter.length] = filter[0];
            filter.shift();
        }

        mainTitle = filter[0]
        .replace(regexUsed.chapterRemoveRegexV3, '').trim() // remove optional leading/trailing numbers (int/float + optional letter) & remove the "chapter/chap/ch" part
        .replace(/^[\s:;,\-–—|]+/, "").trim() // remove leading punctuation + spaces
        .replace(/[:;,\-–—|]+$/,"") // remove trailing punctuation
        .trim();
        if(mainTitle === '' ) return this.makeTitle(filter.slice(1), Url_filter, regexUsed);
        
        if (filter.length < 2) return mainTitle;
        let Chapter_Title = filter[1]
        .replace(regexUsed.chapterRegex, '').trim() // remove 'chapter' and any variation
        .replace(/\b\d+(\.\d+)?\b/g, "") // remove numbers
        .replace(/^[\s:;,.\-–—|]+/, "").trim() // remove leading punctuation + spaces
        .replace(/[:;,.\-–—|]+$/,"") // remove trailing punctuation
        .trim();

        if (Chapter_Title === '' && filter.length == 2) return mainTitle;
        if (Chapter_Title === '') return `${mainTitle} ${this.makeTitle(filter.slice(1), Url_filter, regexUsed)}`;
        this.HermidataNotes = `Chapter Title: ${Chapter_Title}`;
        return mainTitle;
    }

    public static trimTitle(title: string, HermidataUrl: string): TrimmedTitle {
        if (!title) return {title: '', note: ''};
        
        this.title = title;
        this.HermidataUrl = HermidataUrl

        const siteName = this.extractDomainFromUrl()
    
        const parts = this.splitTitleByCommonSeparators(this.title);
        
        // examples
        // "Chapter 222: Illythia's Mission - The Wandering Fairy [LitRPG World-Hopping] | Royal Road"

        // ─── Regex config ─────────────────────────────────────────────────────────────
        const regexUsed: RegexConfig = this.setRegexConfig(siteName);

        // Remove junk and site name
        const filtered = this.removeJunkAndSiteName(parts, regexUsed);

        // Extract main title (remove chapter info)
        const Url_filter_parts = this.HermidataUrl.split('/')
        let Url_filter = Url_filter_parts.at(-1)?.replace(/-/g,' ').toLowerCase().trim() || '';
        
        const trimmedTitle: TrimmedTitle = {
            title: this.makeTitle(filtered, Url_filter, regexUsed)?.trim() || title,
            note: this.HermidataNotes || ''
        }
        
        return trimmedTitle;
    }
}