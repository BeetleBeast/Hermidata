import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateChapterProgress } from '../../scripts/popup/core/save';
import { getHermidataViaKey, saveHermidata } from '../../scripts/shared/db/Storage';
import { HermidataModel } from '../../scripts/shared/utils/HermidataSelector';
import { generateHermidataHash } from '../../scripts/shared/utils/StringOutput';
import type { Hermidata } from '../../scripts/shared/types';

const pastInit = vi.hoisted(() => vi.fn());

vi.mock('../../scripts/shared/db/Storage', () => ({
    getHermidataViaKey: vi.fn(),
    saveHermidata: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../scripts/popup/core/Past', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../scripts/popup/core/Past')>()),
    PastHermidata: class { init = pastInit; },
}));

function createPage(title: string, chapter: number): HermidataModel {
    const hermidata = HermidataModel.from('Manga', 'Viewing', 'Ongoing');
    hermidata.title = title;
    hermidata.SetUrl(`https://manga.com/solo-leveling/chapter-${chapter}`);
    hermidata.SetChapter(chapter);
    return hermidata;
}

function createSaved(title: string, id: string): Hermidata {
    const saved = createPage(title, 3);
    saved.id = id;
    return saved.toJSON();
}

const pageKey = (page: HermidataModel) => generateHermidataHash(page.title, page.novelType, page.GetUrl(), false);
const savedKeys = () => vi.mocked(saveHermidata).mock.calls.map(([key]) => key);

beforeEach(() => {
    vi.mocked(getHermidataViaKey).mockReset();
    vi.mocked(saveHermidata).mockClear();
    pastInit.mockReset();
});

describe('updateChapterProgress', () => {
    it('updates the item stored under the computed key', async () => {
        const page = createPage('Solo Leveling', 10);
        vi.mocked(getHermidataViaKey).mockResolvedValue(createSaved('Solo Leveling', pageKey(page)));

        expect(await updateChapterProgress(page)).toBe(true);
        expect(savedKeys()).toEqual([pageKey(page)]);
        expect(pastInit).not.toHaveBeenCalled();
    });

    it('looks up the saved item when the key misses and updates it under its own id', async () => {
        const page = createPage('Solo Leveling Alt', 10);
        vi.mocked(getHermidataViaKey).mockResolvedValue(null);
        pastInit.mockResolvedValue(createSaved('Solo Leveling', 'existing-id'));

        expect(await updateChapterProgress(page)).toBe(true);
        expect(pastInit).toHaveBeenCalledOnce();
        // updated in place, not copied under the page's key
        expect(savedKeys()).toEqual(['existing-id']);
        expect(vi.mocked(saveHermidata).mock.calls[0][1].chapter.latest).toBe(10);
    });

    it('creates a new item under the computed key when nothing is found', async () => {
        const page = createPage('Solo Leveling', 10);
        vi.mocked(getHermidataViaKey).mockResolvedValue(null);
        pastInit.mockResolvedValue(null);

        expect(await updateChapterProgress(page)).toBe(true);
        expect(savedKeys()).toEqual([pageKey(page)]);
    });

    it('updates an item by its own id when it is not stored under the hash of its title', async () => {
        const page = createPage('Solo Leveling', 10);
        page.id = 'separate-id';
        vi.mocked(getHermidataViaKey).mockImplementation(async (key: string) => key === 'separate-id' ? createSaved('Solo Leveling', 'separate-id') : null);

        expect(await updateChapterProgress(page)).toBe(true);
        expect(savedKeys()).toEqual(['separate-id']);
        expect(pastInit).not.toHaveBeenCalled();
    });

    it('reports success when the saved title only differs in case', async () => {
        const page = createPage('Solo Leveling', 10);
        vi.mocked(getHermidataViaKey).mockResolvedValue(createSaved('solo leveling', pageKey(page)));

        expect(await updateChapterProgress(page)).toBe(true);
    });
});
