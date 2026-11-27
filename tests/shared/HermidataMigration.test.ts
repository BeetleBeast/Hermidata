import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HermidataMigration } from '../../scripts/shared/migration/Hermidata';
import { removeHermidata, moveHermidata } from '../../scripts/shared/db/Storage';
import { HermidataModel } from '../../scripts/shared/utils/HermidataSelector';
import { generateHermidataHash } from '../../scripts/shared/utils/StringOutput';

vi.mock('../../scripts/shared/db/Storage', () => ({
    getAllRawFeeds: vi.fn(),
    getHermidataViaKey: vi.fn(),
    removeHermidata: vi.fn().mockResolvedValue(undefined),
    setAllHermidata: vi.fn(),
    setAllRawFeeds: vi.fn(),
    moveHermidata: vi.fn().mockResolvedValue(undefined),
}));

function createHermidata(novelType: string, title = 'Series'): HermidataModel {
    const hermidata = HermidataModel.from(novelType, 'Viewing', 'Ongoing');
    hermidata.title = title;
    hermidata.id = generateHermidataHash(hermidata.title, novelType);
    hermidata.SetUrl('https://example.com/series/chapter-12');
    return hermidata;
}

describe('HermidataMigration.mergeHermidata', () => {
    it('keeps the selected entry ID until merge configuration resolves identity conflicts', () => {
        const keep = createHermidata('Manga');
        const discard = createHermidata('Anime', 'Series Alt');

        const { merged, conflicts } = HermidataMigration.mergeHermidata(keep, discard);

        expect(conflicts.map(conflict => conflict.path)).toContain('novelType');
        expect(merged.id).toBe(keep.id);
        expect(merged.id).not.toBe(discard.id);
        expect(keep.id).toBe(generateHermidataHash(keep.title, keep.novelType));
        expect(discard.id).toBe(generateHermidataHash(discard.title, discard.novelType));
    });

    it('joins the links of both entries and drops the links between them', () => {
        const keep = createHermidata('Manga');
        const discard = createHermidata('Anime', 'Series Alt');
        keep.meta.relations = { relatedWorks: [{ type: 'sideStory', id: discard.id }, { type: 'sequel', id: 'c' }] };
        discard.meta.relations = { relatedWorks: [{ type: 'sideStory', id: keep.id }, { type: 'prequel', id: 'd' }] };

        const { merged, autoResolved } = HermidataMigration.mergeHermidata(keep, discard);

        expect(merged.meta.relations).toEqual({ relatedWorks: [{ type: 'sequel', id: 'c' }, { type: 'prequel', id: 'd' }] });
        expect(autoResolved).toContain('meta.relations');
    });

    it('does not list related titles as combined when neither entry has any', () => {
        const { autoResolved } = HermidataMigration.mergeHermidata(createHermidata('Manga'), createHermidata('Anime', 'Series Alt'));

        expect(autoResolved).not.toContain('meta.relations');
    });
});

