import { ext } from "../shared/utils/BrowserCompat";
import type { InputArraySheetType, InputArrayType, ShouldReplaceOrBlockReturn, ShouldReplaceReturn } from "../shared/types/index";
import { getSettings } from "../shared/db/Storage";
import { hasRelatedBookmarkCached } from "./fuzzy";
import { currentBookmark, setState } from "./state";
import { updateIcon } from "./tabs";
import { getTitleAndChapterFromUrl, TrimTitle } from "../shared/utils/StringOutput";
import { FolderMapping } from "../settings/build/FolderMapping";

declare const browser: typeof chrome | undefined;


export async function writeToBookmarks(dataArray: InputArrayType) {
    const bookmarks = await searchValidBookmarks();
    const rows: chrome.bookmarks.BookmarkTreeNode[] = bookmarks.filter(b => b.url);
    rows.forEach(b => b.title = extractTitleFromBookmark(b.title));

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

async function addBookmark([title, type, chapter, url, status,,]: InputArrayType) {
    const settings = await getSettings();
    const folderMapPath = FolderMapping.resolveFolder(type, status, settings.FolderMapping);
    if (!folderMapPath) {
        console.warn("Folder mapping not found for", type, status);
        return;
    }
    const Browserroot = browser !== undefined && navigator.userAgent.includes("Firefox")
    ? "Bookmarks Menu"
    : "Bookmarks";
    const pathSegments = folderMapPath.split('/').filter(Boolean);
    const finalFolderId: string = await createNestedFolders(pathSegments, Browserroot);
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
async function replaceBookmark(dataArray: InputArrayType, decision: ShouldReplaceReturn) {
    const { replacedURL: OldURL, replaceID: OldID } = decision;
    const [title, type, chapter, url, status] = dataArray;
    const bookmarkTitle = `${title} - Chapter ${chapter || '0'}`;
    
    
    const settings = await getSettings();
    const folderMapPath = FolderMapping.resolveFolder(type, status, settings.FolderMapping);
    if (!folderMapPath) {
        console.warn("Folder mapping not found for", type, status);
        return;
    }

    const Browserroot = browser !== undefined && navigator.userAgent.includes("Firefox")
    ? "Bookmarks Menu"
    : "Bookmarks";
    const pathSegments = folderMapPath.split('/').filter(Boolean);

    const finalFolderId: string = await createNestedFolders(pathSegments, Browserroot);
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



export function shouldReplaceOrBlock(newEntry: InputArrayType, existingSheetRows: InputArraySheetType[], isSheet: true): ShouldReplaceOrBlockReturn
export function shouldReplaceOrBlock(newEntry: InputArrayType, existingBookmarksRows: chrome.bookmarks.BookmarkTreeNode[], isSheet: false): ShouldReplaceOrBlockReturn
export function shouldReplaceOrBlock(newEntry: InputArrayType, existingRows: chrome.bookmarks.BookmarkTreeNode[] | InputArraySheetType[], isSheet: boolean = true): ShouldReplaceOrBlockReturn {
    const [ title, chapter, url, date ] = [newEntry[0], newEntry[2], newEntry[3], newEntry[5]];

    const isSheetArray = (isSheet: boolean, value: InputArraySheetType | chrome.bookmarks.BookmarkTreeNode): value is InputArraySheetType => isSheet

    const returnExistingRowInfo = (existingRow: chrome.bookmarks.BookmarkTreeNode | InputArraySheetType, isSheet: boolean): { title: string, url: string | undefined, dateAdded: number | string | undefined, id: string | undefined } => {
        const { title, url, dateAdded, id: id } = isSheetArray(isSheet, existingRow) 
            ? {title: existingRow[0], url: existingRow[3], dateAdded: existingRow[5]} 
            : existingRow

        return { title, url, dateAdded, id: id }

    }


    for (let i = 0; i < existingRows.length; i++) {

        const { title: oldTitle, url: oldUrl, dateAdded: oldDate, id: id } = returnExistingRowInfo(existingRows[i], isSheet)
        
        const ExactSameTitle = title.trim().toLowerCase() === oldTitle?.trim().toLowerCase();
        
        const SameTrimmedTitle = TrimTitle.trimTitle(title, url).title === TrimTitle.trimTitle(oldTitle, oldUrl ?? '').title;
        
        const oldChapterParsed = getTitleAndChapterFromUrl(oldUrl ?? '').chapter;
        
        
        const isSame = isSheet ? ExactSameTitle : SameTrimmedTitle;

        if (!isSame) continue;

        const chapterChanged = chapter !== oldChapterParsed;

        if (chapterChanged) return { action: "replace", rowIndex: i + 2, replacedURL: oldUrl, replaceID: id };
        
        else if (oldDate !== undefined && new Date(date).getTime() > new Date(oldDate).getTime()) return { action: "alert" };
        
        else return { action: "skip" };
    }

    return { action: "append" };
}

/**
 * Opera only: This function retrieves the ID of the "Trash" folder in bookmarks.
 * @param {*} query 
 * @returns {Promise<Array>} Returns a promise that resolves to an array of valid bookmarks.
 */
async function searchValidBookmarks(query: object | string = {}) {
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
        ext.bookmarks.getTree((nodes) => {
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
async function searchBookmarks(query: object | string): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
    if (browser?.bookmarks?.search) {
        const Results = await browser.bookmarks?.search(query);
        if (Results) return Results;
    }
    return await new Promise<chrome.bookmarks.BookmarkTreeNode[]>((resolve, reject) => {
        ext.bookmarks.search(query, (results) => {
        if (ext.runtime.lastError) reject(new Error(ext.runtime.lastError?.message));
        else resolve(results);
        });
    });
}
function updateBookmark(id: string, changes: Partial<chrome.bookmarks.BookmarkTreeNode>): Promise<chrome.bookmarks.BookmarkTreeNode> {
    if (browser?.bookmarks?.update) {
        return browser.bookmarks.update(id, changes);
    }
    return new Promise((resolve, reject) => {
        ext.bookmarks.update(id, changes, (result) => {
        if (ext.runtime.lastError) reject(new Error(ext.runtime.lastError?.message));
        else resolve(result);
        });
    });
}
function moveBookmark(id: string, parentId: string) {
    if (browser?.bookmarks?.move) {
        return browser.bookmarks.move(id, { parentId });
    }
    return new Promise((resolve, reject) => {
        ext.bookmarks.move(id, { parentId }, (result) => {
            if (ext.runtime.lastError) reject(new Error(ext.runtime.lastError?.message));
            else resolve(result);
        });
    });
}
function createBookmark(bookmarkObj: Partial<chrome.bookmarks.BookmarkTreeNode>): Promise<chrome.bookmarks.BookmarkTreeNode> {
    if (browser?.bookmarks?.create) {
        return browser.bookmarks.create(bookmarkObj);
    }
    return new Promise((resolve, reject) => {
        ext.bookmarks.create(bookmarkObj, (result) => {
        if (ext.runtime.lastError) reject(new Error(ext.runtime.lastError?.message));
        else resolve(result);
        });
    });
}
export function getBookmarkChildren(parentId = "2"): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
    if (browser?.bookmarks?.getChildren) {
        return browser.bookmarks.getChildren(parentId);
    }
    return new Promise((resolve, reject) => {
        ext.bookmarks.getChildren(parentId, (children) => {
        if (ext.runtime.lastError) reject(new Error(ext.runtime.lastError?.message));
        else resolve(children);
        });
    });
}
export async function updateCurrentBookmarkAndIcon(Url: string | null = null) {
    const [currentTab] = await ext.tabs.query({ active: true, currentWindow: true });
    if (!currentTab && !Url) return;
    // initialize currentBookmark
    let searchUrl = Url ?? currentTab.url;
    let NewUrl;

    const fuzzyPromise = hasRelatedBookmarkCached(currentTab);

    // get valid bookmark
    const validBookmarks = await searchValidBookmarks(searchUrl);
    if (validBookmarks.length > 0) {
        setState.currentBookmark(validBookmarks[0]);
        updateIcon(currentBookmark?.url);
    }else {
        setState.currentBookmark(null);
        updateIcon(NewUrl, currentTab);
    }
    if (!currentBookmark) { // if dons't already have valid bookmark
        // get fuzzy bookmark & hermidata | slower
        const validFuzzyBookmarks = await fuzzyPromise;
        const isValid = validFuzzyBookmarks?.bookmarkSameChapter || validFuzzyBookmarks?.hermidataSameChapter || false;
        const validEntry = validFuzzyBookmarks?.bookmark || validFuzzyBookmarks?.hermidata || null;
        if (isValid && validEntry) {
            setState.currentBookmark(validEntry);
            updateIcon(validEntry.url || validEntry.currentUrl || searchUrl);
        }
    }
}

// Main entry point
export async function createNestedFolders(pathSegments: string[], rootTitle: string): Promise<string> {
    const rootId = await getRootByTitle(rootTitle);
    if (!rootId) throw new Error(`Root folder "${rootTitle}" not found`);
    const existingFolder = await findFolderPath(rootId, pathSegments);
    if (existingFolder) return existingFolder.id;

    return createMissingFolders(rootId, pathSegments);

}

export async function findNestedFolder(pathSegments: string[], rootTitle: string): Promise<string | null> {
    const rootId = await getRootByTitle(rootTitle);
    if (!rootId) return null;
    
    const existingFolder = await findFolderPath(rootId, pathSegments);
    return existingFolder?.id ?? null;
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
    
    folder ??= await createBookmark({ parentId: baseId, title: pathSegments[index] });
    
    return createMissingFolders(folder.id, pathSegments, index + 1);
}

// ==== Bookmarking Functions ====
function extractTitleFromBookmark(title: string) {
    return title.split(" - Chapter ")[0].trim();
}
