
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
function updateIcon() {
    if (!currentTab?.id) {
        console.warn("No currentTab or tab id available");
        return;
    }

    const api = typeof browser !== "undefined" ? browser : chrome;
    const actionApi = api.action || api.browserAction;

    const iconPath = currentBookmark
        ? { 48: "assets/icon_red48.png" }
        : { 48: "assets/icon48.png" };

    // Set icon
    actionApi.setIcon({
        path: iconPath,
        tabId: currentTab.id
    }, () => {
        if (api.runtime.lastError) {
            console.warn("setIcon error:", api.runtime.lastError.message);
        }
    });

    // Set title/tooltip
    actionApi.setTitle({
        title: currentBookmark ? 'Unbookmark it!' : 'Bookmark it!',
        tabId: currentTab.id
    }, () => {
        if (api.runtime.lastError) {
            console.warn("setTitle error:", api.runtime.lastError.message);
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
function shouldReplaceOrBlock(newEntry, existingRows) {
    const [title, type, chapter, url, status, date, tags, notes] = newEntry;

    for (let i = 0; i < existingRows.length; i++) {
        const [oldTitle, oldType, oldChapter, oldUrl, oldStatus, oldDate] = existingRows[i];

        const isSame = url === oldUrl || title.trim().toLowerCase() === oldTitle.trim().toLowerCase();
        const chapterChanged = chapter !== oldChapter;

        if (isSame) {
        if (chapterChanged) {
            return { action: "replace", rowIndex: i + 2 };
        } else if (date > oldDate) {
            return { action: "alert" };
        } else {
            return { action: "skip" };
        }
        }
    }

    return { action: "append" };
}
async function replaceBookmark(dataArray, allBookmarks, rowIndex) {
    const oldBookmark = allBookmarks[rowIndex - 2];
    if (oldBookmark) {
        const [title, type, chapter, url, status, date, tags, notes] = dataArray;
        const bookmarkTitle = `${title} - Chapter ${chapter}`;
        const updated = await updateBookmark(oldBookmark.id, {title:bookmarkTitle});
        console.log("Updated bookmark", updated);
    } else {
        addBookmark(dataArray);
    }
}
function extractSpreadsheetId(url) {
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
}
function extractTitleFromBookmark(title) {
    return title.split(" - Chapter ")[0].trim();
}
function writeToSheet(token, dataArray) {
    readSheet(token, (rows) => {
        const decision = shouldReplaceOrBlock(dataArray, rows);

        if (decision.action === "append") {
        appendRow(token, dataArray);
        } else if (decision.action === "replace") {
        updateRow(token, decision.rowIndex, dataArray);
        } else {
        console.log("Skipping entry.");
        }
    });
}
async function writeToBookmarks(dataArray) {
    const bookmarks = await searchBookmarks({});
    const rows = bookmarks
        .filter(b => b.url)
        .map(b => [
            extractTitleFromBookmark(b.title), 
            "", "",                            
            b.url,
            "", "", "", ""                     
        ]);
    const decision = shouldReplaceOrBlock(dataArray, rows);
    if (decision.action === "append") {
        addBookmark(dataArray);
    } else if (decision.action === "replace") {
        replaceBookmark(dataArray, bookmarks, decision.rowIndex);
    } else {
        console.log("Skipping bookmark entry.");
    }
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
async function createNestedFolders(pathSegments, rootTitle, callback, parentId = null, index = 0) {
    if (index >= pathSegments.length) {
        callback(parentId);
        return;
    }
    const actualParentId = parentId || rootTitle;

    try {
        const children = await getBookmarkChildren(actualParentId);
        if (!children) {
            console.error(`No children found for parentId ${actualParentId}`);
            callback(null);
            return;
        }
        let folder = children.find(child => !child.url && child.title === pathSegments[index]);
        if (folder) {
            createNestedFolders(pathSegments, rootTitle, callback, folder.id, index + 1);
        } else {
            const newFolder = await createBookmark({parentId: actualParentId, title: pathSegments[index]});
            createNestedFolders(pathSegments, rootTitle, callback, newFolder.id, index + 1);
        }
    } catch (err) {
        console.error("Error in createNestedFolders:", err);
        callback(null);
    }
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

    const pathSegments = folderInfo.path.split("/");
    const finalFolderId = await new Promise((resolve) => {
        createNestedFolders(pathSegments, folderInfo.root, resolve);
    });
    const bookmarkTitle = `${title} - Chapter ${chapter}`;
    await createBookmark({
        parentId: finalFolderId,
        title: bookmarkTitle,
        url
    });
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
        const parts = new URL(url).pathname.split('/');

        const titleSlug = parts.includes('read') ? parts[parts.indexOf('read') + 1] : parts[2];
        const chapter = parts.includes('chapter') ?  parts[parts.length - 1].replace('chapter-', '') : '0';

        const title = titleSlug
            .split('.')[0]             // remove Site's ID code (.yvov1)
            .replace(/(.)\1$/, '$1')   // Remove last char if second to last is the same
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
function searchBookmarks(query) {
    if (typeof browser !== "undefined" && browser.bookmarks?.search) {
        return browser.bookmarks.search(query);
    }
    return new Promise((resolve, reject) => {
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
function getBookmarkChildren(parentId = "1") {
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
function updateCurrentBookmarkAndIcon() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        currentTab = tabs[0];
        if (!currentTab) return;

        chrome.bookmarks.search({ url: currentTab.url }, (results) => {
            currentBookmark = results.length > 0 ? results[0] : null;
            updateIcon();
        });
    });
}

chrome.storage.sync.get([ "Settings" ], (result) => {
    if (result.AllowContextMenu) {
        chrome.runtime.onInstalled.addListener(() => {
            chrome.contextMenus.create({
                id: "Hermidata",
                title: "Save to Hermidata",
                contexts: ["link"]
            });
        });
        // Context-Menu Listener
        chrome.contextMenus.onClicked.addListener((info, tab) => {
            if (info.menuItemId === "Hermidata") {
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
                    });
                })
                .catch(err => console.error("Failed to resolve redirect:", err));
            }
        });
    }
})

let currentBookmark = null;
let currentTab = null;

chrome.runtime.onStartup.addListener(() => {
    updateCurrentBookmarkAndIcon();
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

// Example usage from popup
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "SAVE_NOVEL") {
        getToken((token) => {
            writeToSheet(token, msg.data);
            writeToBookmarks(msg.data);
        });
    }
});
