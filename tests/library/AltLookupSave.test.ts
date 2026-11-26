import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditDetail } from '../../scripts/library/build/edit';
import { AltTitleLookupPanel } from '../../scripts/library/build/altLookup';
import type { LookupPatch } from '../../scripts/shared/lookup/altTitleLookup';
import { HermidataModel } from '../../scripts/shared/utils/HermidataSelector';
import { generateHermidataHash } from '../../scripts/shared/utils/StringOutput';
import type { Hermidata, Settings } from '../../scripts/shared/types';

const mocks = vi.hoisted(() => ({
    saveHermidata: vi.fn(),
    moveHermidata: vi.fn(),
    removeHermidata: vi.fn(),
    errorShown: vi.fn(),
}));

vi.mock('../../scripts/shared/db/Storage', () => ({
    getAllTags: vi.fn().mockReturnValue(new Map()),
    dbAccess: class {
        saveHermidata = mocks.saveHermidata;
        moveHermidata = mocks.moveHermidata;
        removeHermidata = mocks.removeHermidata;
    },
}));

vi.mock('../../scripts/shared/utils/ErrorMessage', async importOriginal => ({
    ...(await importOriginal<typeof import('../../scripts/shared/utils/ErrorMessage')>()),
    ErrorMessage: class { sendMessage = mocks.errorShown; },
}));

const MATCH: LookupPatch['external'] = { status: 'matched', source: 'mangaupdates', id: '77', checkedAt: '2026-11-26T10:00:00.000Z' };

function createItem(altTitles: string[] = ['Existing alt']): HermidataModel {
    const item = HermidataModel.from('Manga', 'Viewing', 'Ongoing');
    item.title = 'A Cadet Becomes a Prophet?!';
    item.SetUrl('https://example.com/series/chapter-12');
    item.id = generateHermidataHash(item.title, item.novelType, item.GetUrl());
    item.meta.altTitles = altTitles;
    return item;
}

function createPage(item: HermidataModel): { page: EditDetail; all: Record<string, Hermidata> } {
    vi.stubGlobal('document', { querySelector: () => null, addEventListener: vi.fn(), title: '' });
    const all: Record<string, Hermidata> = { [item.id]: structuredClone(item.toJSON()) }; // the page's list holds its own copy
    const page = new EditDetail(all, {} as Settings, item);
    Reflect.set(page, 'render', vi.fn()); // nothing to draw without a page
    return { page, all };
}

function applyLookup(page: EditDetail, patch: LookupPatch): Promise<{ saved: boolean; added: string[] }> {
    return Reflect.apply(Reflect.get(page, 'applyLookup'), page, [patch]);
}

describe('saving an alt title lookup from the overview', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.saveHermidata.mockResolvedValue(undefined);
        mocks.moveHermidata.mockResolvedValue(undefined);
    });

    it('saves the found titles under the item id and keeps the open page in step', async () => {
        const item = createItem();
        const { page, all } = createPage(item);

        const result = await applyLookup(page, { external: MATCH, titles: ['Prophecies are my textbooks', 'Existing alt'] });

        expect(result).toEqual({ saved: true, added: ['Prophecies are my textbooks'] });
        expect(mocks.saveHermidata).toHaveBeenCalledTimes(1);
        const [key, saved] = mocks.saveHermidata.mock.calls[0] as [string, Hermidata];
        expect(key).toBe(item.id);
        expect(saved.meta.altTitles).toEqual(['Existing alt', 'Prophecies are my textbooks']);
        expect(saved.meta.external).toEqual(MATCH);
        // the model on the page and the page's list of items hold what was saved
        expect(item.meta.altTitles).toEqual(['Existing alt', 'Prophecies are my textbooks']);
        expect(item.meta.external).toEqual(MATCH);
        expect(all[item.id].meta.altTitles).toEqual(['Existing alt', 'Prophecies are my textbooks']);
        expect(mocks.moveHermidata).not.toHaveBeenCalled();
    });

    it('applies the patch to the item as it is when its turn comes, so an edit that was already saving is not written back', async () => {
        const item = createItem();
        const { page } = createPage(item);
        let finishFirstSave: () => void = () => {};
        mocks.saveHermidata.mockImplementationOnce(() => new Promise<void>(resolve => { finishFirstSave = resolve; }));

        // a notes save is running when the lookup answers
        const notesSaved = page.commit('Notes updated', () => { item.meta.notes = 'Read up to the arc'; });
        const lookupSaved = applyLookup(page, { external: MATCH, titles: ['Prophecies are my textbooks'] });
        await vi.waitFor(() => expect(mocks.saveHermidata).toHaveBeenCalledTimes(1));
        expect(mocks.saveHermidata).toHaveBeenCalledTimes(1); // the lookup waits for its turn
        finishFirstSave();
        await Promise.all([notesSaved, lookupSaved]);

        expect(mocks.saveHermidata).toHaveBeenCalledTimes(2);
        const [, secondSave] = mocks.saveHermidata.mock.calls[1] as [string, Hermidata];
        expect(secondSave.meta.notes).toBe('Read up to the arc');
        expect(secondSave.meta.altTitles).toEqual(['Existing alt', 'Prophecies are my textbooks']);
    });

    it('does not add what the page already has, and says what it added', async () => {
        const item = createItem(['Existing alt']);
        const { page } = createPage(item);

        const result = await applyLookup(page, { external: MATCH, titles: ['existing ALT'] });

        expect(result).toEqual({ saved: true, added: [] });
        expect(item.meta.altTitles).toEqual(['Existing alt']);
        expect(item.meta.external).toEqual(MATCH);
    });

    it('puts the item back and says it was not saved when the save fails', async () => {
        const item = createItem();
        const { page, all } = createPage(item);
        mocks.saveHermidata.mockRejectedValueOnce(new Error('DataError: nope'));

        const result = await applyLookup(page, { external: MATCH, titles: ['Prophecies are my textbooks'] });

        expect(result.saved).toBe(false);
        expect(item.meta.altTitles).toEqual(['Existing alt']);
        expect(item.meta.external).toBeUndefined();
        expect(all[item.id].meta.altTitles).toEqual(['Existing alt']);
        expect(mocks.errorShown).toHaveBeenCalledTimes(1);
    });

    it('keeps saving after a failed save', async () => {
        const item = createItem();
        const { page } = createPage(item);
        mocks.saveHermidata.mockRejectedValueOnce(new Error('first one fails'));

        await applyLookup(page, { external: MATCH, titles: ['One'] });
        const second = await applyLookup(page, { external: MATCH, titles: ['Two'] });

        expect(second).toEqual({ saved: true, added: ['Two'] });
        expect(item.meta.altTitles).toEqual(['Existing alt', 'Two']);
    });

    it('saves a lookup under the id a rename just gave the item', async () => {
        const item = createItem();
        const { page } = createPage(item);
        vi.stubGlobal('history', { replaceState: vi.fn() });
        const oldId = item.id;

        // a rename ( title ) and a lookup, one after the other
        await page.commit('Title updated', () => { item.title = 'A Cadet Becomes a Prophet'; });
        const result = await applyLookup(page, { external: MATCH, titles: ['Prophecies are my textbooks'] });

        const newId = generateHermidataHash(item.title, item.novelType, item.GetUrl());
        expect(newId).not.toBe(oldId);
        expect(mocks.moveHermidata).toHaveBeenCalledWith(oldId, newId, expect.objectContaining({ id: newId }));
        // the lookup saved under the id the rename gave, never under the old one
        expect(result.saved).toBe(true);
        expect(mocks.saveHermidata).toHaveBeenCalledWith(newId, expect.objectContaining({ id: newId }));
        expect(mocks.saveHermidata).not.toHaveBeenCalledWith(oldId, expect.anything());
    });
});

