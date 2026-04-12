import { CalcDiff, PastHermidata } from "../popup/core/Past";
import { FolderMapping } from "../settings/build/FolderMapping";
import { getChapterFromTitle, TrimTitle } from "../shared/StringOutput";
import { getSettings } from "../shared/db/Storage";
import type { Settings } from "../shared/types";
import { findNestedFolder, getBookmarkChildren } from "./bookmarks";
import { setState, settingsCashed } from "./state";


interface FuzzyBookmarkMatches {
    folderPath: string;
    bookmarkTitle: string;
    fuzzySearchUrl: string;
    currentUrl: string | undefined;
    similarity: number;
}
interface FuzzyHermidataMatches {
    bookmarkTitle: string,
    fuzzySearchUrl: string,
    chapter: number,
    currentUrl: string | undefined,
    similarity: number
}


const fuzzyCache = new Map();

declare const browser: typeof chrome | undefined;

/**
 * Return the bookmark after a fuzzy search instead of a direct search
 * @param {*} currentTab 
 * @returns 
 */
async function hasRelatedBookmark(currentTab: chrome.tabs.Tab) {
    const Browserroot = browser !== undefined && navigator.userAgent.includes("Firefox")
        ? "Bookmarks Menu"
        : "Bookmarks";
    const settings = settingsCashed ?? await getSettings();

    if (settingsCashed === null) setState.settingsCashed(settings);

    if (!settings) return { hasValidFuzzyBookmark: false, hasValidFuzzyHermidata: false };

    let folderPaths: string[] = getFolderPathsFromMapping(settings);
    
    const resultFuzzyBookmark = await detectFuzzyBookmark(currentTab, folderPaths, Browserroot);
    const ressultFuzzyHermidata = await detectFuzzyHermidata(currentTab);
    let sameChapter;
    const finalObj: { bookmark?: FuzzyBookmarkMatches, bookmarkSameChapter?: boolean, hermidataSameChapter?: boolean, hermidata?: FuzzyHermidataMatches} = {};
    if ( resultFuzzyBookmark.hasValidFuzzyBookmark ) {
        sameChapter = isSameChapterCount(resultFuzzyBookmark.fuzzyMatches[0], currentTab);
        finalObj.bookmark = resultFuzzyBookmark.fuzzyMatches[0];
        finalObj.bookmarkSameChapter = sameChapter
    }
    else if ( ressultFuzzyHermidata.hasValidFuzzyHermidata ) {
        sameChapter = isSameChapterCount(ressultFuzzyHermidata.fuzzyMatches[0], currentTab);
        finalObj.hermidata = ressultFuzzyHermidata.fuzzyMatches[0];
        finalObj.hermidataSameChapter = sameChapter
    }
    return finalObj
}

export async function hasRelatedBookmarkCached(tab: chrome.tabs.Tab) {
    if (fuzzyCache.has(tab.url)) return fuzzyCache.get(tab.url);
    const result = await hasRelatedBookmark(tab);
    fuzzyCache.set(tab.url, result);
    return result;
}

// Generate all possible folder paths from the new mapping system
function getFolderPathsFromMapping(settings: Settings): string[] {
    const folderPaths: Set<string> = new Set();
    
    if (!settings?.TYPE_OPTIONS || !settings?.STATUS_OPTIONS || !settings?.FolderMapping) return [];
    
    for (const novelType of Object.values(settings.TYPE_OPTIONS)) {
        for (const readStatus of Object.values(settings.STATUS_OPTIONS)) {
            const path = FolderMapping.resolveFolder( novelType, readStatus, settings.FolderMapping );
            folderPaths.add(path);
        }
    }
    
    // Remove duplicates (in case multiple type/status combos resolve to same path)
    return [...folderPaths].flat();
}


async function detectFuzzyHermidata(currentTab: chrome.tabs.Tab, threshold = 0.8): Promise<{hasValidFuzzyHermidata: boolean, fuzzyMatches: FuzzyHermidataMatches[]}> {
    const fuzzyMatches: FuzzyHermidataMatches[] = [];
    const allHermidata = await PastHermidata.getAllHermidata();
    console.groupCollapsed("Fuzzy Bookmark Detection");
    if (!currentTab.title || !currentTab.url) throw new Error("No title or url");
    console.log("Current tab:", currentTab.title);
    const trimmedTitle = TrimTitle.trimTitle(currentTab.title, currentTab.url).title;
    console.log("Current tab trimmed: ", trimmedTitle)
    for (const element of Object.keys(allHermidata)) {
        const index = element;

        const hermidata = allHermidata[index]
        let score = null
            for (let index = 0; index < hermidata?.meta?.altTitles.length; index++) {
                score = CalcDiff( hermidata?.meta?.altTitles?.[index] || hermidata.title, trimmedTitle);
                if (score >= threshold) {
                    fuzzyMatches.push({
                        bookmarkTitle: hermidata.title,
                        fuzzySearchUrl: hermidata.url,
                        currentUrl: currentTab.url,
                        chapter: hermidata?.chapter?.current || Number.NaN,
                        similarity: score
                    });
                    console.warn(`[Fuzzy Match ${score.toFixed(2)}] "${hermidata.title}" ↔ "${trimmedTitle}"`);
                }
            }
    }

    console.groupEnd();
    const hasValidFuzzyHermidata = fuzzyMatches.length > 0;
    return {hasValidFuzzyHermidata, fuzzyMatches};
}
async function detectFuzzyBookmark(currentTab: chrome.tabs.Tab, folderPaths: string[], Browserroot: string, threshold = 0.8): 
    Promise<{hasValidFuzzyBookmark: boolean, fuzzyMatches: FuzzyBookmarkMatches[]}> {
    const fuzzyMatches: FuzzyBookmarkMatches[] = [];
    

    for (const folderPath of folderPaths) {
        if (!folderPath) continue;

        const pathSegments = folderPath.split('/').filter(Boolean);

        const finalFolderId = await findNestedFolder(pathSegments, Browserroot)
        if (!finalFolderId) continue;
        const bookmarks = await getBookmarkChildren(finalFolderId);

        for (const bookmark of bookmarks) {
            if (!currentTab.title) continue;
            const score = CalcDiff(bookmark.title, currentTab.title);

            if (score >= threshold) {
                fuzzyMatches.push({
                    folderPath: folderPath,
                    bookmarkTitle: bookmark.title,
                    fuzzySearchUrl: bookmark.url!,
                    currentUrl: currentTab.url,
                    similarity: score
                });

                console.warn(
                    `[Fuzzy Match ${score.toFixed(2)}] "${bookmark.title}" ↔ "${currentTab.title}" in folder "${folderPath}"`
                );
            }
        }
    }

    const hasValidFuzzyBookmark = fuzzyMatches.length > 0;
    return ({ hasValidFuzzyBookmark, fuzzyMatches });
}

function isSameChapterCount(a: (FuzzyBookmarkMatches | FuzzyHermidataMatches),b: chrome.tabs.Tab) {
    let isSameNummber = false;

    const fuzzychapter = (a as FuzzyHermidataMatches).chapter ?? getChapterFromTitle(a.bookmarkTitle, a.fuzzySearchUrl)
    if (!b.title || !b.url) return isSameNummber
    const curentTabChapter = getChapterFromTitle(b.title, b.url)



    if ( fuzzychapter === curentTabChapter) isSameNummber = true
    return isSameNummber
}
