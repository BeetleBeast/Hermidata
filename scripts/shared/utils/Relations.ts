import type { Hermidata, RelatedEntry, RelatedRoles, RelatedWork, RelatedWorkType, Relation } from "../types";

/**
 * Related titles ( `meta.relations` ) form one group: every title in it lists all the others, each with the type
 * of what that title is ( `{ type: 'sequel', id: B }`: B is a sequel ). A title has the same type on every page,
 * so there is nothing to translate between two sides, and the whole group can be edited from any of its titles.
 * These helpers never change what they are given; they return new values, `'None'` for a title with nothing left.
 */

/** The type a title gets when no other title in its group has given it one yet ( the title the others were linked to ) */
const DEFAULT_TYPE: RelatedWorkType = 'mainStory';

export function getRelatedWorks(relations: Relation | 'None'): RelatedWork[] {
    return relations === 'None' ? [] : relations.relatedWorks;
}

export function hasRelatedWork(relations: Relation | 'None', id: string): boolean {
    return getRelatedWorks(relations).some(work => work.id === id);
}

/**
 * Every title related to `id`, directly or through other related titles, `id` first. Links are followed both ways,
 * so a group stays whole when one title lost its links ( sync keeps the newest copy of each title, so a title
 * edited on two devices at once can come back without them ). Titles that no longer exist are left out.
 */
export function findRelatedGroup(id: string, all: Record<string, Hermidata>): string[] {
    if (!all[id]) return [];
    const group = [id];
    for (let index = 0; index < group.length; index++) {
        const current = group[index];
        const linked = [
            ...getRelatedWorks(all[current].meta.relations).map(work => work.id),
            ...Object.values(all).filter(other => hasRelatedWork(other.meta.relations, current)).map(other => other.id),
        ];
        for (const other of linked) if (all[other] && !group.includes(other)) group.push(other);
    }
    return group;
}

/** The type of every title in the group of `id`, read from the other titles of the group */
export function groupRoles(id: string, all: Record<string, Hermidata>): RelatedRoles {
    const group = findRelatedGroup(id, all);
    const roles: RelatedRoles = {};
    for (const member of group) {
        const given = group.flatMap(other => getRelatedWorks(all[other].meta.relations)).find(work => work.id === member);
        roles[member] = given?.type ?? DEFAULT_TYPE;
    }
    return roles;
}

/**
 * The titles whose relations change when a group becomes `roles`: every title in it lists all the others with
 * their type ( and nothing else ), and each title in `removed` forgets the titles of the group.
 */
export function applyGroupRoles<T extends Hermidata>(all: Record<string, T>, roles: RelatedRoles, removed: string[]): T[] {
    const members = Object.keys(roles);
    const next: Record<string, Relation | 'None'> = {};
    for (const id of members) {
        if (!all[id]) continue;
        // titles it already lists keep their place, so a title whose links did not change is not written again
        const listed = getRelatedWorks(all[id].meta.relations).map(work => work.id).filter(other => other !== id && other in roles);
        const others = [...new Set([...listed, ...members.filter(other => other !== id)])];
        next[id] = toRelations(seriesOf(all[id].meta.relations), others.map(other => ({ type: roles[other], id: other })));
    }
    for (const id of removed) {
        if (all[id]) next[id] = toRelations(seriesOf(all[id].meta.relations), getRelatedWorks(all[id].meta.relations).filter(work => !(work.id in roles)));
    }
    return Object.entries(next)
        .filter(([id, relations]) => JSON.stringify(relations) !== JSON.stringify(all[id].meta.relations))
        .map(([id, relations]) => {
            const entry = structuredClone(all[id]);
            entry.meta.relations = relations;
            return entry;
        });
}

/** The group of `entry` as the detail page shows it, `entry` itself included; empty when it has no related titles */
export function resolveRelatedGroup(entry: Hermidata, all: Record<string, Hermidata>): RelatedEntry[] {
    const library = { ...all, [entry.id]: entry };
    const roles = groupRoles(entry.id, library);
    const members = Object.keys(roles);
    return members.length < 2 ? [] : members.map(id => ({ type: roles[id], entry: library[id] }));
}

/**
 * Follow a title that moved to another id ( `toId` ), or forget one that was deleted ( `toId` null ).
 * A link that now points at the title itself ( `ownId` ) is dropped, and so is a second link to the same title.
 */
export function retargetRelations(relations: Relation | 'None', ownId: string, fromId: string, toId: string | null): Relation | 'None' {
    const works = getRelatedWorks(relations).flatMap(work => {
        if (work.id !== fromId) return [work];
        return toId ? [{ ...work, id: toId }] : [];
    });
    return toRelations(seriesOf(relations), uniqueById(works.filter(work => work.id !== ownId)));
}

/**
 * The relations of two titles merged into one: every link of both, the kept title's first.
 * Links to `mergedIds` ( the two titles themselves ) would point at the merged title, so they are dropped.
 */
export function mergeRelations(keep: Relation | 'None', discard: Relation | 'None', mergedIds: string[]): Relation | 'None' {
    const works = [...getRelatedWorks(keep), ...getRelatedWorks(discard)].filter(work => !mergedIds.includes(work.id));
    return toRelations(seriesOf(keep) ?? seriesOf(discard), uniqueById(works));
}

function seriesOf(relations: Relation | 'None'): Relation['series'] {
    return relations === 'None' ? undefined : relations.series;
}

/** `works` with the series, if any; `'None'` when there is neither */
function toRelations(series: Relation['series'], works: RelatedWork[]): Relation | 'None' {
    if (works.length === 0 && !series) return 'None';
    return series ? { series, relatedWorks: works } : { relatedWorks: works };
}

function uniqueById(works: RelatedWork[]): RelatedWork[] {
    return works.filter((work, index) => works.findIndex(other => other.id === work.id) === index);
}
