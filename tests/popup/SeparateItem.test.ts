import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeparateItem, linkAsSameStory } from '../../scripts/popup/core/save';
import { linkHermidata } from '../../scripts/shared/db/Storage';
import { HermidataService } from '../../scripts/popup/in/service';
import { HermidataModel } from '../../scripts/shared/utils/HermidataSelector';
import { generateHermidataHash } from '../../scripts/shared/utils/StringOutput';
import type { AnyNovelType, Hermidata, Settings } from '../../scripts/shared/types';

const store = vi.hoisted(() => ({ items: {} as Record<string, Hermidata> }));

vi.mock('../../scripts/shared/db/Storage', () => ({
    getAllHermidata: vi.fn(async () => store.items),
    getHermidataViaKey: vi.fn(async (key: string) => store.items[key] ? structuredClone(store.items[key]) : null),
    saveHermidata: vi.fn(async (key: string, entry: Hermidata) => { store.items[key] = structuredClone({ ...entry, id: key }); }),
    getSettings: vi.fn(async () => ({ ContentTypesAndStatuses: { TYPE_OPTIONS: ['Manga', 'Novel'] } })),
    linkHermidata: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../scripts/popup/frontend/confirm', () => ({
    customConfirm: vi.fn().mockResolvedValue(false),
    confirmMigrationPrompt: vi.fn().mockResolvedValue(false),
}));

const settings = {
    ExtensionBehaviour: { SaveTarget: { GoogleSpreadsheet: false, BrowserBookmark: false } },
} as unknown as Settings;

function createPage(title: string, type: AnyNovelType, url: string, chapter: number): HermidataModel {
    const page = HermidataModel.from(type, 'Viewing', 'Ongoing');
    page.title = title;
    page.SetUrl(url);
    page.SetChapter(chapter);
    return page;
}

async function seed(title: string, type: AnyNovelType, url: string, chapter: number): Promise<Hermidata> {
    const page = createPage(title, type, url, chapter);
    await new HermidataService(settings, async () => true).saveHermidata(page);
    return store.items[generateHermidataHash(title, type, url)];
}

beforeEach(() => {
    store.items = {};
    vi.mocked(linkHermidata).mockClear();
});

describe('createSeparateItem', () => {
    it('uses the hash of its title and type when that is free', async () => {
        await seed('Solo Leveling', 'Novel', 'https://novels.com/solo-leveling/chapter-3', 3);
        const item = await createSeparateItem('Solo Leveling', 'https://manga.com/solo-leveling/chapter-40', 'Manga');
        expect(item.id).toBe(generateHermidataHash('Solo Leveling', 'Manga'));
    });

    it('uses a random id instead of overwriting the item with the same title and type', async () => {
        const original = await seed('Solo Leveling', 'Novel', 'https://novels.com/solo-leveling/chapter-3', 3);
        const item = await createSeparateItem('Solo Leveling', 'https://other.com/solo-leveling/chapter-1', 'Novel');

        expect(item.id).not.toBe(original.id);
        expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(store.items[original.id]).toEqual(original);
    });
});

describe('HermidataService.saveAsSeparateItem', () => {
    it('saves the page as its own item and leaves the same-titled one untouched', async () => {
        const original = await seed('Solo Leveling', 'Novel', 'https://novels.com/solo-leveling/chapter-3', 3);
        const page = createPage('Solo Leveling', 'Novel', 'https://other.com/solo-leveling/chapter-12', 12);

        expect(await new HermidataService(settings, async () => true).saveAsSeparateItem(page)).toBe(true);

        expect(Object.keys(store.items)).toHaveLength(2);
        expect(store.items[original.id]).toEqual(original);
        expect(store.items[page.id].chapter.latest).toBe(12);
    });

    it('later saves of the separate item update it, not the item under the hash of its title', async () => {
        const original = await seed('Solo Leveling', 'Novel', 'https://novels.com/solo-leveling/chapter-3', 3);
        const service = new HermidataService(settings, async () => true);
        const page = createPage('Solo Leveling', 'Novel', 'https://other.com/solo-leveling/chapter-12', 12);
        await service.saveAsSeparateItem(page);

        const nextVisit = new HermidataModel(store.items[page.id]);
        nextVisit.SetChapter(13);
        await service.saveHermidata(nextVisit);

        expect(store.items[page.id].chapter.latest).toBe(13);
        expect(store.items[original.id].chapter.latest).toBe(3);
    });
});

describe('retyping a separate item', () => {
    it('changes its type in place, keeps its id and leaves the original untouched', async () => {
        const original = await seed('Solo Leveling', 'Novel', 'https://novels.com/solo-leveling/chapter-3', 3);
        const service = new HermidataService(settings, async () => true);
        const page = createPage('Solo Leveling', 'Novel', 'https://other.com/solo-leveling/chapter-12', 12);
        await service.saveAsSeparateItem(page);
        const separateId = page.id;

        // the popup keeps the item's own id when its type changes ( it is not stored under a title hash )
        const retyped = new HermidataModel(store.items[separateId]);
        retyped.novelType = 'Manga';
        await service.saveHermidata(retyped);

        expect(store.items[separateId]).toMatchObject({ id: separateId, novelType: 'Manga' });
        expect(store.items[original.id]).toEqual(original);
        expect(Object.keys(store.items)).toHaveLength(2);
    });
});

describe('linkAsSameStory', () => {
    it('links a title without related titles as the main story, like the one it is linked to', async () => {
        const novel = await seed('Solo Leveling', 'Novel', 'https://novels.com/solo-leveling/chapter-3', 3);
        const manga = await seed('Solo Leveling', 'Manga', 'https://manga.com/solo-leveling/chapter-40', 40);

        await linkAsSameStory(novel.id, manga.id);

        expect(linkHermidata).toHaveBeenCalledWith(novel.id, manga.id, 'mainStory');
    });

    it('gives the new title the type of the one it is linked to: the manga of a sequel is a sequel', async () => {
        const novel = await seed('Solo Leveling', 'Novel', 'https://novels.com/solo-leveling/chapter-3', 3);
        const sequel = await seed('Solo Leveling Ragnarok', 'Novel', 'https://novels.com/ragnarok/chapter-1', 1);
        const manga = await seed('Solo Leveling Ragnarok', 'Manga', 'https://manga.com/ragnarok/chapter-1', 1);
        store.items[novel.id].meta.relations = { relatedWorks: [{ type: 'sequel', id: sequel.id }] };
        store.items[sequel.id].meta.relations = { relatedWorks: [{ type: 'mainStory', id: novel.id }] };

        await linkAsSameStory(sequel.id, manga.id);

        expect(linkHermidata).toHaveBeenCalledWith(sequel.id, manga.id, 'sequel');
    });

    it('fails without linking when the item to link to is missing', async () => {
        const manga = await seed('Solo Leveling', 'Manga', 'https://manga.com/solo-leveling/chapter-40', 40);
        await expect(linkAsSameStory('missing', manga.id)).rejects.toThrow();
        expect(linkHermidata).not.toHaveBeenCalled();
    });
});
