import type { SheetCheck } from "../types";

// Where Hermidata keeps its rows in the user's spreadsheet. Row 1 holds the column titles, so data starts on row 2,
// and an entry spans the columns A to H (the eight fields of InputArraySheetType).

export const DEFAULT_SHEET_NAME = 'Sheet1';
export const SHEET_FIRST_DATA_ROW = 2;
export const SHEET_FIRST_COLUMN = 'A';
export const SHEET_LAST_COLUMN = 'H';

const SHEET_URL = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+/;
const SHEET_ID = /\/d\/([a-zA-Z0-9-_]+)/;

export function isValidGoogleSheetUrl(url: string): boolean {
    return SHEET_URL.test(url);
}

export function extractSpreadsheetId(url: string): string | null {
    return SHEET_ID.exec(url)?.[1] ?? null;
}

/** The tab to use: what the user typed, or the default when that is empty. */
export function resolveSheetName(name: string | undefined): string {
    return name?.trim() || DEFAULT_SHEET_NAME;
}

/** A1 notation for a tab: always quoted, so names with spaces or punctuation work; a quote inside is doubled. */
function quotedTab(sheetName: string): string {
    return `'${sheetName.replaceAll("'", "''")}'`;
}

/** Every data row, e.g. `'Sheet1'!A2:H`. */
export function dataRange(sheetName: string): string {
    return `${quotedTab(sheetName)}!${SHEET_FIRST_COLUMN}${SHEET_FIRST_DATA_ROW}:${SHEET_LAST_COLUMN}`;
}

/** Where a new row is appended; Sheets finds the end of the table by itself. */
export function appendRange(sheetName: string): string {
    return `${quotedTab(sheetName)}!${SHEET_FIRST_COLUMN}${SHEET_FIRST_DATA_ROW}`;
}

/** One existing row, e.g. `'Sheet1'!A7:H7`. */
export function rowRange(sheetName: string, rowIndex: number): string {
    return `${quotedTab(sheetName)}!${SHEET_FIRST_COLUMN}${rowIndex}:${SHEET_LAST_COLUMN}${rowIndex}`;
}

/** Turns the Sheets API's answer for "can I open this spreadsheet?" into something the settings page can show. */
export function classifySheetCheck(status: number, body: unknown, sheetName: string): SheetCheck {
    if (status === 401) return { ok: false, problem: 'auth', message: 'Google did not accept the sign-in. Sign out and try again.' };
    if (status === 403) return { ok: false, problem: 'no-access', message: 'This Google account has no access to that spreadsheet. Ask the owner to share it with edit rights.' };
    if (status === 404) return { ok: false, problem: 'not-found', message: 'No spreadsheet was found at that URL. Check the link.' };
    if (status < 200 || status >= 300) return { ok: false, problem: 'server', message: `Google Sheets answered with an error (${status}).` };

    const tabs = tabTitles(body);
    if (!tabs.includes(sheetName)) {
        const known = tabs.length ? ` The tabs in this spreadsheet are: ${tabs.join(', ')}.` : '';
        return { ok: false, problem: 'no-tab', message: `The spreadsheet has no tab named "${sheetName}".${known}` };
    }
    return { ok: true, title: spreadsheetTitle(body) };
}

function tabTitles(body: unknown): string[] {
    const sheets = (body as { sheets?: { properties?: { title?: string } }[] } | null)?.sheets ?? [];
    return sheets.map(sheet => sheet.properties?.title).filter((title): title is string => typeof title === 'string');
}

function spreadsheetTitle(body: unknown): string {
    return (body as { properties?: { title?: string } } | null)?.properties?.title ?? '';
}
