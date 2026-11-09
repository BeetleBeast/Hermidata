import type { PickedElementData } from '../types/rss';
import type { AnyNovelType, Hermidata, RegexConfig, TrimmedTitle } from '../types';
import { HermidataModel } from './HermidataSelector';
import { ext } from './BrowserCompat';

const CHAPTER_KEYWORDS = ['episode', 'chapter', 'chap', 'ch'] as const;
const LOCALIZED_TITLE_KEYWORDS = ['chapitre', 'capitulo', 'kapitel', 'capitolo'] as const;
const VOLUME_KEYWORDS = ['vol', 'volume'] as const;
// Only trusted inside URL slugs, where they're delimited by - _ /
const URL_ONLY_CHAPTER_KEYWORDS = ['ep', 'eps', 'chapitre', 'capitulo', 'cap', 'kapitel', 'bab', 'chuong', 'capitolo'];

const URL_KEYWORDS = new Set<string>([...CHAPTER_KEYWORDS, ...LOCALIZED_TITLE_KEYWORDS, ...URL_ONLY_CHAPTER_KEYWORDS]);
const URL_NUMBER = String.raw`\d{1,5}(?:\.\d+)?`; // 1-5 digits, so DB ids like 9817342 are rejected
const urlAttachedRegex = new RegExp(String.raw`^(?:${[...URL_KEYWORDS].join('|')})(${URL_NUMBER})$`); // "ch12", "chapter154"
const urlPureNumberRegex = new RegExp(`^${URL_NUMBER}$`);
const isUrlKeyword = (t?: string) => !!t && URL_KEYWORDS.has(t.replace(/s$/, '')); // "chapters" -> "chapter"



/** 
 * Converts basic CJK numerals (0-99) to ASCII digits
 * @example 
 * 1. "五" -> "5"
 * 2. "十二" -> "12" 
 */
