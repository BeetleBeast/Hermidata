
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
            return { action: "replace", rowIndex: i + 2 }; // +2 = row index in Google Sheets (1-based + header)
        } else if (date > oldDate) {
            return { action: "alert" };
        } else {
            return { action: "skip" };
        }
        }
    }

    return { action: "append" };
}
function extractSpreadsheetId(url) {
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
}
function writeToSheet(token, dataArray, params) {
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
function getCurrentDate() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are 0-based
    const year = now.getFullYear();
    return `${day}/${month}/${year}`;
}
function parseMangaFireUrl(url) {
    try {
        const parts = new URL(url).pathname.split('/');

        const titleSlug = parts.includes('read') ? parts[parts.indexOf('read') + 1] : parts[2];
        const chapter = parts.includes('chapter') ?  parts[parts.length - 1].replace('chapter-', '') : '0';

        const title = titleSlug
            .split('.')[0]             // remove mangafire’s ID code (.yvov1)
            .replace(/(.)\1$/, '$1')   // Rem last char if 2 to last is the same
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

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "Hermidata",
        title: "Save to Hermidata",
        contexts: ["link"] // Or "all", "selection", "link", etc.
    });
});
// Context-Menu Listener
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "Hermidata") {
        chrome.storage.sync.get([ "Settings" ], (result) => {
            const Settings = result.Settings
            let argument;
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
                    writeToSheet(token, data, argument);
                });
            })
            .catch(err => console.error("Failed to resolve redirect:", err));
        })
    }
});
// Example usage from popup
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "SAVE_NOVEL") {
        getToken((token) => {
            writeToSheet(token, msg.data, msg.arguments);
        });
    }
});
