

export class HermidataUtils {
    static trimTitle(title = '', url = '') {
        if (!title || !url) return '';
        const anwser = helperTrimTitle(title, url);
        if (Object.keys(anwser).length == 0) return '';
        const FinalTitle = helperMakeTitle(anwser.filtered, anwser.Url_filter);
        return FinalTitle.trim() || title;
    }

    static getChapterTitle(title = '', url = '') {
        if (!title || !url) return '';
        const anwser = helperTrimTitle(title, url);
        if (Object.keys(anwser).length == 0) return '';
        const ChapterTitle = helperMakeChapterTitle(anwser.filtered, anwser.Url_filter);
        return ChapterTitle.trim() || '';
    }

    static returnHashedTitle(title, type) {
    return type 
    ? this.simpleHash(`${type}:${this.trimTitle(title).toLowerCase()}`) // V2
        : this.simpleHash(this.trimTitle(title).toLowerCase()) // V1
    }

    static simpleHash(str) {
        let hash = 0, i, chr;
        if (str.length === 0) return hash.toString();
        for (i = 0; i < str.length; i++) {
            chr = str.codePointAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash = Math.trunc(hash); // Convert to 32bit integer
        }
        return hash.toString();
    }

    static getChapterFromTitle(title, url) {
        // logic
    }

    static compareFeeds(a, b) {
        // logic
    }
    static testingFunction() {
        console.log("HermidataUtils testingFunction called");
    }
}

