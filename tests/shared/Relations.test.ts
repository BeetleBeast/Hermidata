import { describe, expect, it } from 'vitest';
import { applyGroupRoles, findRelatedGroup, getRelatedWorks, groupRoles, hasRelatedWork, mergeRelations, resolveRelatedGroup, retargetRelations } from '../../scripts/shared/utils/Relations';
import { HermidataModel } from '../../scripts/shared/utils/HermidataSelector';
import type { Hermidata, Relation } from '../../scripts/shared/types';

function createHermidata(id: string, relations: Relation | 'None' = 'None'): Hermidata {
    const hermidata = HermidataModel.from('Manga', 'Viewing', 'Ongoing').toJSON();
    hermidata.id = id;
    hermidata.title = `Title ${id}`;
    hermidata.meta.relations = relations;
    return hermidata;
}

function library(...entries: Hermidata[]): Record<string, Hermidata> {
    return Object.fromEntries(entries.map(entry => [entry.id, entry]));
}

const series = { seriesId: 'saga', position: 2 };

/** a is the main story, b its sequel, c an adaptation: every title lists the other two */
function saga(): Record<string, Hermidata> {
    return library(
        createHermidata('a', { relatedWorks: [{ type: 'sequel', id: 'b' }, { type: 'adaptation', id: 'c' }] }),
        createHermidata('b', { relatedWorks: [{ type: 'mainStory', id: 'a' }, { type: 'adaptation', id: 'c' }] }),
        createHermidata('c', { relatedWorks: [{ type: 'mainStory', id: 'a' }, { type: 'sequel', id: 'b' }] }),
    );
}

describe('getRelatedWorks / hasRelatedWork', () => {
    it('reads None as no links', () => {
        expect(getRelatedWorks('None')).toEqual([]);
        expect(hasRelatedWork('None', 'b')).toBe(false);
        expect(hasRelatedWork({ relatedWorks: [{ type: 'sequel', id: 'b' }] }, 'b')).toBe(true);
    });
});

describe('findRelatedGroup', () => {
    it('finds every title of the group, the asked one first', () => {
        expect(findRelatedGroup('b', saga())).toEqual(['b', 'a', 'c']);
    });

    it('follows links both ways and through other titles, so a title that lost its links stays in the group', () => {
        const all = library(
            createHermidata('a'),                                                      // lost its links in sync
            createHermidata('b', { relatedWorks: [{ type: 'mainStory', id: 'a' }] }),
            createHermidata('c', { relatedWorks: [{ type: 'sequel', id: 'b' }] }),
        );

        expect(findRelatedGroup('a', all)).toEqual(['a', 'b', 'c']);
    });

    it('leaves out titles that no longer exist, and is empty for a title that does not exist', () => {
        const all = library(createHermidata('a', { relatedWorks: [{ type: 'sequel', id: 'gone' }] }));

        expect(findRelatedGroup('a', all)).toEqual(['a']);
        expect(findRelatedGroup('gone', all)).toEqual([]);
    });
});

describe('groupRoles', () => {
    it('gives every title the type the other titles list it with', () => {
        expect(groupRoles('c', saga())).toEqual({ c: 'adaptation', a: 'mainStory', b: 'sequel' });
    });

    it('makes a title no other title has a type for the main story', () => {
        const all = library(createHermidata('a', { relatedWorks: [{ type: 'sequel', id: 'b' }] }), createHermidata('b'));

        expect(groupRoles('a', all)).toEqual({ a: 'mainStory', b: 'sequel' });
        expect(groupRoles('x', library(createHermidata('x')))).toEqual({ x: 'mainStory' });
    });
});

describe('applyGroupRoles', () => {
    it('lets every title of the group list all the others with their type', () => {
        const all = library(createHermidata('a'), createHermidata('b'), createHermidata('c'));

        const changed = library(...applyGroupRoles(all, { a: 'mainStory', b: 'sequel', c: 'adaptation' }, []));

        expect(changed.a.meta.relations).toEqual({ relatedWorks: [{ type: 'sequel', id: 'b' }, { type: 'adaptation', id: 'c' }] });
        expect(changed.b.meta.relations).toEqual({ relatedWorks: [{ type: 'mainStory', id: 'a' }, { type: 'adaptation', id: 'c' }] });
        expect(changed.c.meta.relations).toEqual({ relatedWorks: [{ type: 'mainStory', id: 'a' }, { type: 'sequel', id: 'b' }] });
        expect(all.a.meta.relations).toBe('None'); // what it was given is not changed
    });

    it('changes a type on every title that lists it, and returns only the titles that changed', () => {
        const changed = applyGroupRoles(saga(), { a: 'mainStory', b: 'spinOff', c: 'adaptation' }, []);

        expect(changed.map(entry => entry.id)).toEqual(['a', 'c']);
        expect(changed.every(entry => hasRelatedWork(entry.meta.relations, 'b'))).toBe(true);
        expect(changed.flatMap(entry => getRelatedWorks(entry.meta.relations)).find(work => work.id === 'b')?.type).toBe('spinOff');
    });

    it('lets a removed title forget the group, and a title left alone go back to None while keeping its series', () => {
        const all = library(
            createHermidata('a', { series, relatedWorks: [{ type: 'sequel', id: 'b' }] }),
            createHermidata('b', { relatedWorks: [{ type: 'mainStory', id: 'a' }] }),
        );

        const changed = library(...applyGroupRoles(all, { a: 'mainStory' }, ['b']));

        expect(changed.a.meta.relations).toEqual({ series, relatedWorks: [] });
        expect(changed.b.meta.relations).toBe('None');
    });
});

