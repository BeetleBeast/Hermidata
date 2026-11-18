import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HermidataService } from '../scripts/popup/in/service';
import { HermidataModel } from '../scripts/shared/utils/HermidataSelector';
import { generateHermidataHash } from '../scripts/shared/utils/StringOutput';
import { AmbiguousItemError, NoPastFoundError } from '../scripts/shared/utils/dedicatedErrors';
import type { AnyNovelType, Hermidata, Settings } from '../scripts/shared/types';

const store = vi.hoisted(() => ({ items: {} as Record<string, Hermidata> }));

vi.mock('../scripts/shared/db/Storage', () => ({
    getAllHermidata: vi.fn(async () => store.items),
    getHermidataViaKey: vi.fn(async (key: string) => store.items[key] ? structuredClone(store.items[key]) : null),
    saveHermidata: vi.fn(async (key: string, entry: Hermidata) => { store.items[key] = structuredClone({ ...entry, id: key }); }),
    getSettings: vi.fn(async () => ({ ContentTypesAndStatuses: { TYPE_OPTIONS: ['Manga', 'Novel'] } })),
}));

vi.mock('../scripts/popup/frontend/confirm', () => ({
    customConfirm: vi.fn().mockResolvedValue(false),
    confirmMigrationPrompt: vi.fn().mockResolvedValue(false),
}));

const settings = {
    ExtensionBehaviour: { SaveTarget: { GoogleSpreadsheet: false, BrowserBookmark: false } },
    DefaultBookmarkSettings: { DefaultChoice: { novelType: 'Manga', readStatus: 'Viewing', novelStatus: 'Ongoing' } },
} as unknown as Settings;

function createSaved(title: string, type: AnyNovelType, url: string, chapter: number): Hermidata {
    const hermidata = HermidataModel.from(type, 'Viewing', 'Ongoing');
    hermidata.title = title;
    hermidata.id = generateHermidataHash(title, type);
    hermidata.SetUrl(url);
    hermidata.SetChapter(chapter);
    hermidata.chapter.latest = chapter;
    const host = new URL(url).hostname;
    hermidata.source = host;
    hermidata.meta.altSources = [host];
    hermidata.meta.altTitles = [title];
    return hermidata.toJSON();
}

function setStore(...items: Hermidata[]): void {
    store.items = structuredClone(Object.fromEntries(items.map(item => [item.id, item])));
}

const novel = createSaved('Solo Leveling', 'Novel', 'https://novels.com/solo-leveling/chapter-3', 3);
const manga = createSaved('Solo Leveling', 'Manga', 'https://manga.com/solo-leveling/chapter-40', 40);
const service = () => new HermidataService(settings, async () => true, { confirm: async () => false });

beforeEach(async () => {
    const { PastHermidata } = await import('../scripts/popup/core/Past');
    PastHermidata.invalidateCache();
});

describe('HermidataService.saveCurrentTab ( auto-save )', () => {
    it('saves to the clearly matching item', async () => {
        setStore(novel, manga);
        const saved = await service().saveCurrentTab({ pageTitle: 'Solo Leveling Chapter 4', url: 'https://novels.com/solo-leveling/chapter-4' });

        expect(saved.id).toBe(novel.id);
        expect(store.items[novel.id].chapter.latest).toBe(4);
        expect(store.items[manga.id]).toEqual(manga);
    });

    it('refuses to guess between same-titled items and writes nothing', async () => {
        setStore(novel, manga);
        const before = structuredClone(store.items);

        const save = service().saveCurrentTab({ pageTitle: 'Solo Leveling Chapter 4', url: 'https://aggregator.com/solo-leveling/chapter-4' });

        await expect(save).rejects.toBeInstanceOf(AmbiguousItemError);
        await expect(save).rejects.toMatchObject({ candidateCount: 2, url: 'https://aggregator.com/solo-leveling/chapter-4' });
        expect(store.items).toEqual(before);
    });

    it('still reports a page that is not in the library', async () => {
        setStore(novel, manga);
        const save = service().saveCurrentTab({ pageTitle: 'Omniscient Reader Chapter 4', url: 'https://novels.com/orv/chapter-4' });
        await expect(save).rejects.toBeInstanceOf(NoPastFoundError);
    });
});
