import { describe, expect, it } from 'vitest';
import {
    appendRange, classifySheetCheck, dataRange, DEFAULT_SHEET_NAME, extractSpreadsheetId, isValidGoogleSheetUrl,
    resolveSheetName, rowRange,
} from '../scripts/shared/sheets/sheetConfig';

const ID = '1AbC-dEf_123';
const body = (...tabs: string[]) => ({ properties: { title: 'My library' }, sheets: tabs.map(title => ({ properties: { title } })) });

describe('isValidGoogleSheetUrl', () => {
    it.each([
        `https://docs.google.com/spreadsheets/d/${ID}/edit?pli=1&gid=0#gid=0`,
        `https://docs.google.com/spreadsheets/d/${ID}`,
    ])('accepts %s', url => expect(isValidGoogleSheetUrl(url)).toBe(true));

    it.each([
        '',
        'not a url',
        `http://docs.google.com/spreadsheets/d/${ID}/edit`,
        `https://example.com/spreadsheets/d/${ID}/edit`,
        'https://docs.google.com/document/d/abc/edit',
        'https://docs.google.com/spreadsheets/',
    ])('rejects %j', url => expect(isValidGoogleSheetUrl(url)).toBe(false));
});

describe('extractSpreadsheetId', () => {
    it('reads the id between /d/ and the next slash', () => {
        expect(extractSpreadsheetId(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`)).toBe(ID);
    });
    it('returns null when there is no id', () => {
        expect(extractSpreadsheetId('https://docs.google.com/spreadsheets/')).toBeNull();
    });
});

describe('resolveSheetName', () => {
    it('falls back to the default tab when empty or blank', () => {
        expect(resolveSheetName(undefined)).toBe(DEFAULT_SHEET_NAME);
        expect(resolveSheetName('   ')).toBe('Sheet1');
    });
    it('trims what the user typed', () => {
        expect(resolveSheetName('  Hermidata ')).toBe('Hermidata');
    });
});

describe('ranges', () => {
    it('start below the title row (row 2) and end at column H', () => {
        expect(dataRange('Sheet1')).toBe("'Sheet1'!A2:H");
        expect(appendRange('Sheet1')).toBe("'Sheet1'!A2");
        expect(rowRange('Sheet1', 7)).toBe("'Sheet1'!A7:H7");
    });
    it('quote tab names with spaces and double any quote inside', () => {
        expect(dataRange('My novels')).toBe("'My novels'!A2:H");
        expect(rowRange("Dave's list", 3)).toBe("'Dave''s list'!A3:H3");
    });
});

describe('classifySheetCheck', () => {
    it('accepts a spreadsheet that has the tab, and returns its title', () => {
        expect(classifySheetCheck(200, body('Sheet1', 'Other'), 'Sheet1')).toEqual({ ok: true, title: 'My library' });
    });
    it('tab names are case sensitive, as in Google Sheets', () => {
        expect(classifySheetCheck(200, body('Sheet1'), 'sheet1')).toMatchObject({ ok: false, problem: 'no-tab' });
    });
    it('lists the tabs that do exist when the tab is missing', () => {
        const result = classifySheetCheck(200, body('Alpha', 'Beta'), 'Hermidata');
        expect(result).toMatchObject({ ok: false, problem: 'no-tab' });
        expect(!result.ok && result.message).toContain('Alpha, Beta');
    });
    it('copes with a body it cannot read', () => {
        expect(classifySheetCheck(200, null, 'Sheet1')).toMatchObject({ ok: false, problem: 'no-tab' });
    });
    it.each([
        [401, 'auth'],
        [403, 'no-access'],
        [404, 'not-found'],
        [500, 'server'],
    ])('maps HTTP %i to %s', (status, problem) => {
        expect(classifySheetCheck(status, null, 'Sheet1')).toMatchObject({ ok: false, problem });
    });
});
