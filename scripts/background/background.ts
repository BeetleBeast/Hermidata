import { CalcDiff, PastHermidata } from "../popup/core/Past";
import { browser, ext } from "../shared/BrowserCompat";
import { getChapterFromTitle, TrimTitle } from "../shared/StringOutput";
import type { Feed, FeedItem, RawFeed } from "../shared/types/rssType";
import type { Settings } from "../shared/types/settings";
import { getAllHermidata, getAllRawFeeds, getSettings } from "../shared/types/Storage";
import type { Hermidata, NovelType, ReadStatus } from "../shared/types/type";

function getToken(callback: Function) {
    chrome.storage.local.get(["googleAccessToken", "googleTokenExpiry","userEmail"], (items: BackgroundStorageItems) => {
        const now = Date.now();

        if (items.googleAccessToken && items.googleTokenExpiry > now) {
            // Token is still valid
            return callback(items.googleAccessToken);
        }
        const clientId = '10068474315-qegara9du372dg55gv3tur6keuegke4n.apps.googleusercontent.com';
        const redirectUri = chrome.identity.getRedirectURL();
        console.log(redirectUri)
        const scope = 'https://www.googleapis.com/auth/spreadsheets';
        const loginHintParam = items.userEmail ? `&login_hint=${encodeURIComponent(items.userEmail)}` : "";
        const authUrl =
            `https://accounts.google.com/o/oauth2/auth` +
            `?client_id=${clientId}` +
            `&response_type=token` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&scope=${encodeURIComponent(scope)}` + 
            loginHintParam;

        chrome.identity.launchWebAuthFlow(
            { url: authUrl, interactive: true },
            (redirectUrl) => {
            if (chrome.runtime.lastError || !redirectUrl) {
                console.error('Auth failed:', chrome.runtime.lastError?.message || 'No redirect URL returned');
                return;
            }

            // Parse the access token from the URL and save it in local storage
            const params = new URLSearchParams(new URL(redirectUrl).hash.substring(1));
            const token = params.get("access_token");
            if (!token) {
                console.error("Access token not found in redirect URL");
                return;
            }
            const expires_inString = params.get("expires_in");
            if (!expires_inString) {
                console.error("Expires in not found in redirect URL");
                return;
            }
            const expiresIn = Number.parseInt(expires_inString, 10) * 1000; // ms
            const expiry = Date.now() + expiresIn;

            if (!token) {
                console.error("Access token not found in redirect URL");
                return;
            }

            // Extract the email if possible via API or save if known
            const updatedStorage: BackgroundStorageItems = {
                googleAccessToken: token,
                googleTokenExpiry: expiry
            };

            if (items.userEmail) {
                updatedStorage.userEmail = items.userEmail;
            }

            chrome.storage.local.set(updatedStorage, () => {
                callback(token);
            });
        });
    });
}
// Update Icon
function updateIcon(Url: string | null = null, currentTabParameter: chrome.tabs.Tab | null = null) {
    const actionApi = ext.action || ext.browserAction;

    const currentTabId = currentTab?.id || currentTabParameter?.id;

    if (Url) {
        chrome.tabs.query({active : true}, (tabs) => {
            const matchedTab = tabs.find(t => t.url === Url);
            if (!matchedTab) {
                console.warn("No tab found with matching URL");
                return;
            }
            if (!matchedTab.id) {
                console.warn("Tab id not found");
                return;
            }
            setIconAndTitle(actionApi, matchedTab.id);
        });
    } else if (currentTabId) {
        setIconAndTitle(actionApi, currentTabId);
    } else {
        console.warn("No valid tab to set icon");
    }
}
// mapping function to normalize types before looking up the folder
function resolveBaseType(type: string) {
    const map: { [key: string]: string } = {
        Manga: "Manga",
        Manhwa: "Manga",
        Manhua: "Manga",

        Novel: "Novel",
        Webnovel: "Novel",

        Anime: "Anime",
        "TV-Series": "TV-Series",
    };
    return map[type] || type;
}

function resolveBaseStatus(status: string) {
    const map: { [key: string]: string } = {
        Viewing: "Viewing",
        
        Finished: "Finished",
        
        Dropped: "Dropped",
        
        Planned: "Planned",
        "On-hold": "Planned"
    }
    return map[status] || status
}
// Helper function to set icon and title
function setIconAndTitle(actionApi: ActionApi, tabId: number) {
    const iconPath = currentBookmark
        ? { 48: "assets/icon_red48.png" }
        : { 48: "assets/icon48.png" };

    actionApi.setIcon({
        path: iconPath,
        tabId: tabId
    }, () => {
        if (chrome.runtime.lastError) {
            console.warn("setIcon error:", chrome.runtime.lastError.message);
        }
    });

    actionApi.setTitle({
        title: currentBookmark ? 'Already bookmarkt!' : 'Bookmark it!',
        tabId: tabId
    }, () => {
        if (chrome.runtime.lastError) {
            console.warn("setTitle error:", chrome.runtime.lastError.message);
        }
    });
}
// ==== Bookmarking Functions ====
function extractTitleFromBookmark(title: string) {
    return title.split(" - Chapter ")[0].trim();
}
async function writeToBookmarks(dataArray: InputArrayType) {
    const bookmarks = await searchValidBookmarks();
    const rows: Partial<chrome.bookmarks.BookmarkTreeNode>[] = bookmarks
        .filter(b => b.url)
        .map(b => ({
            title: extractTitleFromBookmark(b.title),
            url: b.url,
            id: b.id
        }));
    const decision = shouldReplaceOrBlock(dataArray, rows, false);
    if (decision.action === "append") {
        addBookmark(dataArray);
        console.log("Added bookmark entry.");
    } else if (decision.action === "replace") {
        replaceBookmark(dataArray, decision);
        console.log("Replaced bookmark entry.");
    } else {
        console.log("Skipping bookmark entry.");
    }
}
function shouldReplaceOrBlock(newEntry: InputArrayType, existingRows: Partial<chrome.bookmarks.BookmarkTreeNode>[] | any, isSheet = true) {
    const [title,, chapter, url,, date,] = newEntry;
    let oldTitle, oldUrl, oldDate, id;

    for (let i = 0; i < existingRows.length; i++) {
        if (isSheet) {
            [oldTitle,,,,, oldUrl,,, oldDate,,,,] = existingRows[i];
        } else {
            const row = existingRows[i] as Partial<chrome.bookmarks.BookmarkTreeNode>;
            ({ title: oldTitle, url: oldUrl, date: oldDate, id } = row);
        }
            
        const SameTrimedTitle = title.trim().toLowerCase() === oldTitle?.trim().toLowerCase();

        const { title: OldTitleParsed, chapter: oldChapterParsed } = parseMangaFireUrl(oldUrl);
        const  { title: TitleParsed, chapter: ChapterParsed } = parseMangaFireUrl(url);
        
        const SameTitle = OldTitleParsed === TitleParsed;
        const isSame = isSheet ? SameTrimedTitle : SameTitle;

        if (isSame) {
            const chapterChanged = chapter !== oldChapterParsed;
            const chapterChangedURL = ChapterParsed !== oldChapterParsed;
            if (chapterChanged) {
                return { action: "replace", rowIndex: i + 2, replacedURL: oldUrl, replaceID: id };
            } else if (date > oldDate && oldDate !== undefined) {
                return { action: "alert" };
            } else {
                return { action: "skip" };
            }
        }
    }

    return { action: "append" };
}
async function addBookmark([title, type, chapter, url, status, date, tags, notes]: InputArrayType) {
    const settings = await getSettings();
    const baseType = resolveBaseType(type);
    const baseStatus = resolveBaseStatus(status);
    const folderInfo = settings?.FolderMapping?.[baseType]?.[baseStatus];
    if (!folderInfo?.path) {
        console.warn("Folder mapping not found for", type, status);
        return;
    }
    const Browserroot = typeof browser !== "undefined" && navigator.userAgent.includes("Firefox")
    ? "Bookmarks Menu"
    : "Bookmarks";
    const pathSegments = folderInfo.path.split('/').filter(Boolean);
    const finalFolderId: string = await new Promise((resolve) => {
        createNestedFolders(pathSegments, Browserroot, resolve);
    });
    const bookmarkTitle = `${title} - Chapter ${chapter || '0'}`;
    const bookmark = await createBookmark({
        parentId: finalFolderId,
        title: bookmarkTitle,
        url
    });
    console.log("Created bookmark", bookmark);
    updateCurrentBookmarkAndIcon();
    console.log('Change Icon');
}
async function replaceBookmark(dataArray: InputArrayType, decision: ReturnType<typeof shouldReplaceOrBlock>) {
    const { rowIndex, replacedURL: OldURL, replaceID: OldID } = decision;
    const [title, type, chapter, url, status, date, tags, notes] = dataArray;
    const bookmarkTitle = `${title} - Chapter ${chapter || '0'}`;
    
    const settings = await new Promise((resolve) => {
        chrome.storage.sync.get(["Settings"], (result) => resolve(result.Settings));
    });
    const baseType = resolveBaseType(type)
    const baseStatus = resolveBaseStatus(status)
    const folderInfo = settings?.FolderMapping?.[baseType]?.[baseStatus];
    if (!folderInfo?.path) {
        console.warn("Folder mapping not found for", type, status);
        return;
    }

    const Browserroot = browser !== undefined && navigator.userAgent.includes("Firefox")
    ? "Bookmarks Menu"
    : "Bookmarks";
    const pathSegments = folderInfo.path.split('/').filter(Boolean);

    const finalFolderId: string = await new Promise<string>((resolve) => {
        return createNestedFolders(pathSegments, Browserroot, resolve);
    });
    const freshBookmarks = await searchValidBookmarks();
    const bookmarkToUpdate = freshBookmarks.find(b => b.url === OldURL);
    const bookmarkToUpdateTest = freshBookmarks.find(b => b.id === OldID);
    if (bookmarkToUpdate && bookmarkToUpdateTest) {
        // Move to new folder if needed
        if (bookmarkToUpdate.parentId !== finalFolderId) {
            await moveBookmark(bookmarkToUpdate.id, finalFolderId);
            console.log("Moved bookmark to new folder");
        }
        const updated = await updateBookmark(bookmarkToUpdate.id, {title:bookmarkTitle, url: url});

        console.log("Updated bookmark", updated);
    } else {
        console.warn("Old bookmark not found, adding new one.");
        addBookmark(dataArray);
    }
    updateCurrentBookmarkAndIcon();
    console.log('Change Icon');
}
// ==== Sheet Functions ====
function extractSpreadsheetId(url: string) {
    const match = new RegExp(/\/d\/([a-zA-Z0-9-_]+)/).exec(url);
    return match ? match[1] : null;
}
function writeToSheet(token: number, dataArray: InputArrayType) {
    readSheet(token, (rows: any) => {
        const decision = shouldReplaceOrBlock(dataArray, rows, true);

        if (decision.action === "append") {
        appendRow(token, dataArray);
        } else if (decision.action === "replace") {
            if (!decision.rowIndex) throw new Error("Row index not found.");
            updateRow(token, decision.rowIndex, dataArray);
        } else {
        console.log("Skipping entry.");
        }
    });
}
/**
 * This function reads the google sheet and throws it back inside callback.
 * @param {number} token - The parameter for the authorization 
 * @returns {number} The callback for the result
 */
function readSheet(token: number, callback: Function) {
    chrome.storage.sync.get<{ spreadsheetUrl: string }>(["spreadsheetUrl"], (result) => {
        const spreadsheetId = extractSpreadsheetId(result.spreadsheetUrl);
        const range = "Sheet1!A2:H"; // Adjust if more columns are added

        fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`, {
            method: "GET",
            headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
            }
        })
        .then(res => res.json())
        .then(data => {
            const rows = data.values || [];
            callback(rows);
        })
        .catch(err => console.error("Error reading sheet:", err));
    });
}
function appendRow(token: number, dataArray: InputArrayType) {
    chrome.storage.sync.get<{ spreadsheetUrl: string }>(["spreadsheetUrl"], (result) => {
        const spreadsheetId = extractSpreadsheetId(result.spreadsheetUrl);
        const range = "Sheet1!A2";
        fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=RAW`, {
            method: "POST",
            headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
            },
            body: JSON.stringify({ values: [dataArray] })
        })
        .then(res => res.json())
        .then(data => console.log("Row appended:", data))
        .catch(err => console.error("Append error:", err));
    });
}

function updateRow(token: number, rowIndex: number, dataArray: InputArrayType) {
    chrome.storage.sync.get<{ spreadsheetUrl: string }>(["spreadsheetUrl"], (result) => {
        const spreadsheetId = extractSpreadsheetId(result.spreadsheetUrl);
        const range = `Sheet1!A${rowIndex}:H${rowIndex}`; // assumes 8 columns
        fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`, {
            method: "PUT",
            headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
            },
            body: JSON.stringify({ values: [dataArray] })
        })
        .then(res => res.json())
        .then(data => console.log("Row updated:", data))
        .catch(err => console.error("Update error:", err));
    });
}
// === Helpers ===
// Recursive helper to find a nested folder path
async function findFolderPath(rootId: string, pathSegments: string[], index: number = 0): Promise<chrome.bookmarks.BookmarkTreeNode | null> {
    const children = await getBookmarkChildren(rootId);
    if (!children) return null;
    
    for (const child of children) {
        if (!child.url && child.title === pathSegments[index]) {
            if (index === pathSegments.length - 1) return child; // found full path
            const result = await findFolderPath(child.id, pathSegments, index + 1);
            if (result) return result;
        }
    }
    
    return null;
}
// Create missing folders in the path
async function createMissingFolders(baseId: string, pathSegments: string[], index = 0) {
    if (index >= pathSegments.length) return baseId;
    
    const children = await getBookmarkChildren(baseId);
    let folder = children.find(child => !child.url && child.title === pathSegments[index]);
    
    if (!folder) {
        folder = await createBookmark({ parentId: baseId, title: pathSegments[index] });
    }
    
    return createMissingFolders(folder.id, pathSegments, index + 1);
}
// Main entry point
async function createNestedFolders(pathSegments: string[], rootTitle: string, callback: (folderId: string) => (string)): Promise<string | null> {
    try {
        const rootId = await getRootByTitle(rootTitle);
        if (!rootId) throw new Error(`Root folder "${rootTitle}" not found`);
        const existingFolder = await findFolderPath(rootId, pathSegments);
        if (existingFolder) {
            callback(existingFolder.id);
            return existingFolder.id;
        }

        const createdFolderId = await createMissingFolders(rootId, pathSegments);
        callback(createdFolderId);
        return createdFolderId;
    } catch (err) {
        console.error("Error in createNestedFolders:", err);
        return null;
    }
}
function getCurrentDate() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${day}/${month}/${year}`;
}
function parseMangaFireUrl(url: string) {
    try {
        const parts = new URL(url).pathname.split('/').filter(Boolean);
        const titleSlug = parts.includes('read') ? parts[parts.indexOf('read') + 1] : parts[2] || parts[1];
        if (!titleSlug) return { title: "Unknown", chapter: "0" }
        const chapter = parts.at(-1)?.includes('chapter') ?  parts.at(-1)?.replace('chapter-', '') : '0';
        const title = titleSlug
            .split('.')[0]             // remove Site's ID code (.yvov1)
            .replace(/(.)\1$/, '$1')   // Remove last char if second to last is the same
            // .split('-')[0]             // remove possible advert's 
            .replaceAll('-', ' ')        // hyphens to spaces
            .replaceAll(/\b\w/g, c => c.toUpperCase()); // capitalize words

        return {
            title,
            chapter
        };
    } catch (err) {
        console.error("Invalid URL", err);
        return { title: "Unknown", chapter: "0" };
    }
}
/**
 * Opera only: This function retrieves the ID of the "Trash" folder in bookmarks.
 * @param {*} query 
 * @returns {Promise<Array>} Returns a promise that resolves to an array of valid bookmarks.
 */
async function searchValidBookmarks(query: string = "") {
    const trashId = await getTrashFolderId();
    const all = await searchBookmarks(query);

    return all.filter(b => {
        return b.url && b.parentId !== trashId && b.parentId !== "undefined";
    });
}
/**
 *  This function retrieves the ID of the "Trash" folder in bookmarks.
 *  It searches through the bookmark tree for nodes with titles like "bin", "trash", or "deleted".
 * @returns {Promise<string|null>} Returns a promise that resolves to the ID of the "Trash" folder or null if not found.
 */
async function getTrashFolderId(): Promise<string | null> {
    return new Promise((resolve) => {
        chrome.bookmarks.getTree((nodes) => {
            const trashNode = 
                findNodeByTitle(nodes[0], "trash") ||
                findNodeByTitle(nodes[0], "Other bookmarks") ||
                findNodeByTitle(nodes[0], "bin") ||
                findNodeByTitle(nodes[0], "Bin") ||
                findNodeByTitle(nodes[0], "deleted") ||
                findNodeByTitle(nodes[0], "Deleted");
            resolve(trashNode?.id || null);
        });
    });
}
// Helper function to find a node by title in the bookmark tree
function findNodeByTitle(node: chrome.bookmarks.BookmarkTreeNode, title: string): chrome.bookmarks.BookmarkTreeNode | null {
    if (node.title === title) return node;
    if (node.children) {
        for (const child of node.children) {
            const found = findNodeByTitle(child, title);
            if (found) {
                return found;
            }
        }
    }
    return null;
}
async function getRootByTitle(title: string) {
    const trees: chrome.bookmarks.BookmarkTreeNode[] = await new Promise((resolve) => chrome.bookmarks.getTree(resolve));
    let rootidList = [];
    const rootNode = trees[0];
    rootidList.push(rootNode.id);

    for (const child of rootNode.children || []) {
        if (child.title === title && !child.url) {
            rootidList.push(child.id)
            return rootidList.at(-1);
        }
    }
    return rootNode.id;
}
async function searchBookmarks(query: string): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
    if (browser !== undefined && browser.bookmarks?.search) {
        const Results = await browser.bookmarks.search(query)
        return Results;
    }
    return await new Promise<chrome.bookmarks.BookmarkTreeNode[]>((resolve, reject) => {
        chrome.bookmarks.search(query, (results) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError?.message));
        else resolve(results);
        });
    });
}
function updateBookmark(id: string, changes: Partial<chrome.bookmarks.BookmarkTreeNode>): Promise<chrome.bookmarks.BookmarkTreeNode> {
    if (browser !== undefined && browser.bookmarks?.update) {
        return browser.bookmarks.update(id, changes);
    }
    return new Promise((resolve, reject) => {
        chrome.bookmarks.update(id, changes, (result) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError?.message));
        else resolve(result);
        });
    });
}
function getAllBookmarks(id: string): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
    if (browser !== undefined && browser.bookmarks?.getSubTree) {
        return browser.bookmarks.getSubTree(id);
    }
    return new Promise<chrome.bookmarks.BookmarkTreeNode[]>((resolve, reject) => {
        chrome.bookmarks.getSubTree(id, (result) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError?.message));
        else resolve(result);
        });
    });
}
function moveBookmark(id: string, parentId: string) {
    if (browser !== undefined && browser.bookmarks?.move) {
        return browser.bookmarks.move(id, { parentId });
    }
    return new Promise((resolve, reject) => {
        chrome.bookmarks.move(id, { parentId }, (result) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError?.message));
            else resolve(result);
        });
    });
}
function createBookmark(bookmarkObj: Partial<chrome.bookmarks.BookmarkTreeNode>): Promise<chrome.bookmarks.BookmarkTreeNode> {
    if (browser !== undefined && browser.bookmarks?.create) {
        return browser.bookmarks.create(bookmarkObj);
    }
    return new Promise((resolve, reject) => {
        chrome.bookmarks.create(bookmarkObj, (result) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError?.message));
        else resolve(result);
        });
    });
}
function getBookmarkChildren(parentId = "2"): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
    if (browser !== undefined && browser.bookmarks?.getChildren) {
        return browser.bookmarks.getChildren(parentId);
    }
    return new Promise((resolve, reject) => {
        chrome.bookmarks.getChildren(parentId, (children) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError?.message));
        else resolve(children);
        });
    });
}
async function updateCurrentBookmarkAndIcon(Url: string | null = null) {
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!currentTab && Url == null) return;
    // initialize currentBookmark
    let searchUrl = Url ?? currentTab.url;
    let NewUrl;

    const fuzzyPromise = hasRelatedBookmarkCached(currentTab);

    // get valid bookmark
    const validBookmarks = await searchValidBookmarks(searchUrl);
    if (validBookmarks.length > 0) {
        currentBookmark = validBookmarks[0]
        updateIcon(currentBookmark.url);
    }else {
        currentBookmark = null;
        updateIcon(NewUrl, currentTab);
    }
    if (!currentBookmark) { // if dons't already have valid bookmark
        // get fuzzy bookmark & hermidata | slower
        const validFuzzyBookmarks = await fuzzyPromise;
        const isValid = validFuzzyBookmarks?.bookmarkSameChapter || validFuzzyBookmarks?.hermidataSameChapter || false;
        const validEntry = validFuzzyBookmarks?.bookmark || validFuzzyBookmarks?.hermidata || null;
        if (isValid && validEntry) {
            currentBookmark = validEntry;
            updateIcon(validEntry.url || validEntry.currentUrl || searchUrl);
        }
    }
}
async function hasRelatedBookmarkCached(tab: chrome.tabs.Tab) {
    if (fuzzyCache.has(tab.url)) return fuzzyCache.get(tab.url);
    const result = await hasRelatedBookmark(tab);
    fuzzyCache.set(tab.url, result);
    return result;
}

/**
 * Return the bookmark after a fuzzy search instead of a direct search
 * @param {*} currentTab 
 * @returns 
 */
async function hasRelatedBookmark(currentTab: chrome.tabs.Tab) {
    const Browserroot = browser !== undefined && navigator.userAgent.includes("Firefox")
        ? "Bookmarks Menu"
        : "Bookmarks";
    const settings = settingsCashed || await getSettings();
    if (!settingsCashed) settingsCashed = settings;
    let flatmapFolderInfo = []
    for (const element of Object.values(settings?.FolderMapping)) {
        const element1 = element;
        for (const element of Object.values(element1)) {
            const element2 = element;
                flatmapFolderInfo.push(element2)
        }
        
    }
    
    const resultFuzzyBookmark = await detectFuzzyBookmark(currentTab, flatmapFolderInfo, Browserroot);
    const ressultFuzzyHermidata = await detectFuzzyHermidata(currentTab);
    let sameChapter;
    const finalObj: { bookmark?: fuzzyBookmarkMatches, bookmarkSameChapter?: boolean, hermidataSameChapter?: boolean, hermidata?: fuzzyHermidataMatches} = {};
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
function isSameChapterCount(a: (fuzzyBookmarkMatches | fuzzyHermidataMatches),b: chrome.tabs.Tab) {
    let isSameNummber = false;

    const fuzzychapter = (a as fuzzyHermidataMatches).chapter ?? getChapterFromTitle(a.bookmarkTitle, a.fuzzySearchUrl)
    if (!b.title || !b.url) return isSameNummber
    const curentTabChapter = getChapterFromTitle(b.title, b.url)



    if ( fuzzychapter === curentTabChapter) isSameNummber = true
    return isSameNummber
}
async function detectFuzzyHermidata(currentTab: chrome.tabs.Tab, threshold = 0.8): Promise<{hasValidFuzzyHermidata: boolean, fuzzyMatches: fuzzyHermidataMatches[]}> {
    const fuzzyMatches: fuzzyHermidataMatches[] = [];
    const allHermidata = PastHermidata.AllHermidata ?? await getAllHermidata();
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
async function detectFuzzyBookmark(currentTab: chrome.tabs.Tab, flatmapFolderInfo: Record<string, any>[], Browserroot: string, threshold = 0.8): 
    Promise<{hasValidFuzzyBookmark: boolean, fuzzyMatches: fuzzyBookmarkMatches[]}> {
    const fuzzyMatches: fuzzyBookmarkMatches[] = [];
    

    for (const element of flatmapFolderInfo) {
        const folder = element;
        folder.pathSegments = folder.path.split('/').filter(Boolean);
        folder.finalFolderId = await new Promise((resolve) => {
            createNestedFolders(folder.pathSegments, Browserroot, resolve);
        });
        folder.bookmarks = await getBookmarkChildren(folder.finalFolderId);

        for (const bookmark of folder.bookmarks) {
            if (!currentTab.title) continue;
            const score = CalcDiff(bookmark.title, currentTab.title);

            if (score >= threshold) {
                fuzzyMatches.push({
                    folderPath: folder.path,
                    bookmarkTitle: bookmark.title,
                    fuzzySearchUrl: bookmark.url,
                    currentUrl: currentTab.url,
                    similarity: score
                });

                console.warn(
                    `[Fuzzy Match ${score.toFixed(2)}] "${bookmark.title}" ↔ "${currentTab.title}" in folder "${folder.path}"`
                );
            }
        }
    }

    const hasValidFuzzyBookmark = fuzzyMatches.length > 0;
    return ({ hasValidFuzzyBookmark, fuzzyMatches });
}


// Helper: parse only the first 1–2 items
function getFeedLatestToken(xmlText: string) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlText, "text/xml");
        const items = [...doc.querySelectorAll("item, entry")].slice(0, 2); // Only first 2
        if (items.length === 0) return null;

        // Prefer guid/id/link/pubDate/title — whichever exists first
        const item = items[0];
        const guid = item.querySelector("guid")?.textContent?.trim();
        if (guid) return `guid:${guid}`;
        const id = item.querySelector("id")?.textContent?.trim();
        if (id) return `id:${id}`;

        const linkEl = item.querySelector("link");
        const href = linkEl?.getAttribute?.("href");
        if (href) return `link:${href}`;
        const linkText = linkEl?.textContent?.trim();
        if (linkText) return `link:${linkText}`;

        const pub = item.querySelector("pubDate, updated, published")?.textContent?.trim();
        if (pub) return `pub:${pub}`;

        const title = item.querySelector("title")?.textContent?.trim();
        if (title) return `title:${title}`;

        return null;
    } catch (e) {
        console.warn("[Hermidata] XML parse error:", e);
        return null;
    }
}

// Helper: SHA-1 hash as hex
async function sha1Hex(str: string) {
    const enc = new TextEncoder();
    const data = enc.encode(str);
    const hashBuffer = await crypto.subtle.digest("SHA-1", data);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}
async function webSearch() {
    // search the web for new releases

    // get the links to check
    const savedFeeds = await getAllRawFeeds();
    const allHermidata = await getAllHermidata();
    const allnovelRSS = Object.values(allHermidata).map(novel => novel?.rss).filter(Boolean);

    console.groupCollapsed(`[Hermidata] Web search - total RSS feeds to check: ${allnovelRSS.length}`);

    const combined = Object.values(savedFeeds).flatMap(f => f?.items).filter(Boolean);

    for (const novel of allnovelRSS) {
        if (!novel) continue;
        if (!novel.domain || !novel.latestItem?.title || !novel.url) {
            console.groupEnd();
            continue;
        }
        console.groupCollapsed(`[Hermidata] Web search for ${novel.latestItem?.title} in ${novel.domain}`);

        // get the rss feed text
        const feedText = await fetchFeedText(novel);
        if (!feedText) {
            console.warn("No feed text found:", novel.url);
            console.groupEnd();
            continue;
        }
        
        // get the latest token
        const token = getFeedLatestToken(feedText);
        if (!token) {
            console.warn("No token for feed:", novel.url);
            console.groupEnd();
            continue;
        }
        console.log(`[Hermidata] Latest token: ${token}`);

        // get the items
        const xml = parseXmlSafely(feedText, novel.latestItem?.title);
        const items = parseItems(xml, novel.latestItem?.title);
        if (!items.length) {
            console.warn("No items found in feed:", novel.url);
            console.groupEnd();
            continue;   
        }

        const newFeed: Partial<RawFeed> = {
            domain: novel.domain,
            lastFetched: new Date().toISOString(),
            lastToken: token,
            items,
            url: novel.url
        };

        // check if the feed is already in savedFeeds via token
        // const existingFeed = savedFeeds.find(f => f.lastToken === token);
        // if (existingFeed?.items?.[0]?.title === items[0].title) {
        //     console.log(`[Hermidata] Feed already exists v1: ${existingFeed.items[0].title}`);
        //     console.log(`[Hermidata] Feed already exists v2: ${items[0].title}`);
        //     console.groupEnd();
        //     continue;
        // }
        console.log(`[Hermidata] Adding feed title: ${items[0].title}`);
        
        const existingIndex = combined.findIndex(f => f.link === newFeed.url && f.link !== undefined);
        console.log(`[Hermidata] existingIndex: ${existingIndex}`);
        if (existingIndex === -1) {
            combined.push(newFeed);
            console.log(`[Hermidata] New feed added: ${newFeed.items[0].title}`);
        } else {
            // Existing feed → update if newer
            const existing = combined[existingIndex];
            console.log(`[Hermidata] Existing feed found: ${existing.items[0].title}`);
            console.log(`[Hermidata] Existing feed lastFetched: ${existing.lastFetched}, New feed lastFetched: ${newFeed.lastFetched}`);
            if (newFeed.lastFetched > existing.lastFetched) {
                combined[existingIndex] = { ...existing, ...newFeed };
                console.log(`[Hermidata] Updated feed: ${newFeed.items[0].title}`);
            }
        }
        
        
        
        console.groupEnd();
    }
    ext.storage.local.set({ savedFeeds: combined }).then(() => {
        console.log(`[Hermidata] ${Object.keys(savedFeeds).length} feeds saved to local storage`);
    });
    
    const HermidataToUpdate = {};
    for (const feed of combined) {
        const related = Object.values(allHermidata).find(h => h.rss?.url === feed.url);
        if (related?.rss) {
            related.rss.lastFetched = feed.lastFetched;
            related.rss.latestItem = feed.items[0];
            HermidataToUpdate[related.id] = related;
        }
    }
    for (const [key, value] of Object.entries(HermidataToUpdate)) {
        await ext.storage.sync.set({ [key]: value });
    };

    console.groupEnd();
}
async function checkFeedsForUpdates() {
    try {
        await webSearch();
        const savedFeeds = await getAllRawFeeds();
        const allHermidata = await getAllHermidata();

        if (Object.keys(allHermidata).length === 0) {
            console.log("[Hermidata] No Hermidata entries found, skipping feed check.");
            return;
        }

        for (const feed of Object.values(savedFeeds)) {
            try {
                if (shouldSkipFeed(feed, allHermidata)) continue;

                // Try to get HEAD metadata (ETag, Last-Modified)
                const meta = await fetchFeedHead(feed);
                if (isFeedUnchanged(feed, meta)) {
                    continue;
                }

                // Fetch the full feed
                const text = await fetchFeedText(feed);
                if (!text) continue;

                // Detect content changes via token or hash
                if (!await hasFeedChanged(feed, text)) {
                    continue;
                }

                // Parse and handle feed contents
                const xml = parseXmlSafely(text, feed.title);
                const items = parseItems(xml, feed.title);
                compareLastSeen(items, feed);

                // Save metadata
                saveFeedMetaData(feed, meta);

            } catch (err) {
                console.error(`[Hermidata] [✕] Failed to check feed ${feed.url}:`, err);
            }
        }

        lastAutoFeedCkeck = Date.now();
        await ext.storage.local.set({ savedFeeds });
    } catch (err) {
        console.error(`[Hermidata] [✕] Failed to check feeds:`, err);
    }
}
// ==== feed helpers ====
function shouldSkipFeed(feed: RawFeed, allHermidata: Record<string, Hermidata>) {
    const novel = Object.values(allHermidata).find(novel => novel?.rss?.url === feed.url);
    return novel === undefined;
}
async function fetchFeedHead(feed: RawFeed) {
    
    let meta: Meta = { etag: null, lastModified: null };
    try {
        const head = await fetch(feed.url, { method: "HEAD" });
        if (head.ok) {
            meta.etag = head.headers.get("etag");
            meta.lastModified = head.headers.get("last-modified");
        } else {
        console.warn(`[Hermidata] HEAD not allowed for ${feed.domain} ( ${feed.title} | ${head.status} ). Falling back to GET.`);
    }
    } catch {
        console.warn(`[Hermidata] HEAD failed for ${feed.title}, using GET fallback`);
    }
    return meta;
}
function isFeedUnchanged(feed: RawFeed, meta: Meta) {
    return (
        meta.etag &&
        meta.lastModified &&
        feed.etag === meta.etag &&
        feed.lastModified === meta.lastModified
    );
}
async function fetchFeedText(feed: Feed) {
    const response = await fetch(feed.url);
    if (!response.ok) {
        console.warn(`[Hermidata] Feed GET failed: ${feed.url} (${response.status})`);
        return null;
    }
    return await response.text();
}
async function hasFeedChanged(feed: RawFeed, text: string) {
    const latestToken = getFeedLatestToken(text);
    let feedChanged = false;

    if (latestToken && feed.lastToken !== latestToken) {
        feedChanged = true;
        feed.lastToken = latestToken;
    } else if (!latestToken) {
        // fallback: hash of first 5KB
        const snippet = text.slice(0, 5000);
        const hash = await sha1Hex(snippet);
        if (feed.lastHash !== hash) {
            feedChanged = true;
            feed.lastHash = hash;
        }
    }

    return feedChanged;
}
function parseXmlSafely(text: string, title: string) {
    const parser = new DOMParser();
    let xml = parser.parseFromString(text, "text/xml");

    if (xml.querySelector("parsererror")) {
        console.warn(`[Hermidata] XML parsing failed for ${title}, falling back to text/html mode.`);
        xml = parser.parseFromString(text, "text/html");
    }

    return xml;
}

function parseItems(xml: Document, title: string) {
    const entries = [...xml.querySelectorAll("item, entry")];
    if (!entries.length) {
        console.warn(`[Hermidata] No <item> or <entry> elements found in ${title}.`);
        return [];
    }
    
    return entries.slice(0, 10).map(item => ({
        title: item.querySelector("title")?.textContent.trim() ?? "",
        link: (
            item.querySelector("link")?.getAttribute?.("href") ??
            item.querySelector("link")?.textContent ??
            ""
        ).trim(),
        pubDate: item.querySelector("pubDate, updated, published")?.textContent.trim() ?? "",
        guid:
        item.querySelector("guid")?.textContent ??
        item.querySelector("id")?.textContent ??
        item.querySelector("link")?.textContent ??
        ""
    }));
}

function saveFeedMetaData(feed: RawFeed, meta: Meta) {
    feed.etag = meta.etag;
    feed.lastModified = meta.lastModified;
    feed.lastChecked = new Date().toISOString();
}

function compareLastSeen(items: FeedItem[], feed: RawFeed) {
    if (!items.length) return feed;
    const latest = items[0];
    if (latest.guid !== feed.lastSeenGuid || latest.pubDate !== feed.lastSeenDate) {
        const newCount = items.findIndex(i => i.guid === feed.lastSeenGuid && i.pubDate === feed.lastSeenDate);
        const newItems = newCount === -1 ? items : items.slice(0, newCount);
        notifyUser(feed, newItems);

        feed.lastSeenGuid = latest.guid;
        feed.lastSeenDate = latest.pubDate;
    }

    return feed;
}

async function notifyUser(feed: RawFeed, newItems: FeedItem[]) {
    const allHermidata = allHermidataCashed || await getAllHermidata();
    if (shouldSkipFeed(feed, allHermidata)) return;
    const title = `${feed.title}: ${newItems.length} new chapter${newItems.length > 1 ? "s" : ""}`;
    const message = newItems[0].title.concat("\n");
    ext.notifications.create({
        type: "basic",
        iconUrl: "assets/icon48.png",
        title,
        message
    });
}

let currentBookmark: chrome.bookmarks.BookmarkTreeNode | null = null;
let currentTab: chrome.tabs.Tab | null = null;

let generalFuzzyBookmark = null;

let lastAutoFeedCkeck = 0
let lastFeedCkeck = 0;

const CalcDiffCache = new Map();

const fuzzyCache = new Map();

type Meta = {
    etag: string | null;
    lastModified: string | null
}
type InputArray = [{
    title: string, 
    type: NovelType, 
    chapter: number,
    url: string,
    status: ReadStatus,
    date: string,
    tags: string[],
    notes: string
}]
type BackgroundStorageItems = {
    googleAccessToken: string;
    googleTokenExpiry: number;
    userEmail?: string;
}


interface fuzzyBookmarkMatches {
    folderPath: string;
    bookmarkTitle: string;
    fuzzySearchUrl: string;
    currentUrl: string | undefined;
    similarity: number;
}
interface fuzzyHermidataMatches {
    bookmarkTitle: string,
    fuzzySearchUrl: string,
    chapter: number,
    currentUrl: string | undefined,
    similarity: number
}

type InputArrayType = [string, NovelType, number, string, ReadStatus, string, string[], string]

type ActionApi = typeof ext.action | typeof ext.browserAction;

let selectedIndex = -1;

let allHermidataCashed: Record<string, Hermidata>;
let settingsCashed: Settings;

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.get<Record<string, Settings>>([ "Settings" ], (result) => {
        const Settings = result.Settings;
        if (Settings?.AllowContextMenu) {
            chrome.contextMenus.create({
                id: "Hermidata",
                title: "Save to Hermidata",
                contexts: ["link"]
            });
        }
    });
});
// Context-Menu Listener
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "Hermidata") {
        chrome.storage.sync.get<Record<string, Settings>>([ "Settings" ], (result) => {
            if (result.AllowContextMenu) {
                const Settings = result.Settings
                // Send tab info to your saving logic
                if (!info.linkUrl) return
                fetch(info.linkUrl, { method: "HEAD" })
                .then(response => {
                    const finalUrl = response.url;
                    let { title, chapter } = parseMangaFireUrl(finalUrl);
                    let url = finalUrl;
                    let date = getCurrentDate(); // yyyy-mm-dd
                    let type = Settings.DefaultChoiceText_Menu.Type;
                    let status = Settings.DefaultChoiceText_Menu.status;
                    let tags = Settings.DefaultChoiceText_Menu.tags;
                    let notes = Settings.DefaultChoiceText_Menu.notes;
                    const data = [title, type, chapter, url, status, date, tags, notes];
                    getToken((token: string) => {
                        writeToSheet(token, data);
                        writeToBookmarks(data);
                        updateCurrentBookmarkAndIcon(url)
                    });
                })
                .catch(err => console.error("Failed to resolve redirect:", err));
            }
        });
    }
});

setInterval(checkFeedsForUpdates, 30 * 60 * 1000); // run every 30 min

chrome.runtime.onStartup.addListener(() => {
    updateCurrentBookmarkAndIcon();
    checkFeedsForUpdates();
});

chrome.tabs.onActivated.addListener(() => {
    updateCurrentBookmarkAndIcon();
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        allHermidataCashed ??= await getAllHermidata();
        // Only update if this tab is active in the current window
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs.length && tabs[0].id === tabId) {
                updateCurrentBookmarkAndIcon();
            }
        });
    }
});
// open settings fix bug from V
chrome.runtime.onInstalled.addListener((details) => {
    checkFeedsForUpdates();

    chrome.storage.sync.get([ "Settings" ], (result) => {
        const settings = result?.Settings;
        if (details.reason === "install") {
            // Open settings on first install to fix bug from V?
            if (!settings) chrome.runtime.openOptionsPage();
        } else if (details.reason === "update") {
            const thisVersion = chrome.runtime.getManifest().version;
            console.log(`Updated to version ${thisVersion}`);
            // open settings after an update to fix bug from V?
            if (!settings) chrome.runtime.openOptionsPage();
        }
        
    });
});



// usage from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "SAVE_NOVEL") {
        getToken((token) => {
            writeToSheet(token, msg.data);
            writeToBookmarks(msg.data);
        });
        updateCurrentBookmarkAndIcon(msg.data[3]);
    }
    else if (msg.type === "RELOAD_RSS_SYNC") {
        const now = Date.now()
        if (now - lastFeedCkeck >= 1000 *60 * 2) { // 2min passed
            lastFeedCkeck = now;
            checkFeedsForUpdates();
            chrome.runtime.sendMessage({ type: "SYNC_COMPLETED" });
        } else {
            console.log('Skipping - already checked recently')
        }
    }
    else if ( msg.type === "GET_LAST_SYNC") {
        // Send the age in minutes (max 2 digits)
        const diffMinutes = lastAutoFeedCkeck
        ? Math.min(99, Math.floor((Date.now() - lastAutoFeedCkeck) / 60000))
        : null;

        sendResponse({ minutesAgo: diffMinutes });
    }
});
