import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditDetail } from '../../scripts/library/build/edit';
import { RelatedWorks } from '../../scripts/library/build/relations';
import { ErrorMessage } from '../../scripts/shared/utils/ErrorMessage';
import { HermidataModel } from '../../scripts/shared/utils/HermidataSelector';
import { generateHermidataHash } from '../../scripts/shared/utils/StringOutput';
import { resolveRelatedGroup } from '../../scripts/shared/utils/Relations';
import type { Hermidata, RelatedWorkType, Relation, Settings } from '../../scripts/shared/types';

const settings = {} as Settings;

/** An entry stored under the id its title gives it, so saving it never moves it */
function createEntry(title: string, relations: Relation | 'None' = 'None'): Hermidata {
    const hermidata = HermidataModel.from('Manga', 'Viewing', 'Ongoing');
    hermidata.title = title;
    hermidata.SetUrl(`https://example.com/${title}/chapter-1`);
    hermidata.id = generateHermidataHash(hermidata.title, hermidata.novelType, hermidata.GetUrl());
    hermidata.meta.relations = relations;
    return hermidata.toJSON();
}

function callPrivate<T>(instance: object, method: string, ...args: unknown[]): T {
    const fn = Reflect.get(instance, method);
    if (typeof fn !== 'function') throw new Error(`Missing method ${method}`);
    return Reflect.apply(fn, instance, args) as T;
}

/** The detail page of `entry`, without a DOM: every element lookup finds nothing */
function openPage(entry: Hermidata, all: Record<string, Hermidata>) {
    const db = {
        saveHermidata: vi.fn().mockResolvedValue(undefined),
        moveHermidata: vi.fn().mockResolvedValue(undefined),
        linkHermidata: vi.fn(),
        unlinkHermidata: vi.fn(),
    };
    const model = new HermidataModel(structuredClone(entry));
    const editDetail = new EditDetail(all, settings, model);
    const related = new RelatedWorks(all, settings, model, editDetail.commit);
    Reflect.set(editDetail, 'db', db);
    Reflect.set(related, 'db', db);
    return { db, model, editDetail, related };
}

describe('the related titles card', () => {
    beforeEach(() => {
        vi.stubGlobal('document', { querySelector: () => null, addEventListener: vi.fn(), title: '' });
        vi.stubGlobal('window', { setTimeout: vi.fn(), clearTimeout: vi.fn() });
    });

    it('adds a title through the page queue and keeps the stored group in the page model, so the next save keeps it', async () => {
        const a = createEntry('Series');
        const b = createEntry('Series Two');
        const all = { [a.id]: a, [b.id]: b };
        const { db, model, related } = openPage(a, all);
        const storedA = { ...structuredClone(a), meta: { ...a.meta, relations: { relatedWorks: [{ type: 'sequel' as RelatedWorkType, id: b.id }] } } };
        const storedB = { ...structuredClone(b), meta: { ...b.meta, relations: { relatedWorks: [{ type: 'mainStory' as RelatedWorkType, id: a.id }] } } };
        db.linkHermidata.mockResolvedValue([storedA, storedB]);

        await callPrivate<Promise<void>>(related, 'link', b, 'sequel');

        expect(db.linkHermidata).toHaveBeenCalledWith(a.id, b.id, 'sequel');
        expect(model.meta.relations).toEqual(storedA.meta.relations);
        expect(db.saveHermidata).toHaveBeenCalledWith(a.id, expect.objectContaining({ meta: expect.objectContaining({ relations: storedA.meta.relations }) }));
        expect(all[b.id].meta.relations).toEqual(storedB.meta.relations);
    });

    it('changes the type of this title itself through the same call', async () => {
        const a = createEntry('Series');
        const b = createEntry('Series Two', { relatedWorks: [{ type: 'mainStory', id: a.id }] });
        a.meta.relations = { relatedWorks: [{ type: 'sequel', id: b.id }] };
        const all = { [a.id]: a, [b.id]: b };
        const { db, related } = openPage(a, all);
        const storedB = { ...structuredClone(b), meta: { ...b.meta, relations: { relatedWorks: [{ type: 'adaptation' as RelatedWorkType, id: a.id }] } } };
        db.linkHermidata.mockResolvedValue([storedB]);

        await callPrivate<Promise<void>>(related, 'link', a, 'adaptation');

        expect(db.linkHermidata).toHaveBeenCalledWith(a.id, a.id, 'adaptation');
        expect(resolveRelatedGroup(a, all).map(member => [member.entry.id, member.type])).toEqual([[a.id, 'adaptation'], [b.id, 'sequel']]);
    });

    it('does not show a removed title again from the other side', async () => {
        const a = createEntry('Series');
        const b = createEntry('Series Two', { relatedWorks: [{ type: 'mainStory', id: a.id }] });
        a.meta.relations = { relatedWorks: [{ type: 'sequel', id: b.id }] };
        const all = { [a.id]: a, [b.id]: b };
        const { db, model, related } = openPage(a, all);
        db.unlinkHermidata.mockResolvedValue([{ ...structuredClone(a), meta: { ...a.meta, relations: 'None' } }, { ...structuredClone(b), meta: { ...b.meta, relations: 'None' } }]);

        await callPrivate<Promise<void>>(related, 'unlink', b);

        expect(db.unlinkHermidata).toHaveBeenCalledWith(a.id, b.id);
        expect(model.meta.relations).toBe('None');
        expect(resolveRelatedGroup(model, all)).toEqual([]);
    });

    it('keeps a link when an earlier edit is undone, since the linked title holds it too', async () => {
        const a = createEntry('Series');
        const b = createEntry('Series Two');
        const all = { [a.id]: a, [b.id]: b };
        const { db, model, editDetail, related } = openPage(a, all);
        const linked: Relation = { relatedWorks: [{ type: 'adaptation', id: b.id }] };
        db.linkHermidata.mockResolvedValue([{ ...structuredClone(a), meta: { ...a.meta, relations: linked } }, b]);

        await editDetail.commit('Author updated', () => { model.meta.author = 'Someone'; });
        Reflect.set(editDetail, 'undoSnapshot', { ...structuredClone(a) }); // the toast offers to undo the author change
        await callPrivate<Promise<void>>(related, 'link', b, 'adaptation');
        await callPrivate<Promise<void>>(editDetail, 'undo');

        expect(model.meta.author).toBeUndefined();
        expect(model.meta.relations).toEqual(linked);
    });

    it('puts the page model back when linking fails, and reports it', async () => {
        const a = createEntry('Series');
        const b = createEntry('Series Two');
        const all = { [a.id]: a, [b.id]: b };
        const { db, model, related } = openPage(a, all);
        db.linkHermidata.mockRejectedValue(new Error('linkHermidata: failed'));
        const report = vi.spyOn(ErrorMessage.prototype, 'sendMessage').mockImplementation(() => {});

        await callPrivate<Promise<void>>(related, 'link', b, 'sequel');

        expect(model.meta.relations).toBe('None');
        expect(db.saveHermidata).not.toHaveBeenCalled();
        expect(report).toHaveBeenCalledTimes(1);
        report.mockRestore();
    });
});
