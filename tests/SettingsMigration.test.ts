import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../scripts/shared/constants';

const { setSettings } = vi.hoisted(() => ({ setSettings: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../scripts/shared/db/Storage', () => ({ setSettings }));

import { SettingsMigration } from '../scripts/shared/migration/Settings';

const URL = 'https://docs.google.com/spreadsheets/d/abc/edit';
const savedSettings = () => setSettings.mock.calls[0][0];

beforeEach(() => setSettings.mockClear());

describe('settings version 9', () => {
    it('is the current version', () => {
        expect(defaultSettings.version).toBe(9);
        expect(defaultSettings.AccountAndConnections.sheetName).toBe('Sheet1');
    });

    it('migrating from version 8 adds the default tab name and keeps everything else', async () => {
        const { sheetName: _sheetName, ...account } = defaultSettings.AccountAndConnections;
        const v8 = { ...defaultSettings, version: 8, AccountAndConnections: { ...account, spreadsheetUrl: URL } };

        await SettingsMigration.migrateSettingsToLatest(v8, 8);

        expect(savedSettings()).toEqual({
            ...defaultSettings,
            version: 9,
            AccountAndConnections: { spreadsheetUrl: URL, sheetName: 'Sheet1' },
        });
    });

    it('migrating from version 7 goes through version 8 and ends on version 9 with the tab name', async () => {
        const { KeyboardShortcuts: _shortcuts, ...behaviour } = defaultSettings.ExtensionBehaviour;
        const v7 = { ...defaultSettings, version: 7, AccountAndConnections: { spreadsheetUrl: URL }, ExtensionBehaviour: behaviour };

        await SettingsMigration.migrateSettingsToLatest(v7, 7);

        expect(savedSettings().version).toBe(9);
        expect(savedSettings().AccountAndConnections).toEqual({ spreadsheetUrl: URL, sheetName: 'Sheet1' });
        expect(savedSettings().ExtensionBehaviour.EnableKeyboardShortcuts).toBe(true);
    });
});