function convertCjkNumerals(str: string): string {
    const cjkDigits: Record<string, number> = {
        '零': 0, '〇': 0, '一': 1, '二': 2, '三': 3, '四': 4,
        '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    };
    return str.replace(/[零〇一二三四五六七八九十]+/g, (match) => {
        let result: number;
        if (match.length === 1) {
            result = cjkDigits[match];
        } else if (match.includes('十')) {
            const [tensPart, onesPart] = match.split('十');
            const tens = tensPart === '' ? 1 : (cjkDigits[tensPart] ?? 1);
            const ones = onesPart ? (cjkDigits[onesPart] ?? 0) : 0;
            result = tens * 10 + ones;
        } else {
            result = cjkDigits[match[0]];
        }
        return (result === undefined || Number.isNaN(result)) ? match : String(result);
    });
}

export function getChapterFromUrl(url: string): string {
    let path: string;
    try { path = decodeURIComponent(new URL(url).pathname); }
    catch { path = (url ?? '').split(/[?#]/)[0]; }

    const segs = path
        .split('/')
        .filter(Boolean)
        .map(s => s.replace(/\.(?:html?|php|aspx?)$/i, '').toLowerCase());

    const last = segs.at(-1);
    if (!last) return '';
    const tokens = last.split(/[-_\s]+/).filter(Boolean);

    for (let i = 0; i < tokens.length; i++) {
        // "chapter154", "ch12"
        const attached = urlAttachedRegex.exec(tokens[i])?.[1];
        if (attached) return attached;

        // "chapter-154", "ep_7"
        if (isUrlKeyword(tokens[i]) && urlPureNumberRegex.test(tokens[i + 1] ?? '')) return tokens[i + 1];
    }

    // "/chapter/154" or "/chapters/154"
    if (tokens.length === 1 && urlPureNumberRegex.test(tokens[0]) && isUrlKeyword(segs.at(-2))) {
        return tokens[0];
    }
    return '';
}
export type ChapterSource = 'titleKeyword' | 'titleSegment' | 'urlKeyword' | 'titleSingleNumber' | 'none';
export interface ChapterResult { chapter: number; source: ChapterSource }

export function detectChapter(title: string | undefined, url: string): ChapterResult {
    if (!title) return { chapter: Number.NaN, source: 'none' };

    const normalized = convertCjkNumerals(title.normalize('NFKC'));

    const numberToken = String.raw`\d+(?:\.\d+)?`;
    const keywordNumberToken = String.raw`\d+(?:\.\d+)?(?:[eE][+-]?\d+)?`;
    const chapterKeywordPattern = `(?:${CHAPTER_KEYWORDS.join('|')})`;

    // Highest: keyword directly attached to a number in the title
    const keywordAdjacentRegex = new RegExp(
        String.raw`\b${chapterKeywordPattern}\b\.?\s*(${keywordNumberToken})`, 'i'
    );
    const titleKeyword = keywordAdjacentRegex.exec(normalized)?.[1] ?? '';

    // A title segment that IS just a number once split on separators
    const exactNumberRegex = new RegExp(`^${numberToken}$`);
    const titleSegment = normalized.split(/[-–—|:]/).map(p => p.trim()).find(p => exactNumberRegex.test(p)) ?? '';

    // URL, only when a chapter word backs the number up
    const urlKeyword = getChapterFromUrl(url);

    // Weakest: the only number in the title
    const allNumberTokens = normalized.match(new RegExp(numberToken, 'g')) ?? [];
    const titleSingleNumber = allNumberTokens.length === 1 ? allNumberTokens[0] : '';

    // Ordered from most to least trusted. The old "any digits in the URL" rule is gone.
    const candidates: [ChapterSource, string][] = [
        ['titleKeyword', titleKeyword],
        ['titleSegment', titleSegment],
        ['urlKeyword', urlKeyword],
        ['titleSingleNumber', titleSingleNumber],
    ];

    for (const [source, raw] of candidates) {
        const n = Number.parseFloat(raw);
        if (!Number.isNaN(n) && n >= 0) return { chapter: n, source };
    }
    return { chapter: Number.NaN, source: 'none' };
}

export function getChapterFromTitle(title: string | undefined, url: string): number {
    return detectChapter(title, url).chapter;
}

/**
 * Extracts a chapter from a feed item title after removing the known series title.
 * Uses the URL for chapter detection when available, otherwise the fallback chapter.
 * Returns NaN when removing the series title leaves no title content to inspect.
 */
export function extractChapterFromFeedItemTitle(seriesTitle: string, feedItemTitle: string, fallbackChapter: number | undefined, url: string): number {
    const titleWithoutSeries = feedItemTitle?.replace(seriesTitle, '');
    const finalChapter = url ? getChapterFromTitle(titleWithoutSeries, url) : fallbackChapter;
    return titleWithoutSeries ? finalChapter ?? Number.NaN : Number.NaN;
}

export function normalizeDateToIso(rawDate: string): string {
    
    if (!rawDate) return '';

    const split = rawDate.split('/');
    const date = split.length === 3 ? new Date(Number(split[2]), Number(split[1]) - 1, Number(split[0])) : new Date(rawDate);

    return new Date(date)?.toISOString();
}

function drawIcon(size: number, colour: string): ImageData {
    const ICON_PATH = "M240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h480q33 0 56.5 23.5T800-800v640q0 33-23.5 56.5T720-80H240Zm0-80h480v-640h-80v280l-100-60-100 60v-280H240v640Zm0 0v-640 640Zm200-360 100-60 100 60-100-60-100 60Z";

    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d')!;

    // viewBox is "0 -960 960 960" — map that space onto the canvas
    const scale = size / 960;
    ctx.setTransform(scale, 0, 0, scale, 0, size);

    ctx.fillStyle = colour;
    ctx.fill(new Path2D(ICON_PATH));

    return ctx.getImageData(0, 0, size, size);
}
async function getTabId(): Promise<number | undefined> {
    const [currentTab] = await ext.tabs.query({ active: true, currentWindow: true });    
    return currentTab?.id;
}
/**
 * set a dynamic icon
 * @param isFound - if the Hermidata is found
 * @param colour - the new colour of the icon
*/
export async function setDynamicIcon(isFound: boolean, colour?: string, currentTabId?: number): Promise<void> {
    const defaultColour = '#e3e3e3';
    const defaultFoundColour = '#5979d6';

    const newColour = isFound ? colour ?? defaultFoundColour : defaultColour;

    let tabId: number | undefined = currentTabId ?? await getTabId();

    if (!tabId) return;

    const sizes = [16, 32, 48, 128];
    const imageData: Record<number, ImageData> = {};
    for (const size of sizes) imageData[size] = drawIcon(size, newColour);

    await ext.action.setIcon({ imageData, tabId });
}

function isConcatenationOfOthers(candidate: string, others: string[]): boolean {
    let remaining = candidate;
    let matchedCount = 0;

    for (const other of others) {
        const idx = remaining.indexOf(other);
        if (idx === -1) continue;
        remaining = remaining.slice(idx + other.length);
        matchedCount++;
    }

    // Only treat as a "summary" if it's stitched together from 2+ other
    // leaves in order — a single containment match is more likely a
    // coincidence (like "New" inside "New Arrivals") than a real duplicate.
    return matchedCount >= 2;
}

function dedupeContainerTexts(texts: string[]): string[] {
    return texts.filter((text, i) => {
        const others = texts.filter((_, j) => j !== i);
        return !isConcatenationOfOthers(text, others);
    });
}

export function getMultipleTitles(data: PickedElementData, separator = '\n'): string[] | null {

    const deduped = dedupeContainerTexts(data.leafTexts);
    return deduped.length > 0 ? deduped : null;
}

export function findByTitleOrAlt(title: string, allData: Record<string, Hermidata> ): Hermidata | undefined {
    title = TrimTitle.trimTitle(title, '').title; // force trim title to remove any chapter info or site name
    if (!title.trim()) return undefined;

    const novel = Object.values(allData).find(novel => {
        const novelModel = new HermidataModel(novel);

        const sameMainTitle = TrimTitle.trimTitle(novelModel.title, novelModel.GetUrl()).title === title;
        const sameAltTitle = (novel.meta?.altTitles).some(altT => {
            // make sure no "" === "" is handled
            if (altT === "") return false;
            return TrimTitle.trimTitle(altT, novelModel.GetUrl()).title === title
        });

        return sameMainTitle || sameAltTitle;
    });

    return novel;
}
/** 
 * takes title and *domain* as input
 * - url is only used to get the domain
 * @return returns a hashed string that is unique to the title and domain
 * */
export function returnHashedFeedId(title: string, url: string): string {
    const domain = new URL(url).hostname.replace(/^www\./, "");
    return simpleHash(`${domain}:${title.toLowerCase()}`);
}

/**
 * Generates a hash for the given title, type, and URL
 * @param title - The title of the novel
 * @param type - The type of the novel (e.g., Manga, Novel)
 * @param url - The URL of the novel (optional)
 * @param trimTitle - Whether to trim the title before hashing (default: true)
 * @returns - A unique hash string based on the title, type, and URL
 */
export function generateHermidataHash(title: string, type: AnyNovelType, url: string = '', trimTitle: boolean = true) {
    const finalTitle = trimTitle ? TrimTitle.trimTitle(title, url).title : title;
    return simpleHash(`${type}:${finalTitle.toLowerCase()}`) // V2
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

/** 
 * - open url into another location
 * @param {string} path - the url
 * @param {string} location - where to open the url: inside a newTab, newWindow or the sameTab
 * @param {number} scrollPositionY - the y position to scroll to
 * */
export async function openLink(path: string, location: 'newTab' | 'newWindow' | 'sameTab', scrollPositionY: number = 0): Promise<void> {
    const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
    const isExternal = /^[a-z][a-z0-9+.-]*:\/\//i.test(path); // has a scheme, e.g. https://, http://

    const url = isExternal ? path : ext.runtime.getURL(`dist/pages/${path}`);

    if (isFirefox && location === 'newTab') return openInSameContainer(url, scrollPositionY);

    const tab = await createTabForLocation(url, location);
    if (tab) openInSpecificYPosition(tab, scrollPositionY);
}

async function createTabForLocation( url: string, location: 'newTab' | 'newWindow' | 'sameTab' ): Promise<chrome.tabs.Tab | undefined> {
    switch (location) {
        case 'newTab':
            return ext.tabs.create({ url });

        case 'newWindow': {
            const win = await ext.windows.create({ url });
            return win?.tabs?.[0]; // TODO: still no way to set Y position for a brand-new window's initial paint
        }

        case 'sameTab':
            return ext.tabs.update({ url, active: true });

        default: {
            const _exhaustive: never = location;
            return _exhaustive;
        }
    }
}
function openInSpecificYPosition(tab: browser.tabs.Tab | undefined, scrollPositionY: number): void {
    if (!tab?.id) return;

    const tabId = tab.id;

    const onUpdated = (changedTabId: number, info: { status?: string }) => {
        if (changedTabId === tabId && info.status === 'complete') {
            cleanup();
            chrome.scripting.executeScript({
                target: { tabId },
                func: (y) => window.scrollTo(0, y),
                args: [scrollPositionY],
            });
        }
    };

    const onRemoved = (removedTabId: number) => {
        if (removedTabId === tabId) cleanup();
    };

    function cleanup() {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        chrome.tabs.onRemoved.removeListener(onRemoved);
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
}
/** Get the current tab's `cookieStoreId` and pass it straight to `tabs.create`:*/
async function openInSameContainer(url: string, scrollPositionY: number): Promise<void> {
    if (!browser) return; // shouldn't happen since caller already checked isFirefox, but keeps TS happy

    const [currentTab] = await browser.tabs.query({ active: true, currentWindow: true });
    
    const cookieStoreId = currentTab.cookieStoreId; // inherits the container

    const tab = await browser.tabs.create({ url, cookieStoreId });
    openInSpecificYPosition(tab, scrollPositionY);
}

export function getTitleAndChapterFromUrl(url: string): { title: string | null, chapter: number } {
    if (!url) return { title: null, chapter: Number.NaN };
    if (!url.trim()) return { title: null, chapter: Number.NaN };

    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const possibleTitleSlug = parts.includes('read') ? parts[parts.indexOf('read') + 1] : parts[2] || parts[1];

    if (!possibleTitleSlug) return { title: null, chapter: Number.NaN };
    
    const titleSlug = possibleTitleSlug.includes('chapter') ? parts[1] : possibleTitleSlug;

    const chapter = Number.parseFloat(getChapterFromUrl(url)); // '' -> NaN
    
    if (!titleSlug) return { title: null, chapter };
    
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
        if (!HermidataUrl.trim()) return "DummySite"; // fallback for empty URL

        // Detect own browser extension and return a constant.
        // Guard against an empty prefix: "".startsWith("") is always true (e.g. a mocked getURL)
        const own = ext.runtime.getURL("");
        if (own && HermidataUrl.startsWith(own)) return "Hermidata";

        // Extract domain name from url
        try {
            // Use the hostname so "m.mangakakalot.com" resolves to "mangakakalot", not "m"
            const labels = new URL(HermidataUrl).hostname.split('.');
            labels.pop(); // drop the TLD
            // drop second-level suffixes like "co" in "example.co.uk"
            if (labels.length > 1 && ['co', 'com', 'org', 'net'].includes(labels.at(-1)!)) labels.pop(); // co.uk
            const siteName = labels.at(-1) ?? "DummySite";
            return siteName

        } catch {
            console.warn(`Failed to extract domain from URL: ${HermidataUrl}`);
            // Fallback if URL is invalid
            const siteName = HermidataUrl.split('/')[2] ?? "DummySite";
            return siteName
        }
    }
    private static looksLikeTitleContinuation(prev: string, curr: string): boolean {
        // A real boundary segment tends to be short (site name, "Vol 3", "Chapter 2")
        // or starts with a known keyword. A continuation tends to be long prose.
        const SHORT_THRESHOLD = 30; // chars — tune as needed
        const chapterLike  = /^\s*(?:episode|chapter|chap|ch|vol|volume)[\s.]*\d+/i;
        const chapterInside = /\b(?:episode|chapter|chap|ch|vol|volume)[\s.]*\d+/i; // anywhere
        const numberOnly   = /^\d+(\.\d+)?[A-Z]?$/i;

        // If either side is clearly chapter/volume info, it's a real boundary
        if (chapterLike.test(curr) || chapterLike.test(prev)) return false;
        if (chapterInside.test(curr)) return false;   // <- new: "Read X Chapter 544" is a boundary
        if (numberOnly.test(curr)  || numberOnly.test(prev))  return false;

        // If the second part is very short it's probably a tag/label, not a continuation
        if (curr.length < SHORT_THRESHOLD) return false;

        // Both sides are long prose → continuation dash
        return true;
    }
    private static splitTitleByCommonSeparators(title: string, regexUsed: RegexConfig): string[] {
        const cleanString = TrimTitle.CleanString(title);

        // chapterRegex is global, so use replace() (which resets lastIndex) instead of test()
        const stripChapter = (s: string) => s.replace(regexUsed.chapterRegex, '').trim();
        // true when the part is nothing but a chapter marker, e.g. "Chapter 293"
        const isBareChapter = (s: string) => stripChapter(s) === '' && s.trim() !== '';
        // true when the part contains a chapter marker anywhere
        const hasChapter = (s: string) => stripChapter(s) !== s.trim();


        // Split only on strong separators first (em-dash, pipe, colon, hash, comma)
        // Leave plain ' - ' for a second pass with smarter logic
        const strongSplit = cleanString.split(/ (?:–|—|:|#|\|) /g).map(p => p.trim()).filter(Boolean);

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
            
            // "MookHyang - Dark Lady - Chapter 293": a trailing bare chapter marker after
            // 2+ plain segments means those segments together are the title.
            const last = merged[merged.length - 1];
            const lead = merged.slice(0, -1);
            // need at least: title part 1, title part 2, chapter marker
            const isAboveMergeLength = merged.length >= 3;
            // a chapter marker or pure number in the lead (e.g. "86 - Eighty Six - Chapter 12") means it's not one title
            const hasNoChapterInLead = !lead.some(p => hasChapter(p) || urlPureNumberRegex.test(p));
            // Run the real cleanup on the lead: if it would drop or change any segment
            // (site name, "read online", junk, duplicates), rejoining would hide that from the pipeline
            const cleaned = TrimTitle.removeJunkAndSiteName(lead, regexUsed);
            const leadIsClean = cleaned.length === lead.length && cleaned.every((p, i) => p === lead[i]);
            // Cheap extra check for the same cases, plus duplicate segments ("Berserk - Berserk - Chapter 3")
            const guard = !lead.some(p => regexUsed.siteNameRegex.test(p) || regexUsed.flexibleSiteNameRegex.test(p) ||
                regexUsed.readRegex.test(p) || regexUsed.junkRegex.test(p)) && new Set(lead.map(p => p.toLowerCase())).size === lead.length;

            if ( isAboveMergeLength && isBareChapter(last) && leadIsClean && hasNoChapterInLead && guard ) {
                // keep the lead as one title segment, chapter marker stays separate
                result.push(lead.join(' - '), last);
            } else result.push(...merged);

        }
        return result;
    }
    private static setRegexConfig(siteName: string): RegexConfig {
        // Keep words lowercase; the /gi flag handles case-insensitive matching.
        // Localized keywords are included here (titles), but "ep"/"cap"/"bab" stay URL-only because they are real words
        const chapterKeywords = [...CHAPTER_KEYWORDS, ...LOCALIZED_TITLE_KEYWORDS, ...VOLUME_KEYWORDS];
        const chapterKeywordPattern = chapterKeywords.join('|');

        const junkKeyWords = ['all page', 'bin', 'page'];
        const junkKeywordPattern = junkKeyWords.join('|');

        const keyword = ['manga', 'novel', 'anime', 'tv-series', 'comic', 'webtoon', 'ln'];
        const keywordPattern = keyword.join('|');
        
        const trailingJunkWords = ['english', 'eng', 'raw', 'online', 'free', 'sub', 'dub', 'hd'];
        const trailingJunkPattern = trailingJunkWords.join('|');

        /**
         * Matches a full chapter reference, including optional leading/trailing numbers.
         * Examples matched:  "Chapter 3"  "12 Chapter 3A"  "ch.4"  "Episode 10"
         *
         * Group 1 — optional number BEFORE the keyword  (e.g. "12 ")
         * Group 2 — the keyword itself                  (e.g. "Chapter")
         * Group 3 — optional number AFTER the keyword   (e.g. "3A")
         */
        const chapterRemoveRegexV3 = new RegExp(
            // leading number only at the start of the part, so "Mob Psycho 100 Chapter 5" keeps its "100"
            String.raw`(?:^\d{1,5}(?:\.\d+)?[A-Z]*\s+)?` +
            // keyword; (?![a-z]) allows "Chapter5" but rejects "Church"/"Chapters of"
            String.raw`\b(?:${chapterKeywordPattern})(?![a-z])\.?\s*` +
            // must be followed by a number, or be a bare keyword at the end / before a separator
            String.raw`(?:\d{1,5}(?:\.\d+)?[A-Z]*\b|(?=$|[:|\-–—]))`,
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

        // Words that commonly trail a chapter marker on scraper sites
        // e.g. "... Chapter 3 English Online" -> after chapter removal, "... English Online" is left dangling
        const trailingJunkRegex = new RegExp(String.raw`(?:\s*\b(?:${trailingJunkPattern})\b)+\s*$`, 'i');

        // junk must be the whole part, optionally prefixed by a keyword ("Novel Bin", "All Page"),
        // so titles like "The Page Turner" are no longer dropped
        const junkRegex = new RegExp(String.raw`^\s*(?:(?:${keywordPattern})\s+)?(?:${junkKeywordPattern})\s*$`, 'i');

        // keyword only counts at the start if followed by a separator, or if it is the whole part ("Comic Girls" is kept)
        const cleanTitleKeywordStart = new RegExp(String.raw`^\s*(?:${keywordPattern})\b\s*(?:[:|\-–—]\s*|$)`, 'i');
        // at the end it only counts after a separator
        const cleanTitleKeywordEnd   = new RegExp(String.raw`\s*[:|\-–—]\s*(?:${keywordPattern})\s*$`, 'i');
        // a chapter keyword with nothing after it: "The Maid is a Vampire Chapter"
        const trailingBareKeywordRegex = new RegExp(String.raw`\s*\b(?:${chapterKeywordPattern})\.?\s*$`, 'i');

        // CJK markers: 第5話 / 第5章 / 第12回 / 5話 (\b doesn't work between CJK characters, so separate regex)
        const cjkChapterRegex = /\s*第\s*\d+(?:\.\d+)?\s*[話话章回巻卷集]|\s*\d+\s*[話话]/g;
        
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
            stripReadOnline,
            trailingJunkRegex,
            trailingBareKeywordRegex,
            cjkChapterRegex
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
            .map(p => p.search(regexUsed.chapterRegex) >= 0 ? p.replace(regexUsed.trailingJunkRegex, '') : p)
            .map(p => p.replace(regexUsed.cjkChapterRegex, '').trim())
            .map(p => p.replace(/^[\s:;,\-–—|]+/, "").trim()) // remove leading punctuation + spaces
            .map(p => p.replace('#', ' ').trim()) // remove any '#' characters
            .map(p => p.replace('／', " ").trim()) // remove trailing punctuation + spaces
            .map(p => p.replace('•', " ").trim()) // remove trailing punctuation + spaces
            .map(p => p.replace('·', " ").trim()) // remove trailing punctuation + spaces
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
    /**
     * Removes the chapter/volume/episode marker block from a title, choosing which side to keep based on structure rather than a word list:
     *  - If a subtitle separator (: - – — |) immediately follows the marker block, the author intentionally continued the title -> keep the suffix.
     *    e.g. "Volume 2, Chapter 5: Revenge" -> "Revenge"
     *  - Otherwise, whatever trails the marker is scraper metadata (language tag, resolution, domain, scanlator name, etc.) with no reliable enumeration -> keep the prefix.
     *    e.g. "The Generic Title Chapter 3 English online test.com" -> "The Generic Title"
    */
    private static stripChapterBlock(title: string, regexUsed: RegexConfig): string {
        // TODO: rewrite this method for better readability
        regexUsed.chapterRemoveRegexV3.lastIndex = 0;

        let match: RegExpExecArray | null;
        let blockStart = -1;
        let blockEnd = -1;
        while ((match = regexUsed.chapterRemoveRegexV3.exec(title)) !== null) {
            if (blockStart === -1) blockStart = match.index;
            blockEnd = match.index + match[0].length;
            if (match[0].length === 0) regexUsed.chapterRemoveRegexV3.lastIndex++; // avoid infinite loop on zero-width match
        }

        if (blockStart === -1) {
            // no number-based marker found; still strip a dangling keyword at the end
            // ("The Maid is a Vampire Chapter"), but never return an empty string
            return title.replace(regexUsed.trailingBareKeywordRegex, '').trim() || title;
        }

        const prefix = title.slice(0, blockStart).trim();
        const rawSuffix = title.slice(blockEnd);

        const subtitleMarker = /^\s*[:\-–—|]\s*/;
        const hasMarker = subtitleMarker.test(rawSuffix);
        const suffix = rawSuffix.replace(subtitleMarker, '').trim();

        if (hasMarker && suffix) return suffix;
        if (prefix) return prefix;
        if (suffix) return suffix;
        return '';
    }

    private static makeTitle(filter: string[], regexUsed: RegexConfig, HermidataUrl: string): TrimmedTitle | null {
        if (!filter.length) return null;
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
        if (filtered[0]?.replaceAll(/\s*([–—-]|:|#|\|)\s*/g,' ').toLowerCase() === Url_filter) {
            // flip the first to last
            filter.push(filter[0]);
            filter.shift();
        }
        // early strip first string if its a leading number
        if (/^\d{1,4}(?:\.\d+)?$/.test(filter[0])) return TrimTitle.makeTitle(filter.slice(1), regexUsed, HermidataUrl);

        mainTitle = TrimTitle.stripChapterBlock(filter[0], regexUsed)
            .replace(/^[\s:;,\-–—|]+/, "").trim() // remove leading punctuation + spaces
            .replace(/[:;,\-–—|]+$/,"") // remove trailing punctuation
            .trim();

        if (mainTitle === '' ) return TrimTitle.makeTitle(filter.slice(1), regexUsed, HermidataUrl);
        
        if (filter.length < 2) return { title: mainTitle };

        const cleanSub = (s: string) => s
            .replace(regexUsed.chapterRegex, '')
            .replaceAll(/\b\d+(\.\d+)?\b/g, '')
            .replace(/^[\s:;,\-–—|]+/, '')
            .replace(/[:;,\-–—|]+$/, '')
            .trim();

        const Chapter_Title = filter.slice(1).map(cleanSub).find(Boolean) ?? '';
        if (!Chapter_Title) return { title: mainTitle };
        return {
            title: mainTitle,
            note: `Chapter Title: ${Chapter_Title}`
        };
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
        if (!title?.trim()) return {title: '', note: ''};

        // --- Site name ---
        const siteName = TrimTitle.extractDomainFromUrl(HermidataUrl);
        
        // --- Regex config ---
        const regexUsed: RegexConfig = TrimTitle.setRegexConfig(siteName);

        // spilt title
        const parts = TrimTitle.splitTitleByCommonSeparators(title, regexUsed);
        
        // Remove junk and site name
        const filtered = TrimTitle.removeJunkAndSiteName(parts, regexUsed);

        // make title and note. 
        // If no title is found, try to take longest parts as backup
        const trimmedTitleOnly = TrimTitle.makeTitle(filtered, regexUsed, HermidataUrl) ?? TrimTitle.TakeLongestPartsBackup(parts, regexUsed, HermidataUrl);

        const trimmedTitle: TrimmedTitle = {
            title: trimmedTitleOnly?.title.trim() || title.trim(),
            note: trimmedTitleOnly?.note || ''
        }

        return trimmedTitle;
    }
}