describe('the alt title lookup panel', () => {
    function element(extra: object = {}) {
        return { textContent: '', dataset: {} as Record<string, string>, hidden: true, disabled: false, value: '', addEventListener: vi.fn(), replaceChildren: vi.fn(), focus: vi.fn(), select: vi.fn(), ...extra };
    }

    function createPanel(applyToItem: (patch: LookupPatch) => Promise<{ saved: boolean; added: string[] }>) {
        const els: Record<string, ReturnType<typeof element>> = {
            '#hermidata-alt-lookup': element(),
            '#hermidata-alt-lookup-status': element(),
            '#hermidata-alt-lookup-btn': element(),
            '#hermidata-alt-lookup-form': element(),
            '#hermidata-alt-lookup-input': element(),
            '#hermidata-alt-lookup-submit': element(),
            '#hermidata-alt-lookup-candidates': element(),
        };
        vi.stubGlobal('document', { querySelector: (selector: string) => els[selector] ?? null });
        const onApplied = vi.fn();
        const panel = new AltTitleLookupPanel(createItem(), {} as Settings, applyToItem, onApplied);
        return { panel, els, onApplied, status: () => els['#hermidata-alt-lookup-status'] };
    }
    const apply = (panel: AltTitleLookupPanel, patch: LookupPatch): Promise<void> => Reflect.apply(Reflect.get(panel, 'apply'), panel, [patch]);
    const run = (panel: AltTitleLookupPanel, request: () => Promise<unknown>): Promise<void> => Reflect.apply(Reflect.get(panel, 'run'), panel, [request]);

    beforeEach(() => vi.clearAllMocks());

    it('hands the patch to the page and reports what was added once it is saved', async () => {
        const applyToItem = vi.fn().mockResolvedValue({ saved: true, added: ['Prophecies are my textbooks'] });
        const { panel, status, onApplied } = createPanel(applyToItem);
        const patch: LookupPatch = { external: MATCH, titles: ['Prophecies are my textbooks'] };

        await apply(panel, patch);

        expect(applyToItem).toHaveBeenCalledWith(patch);
        expect(onApplied).toHaveBeenCalledTimes(1);
        expect(status().textContent).toContain('Added 1 alt title.');
    });

    it('shows one short line when the page could not save, and shows nothing as applied', async () => {
        const { panel, status, onApplied } = createPanel(vi.fn().mockResolvedValue({ saved: false, added: [] }));

        await apply(panel, { external: MATCH, titles: ['x'] });

        expect(status().textContent).toBe('Could not save the lookup result.');
        expect(status().dataset.error).toBe('true');
        expect(onApplied).not.toHaveBeenCalled();
    });

    it('keeps the details of a failure in the console and out of the page', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const item = createItem();
        const failure = new Error(`DataError: Data provided to an operation does not meet requirements.\n Call: ${JSON.stringify(item)}`);
        const { panel, status } = createPanel(vi.fn());

        await run(panel, () => Promise.reject(failure));

        expect(status().textContent).toBe('The lookup failed. Try again later.');
        expect(status().textContent).not.toContain(item.title);
        expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('lookup failed'), failure);
        consoleError.mockRestore();
    });
});
