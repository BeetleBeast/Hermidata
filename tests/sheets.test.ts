import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HermidataModel } from '../scripts/shared/utils/HermidataSelector';

const ID = '1AbC-dEf_123';
const URL = `https://docs.google.com/spreadsheets/d/${ID}/edit`;
const ROW = ['Title', 'Novel', 1, 'https://x/ch-1', 'Viewing', '2026-01-01', 'tag', 'note'];

const { getGoogleSheetURL, getSettings, shouldReplaceOrBlock } = vi.hoisted(() => ({
    getGoogleSheetURL: vi.fn(),
    getSettings: vi.fn(),
    shouldReplaceOrBlock: vi.fn(),
}));
vi.mock('../scripts/shared/db/Storage', () => ({ getGoogleSheetURL, getSettings }));
vi.mock('../scripts/background/bookmarks', () => ({ shouldReplaceOrBlock }));
vi.mock('../scripts/background/auth', () => ({ getToken: vi.fn().mockResolvedValue('tok') }));

import { verifySheet, writeToSheet } from '../scripts/background/sheets';

const fetchMock = vi.fn();
const respond = (status: number, json: unknown) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(json), { status }));
const entry = { toInputArraySheetRow: () => ROW } as unknown as HermidataModel;
const settingsWith = (sheetName?: string) => ({ AccountAndConnections: { spreadsheetUrl: URL, sheetName } });
const calledUrl = (call: number) => decodeURIComponent(String(fetchMock.mock.calls[call][0]));

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    getGoogleSheetURL.mockReset().mockResolvedValue(URL);
    getSettings.mockReset().mockResolvedValue(settingsWith('Sheet1'));
    shouldReplaceOrBlock.mockReset();
});

describe('writeToSheet', () => {
    it('reads from row 2 down to column H and appends below the table', async () => {
        respond(200, { values: [] });
        respond(200, {});
        shouldReplaceOrBlock.mockReturnValue({ action: 'append' });

        await writeToSheet('tok', entry);

        expect(calledUrl(0)).toBe(`https://sheets.googleapis.com/v4/spreadsheets/${ID}/values/'Sheet1'!A2:H`);
        expect(calledUrl(1)).toContain(`/values/'Sheet1'!A2:append?valueInputOption=RAW`);
        expect(fetchMock.mock.calls[1][1].method).toBe('POST');
        expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ values: [ROW] });
    });

    it('updates the matching row A..H', async () => {
        respond(200, { values: [ROW] });
        respond(200, {});
        shouldReplaceOrBlock.mockReturnValue({ action: 'replace', rowIndex: 5 });

        await writeToSheet('tok', entry);

        expect(calledUrl(1)).toContain(`/values/'Sheet1'!A5:H5?valueInputOption=RAW`);
        expect(fetchMock.mock.calls[1][1].method).toBe('PUT');
    });

    it('writes nothing when the entry is skipped', async () => {
        respond(200, { values: [ROW] });
        shouldReplaceOrBlock.mockReturnValue({ action: 'skip' });

        await writeToSheet('tok', entry);

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('uses the tab name from the settings, quoted', async () => {
        getSettings.mockResolvedValue(settingsWith('My novels'));
        respond(200, { values: [] });
        respond(200, {});
        shouldReplaceOrBlock.mockReturnValue({ action: 'append' });

        await writeToSheet('tok', entry);

        expect(calledUrl(0)).toContain(`/values/'My novels'!A2:H`);
        expect(calledUrl(1)).toContain(`/values/'My novels'!A2:append`);
    });

    it('falls back to Sheet1 for settings saved before the tab name existed', async () => {
        getSettings.mockResolvedValue(settingsWith(undefined));
        respond(200, { values: [] });
        respond(200, {});
        shouldReplaceOrBlock.mockReturnValue({ action: 'append' });

        await writeToSheet('tok', entry);

        expect(calledUrl(0)).toContain(`'Sheet1'!A2:H`);
    });

    it('looks the spreadsheet up once per save, not once per request', async () => {
        respond(200, { values: [] });
        respond(200, {});
        shouldReplaceOrBlock.mockReturnValue({ action: 'append' });

        await writeToSheet('tok', entry);

        expect(getGoogleSheetURL).toHaveBeenCalledTimes(1);
    });

    it('fails clearly when no spreadsheet id can be found', async () => {
        getGoogleSheetURL.mockResolvedValue('');
        await expect(writeToSheet('tok', entry)).rejects.toThrow('Spreadsheet ID not found.');
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('verifySheet', () => {
    const tabs = { properties: { title: 'Library' }, sheets: [{ properties: { title: 'Sheet1' } }] };

    it('asks only for titles, never for cell values', async () => {
        respond(200, tabs);
        await verifySheet('tok', URL, 'Sheet1');
        const asked = calledUrl(0);
        expect(asked).toContain(`/spreadsheets/${ID}?fields=properties.title,sheets.properties.title`);
        expect(asked).not.toContain('/values/');
    });

    it('is ok when the tab exists (an empty name means Sheet1)', async () => {
        respond(200, tabs);
        expect(await verifySheet('tok', URL, '')).toEqual({ ok: true, title: 'Library' });
    });

    it('reports a missing tab', async () => {
        respond(200, tabs);
        expect(await verifySheet('tok', URL, 'Hermidata')).toMatchObject({ ok: false, problem: 'no-tab' });
    });

    it('reports a spreadsheet the account cannot open', async () => {
        respond(403, { error: {} });
        expect(await verifySheet('tok', URL, 'Sheet1')).toMatchObject({ ok: false, problem: 'no-access' });
    });

    it('reports a network failure', async () => {
        fetchMock.mockRejectedValueOnce(new TypeError('offline'));
        expect(await verifySheet('tok', URL, 'Sheet1')).toMatchObject({ ok: false, problem: 'network' });
    });

    it('rejects a URL without an id before calling Google', async () => {
        expect(await verifySheet('tok', 'https://docs.google.com/spreadsheets/', 'Sheet1')).toMatchObject({ ok: false });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
