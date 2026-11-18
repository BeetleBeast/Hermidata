import { getGoogleSheetURL, getSettings } from "../shared/db/Storage";
import { appendRange, classifySheetCheck, dataRange, extractSpreadsheetId, resolveSheetName, rowRange } from "../shared/sheets/sheetConfig";
import type { InputArraySheetType, SheetCheck } from "../shared/types/index";
import type { HermidataModel } from "../shared/utils/HermidataSelector";
import { getToken } from "./auth";
import { shouldReplaceOrBlock } from "./bookmarks";


// CRUD
// C = Create | appendRow()
// R = Read   | readSheet()
// U = Update | updateRow()
// D = Delete | N/A

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

/** The spreadsheet and tab a write goes to, looked up once per save. */
interface SheetTarget {
    spreadsheetId: string;
    sheetName: string;
}

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

async function resolveTarget(): Promise<SheetTarget> {
    const spreadsheetId = extractSpreadsheetId(await getGoogleSheetURL());
    if (!spreadsheetId) throw new Error("Spreadsheet ID not found.");

    const settings = await getSettings();
    return { spreadsheetId, sheetName: resolveSheetName(settings?.AccountAndConnections.sheetName) };
}

export async function writeToSheet(token: string, hermidata: HermidataModel) {
    const dataArray = hermidata.toInputArraySheetRow();
    const target = await resolveTarget();
    const rows = await readSheet(token, target);

    const decision = shouldReplaceOrBlock(dataArray, rows, true);

    if (decision.action === "append") {
        await appendRow(token, target, dataArray);
        console.log("Added new entry.", dataArray);
    } else if (decision.action === "replace") {
        if (!decision.rowIndex) throw new Error("Row index not found.");
        await updateRow(token, target, decision.rowIndex, dataArray);
        console.log("Replaced/updated entry.", dataArray);
    } else {
        console.log("Skipping entry.");
    }

}

/**
 * Can this account open the spreadsheet, and does it have the tab? Used by the settings page before it saves a URL.
 * Only reads the spreadsheet's title and tab names, never its cells.
 */
export async function verifySheet(token: string, spreadsheetUrl: string, sheetNameInput: string): Promise<SheetCheck> {
    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
    if (!spreadsheetId) return { ok: false, problem: 'not-found', message: 'That URL has no spreadsheet ID in it. Check the link.' };

    const fields = encodeURIComponent("properties.title,sheets.properties.title");
    let res: Response;
    try {
        res = await fetch(`${SHEETS_API}/${spreadsheetId}?fields=${fields}`, { headers: { Authorization: `Bearer ${token}` } });
    } catch {
        return { ok: false, problem: 'network', message: 'Could not reach Google. Check your internet connection.' };
    }
    const body = await res.json().catch(() => null);
    return classifySheetCheck(res.status, body, resolveSheetName(sheetNameInput));
}

async function readSheet(token: string, { spreadsheetId, sheetName }: SheetTarget): Promise<InputArraySheetType[]> {
    const range = encodeURIComponent(dataRange(sheetName));
    const data = await apiFetch(`${SHEETS_API}/${spreadsheetId}/values/${range}`, token, { method: "GET" });

    return data.values ?? [];
}
async function appendRow(token: string, { spreadsheetId, sheetName }: SheetTarget, dataArray: InputArraySheetType): Promise<void> {
    const range = encodeURIComponent(appendRange(sheetName));
    await apiFetch(`${SHEETS_API}/${spreadsheetId}/values/${range}:append?valueInputOption=RAW`, token, {
        method: "POST",
        body: JSON.stringify({ values: [dataArray] })
    });
}
async function updateRow(token: string, { spreadsheetId, sheetName }: SheetTarget, rowIndex: number, dataArray: InputArraySheetType): Promise<void> {
    const range = encodeURIComponent(rowRange(sheetName, rowIndex));
    await apiFetch(`${SHEETS_API}/${spreadsheetId}/values/${range}?valueInputOption=RAW`, token, {
        method: "PUT",
        body: JSON.stringify({ values: [dataArray] })
    });
}

/** Message handler for the settings page: signs in if needed, then checks the spreadsheet and tab. */
export async function handleVerifySheet(url: string, sheetName: string, respond: (check: SheetCheck) => void): Promise<void> {
    try {
        respond(await verifySheet(await getToken(), url, sheetName));
    } catch (err) {
        respond({ ok: false, problem: 'auth', message: `Google sign-in did not finish: ${err instanceof Error ? err.message : String(err)}` });
    }
}
