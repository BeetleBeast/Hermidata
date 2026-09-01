import { getGoogleSheetURL } from "../shared/db/Storage";
import type { InputArraySheetType, InputArrayType } from "../shared/types/index";
import type { HermidataModel } from "../shared/utils/HermidataSelector";
import { shouldReplaceOrBlock } from "./bookmarks";


// CRUD
// C = Create | appendRow()
// R = Read   | readSheet()
// U = Update | updateRow()
// D = Delete | N/A

async function apiFetch(url: string, token: string, options: RequestInit = {}): Promise<any> {
    let res: Response;
    try {
        res = await fetch(url, {
            ...options,
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                ...options.headers,
            },
        });
    } catch (err) {
        // network failure
        throw new Error(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        if (res.status === 401) {
            throw new Error("Token expired or invalid — re-authentication required.");
        }
        throw new Error(`Sheets API error (${res.status}): ${errorBody?.error?.message ?? res.statusText}`);
    }

    return res.json();
}

export async function writeToSheet(token: string, hermidata: HermidataModel) {
    const dataArray = hermidata.toInputArraySheetRow();
    const rows = await readSheet(token);
    
    const decision = shouldReplaceOrBlock(dataArray, rows, true);

    // make sure tags is NOT an list and is instead a string


    if (decision.action === "append") {
        await appendRow(token, dataArray);
        console.log("Added new entry.", dataArray);
    } else if (decision.action === "replace") {
        if (!decision.rowIndex) throw new Error("Row index not found.");
        await updateRow(token, decision.rowIndex, dataArray);
        console.log("Replaced/updated entry.", dataArray);
    } else {
        console.log("Skipping entry.");
    }
    
}

async function readSheet(token: string): Promise<InputArraySheetType[]> {
    const spreadsheetUrl = await getGoogleSheetURL();
    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
    if (!spreadsheetId) throw new Error("Spreadsheet ID not found.");

    const range = "Sheet1!A2:H"; // Adjust if more columns are added

    const data = await apiFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`, token, { method: "GET" });

    return data.values ?? [];
}
async function appendRow(token: string, dataArray: InputArraySheetType): Promise<void> {
    const spreadsheetUrl = await getGoogleSheetURL();
    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
    if (!spreadsheetId) throw new Error("Spreadsheet ID not found.");

    const range = "Sheet1!A2";
    await apiFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=RAW`, token, {
        method: "POST",
        body: JSON.stringify({ values: [dataArray] })
    });
}
async function updateRow(token: string, rowIndex: number, dataArray: InputArraySheetType): Promise<void> {
    const spreadsheetUrl = await getGoogleSheetURL();
    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
    if (!spreadsheetId) throw new Error("Spreadsheet ID not found.");

    const range = `Sheet1!A${rowIndex}:H${rowIndex}`; // assumes 8 columns

    await apiFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`, token, {
        method: "PUT",
        body: JSON.stringify({ values: [dataArray] })
    });
}

function extractSpreadsheetId(url: string) {
    const match = new RegExp(/\/d\/([a-zA-Z0-9-_]+)/).exec(url);
    return match ? match[1] : null;
}