describe('HermidataMigration.mergeTwoHermidata after a novel type change', () => {
    beforeEach(() => {
        vi.stubGlobal('chrome', {
            ...chrome,
            tabs: { query: vi.fn().mockResolvedValue([]) },
        });
        vi.clearAllMocks();
    });

    it('keeps the ID aligned with the novel type and allows changing the type again', async () => {
        const original = createHermidata('Manga');
        const changedToAnime = createHermidata('Anime');

        const animeResult = await HermidataMigration.mergeTwoHermidata(
            changedToAnime,
            original,
        );

        expect(animeResult).not.toBeInstanceOf(Error);
        if (animeResult instanceof Error) throw animeResult;

        const animeId = generateHermidataHash(animeResult.title, animeResult.novelType);
        expect(animeResult.novelType).toBe('Anime');
        expect(animeResult.id).toBe(animeId);
        expect(moveHermidata).toHaveBeenCalledWith(original.id, animeId, animeResult);

        const changedBackToManga = createHermidata('Manga');
        const mangaResult = await HermidataMigration.mergeTwoHermidata(
            changedBackToManga,
            animeResult,
        );

        expect(mangaResult).not.toBeInstanceOf(Error);
        if (mangaResult instanceof Error) throw mangaResult;

        const mangaId = generateHermidataHash(mangaResult.title, mangaResult.novelType);
        expect(mangaResult.novelType).toBe('Manga');
        expect(mangaResult.id).toBe(mangaId);
        expect(moveHermidata).toHaveBeenNthCalledWith(2, animeId, mangaId, mangaResult);
    });

    it('recomputes the ID and removes both original keys when configured merge changes identity', async () => {
        const keep = createHermidata('Manga');
        const discard = createHermidata('Anime', 'Series Alt');

        const result = await HermidataMigration.mergeTwoHermidataWithConfiguration(
            keep,
            discard,
            {
                keepId: keep.id,
                removeId: discard.id,
                resolutions: {
                    title: 'A',
                    novelType: 'B',
                },
            },
        );

        const expectedId = generateHermidataHash(keep.title, 'Anime', keep.GetUrl());
        expect(result).toEqual({
            merged: true,
            removedIds: [keep.id, discard.id],
            addedId: expectedId,
        });
        expect(moveHermidata).toHaveBeenCalledWith(discard.id, expectedId, expect.objectContaining({
            id: expectedId,
            title: keep.title,
            novelType: 'Anime',
        }));
        // the kept record moves too, so its links follow it to the merged one
        expect(moveHermidata).toHaveBeenCalledWith(keep.id, expectedId, expect.objectContaining({ id: expectedId }));
        expect(removeHermidata).not.toHaveBeenCalled();
    });

    it('does not report the merged item as removed when its new ID is the ID of the discarded one', async () => {
        const keep = createHermidata('Manga');
        const discard = createHermidata('Anime', 'Series Alt');
        const expectedId = generateHermidataHash(keep.title, 'Anime', keep.GetUrl());
        discard.id = expectedId; // the merge lands on the discarded item's own key

        const result = await HermidataMigration.mergeTwoHermidataWithConfiguration(
            keep,
            discard,
            {
                keepId: keep.id,
                removeId: discard.id,
                resolutions: { title: 'A', novelType: 'B' },
            },
        );

        expect(result).toEqual({ merged: true, removedIds: [keep.id], addedId: expectedId });
        expect(moveHermidata).toHaveBeenCalledWith(expectedId, expectedId, expect.objectContaining({ id: expectedId }));
        expect(moveHermidata).toHaveBeenCalledWith(keep.id, expectedId, expect.objectContaining({ id: expectedId }));
        expect(removeHermidata).not.toHaveBeenCalled();
    });

    it('keeps the existing ID and removes only the discarded key when identity is unchanged', async () => {
        const keep = createHermidata('Manga');
        const discard = keep.Copy();
        discard.id = generateHermidataHash('Series Alt', discard.novelType);
        discard.title = 'Series Alt';

        const result = await HermidataMigration.mergeTwoHermidataWithConfiguration(
            keep,
            discard,
            {
                keepId: keep.id,
                removeId: discard.id,
                resolutions: { title: 'A' },
            },
        );

        expect(result).toEqual({
            merged: true,
            removedIds: [discard.id],
            addedId: keep.id,
        });
        expect(moveHermidata).toHaveBeenCalledWith(discard.id, keep.id, expect.objectContaining({
            id: keep.id,
            title: keep.title,
            novelType: keep.novelType,
        }));
        expect(removeHermidata).not.toHaveBeenCalled();
    });
});

describe('HermidataMigration.mergeTwoHermidata alt sources', () => {
    it('collects hostnames in altSources and never titles', async () => {
        vi.stubGlobal('chrome', { ...chrome, tabs: { query: vi.fn().mockResolvedValue([]) } });
        const newer = createHermidata('Manga', 'Series One');
        const older = createHermidata('Manga', 'Series Two');
        newer.source = 'a.example.com';
        older.source = 'b.example.com';

        const merged = await HermidataMigration.mergeTwoHermidata(newer, older);
        if (merged instanceof Error) throw merged;

        expect(merged.meta.altSources).toEqual(expect.arrayContaining(['b.example.com']));
        expect(merged.meta.altSources).not.toContain('Series One');
        expect(merged.meta.altSources).not.toContain('Series Two');
    });
});

describe('HermidataMigration.mergeTwoHermidata relations', () => {
    it('keeps the links of the older entry too, instead of only the newer one', async () => {
        vi.stubGlobal('chrome', { ...chrome, tabs: { query: vi.fn().mockResolvedValue([]) } });
        const newer = createHermidata('Manga', 'Series One');
        const older = createHermidata('Manga', 'Series Two');
        newer.meta.relations = { relatedWorks: [{ type: 'sequel', id: 'c' }] };
        older.meta.relations = { relatedWorks: [{ type: 'sideStory', id: 'd' }, { type: 'sideStory', id: newer.id }] };

        const merged = await HermidataMigration.mergeTwoHermidata(newer, older);
        if (merged instanceof Error) throw merged;

        expect(merged.meta.relations).toEqual({ relatedWorks: [{ type: 'sequel', id: 'c' }, { type: 'sideStory', id: 'd' }] });
    });
});
