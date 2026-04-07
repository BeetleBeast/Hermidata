import { ext } from "../shared/BrowserCompat";
import type { InputArraySheetType, InputArrayType } from "../shared/types/index";
import { shouldReplaceOrBlock } from "./bookmarks";


// CRUD
// C = Create | appendRow()
// R = Read | readSheet()
// U = Update | updateRow()
// D = Delete | N/A

function makeSureTagsISNotAnArray(dataArray: InputArrayType | InputArraySheetType): InputArraySheetType {
    const tags = (Array.isArray(dataArray[6]) ? dataArray[6].join(", ") : dataArray[6])
    const newArray: InputArraySheetType = [dataArray[0], dataArray[1], dataArray[2], dataArray[3], dataArray[4], dataArray[5], tags, dataArray[7]]
    return newArray
    
}

export function writeToSheet(token: number, dataArray: InputArrayType | InputArraySheetType) {
    readSheet(token, (rows: string[][]) => {
        const decision = shouldReplaceOrBlock(dataArray as InputArrayType, rows, true);

        // make sure tags is NOT an list and is instead a string

        dataArray = makeSureTagsISNotAnArray(dataArray)

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
function readSheet(token: number, callback: Function): void {
    ext.storage.sync.get<{ spreadsheetUrl: string }>(["spreadsheetUrl"], (result) => {
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
function appendRow(token: number, dataArray: InputArraySheetType) {
    ext.storage.sync.get<{ spreadsheetUrl: string }>(["spreadsheetUrl"], (result) => {
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

function updateRow(token: number, rowIndex: number, dataArray: InputArraySheetType) {
    ext.storage.sync.get<{ spreadsheetUrl: string }>(["spreadsheetUrl"], (result) => {
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

function extractSpreadsheetId(url: string) {
    const match = new RegExp(/\/d\/([a-zA-Z0-9-_]+)/).exec(url);
    return match ? match[1] : null;
}
