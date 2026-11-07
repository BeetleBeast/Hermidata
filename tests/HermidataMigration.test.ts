import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HermidataMigration } from '../scripts/shared/migration/Hermidata';
import { removeHermidata, updateHermidata } from '../scripts/shared/db/Storage';
import { HermidataModel } from '../scripts/shared/utils/HermidataSelector';
import { returnHashedTitle } from '../scripts/shared/utils/StringOutput';

vi.mock('../scripts/shared/db/Storage', () => ({
    getAllRawFeeds: vi.fn(),
    getHermidataViaKey: vi.fn(),
    removeHermidata: vi.fn().mockResolvedValue(undefined),
    setAllHermidata: vi.fn(),
    setAllRawFeeds: vi.fn(),
    updateHermidata: vi.fn().mockResolvedValue(undefined),
}));

function createHermidata(novelType: string, title = 'Series'): HermidataModel {
    const hermidata = HermidataModel.from(novelType, 'Viewing', 'Ongoing');
    hermidata.title = title;
    hermidata.id = returnHashedTitle(hermidata.title, novelType);
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
        expect(keep.id).toBe(returnHashedTitle(keep.title, keep.novelType));
        expect(discard.id).toBe(returnHashedTitle(discard.title, discard.novelType));
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

        const animeId = returnHashedTitle(animeResult.title, animeResult.novelType);
        expect(animeResult.novelType).toBe('Anime');
        expect(animeResult.id).toBe(animeId);
        expect(updateHermidata).toHaveBeenCalledWith(original.id, animeId, animeResult);

        const changedBackToManga = createHermidata('Manga');
        const mangaResult = await HermidataMigration.mergeTwoHermidata(
            changedBackToManga,
            animeResult,
        );

        expect(mangaResult).not.toBeInstanceOf(Error);
        if (mangaResult instanceof Error) throw mangaResult;

        const mangaId = returnHashedTitle(mangaResult.title, mangaResult.novelType);
        expect(mangaResult.novelType).toBe('Manga');
        expect(mangaResult.id).toBe(mangaId);
        expect(updateHermidata).toHaveBeenNthCalledWith(2, animeId, mangaId, mangaResult);
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

        const expectedId = returnHashedTitle(keep.title, 'Anime', keep.GetUrl());
        expect(result).toEqual({
            merged: true,
            removedIds: [keep.id, discard.id],
            addedId: expectedId,
        });
        expect(updateHermidata).toHaveBeenCalledWith(discard.id, expectedId, expect.objectContaining({
            id: expectedId,
            title: keep.title,
            novelType: 'Anime',
        }));
        expect(removeHermidata).toHaveBeenCalledWith(keep.id);
    });

    it('keeps the existing ID and removes only the discarded key when identity is unchanged', async () => {
        const keep = createHermidata('Manga');
        const discard = keep.Copy();
        discard.id = returnHashedTitle('Series Alt', discard.novelType);
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
        expect(updateHermidata).toHaveBeenCalledWith(discard.id, keep.id, expect.objectContaining({
            id: keep.id,
            title: keep.title,
            novelType: keep.novelType,
        }));
        expect(removeHermidata).not.toHaveBeenCalled();
    });
});
