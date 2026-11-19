import { bench, describe, vi } from 'vitest';
import { HermidataService } from '../../scripts/popup/in/service';
import { PastHermidata } from '../../scripts/popup/core/Past';
import type { Hermidata, Settings } from '../../scripts/shared/types';
import { clearTitleCaches, LIBRARY_SIZES, makeLibrary, pageUrlOf, silenceConsole, stubActiveTab, titleOf } from './fixtures';

/*
 * The "save current page" shortcut ( background command save-hermidata ): HermidataService.saveCurrentTab.
 * It finds the saved item behind the tab, updates its progress and writes it.
 * The Sheets / bookmark targets are replaced by a stub, so network and browser calls are not measured.
 */

const store = vi.hoisted(() => ({ items: {} as Record<string, Hermidata> }));

vi.mock('../../scripts/shared/db/Storage', () => ({
    getAllHermidata: vi.fn(async () => store.items),
    getHermidataViaKey: vi.fn(async (key: string) => store.items[key] ? structuredClone(store.items[key]) : null),
    saveHermidata: vi.fn(async (key: string, entry: Hermidata) => { store.items[key] = structuredClone({ ...entry, id: key }); }),
    getSettings: vi.fn(async () => ({ ContentTypesAndStatuses: { TYPE_OPTIONS: ['Manga', 'Novel'] } })),
}));

vi.mock('../../scripts/popup/frontend/confirm', () => ({
    customConfirm: vi.fn().mockResolvedValue(false),
    confirmMigrationPrompt: vi.fn().mockResolvedValue(false),
}));

silenceConsole();
stubActiveTab();

const settings = {
    ExtensionBehaviour: { SaveTarget: { GoogleSpreadsheet: false, BrowserBookmark: false } },
    DefaultBookmarkSettings: { DefaultChoice: { novelType: 'Manga', readStatus: 'Viewing', novelStatus: 'Ongoing' } },
} as unknown as Settings;

const service = () => new HermidataService(settings, async () => true, { confirm: async () => false });

for (const size of LIBRARY_SIZES) {
    describe(`shortcut save, ${size} items with 2-8 alt titles`, () => {
        const library = makeLibrary(size);
        const middle = Math.floor(size / 2);
        const tab = { pageTitle: `${titleOf(middle)} Chapter 4`, url: pageUrlOf(middle, 4) };
        // repeated saves of the same item stay stable ( history is capped ), so no per-run copy is needed
        const useThisLibrary = () => { store.items = library; PastHermidata.invalidateCache(); };

        bench('save the current tab (cold caches)', async () => {
            useThisLibrary();
            clearTitleCaches();
            await service().saveCurrentTab(tab);
        });

        bench('save the current tab (warm caches)', async () => {
            useThisLibrary();
            await service().saveCurrentTab(tab);
        });
    });
}
