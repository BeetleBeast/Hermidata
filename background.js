
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
        const loginHint = items.userEmail ? `&login_hint=${items.userEmail}` : "";
        const authUrl =
            `https://accounts.google.com/o/oauth2/auth` +
            `?client_id=${clientId}` +
            `&response_type=token` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&scope=${encodeURIComponent(scope)}` + 
            loginHint;

        chrome.identity.launchWebAuthFlow(
            { url: authUrl, interactive: true },
            (redirectUrl) => {
            if (chrome.runtime.lastError) {
                console.error('Auth failed:', chrome.runtime.lastError.message);
                return;
            }

            // Parse the access token from the URL and save it in local storage
            const params = new URLSearchParams(new URL(redirectUrl).hash.substring(1));
            const token = params.get("access_token");
            const expiresIn = parseInt(params.get("expires_in"), 10) * 1000; // ms
            const expiry = Date.now() + expiresIn;

            chrome.storage.local.set({
                googleAccessToken: token,
                googleTokenExpiry: expiry,
                userEmail: loginHint
            });
            callback(token);
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
            alert("Entry already exists with the same chapter, but newer date.");
            return { action: "alert" };
        } else {
            alert("Exact same entry already exists.");
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
function writeToSheet(token, dataArray, arguments) {
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
        .then(user => { chrome.storage.local.set({ userEmail: user.email })})
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
        .then(user => { chrome.storage.local.set({ userEmail: user.email })})
        .catch(err => console.error("Update error:", err));
    });
}

// Example usage from popup
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "SAVE_NOVEL") {
        getToken((token) => {
        writeToSheet(token, msg.data, msg.arguments);
        });
    }
});
