// Links between entries ( meta.relations ) through library sync, against the in-memory fakes of sync.testKit.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Hermidata } from '../../scripts/shared/types';
import { resolveRelatedGroup } from '../../scripts/shared/utils/Relations';

vi.mock('./browser', () => ({ ext: {} }));
import { devices, FakeCloud, FakeRemote, makeDevice, makeNovel, norm, settle, sorted } from './sync.testKit';

beforeEach(() => {
    devices.length = 0;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-11-16T12:00:00.000Z'));
});
afterEach(() => vi.useRealTimers());

/** Two related titles: 1 is the main story, 2 its sequel and part of a series */
function linkedPair(): Hermidata[] {
    const first = makeNovel(1);
    const second = makeNovel(2);
    first.meta.relations = { relatedWorks: [{ type: 'sequel', id: second.id }, { type: 'sideStory', id: 'not-on-this-device' }] };
    second.meta.relations = { series: { seriesId: 'saga', position: 2 }, relatedWorks: [{ type: 'mainStory', id: first.id }] };
    return [first, second];
}

describe('links in library sync', () => {
    it('arrive on another device unchanged, on browser sync and on a server', async () => {
        for (const backend of [undefined, new FakeRemote()]) {
            devices.length = 0;
            const cloud = new FakeCloud();
            const pair = linkedPair();
            const a = makeDevice(cloud, 'A', pair, { backend: backend?.connect() });
            const b = makeDevice(cloud, 'B', [], { backend: backend?.connect() });
            await a.start();
            await b.start();

            expect(b.list().map(norm)).toEqual(sorted(pair).map(norm));
        }
    });

    it('carry a group made on one device to every title of it on the other', async () => {
        const cloud = new FakeCloud();
        const a = makeDevice(cloud, 'A', [makeNovel(1), makeNovel(2)]);
        const b = makeDevice(cloud, 'B');
        await a.start();
        await b.start();

        const [first, second] = [makeNovel(1).id, makeNovel(2).id];
        a.edit(first, h => { h.meta.relations = { relatedWorks: [{ type: 'sideStory', id: second }] }; });
        a.edit(second, h => { h.meta.relations = { relatedWorks: [{ type: 'mainStory', id: first }] }; });
        await settle();

        expect(b.db.get(first)!.meta.relations).toEqual({ relatedWorks: [{ type: 'sideStory', id: second }] });
        expect(b.db.get(second)!.meta.relations).toEqual({ relatedWorks: [{ type: 'mainStory', id: first }] });
    });

    it('carry the cleanup of a deleted entry: the deletion and the entry that lost its link', async () => {
        const cloud = new FakeCloud();
        const pair = linkedPair();
        const a = makeDevice(cloud, 'A', pair);
        const b = makeDevice(cloud, 'B');
        await a.start();
        await b.start();

        const [first, second] = pair.map(entry => entry.id);
        a.remove(second);
        a.edit(first, h => { h.meta.relations = { relatedWorks: [{ type: 'sideStory', id: 'not-on-this-device' }] }; });
        await settle();

        expect(b.db.has(second)).toBe(false);
        expect(b.db.get(first)!.meta.relations).toEqual({ relatedWorks: [{ type: 'sideStory', id: 'not-on-this-device' }] });
    });

    it('still show the whole group when a concurrent edit on another device kept a copy without its links', async () => {
        const cloud = new FakeCloud();
        const a = makeDevice(cloud, 'A', [makeNovel(1), makeNovel(2)]);
        const b = makeDevice(cloud, 'B');
        await a.start();
        await b.start();

        const [first, second] = [makeNovel(1).id, makeNovel(2).id];
        // A links the two; B edits the first entry's notes a moment later, before A's link has arrived
        a.edit(first, h => { h.meta.relations = { relatedWorks: [{ type: 'sequel', id: second }] }; });
        a.edit(second, h => { h.meta.relations = { relatedWorks: [{ type: 'mainStory', id: first }] }; });
        vi.advanceTimersByTime(10);
        b.edit(first, h => { h.meta.notes = 'edited on B'; });
        await settle();

        const library = Object.fromEntries(a.list().map(entry => [entry.id, entry]));
        expect(library[first].meta.notes).toBe('edited on B');
        expect(library[first].meta.relations).toBe('None'); // the newest copy of the first entry won, without the link
        // the second title still lists the first, so both pages show the group; only the type only the first held is lost
        const group = resolveRelatedGroup(library[first], library);
        expect(group.map(member => member.entry.id)).toEqual([first, second]);
        expect(group[0].type).toBe('mainStory');
    });
});
