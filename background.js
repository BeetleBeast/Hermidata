function getToken(callback) {
    chrome.storage.local.get(["googleAccessToken", "googleTokenExpiry","userEmail"], (items) => {
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
                console.error('Auth failed:', chrome.runtime.lastError.message || 'No redirect URL returned');
                return;
            }

            // Parse the access token from the URL and save it in local storage
            const params = new URLSearchParams(new URL(redirectUrl).hash.substring(1));
            const token = params.get("access_token");
            const expiresIn = parseInt(params.get("expires_in"), 10) * 1000; // ms
            const expiry = Date.now() + expiresIn;

            if (!token) {
                console.error("Access token not found in redirect URL");
                return;
            }

            // Extract the email if possible via API or save if known
            const updatedStorage = {
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
function updateIcon(Url = null) {
    const api = typeof browser !== "undefined" ? browser : chrome;
    const actionApi = api.action || api.browserAction;

    if (Url) {
        chrome.tabs.query({active : true}, (tabs) => {
            const matchedTab = tabs.find(t => t.url === Url);
            if (!matchedTab) {
                console.warn("No tab found with matching URL");
                return;
            }
            setIconAndTitle(actionApi, matchedTab.id);
        });
    } else if (currentTab?.id) {
        setIconAndTitle(actionApi, currentTab.id);
    } else {
        console.warn("No valid tab to set icon");
    }
}
// Helper function to set icon and title
function setIconAndTitle(actionApi, tabId) {
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
function extractTitleFromBookmark(title) {
    return title.split(" - Chapter ")[0].trim();
}
async function writeToBookmarks(dataArray) {
    const bookmarks = await searchValidBookmarks();
    const rows = bookmarks
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
function shouldReplaceOrBlock(newEntry, existingRows, isSheet = true) {
    const [title, type, chapter, url, status, date, tags, notes] = newEntry;
    let oldTitle, oldType, oldChapter, oldUrl, oldStatus, oldDate, oldTags, oldNotes, id;

    for (let i = 0; i < existingRows.length; i++) {
        if (isSheet) {
            [oldTitle, oldType, oldChapter, oldUrl, oldStatus, oldDate, oldTags, oldNotes] = existingRows[i];
        } else {
            ({ title: oldTitle, type: oldType, chapter: oldChapter, url: oldUrl, status: oldStatus, date: oldDate, id } = existingRows[i]);
        }
            
        const SameTrimedTitle = title.trim().toLowerCase() === oldTitle.trim().toLowerCase();

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
async function addBookmark([title, type, chapter, url, status, date, tags, notes]) {
    const settings = await new Promise((resolve) => {
        chrome.storage.sync.get(["Settings"], (result) => resolve(result.Settings));
    });

    const folderInfo = settings?.FolderMapping?.[type]?.[status];
    if (!folderInfo?.path) {
        console.warn("Folder mapping not found for", type, status);
        return;
    }
    const Browserroot = typeof browser !== "undefined" && navigator.userAgent.includes("Firefox")
    ? "Bookmarks Menu"
    : "Bookmarks";
    const pathSegments = folderInfo.path.split('/').filter(Boolean);
    const finalFolderId = await new Promise((resolve) => {
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
async function replaceBookmark(dataArray, decision) {
    const { rowIndex, replacedURL: OldURL, replaceID: OldID } = decision;
    const [title, type, chapter, url, status, date, tags, notes] = dataArray;
    const bookmarkTitle = `${title} - Chapter ${chapter || '0'}`;
    
    const settings = await new Promise((resolve) => {
        chrome.storage.sync.get(["Settings"], (result) => resolve(result.Settings));
    });

    const folderInfo = settings?.FolderMapping?.[type]?.[status];
    if (!folderInfo?.path) {
        console.warn("Folder mapping not found for", type, status);
        return;
    }

    const Browserroot = typeof browser !== "undefined" && navigator.userAgent.includes("Firefox")
    ? "Bookmarks Menu"
    : "Bookmarks";
    const pathSegments = folderInfo.path.split('/').filter(Boolean);

    const finalFolderId = await new Promise((resolve) => {
        createNestedFolders(pathSegments, Browserroot, resolve);
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
function extractSpreadsheetId(url) {
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
}
function writeToSheet(token, dataArray) {
    readSheet(token, (rows) => {
        const decision = shouldReplaceOrBlock(dataArray, rows, true);

        if (decision.action === "append") {
        appendRow(token, dataArray);
        } else if (decision.action === "replace") {
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
function readSheet(token, callback) {
    chrome.storage.sync.get(["spreadsheetUrl"], (result) => {
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
function appendRow(token, dataArray) {
    chrome.storage.sync.get(["spreadsheetUrl"], (result) => {
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

function updateRow(token, rowIndex, dataArray) {
    chrome.storage.sync.get(["spreadsheetUrl"], (result) => {
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
async function findFolderPath(rootId, pathSegments, index = 0) {
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
async function createMissingFolders(baseId, pathSegments, index = 0) {
    if (index >= pathSegments.length) return baseId;
    
    const children = await getBookmarkChildren(baseId);
    let folder = children.find(child => !child.url && child.title === pathSegments[index]);
    
    if (!folder) {
        folder = await createBookmark({ parentId: baseId, title: pathSegments[index] });
    }
    
    return createMissingFolders(folder.id, pathSegments, index + 1);
}
// Main entry point
async function createNestedFolders(pathSegments, rootTitle, callback) {
    try {
        const rootId = await getRootByTitle(rootTitle);

        const existingFolder = await findFolderPath(rootId, pathSegments);
        if (existingFolder) {
            callback(existingFolder.id);
            return;
        }

        const createdFolderId = await createMissingFolders(rootId, pathSegments);
        callback(createdFolderId);
    } catch (err) {
        console.error("Error in createNestedFolders:", err);
        callback(null);
    }
}
function getCurrentDate() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${day}/${month}/${year}`;
}
function parseMangaFireUrl(url) {
    try {
        const parts = new URL(url).pathname.split('/').filter(Boolean);
        const titleSlug = parts.includes('read') ? parts[parts.indexOf('read') + 1] : parts[2] || parts[1];
        if (!titleSlug) return { title: "Unknown", chapter: "0" }
        const chapter = parts[parts.length - 1].includes('chapter') ?  parts[parts.length - 1].replace('chapter-', '') : '0';
        const title = titleSlug
            .split('.')[0]             // remove Site's ID code (.yvov1)
            .replace(/(.)\1$/, '$1')   // Remove last char if second to last is the same
            // .split('-')[0]             // remove possible advert's 
            .replace(/-/g, ' ')        // hyphens to spaces
            .replace(/\b\w/g, c => c.toUpperCase()); // capitalize words

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
async function searchValidBookmarks(query = {}) {
    const trashId = await getTrashFolderId();
    const all = await searchBookmarks(query);

    return all.filter(b => {
        return b.url && b.parentId !== trashId && typeof b.parentId !== "undefined";
    });
}
/**
 *  This function retrieves the ID of the "Trash" folder in bookmarks.
 *  It searches through the bookmark tree for nodes with titles like "bin", "trash", or "deleted".
 * @returns {Promise<string|null>} Returns a promise that resolves to the ID of the "Trash" folder or null if not found.
 */
async function getTrashFolderId() {
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
function findNodeByTitle(node, title) {
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
async function getRootByTitle(title) {
    const trees = await new Promise((resolve) => chrome.bookmarks.getTree(resolve));
    let rootidList = [];
    const rootNode = trees[0];
    rootidList.push(rootNode.id);

    for (const child of rootNode.children || []) {
        if (child.title === title && !child.url) {
            rootidList.push(child.id)
            return rootidList[rootidList.length - 1];
        }
    }
    return rootNode.id;
}
async function searchBookmarks(query) {
    if (typeof browser !== "undefined" && browser.bookmarks?.search) {
        const Results = await browser.bookmarks.search(query)
        return Results;
    }
    return await new Promise((resolve, reject) => {
        chrome.bookmarks.search(query, (results) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError));
        else resolve(results);
        });
    });
}
function updateBookmark(id, changes) {
    if (typeof browser !== "undefined" && browser.bookmarks?.update) {
        return browser.bookmarks.update(id, changes);
    }
    return new Promise((resolve, reject) => {
        chrome.bookmarks.update(id, changes, (result) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError));
        else resolve(result);
        });
    });
}
function moveBookmark(id, parentId) {
    if (typeof browser !== "undefined" && browser.bookmarks?.move) {
        return browser.bookmarks.move(id, { parentId });
    }
    return new Promise((resolve, reject) => {
        chrome.bookmarks.move(id, { parentId }, (result) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError));
            else resolve(result);
        });
    });
}
function createBookmark(bookmarkObj) {
    if (typeof browser !== "undefined" && browser.bookmarks?.create) {
        return browser.bookmarks.create(bookmarkObj);
    }
    return new Promise((resolve, reject) => {
        chrome.bookmarks.create(bookmarkObj, (result) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError));
        else resolve(result);
        });
    });
}
function getBookmarkChildren(parentId = "2") {
    if (typeof browser !== "undefined" && browser.bookmarks?.getChildren) {
        return browser.bookmarks.getChildren(parentId);
    }
    return new Promise((resolve, reject) => {
        chrome.bookmarks.getChildren(parentId, (children) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError));
        else resolve(children);
        });
    });
}
async function updateCurrentBookmarkAndIcon(Url) {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        currentTab = tabs[0];
        if (!currentTab && Url == null) return;

        let searchUrl = Url || currentTab.url;
        const validBookmarks = await searchValidBookmarks(searchUrl);
        currentBookmark = validBookmarks.length > 0 ? validBookmarks[0] : null;
        updateIcon(Url);
    });
}

async function getAllHermidata() {
    const allData = await new Promise((resolve, reject) => {
        browserAPI.storage.sync.get(null, (result) => {
            if (browserAPI.runtime.lastError) reject(new Error(browserAPI.runtime.lastError));
            else resolve(result || {});
        });
    });

    let allHermidata = {};
    let Count = 0;

    for (const [key, value] of Object.entries(allData)) {
        // Ensure the value is a valid Hermidata entry
        if (!value || typeof value !== "object" || !value.Title || typeof value.Title !== "string") continue;

        allHermidata[key] = value;
        Count++;
        }
    // Nothing to do
    if (Count === 0) console.log("No entries detected.");
    console.log(`Total entries: ${Count}`);
    return allHermidata;
}

async function checkFeedsForUpdates() {
    const { savedFeeds } = await browser.storage.local.get({ savedFeeds: [] });
    const allHermidata = await getAllHermidata();
    if (Object.keys(allHermidata).length === 0) {
        console.log("[Hermidata] No Hermidata entries found, skipping feed check.");
        return;
    }
    for (const feed of savedFeeds) {
        try {
            // HEAD request first

            if ( feed.domain !=  Object.values(allHermidata).find(novel => novel.Url.includes(feed.domain))?.Url.replace(/^https?:\/\/(www\.)?/,'').split('/')[0] ) continue;

            const head = await fetch(feed.url, { method: "HEAD" });
            const etag = head.headers.get("etag");
            const lastMod = head.headers.get("last-modified");

            if (feed.etag === etag && feed.lastModified === lastMod) {
                console.log(`[Hermidata] No change in ${feed.title}`);
                continue; // skip unchanged
            }

            // Fetch full feed
            const response = await fetch(feed.url);
            const text = await response.text();
            const parser = new DOMParser();
            const xml = parser.parseFromString(text, "text/xml");
            const items = [...xml.querySelectorAll("item")].map(item => ({
                title: item.querySelector("title")?.textContent ?? "",
                link: item.querySelector("link")?.textContent ?? "",
                pubDate: item.querySelector("pubDate")?.textContent ?? "",
                guid: item.querySelector("guid")?.textContent ?? item.querySelector("link")?.textContent ?? ""
            }));

            // Compare first item with last seen
            if (items.length && items[0].guid !== feed.lastSeenGuid) {
                const newCount = items.findIndex(i => i.guid === feed.lastSeenGuid);
                const newItems = newCount === -1 ? items : items.slice(0, newCount);
                notifyUser(feed, newItems);
                feed.lastSeenGuid = items[0].guid;
            }

            // Save metadata
            feed.etag = etag;
            feed.lastModified = lastMod;
            feed.lastChecked = new Date().toISOString();

        } catch (err) {
            console.error(`[Hermidata] Failed to check feed ${feed.url}:`, err);
        }
    }

    // Save back updated feeds
    await browser.storage.local.set({ savedFeeds });
    console.log("[Hermidata] Feed check completed.");
}

function notifyUser(feed, newItems) {
    const title = `${feed.title}: ${newItems.length} new chapter${newItems.length > 1 ? "s" : ""}`;
    const message = newItems.map(i => i.title).join("\n");
    browser.notifications.create({
        type: "basic",
        iconUrl: "assets/icon48.png",
        title,
        message
    });
}

const browserAPI = typeof browser !== "undefined" ? browser : chrome;

let currentBookmark = null;
let currentTab = null;

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.get([ "Settings" ], (result) => {
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
        chrome.storage.sync.get([ "Settings" ], (result) => {
            if (result.AllowContextMenu) {
                const Settings = result.Settings
                // Send tab info to your saving logic
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
                    getToken((token) => {
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

// Run every 30 minutes
setInterval(checkFeedsForUpdates, 30 * 60 * 1000);

chrome.runtime.onStartup.addListener(() => {
    updateCurrentBookmarkAndIcon();
    checkFeedsForUpdates();
});

chrome.tabs.onActivated.addListener(() => {
    updateCurrentBookmarkAndIcon();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
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
    if (details.reason === "install") {
        // Open settings on first install
        chrome.runtime.openOptionsPage();
    } else if (details.reason === "update") {
        // Optional: open settings after an update
        const thisVersion = chrome.runtime.getManifest().version;
        console.log(`Updated to version ${thisVersion}`);
        chrome.runtime.openOptionsPage();
    }
});


// usage from popup
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "SAVE_NOVEL") {
        getToken((token) => {
            writeToSheet(token, msg.data);
            writeToBookmarks(msg.data);
        });
        updateCurrentBookmarkAndIcon(msg.data[3]);
    }
    else if (msg.type === "LOAD_RSS") {
        // RSSWHATEVER();
    }
});