// helper functions for Hermidata
function helperTrimTitle(title = '', url = '') {
    let cleanString = (str) => {
        if (!str) return null;
        return str
            // Remove all control characters (C0 + C1), zero-width chars, and formatting chars
            .replace(/[\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, '')
            // Normalize multiple spaces to a single space
            .replace(/\s{2,}/g, ' ')
            .trim();
    }
    if (!title || !url) return null;

    // Extract domain name from url
    const siteMatch = new RegExp(/:\/\/(?:www\.)?([^./]+)/i).exec(url);
    const siteName = siteMatch ? siteMatch[1] : "";

    // Split title by common separators
    let cleanstring = cleanString(title);
    const parts = cleanstring.split(/ (?:(?:-+)|–|-|:|#|—|,|\|) /g).map(p => p.trim()).filter(Boolean);

    // "Chapter 222: Illythia's Mission - The Wandering Fairy [LitRPG World-Hopping] | Royal Road"

    // Regex patterns
    const readRegex = /^\s*read(\s+\w+)*(\s*online)?\s*$/i;
    const junkRegex = /\b(all page|novel bin|online)\b/i;
    const cleanTitleKeyword = (title) => {
        return title
        .replace(/^\s*(manga|novel|anime|tv-series)\b\s*/i, '') // start
        .replace(/\s*\b(manga|novel|anime|tv-series)\s*$/i, '') // end
        .trim();
    }
    const siteNameRegex = new RegExp(`\\b${siteName}\\b`, 'i');
    const flexibleSiteNameRegex = new RegExp(`\\b${siteName
        .replace(/[-/\\^$*+?.()|[\]{}]/g, "").split("")
        .map(ch => ch.replace(/\s+/, ""))
        .map(ch => `${ch}[\\s._-]*`)
        .join("")}\\b`, 'i');

    // Remove junk and site name
    let filtered = parts
        .filter(p => !readRegex.test(p))
        .filter(p => !junkRegex.test(p))
        .filter(p => !siteNameRegex.test(p))
        .filter(p => !flexibleSiteNameRegex.test(p))
        .map(p => cleanTitleKeyword(p))
        .map(p => p.replace(/^[\s:;,\-–—|]+/, "").trim()) // remove leading punctuation + spaces
        .map(p => p.replace('#', '').trim()) // remove any '#' characters
        .filter(Boolean)

    // Remove duplicates
    filtered = filtered.filter((item, idx, arr) =>
        arr.findIndex(i => i.toLowerCase() === item.toLowerCase()) === idx
    );

    // Extract main title (remove chapter info)
    let Url_filter_parts = url.split('/')
    let Url_filter = Url_filter_parts.at(-1).replace(/-/g,' ').toLowerCase().trim();
    const anwser = { filtered, Url_filter }
    return anwser;
}

function helperMakeTitle(filter, Url_filter) {
    const chapterRemoveRegexV2 = /(\b\d{1,4}(?:\.\d+)?[A-Z]*\b\s*)?(\b(?:Episode|chapter|chap|ch)\b\.?\s*)(\b\d{1,4}(?:\.\d+)?[A-Z]*\b)?/gi
    const chapterRegex = /\b(?:Episode|chapter|chap|ch)\.?\s*\d+[A-Z]*/gi;
    let mainTitle = '';
    if (!filter.length) return '';
    // Edge case: if first looks like "chapter info" but second looks like a real title → swap them
    if (
        filter.length > 1 &&
        /^\s*(chapter|ch\.?)\s*\d+/i.test(filter[0]) && // first is chapter info
        !/^\s*(chapter|ch\.?)\s*\d+/i.test(filter[1])   // second is NOT chapter info
    ) {
        [filter[0], filter[1]] = [filter[1], filter[0]]; // swap
    }
    // if first el is chapter info place it at the end
    if (filter[0]?.replace(/\s*([–—-]|:|#|\|)\s*/g,' ').toLowerCase() === Url_filter) {// fip the first to last
        filter[filter.length] = filter[0];
        filter.shift();
    }

    mainTitle = filter[0]
    .replace(chapterRemoveRegexV2, '').trim() // remove optional leading/trailing numbers (int/float + optional letter) & remove the "chapter/chap/ch" part
    .replace(/^[\s:;,\-–—|]+/, "").trim() // remove leading punctuation + spaces
    .replace(/[:;,\-–—|]+$/,"") // remove trailing punctuation
    .trim();
    if(mainTitle === '' ) return MakemTitle(filter.slice(1));
    
    if (filter.length < 2) return mainTitle;
    let Chapter_Title = filter[1]
    .replace(chapterRegex, '').trim() // remove 'chapter' and any variation
    .replace(/\b\d+(\.\d+)?\b/g, "") // remove numbers
    .replace(/^[\s:;,\-–—|]+/, "").trim() // remove leading punctuation + spaces
    .replace(/[:;,\-–—|]+$/,"") // remove trailing punctuation
    .trim();

    if (Chapter_Title === '' && filter.length == 2) return mainTitle;
    if (Chapter_Title === '') return [mainTitle, ...MakemTitle(filter.slice(1))];
    return mainTitle;
}

function helperMakeChapterTitle(filter, Url_filter) {
    const chapterRemoveRegexV2 = /(\b\d{1,4}(?:\.\d+)?[A-Z]*\b\s*)?(\b(?:Episode|chapter|chap|ch)\b\.?\s*)(\b\d{1,4}(?:\.\d+)?[A-Z]*\b)?/gi
    const chapterRegex = /\b(?:Episode|chapter|chap|ch)\.?\s*\d+[A-Z]*/gi;
    let mainTitle = '';
    if (!filter.length) return '';
    // Edge case: if first looks like "chapter info" but second looks like a real title → swap them
    if (
        filter.length > 1 &&
        /^\s*(chapter|ch\.?)\s*\d+/i.test(filter[0]) && // first is chapter info
        !/^\s*(chapter|ch\.?)\s*\d+/i.test(filter[1])   // second is NOT chapter info
    ) {
        [filter[0], filter[1]] = [filter[1], filter[0]]; // swap
    }
    // if first el is chapter info place it at the end
    if (filter[0]?.replace(/\s*([–—-]|:|#|\|)\s*/g,' ').toLowerCase() === Url_filter) {// fip the first to last
        filter[filter.length] = filter[0];
        filter.shift();
    }

    mainTitle = filter[0]
    .replace(chapterRemoveRegexV2, '').trim() // remove optional leading/trailing numbers (int/float + optional letter) & remove the "chapter/chap/ch" part
    .replace(/^[\s:;,\-–—|]+/, "").trim() // remove leading punctuation + spaces
    .replace(/[:;,\-–—|]+$/,"") // remove trailing punctuation
    .trim();
    if(mainTitle === '' ) return MakemTitle(filter.slice(1));
    
    if (filter.length < 2) return MakemTitle(filter.slice(1));
    let Chapter_Title = filter[1]
    .replace(chapterRegex, '').trim() // remove 'chapter' and any variation
    .replace(/\b\d+(\.\d+)?\b/g, "") // remove numbers
    .replace(/^[\s:;,\-–—|]+/, "").trim() // remove leading punctuation + spaces
    .replace(/[:;,\-–—|]+$/,"") // remove trailing punctuation
    .trim();

    if (Chapter_Title === '' && filter.length == 2) return '';
    if (Chapter_Title === '') return MakemTitle(filter.slice(1));
    const ChapterTitle = `Chapter Title: ${Chapter_Title}`;
    return ChapterTitle;
}