import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditDetail } from '../scripts/library/build/edit';
import { EventListener } from '../scripts/rss/build/EventListener';
import { HermidataMigration } from '../scripts/shared/migration/Hermidata';
import { updateHermidata } from '../scripts/shared/db/Storage';
import { HermidataModel } from '../scripts/shared/utils/HermidataSelector';
import { generateHermidataHash, TrimTitle } from '../scripts/shared/utils/StringOutput';
import type { Hermidata } from '../scripts/shared/types';

vi.mock('../scripts/shared/db/Storage', () => ({
    getAllRawFeeds: vi.fn(),
    getHermidataViaKey: vi.fn(),
    removeHermidata: vi.fn(),
    setAllHermidata: vi.fn(),
    setAllRawFeeds: vi.fn(),
    updateHermidata: vi.fn().mockResolvedValue(undefined),
    saveHermidata: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../scripts/popup/frontend/confirm', () => ({
    customPrompt: vi.fn().mockResolvedValue('Renamed Series'),
    customConfirm: vi.fn(),
    confirmMigrationPrompt: vi.fn(),
}));

vi.mock('../scripts/shared/utils/Selection', () => ({
    getElement: vi.fn().mockReturnValue(null),
    setElement: vi.fn(),
}));

vi.mock('../scripts/rss/controller', () => ({
    BuildRSSController: class {},
}));

function createHermidata(title = 'Series'): HermidataModel {
    const hermidata = HermidataModel.from('Manga', 'Viewing', 'Ongoing');
    hermidata.title = title;
    hermidata.id = generateHermidataHash(title, hermidata.novelType);
    hermidata.SetUrl('https://example.com/series/chapter-12');
    return hermidata;
}

function callPrivate<T>(instance: object, method: string, ...args: unknown[]): T {
    const fn = Reflect.get(instance, method);
    if (typeof fn !== 'function') throw new Error(`Missing method ${method}`);
    return Reflect.apply(fn, instance, args) as T;
}

function setPrivate(instance: object, property: string, value: unknown): void {
    Reflect.set(instance, property, value);
}

function legacyHash(value: string): string {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = ((hash << 5) - hash) + value.charCodeAt(i);
        hash |= 0;
    }
    return hash.toString();
}

describe('ID rekey flows outside the database layer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('chrome', {
            ...chrome,
            tabs: { query: vi.fn().mockResolvedValue([]) },
        });
    });

    it('rekeys a library entry when its title changes', async () => {
        const hermidata = createHermidata();
        const oldId = hermidata.id;
        const editDetail = Object.create(EditDetail.prototype) as EditDetail;
        const changeHermidata = vi.fn().mockResolvedValue(undefined);
        setPrivate(editDetail, 'hermidata', hermidata);
        setPrivate(editDetail, 'changeHermidata', changeHermidata);

        hermidata.title = 'Renamed Series';
        await callPrivate<Promise<void>>(editDetail, 'forceKeyUpdate');

        const expectedId = generateHermidataHash(hermidata.title, hermidata.novelType, hermidata.GetUrl());
        expect(hermidata.id).toBe(expectedId);
        expect(changeHermidata).toHaveBeenCalledWith(oldId, expectedId, hermidata.toJSON());
    });

    it('rekeys and indexes an RSS entry after renaming it', async () => {
        const original = createHermidata();
        const oldId = original.id;
        const entryItem = {
            dataset: { hashKey: oldId },
            className: `hermidata-item ${oldId}`,
            querySelector: vi.fn().mockReturnValue(null),
        };
        const target = {} as HTMLDivElement;
        const listener = Object.create(EventListener.prototype) as EventListener;
        const allHermidata: Record<string, Hermidata> = { [oldId]: original.toJSON() };
        setPrivate(listener, 'AllHermidata', allHermidata);
        setPrivate(listener, 'getEntriesItem', vi.fn().mockReturnValue(entryItem));
        setPrivate(listener, 'reloadContent', vi.fn().mockResolvedValue(undefined));

        await callPrivate<Promise<void>>(listener, 'RenameItem', target);

        const expectedId = generateHermidataHash('Renamed Series', original.novelType, original.GetUrl(), false);
        expect(updateHermidata).toHaveBeenCalledWith(oldId, expectedId, expect.objectContaining({
            id: expectedId,
            title: 'Renamed Series',
        }));
        expect(allHermidata).not.toHaveProperty(oldId);
        expect(allHermidata[expectedId]).toMatchObject({ id: expectedId, title: 'Renamed Series' });
        expect(entryItem.className).toContain(expectedId);
    });

    it('migrates a legacy hash entry to its current hash key', async () => {
        const entry = createHermidata('Series 🚀');
        const normalizedTitle = TrimTitle.trimTitle(entry.title, entry.GetUrl()).title.toLowerCase();
        const oldId = legacyHash(`${entry.novelType}:${normalizedTitle}`);
        const newId = generateHermidataHash(entry.title, entry.novelType);
        expect(oldId).not.toBe(newId);
        entry.id = oldId;
        const migration = new HermidataMigration();
        setPrivate(migration, 'AllHermidata', { [oldId]: entry.toJSON() });

        await migration.migrateAndCheckDuplicates();

        expect(updateHermidata).toHaveBeenCalledWith(oldId, newId, expect.objectContaining({
            id: newId,
            novelType: entry.novelType,
        }));
    });

    it('rebuilds the ID when recovering an entry with valid title, type, and URL', () => {
        const hermidata = createHermidata('Series Chapter 12');
        hermidata.version = 10;
        hermidata.id = 'stale-id';

        callPrivate<void>(hermidata, 'ForceCreateNewHermidata');

        const expectedTitle = TrimTitle.trimTitle('Series Chapter 12', hermidata.GetUrl()).title;
        expect(hermidata.title).toBe(expectedTitle);
        expect(hermidata.id).toBe(generateHermidataHash(expectedTitle, hermidata.novelType, hermidata.GetUrl()));
    });
});
