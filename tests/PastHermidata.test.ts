import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PastHermidata } from '../scripts/popup/core/Past';
import { HermidataModel } from '../scripts/shared/utils/HermidataSelector';
import { generateHermidataHash } from '../scripts/shared/utils/StringOutput';
import type { AnyNovelType, Hermidata } from '../scripts/shared/types';

const store = vi.hoisted(() => ({ items: {} as Record<string, Hermidata> }));

vi.mock('../scripts/shared/db/Storage', () => ({
    getAllHermidata: vi.fn(async () => store.items),
    getHermidataViaKey: vi.fn(async (key: string) => store.items[key] ?? null),
    getSettings: vi.fn(async () => ({ ContentTypesAndStatuses: { TYPE_OPTIONS: ['Manga', 'Novel'] } })),
    saveHermidata: vi.fn(),
}));

vi.mock('../scripts/popup/frontend/confirm', () => ({
    customConfirm: vi.fn().mockResolvedValue(false),
    confirmMigrationPrompt: vi.fn().mockResolvedValue(false),
}));

function createSaved(title: string, type: AnyNovelType, url: string, updated: string): Hermidata {
    const hermidata = HermidataModel.from(type, 'Viewing', 'Ongoing');
    hermidata.title = title;
    hermidata.id = generateHermidataHash(title, type);
    hermidata.SetUrl(url);
    const host = new URL(url).hostname;
    hermidata.source = host;
    hermidata.meta.altSources = [host];
    hermidata.meta.altTitles = [title];
    hermidata.meta.updated = updated;
    return hermidata.toJSON();
}

/** The page the popup was opened on: the type is only the default, it is not detected */
function createCurrent(title: string, url: string): HermidataModel {
    const hermidata = HermidataModel.from('Manga', 'Viewing', 'Ongoing');
    hermidata.title = title;
    hermidata.SetUrl(url);
    hermidata.source = new URL(url).hostname;
    return hermidata;
}

function setStore(...items: Hermidata[]): void {
    store.items = Object.fromEntries(items.map(item => [item.id, item]));
}

const novel = createSaved('Solo Leveling', 'Novel', 'https://novels.com/solo-leveling/chapter-3', '2026-01-01T00:00:00.000Z');
const manga = createSaved('Solo Leveling', 'Manga', 'https://manga.com/solo-leveling/chapter-40', '2026-06-01T00:00:00.000Z');

beforeEach(() => {
    PastHermidata.invalidateCache();
});

describe('PastHermidata.init', () => {
    it('finds the only same-titled item, even from a new site', async () => {
        setStore(novel);
        const past = new PastHermidata(createCurrent('Solo Leveling', 'https://elsewhere.com/solo-leveling/chapter-4'));
        expect((await past.init())?.id).toBe(novel.id);
    });

    it('picks the item with a marker on the current series page, not the newest one', async () => {
        setStore(novel, manga);
        const past = new PastHermidata(createCurrent('Solo Leveling', 'https://novels.com/solo-leveling/chapter-4'));
        expect((await past.init())?.id).toBe(novel.id);
    });

    it('returns nothing when the match is ambiguous instead of silently taking the newest', async () => {
        setStore(novel, manga);
        const past = new PastHermidata(createCurrent('Solo Leveling', 'https://aggregator.com/solo-leveling/chapter-4'));
        expect(await past.init()).toBeNull();
    });

    it('finds nothing for an unknown title', async () => {
        setStore(novel, manga);
        const past = new PastHermidata(createCurrent('Omniscient Reader', 'https://novels.com/orv/chapter-4'));
        expect(await past.init()).toBeNull();
    });
});

describe('PastHermidata ambiguity', () => {
    it('exposes the candidates of an ambiguous match', async () => {
        setStore(novel, manga);
        const past = new PastHermidata(createCurrent('Solo Leveling', 'https://aggregator.com/solo-leveling/chapter-4'));
        await past.init();

        expect(past.isAmbiguous).toBe(true);
        if (past.resolution?.kind !== 'ambiguous') throw new Error('expected an ambiguous resolution');
        expect(past.resolution.candidates.map(candidate => candidate.item.id).sort()).toEqual([novel.id, manga.id].sort());
    });

    it('is not ambiguous for a clear match or an unknown title', async () => {
        setStore(novel, manga);
        const clear = new PastHermidata(createCurrent('Solo Leveling', 'https://novels.com/solo-leveling/chapter-4'));
        await clear.init();
        expect(clear.isAmbiguous).toBe(false);

        const unknown = new PastHermidata(createCurrent('Omniscient Reader', 'https://novels.com/orv/chapter-4'));
        await unknown.init();
        expect(unknown.isAmbiguous).toBe(false);
        expect(unknown.resolution).toBeNull();
    });

    it('is an exact match when the saved item has a marker on this series page', async () => {
        setStore(novel, manga);
        const past = new PastHermidata(createCurrent('Solo Leveling', 'https://novels.com/solo-leveling/chapter-4'));
        await past.init();
        expect(past.isExactMatch).toBe(true);
    });

    it('is not an exact match on a site the saved item has no marker on', async () => {
        setStore(novel);
        const past = new PastHermidata(createCurrent('Solo Leveling', 'https://elsewhere.com/solo-leveling/chapter-4'));
        await past.init();

        expect(past.pastHermidata?.id).toBe(novel.id); // still the one-click match
        expect(past.isExactMatch).toBe(false);
    });

    it('is not an exact match when ambiguous or when nothing is saved', async () => {
        setStore(novel, manga);
        const ambiguous = new PastHermidata(createCurrent('Solo Leveling', 'https://aggregator.com/solo-leveling/chapter-4'));
        await ambiguous.init();
        expect(ambiguous.isExactMatch).toBe(false);

        setStore();
        PastHermidata.invalidateCache();
        const empty = new PastHermidata(createCurrent('Solo Leveling', 'https://novels.com/solo-leveling/chapter-4'));
        await empty.init();
        expect(empty.isExactMatch).toBe(false);
    });

    it('returns the chosen item once the user settled an ambiguous match', async () => {
        setStore(novel, manga);
        const past = new PastHermidata(createCurrent('Solo Leveling', 'https://aggregator.com/solo-leveling/chapter-4'));
        await past.init();

        past.choose(manga);
        expect((await past.init())?.id).toBe(manga.id);
    });
});

describe('PastHermidata.checkForDuplicates', () => {
    it('reports no duplicate for a single item', async () => {
        setStore(novel);
        const past = new PastHermidata(createCurrent('Solo Leveling', 'https://novels.com/solo-leveling/chapter-4'));
        expect(await past.checkForDuplicates()).toBe(false);
    });

    it('returns the clear winner among same-titled items', async () => {
        setStore(novel, manga);
        const past = new PastHermidata(createCurrent('Solo Leveling', 'https://manga.com/solo-leveling/chapter-41'));
        expect(await past.checkForDuplicates()).toMatchObject({ id: manga.id });
    });

    it('never picks one when ambiguous', async () => {
        setStore(novel, manga);
        const past = new PastHermidata(createCurrent('Solo Leveling', 'https://aggregator.com/solo-leveling/chapter-4'));
        expect(await past.checkForDuplicates()).toBe(false);
    });
});
