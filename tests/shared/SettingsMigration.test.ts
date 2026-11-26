import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../../scripts/shared/constants';

const { setSettings } = vi.hoisted(() => ({ setSettings: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../scripts/shared/db/Storage', () => ({ setSettings }));

import { SettingsMigration } from '../../scripts/shared/migration/Settings';

const URL = 'https://docs.google.com/spreadsheets/d/abc/edit';
const savedSettings = () => setSettings.mock.calls[0][0];

beforeEach(() => setSettings.mockClear());

/** defaultSettings as they were stored before version 10: two auto status flags instead of one mode */
const legacyBehaviour = (flags = { onlyRSS: false, allowAllDateFields: false }) =>
    ({ ...defaultSettings.ExtensionBehaviour, AutoSetStatusScore: flags });

describe('settings version 10', () => {
    it('is the current version, with auto status off', () => {
        expect(defaultSettings.version).toBe(10);
        expect(defaultSettings.ExtensionBehaviour.AutoSetStatusScore).toEqual({ mode: 'off' });
    });

    it.each([
        [{ onlyRSS: false, allowAllDateFields: false }, 'off'],
        [{ onlyRSS: true,  allowAllDateFields: false }, 'rss'],
        [{ onlyRSS: false, allowAllDateFields: true  }, 'all'],
        [{ onlyRSS: true,  allowAllDateFields: true  }, 'rss'],
    ] as const)('migrating from version 9 turns %o into mode %s and keeps everything else', async (flags, mode) => {
        const v9 = { ...defaultSettings, version: 9, ExtensionBehaviour: legacyBehaviour(flags) };

        await SettingsMigration.migrateSettingsToLatest(v9, 9);

        expect(savedSettings()).toEqual({
            ...defaultSettings,
            ExtensionBehaviour: { ...defaultSettings.ExtensionBehaviour, AutoSetStatusScore: { mode } },
        });
    });
});

describe('settings version 9', () => {
    it('migrating from version 8 adds the default tab name and keeps everything else', async () => {
        const { sheetName: _sheetName, ...account } = defaultSettings.AccountAndConnections;
        const v8 = { ...defaultSettings, version: 8, AccountAndConnections: { ...account, spreadsheetUrl: URL }, ExtensionBehaviour: legacyBehaviour() };

        await SettingsMigration.migrateSettingsToLatest(v8, 8);

        expect(savedSettings()).toEqual({
            ...defaultSettings,
            AccountAndConnections: { spreadsheetUrl: URL, sheetName: 'Sheet1' },
        });
    });

    it('migrating from version 7 goes through every version and ends on the latest with the tab name', async () => {
        const { KeyboardShortcuts: _shortcuts, ...behaviour } = legacyBehaviour({ onlyRSS: true, allowAllDateFields: false });
        const v7 = { ...defaultSettings, version: 7, AccountAndConnections: { spreadsheetUrl: URL }, ExtensionBehaviour: behaviour };

        await SettingsMigration.migrateSettingsToLatest(v7, 7);

        expect(savedSettings().version).toBe(10);
        expect(savedSettings().AccountAndConnections).toEqual({ spreadsheetUrl: URL, sheetName: 'Sheet1' });
        expect(savedSettings().ExtensionBehaviour.EnableKeyboardShortcuts).toBe(true);
        expect(savedSettings().ExtensionBehaviour.AutoSetStatusScore).toEqual({ mode: 'rss' });
    });
});