describe('resolveRelatedGroup', () => {
    it('lists the whole group, the title itself included, with the same types on every page', () => {
        const all = saga();
        const fromA = resolveRelatedGroup(all.a, all).map(member => `${member.entry.id}: ${member.type}`);
        const fromC = resolveRelatedGroup(all.c, all).map(member => `${member.entry.id}: ${member.type}`);

        expect(fromA).toEqual(['a: mainStory', 'b: sequel', 'c: adaptation']);
        expect(fromC.sort()).toEqual(fromA);
    });

    it('is empty for a title without related titles', () => {
        const all = library(createHermidata('a'));
        expect(resolveRelatedGroup(all.a, all)).toEqual([]);
    });

    it('reads the title itself from what it is given, not from the library copy', () => {
        const all = saga();
        const edited = { ...structuredClone(all.a), title: 'Renamed' };

        expect(resolveRelatedGroup(edited, all).find(member => member.entry.id === 'a')?.entry.title).toBe('Renamed');
    });
});

describe('retargetRelations', () => {
    it('points a link at the id a title moved to', () => {
        const relations: Relation = { series, relatedWorks: [{ type: 'sequel', id: 'old' }, { type: 'adaptation', id: 'c' }] };

        expect(retargetRelations(relations, 'a', 'old', 'new')).toEqual({
            series,
            relatedWorks: [{ type: 'sequel', id: 'new' }, { type: 'adaptation', id: 'c' }],
        });
    });

    it('drops the link to a deleted title', () => {
        expect(retargetRelations({ relatedWorks: [{ type: 'sequel', id: 'gone' }] }, 'a', 'gone', null)).toBe('None');
    });

    it('drops a link that would point at the title itself, and a second link to the same title', () => {
        const relations: Relation = { relatedWorks: [{ type: 'prequel', id: 'c' }, { type: 'sequel', id: 'b' }, { type: 'adaptation', id: 'd' }] };

        expect(retargetRelations(relations, 'a', 'b', 'a')).toEqual({ relatedWorks: [{ type: 'prequel', id: 'c' }, { type: 'adaptation', id: 'd' }] });
        expect(retargetRelations(relations, 'x', 'b', 'c')).toEqual({ relatedWorks: [{ type: 'prequel', id: 'c' }, { type: 'adaptation', id: 'd' }] });
    });
});

describe('mergeRelations', () => {
    it('joins the links of both titles, the kept title first and winning a duplicate', () => {
        const keep: Relation = { relatedWorks: [{ type: 'sequel', id: 'c' }] };
        const discard: Relation = { relatedWorks: [{ type: 'adaptation', id: 'c' }, { type: 'prequel', id: 'd' }] };

        expect(mergeRelations(keep, discard, ['a', 'b'])).toEqual({ relatedWorks: [{ type: 'sequel', id: 'c' }, { type: 'prequel', id: 'd' }] });
    });

    it('drops the links between the two merged titles', () => {
        const keep: Relation = { relatedWorks: [{ type: 'adaptation', id: 'b' }] };
        const discard: Relation = { relatedWorks: [{ type: 'mainStory', id: 'a' }] };

        expect(mergeRelations(keep, discard, ['a', 'b'])).toBe('None');
    });

    it('keeps a series from either title, the kept one first', () => {
        const other = { seriesId: 'other', position: 1 };
        expect(mergeRelations('None', { series, relatedWorks: [] }, ['a', 'b'])).toEqual({ series, relatedWorks: [] });
        expect(mergeRelations({ series: other, relatedWorks: [] }, { series, relatedWorks: [] }, ['a', 'b'])).toEqual({ series: other, relatedWorks: [] });
    });
});
