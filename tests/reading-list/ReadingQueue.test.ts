import { describe, expect, it } from 'vitest';
import { HermidataModel } from '../../scripts/shared/utils/HermidataSelector';
import type { Hermidata, ReadingQueue } from '../../scripts/shared/types';
import {
    addToQueue, getPriorityBand, getQueue, isQueueable, moveInQueue, normaliseQueue,
    pickForMe, removeFromQueue, setQueuePriority, sortQueueByPriority,
} from '../../scripts/reading-list/queue';

function createItem(id: string, queue: ReadingQueue | false = false, status = 'Planned'): Hermidata {
    const hermidata = HermidataModel.from('Manga', status, 'Ongoing');
    hermidata.id = id;
    hermidata.title = `Title ${id}`;
    hermidata.meta.readingQueue = queue;
    return hermidata.toJSON();
}

const q = (queueIndex: number, priority = 5): ReadingQueue => ({ readNext: queueIndex === 0, priority, queueIndex });

/** Apply a change set the way the page does, so tests chain operations */
function apply(all: Hermidata[], changed: Hermidata[]): Hermidata[] {
    const byId = new Map(changed.map(entry => [entry.id, entry]));
    return all.map(entry => byId.get(entry.id) ?? entry);
}
const order = (all: Hermidata[]) => getQueue(all).map(entry => entry.id);

describe('getQueue', () => {
    it('orders by index and ignores entries that are not queued', () => {
        const all = [createItem('b', q(1)), createItem('x'), createItem('a', q(0))];
        expect(order(all)).toEqual(['a', 'b']);
    });

    it('breaks ties (imports all start at 0) by priority', () => {
        const all = [createItem('low', q(0, 2)), createItem('high', q(0, 8))];
        expect(order(all)).toEqual(['high', 'low']);
    });
});

describe('normaliseQueue', () => {
    it('makes indexes contiguous with exactly one readNext', () => {
        const all = [createItem('a', q(0, 2)), createItem('b', q(0, 8)), createItem('c', q(7, 5))];
        const fixed = apply(all, normaliseQueue(all));
        const queue = getQueue(fixed);

        expect(queue.map(e => e.id)).toEqual(['b', 'a', 'c']);
        expect(queue.map(e => (e.meta.readingQueue as ReadingQueue).queueIndex)).toEqual([0, 1, 2]);
        expect(queue.filter(e => (e.meta.readingQueue as ReadingQueue).readNext)).toHaveLength(1);
    });

    it('changes nothing when the queue is already clean', () => {
        expect(normaliseQueue([createItem('a', q(0)), createItem('b', q(1))])).toEqual([]);
    });

    it('removes finished and dropped titles and closes the gap', () => {
        const all = [createItem('a', q(0), 'Finished'), createItem('b', q(1)), createItem('c', q(2), 'Dropped'), createItem('d', q(3))];
        const fixed = apply(all, normaliseQueue(all));

        expect(order(fixed)).toEqual(['b', 'd']);
        expect(getQueue(fixed)[0].meta.readingQueue).toMatchObject({ readNext: true, queueIndex: 0 });
    });
});

describe('addToQueue', () => {
    const base = [createItem('a', q(0)), createItem('b', q(1)), createItem('c'), createItem('d')];

    it('adds to the bottom', () => {
        expect(order(apply(base, addToQueue(base, ['c', 'd'], 5, 'bottom')))).toEqual(['a', 'b', 'c', 'd']);
    });

    it('adds to the top and hands readNext over', () => {
        const next = apply(base, addToQueue(base, ['c'], 5, 'top'));
        expect(order(next)).toEqual(['c', 'a', 'b']);
        expect(next.find(e => e.id === 'a')?.meta.readingQueue).toMatchObject({ readNext: false, queueIndex: 1 });
    });

    it('clamps the priority', () => {
        const next = apply(base, addToQueue(base, ['c'], 99, 'bottom'));
        expect(next.find(e => e.id === 'c')?.meta.readingQueue).toMatchObject({ priority: 10 });
    });

    it('skips queued, finished and unknown entries', () => {
        const all = [...base, createItem('e', false, 'Finished')];
        expect(addToQueue(all, ['a', 'e', 'zzz'], 5, 'bottom')).toEqual([]);
    });

    it('queues entries that are being read as well as planned ones', () => {
        const all = [createItem('p', false, 'Planned'), createItem('r', false, 'Viewing')];
        expect(order(apply(all, addToQueue(all, ['p', 'r'], 5, 'bottom')))).toEqual(['p', 'r']);
    });
});

describe('removeFromQueue', () => {
    it('un-queues the entry and closes the gap', () => {
        const all = [createItem('a', q(0)), createItem('b', q(1)), createItem('c', q(2))];
        const next = apply(all, removeFromQueue(all, 'a'));

        expect(next.find(e => e.id === 'a')?.meta.readingQueue).toBe(false);
        expect(order(next)).toEqual(['b', 'c']);
        expect(getQueue(next)[0].meta.readingQueue).toMatchObject({ readNext: true, queueIndex: 0 });
    });

    it('ignores an entry that is not queued', () => {
        expect(removeFromQueue([createItem('a')], 'a')).toEqual([]);
    });
});

describe('moveInQueue', () => {
    const all = [createItem('a', q(0)), createItem('b', q(1)), createItem('c', q(2))];

    it('moves an entry down and up', () => {
        expect(order(apply(all, moveInQueue(all, 'a', 2)))).toEqual(['b', 'c', 'a']);
        expect(order(apply(all, moveInQueue(all, 'c', 0)))).toEqual(['c', 'a', 'b']);
    });

    it('clamps an out-of-range target', () => {
        expect(order(apply(all, moveInQueue(all, 'a', 99)))).toEqual(['b', 'c', 'a']);
    });

    it('only returns the entries that changed', () => {
        expect(moveInQueue(all, 'c', 1).map(e => e.id).sort()).toEqual(['b', 'c']);
    });

    it('returns nothing for an entry outside the queue', () => {
        expect(moveInQueue(all, 'nope', 0)).toEqual([]);
    });
});

describe('priority', () => {
    it('maps bands like the MAL export', () => {
        expect([1, 3, 4, 6, 7, 10].map(getPriorityBand)).toEqual(['Low', 'Low', 'Medium', 'Medium', 'High', 'High']);
    });

    it('sets and clamps a priority', () => {
        const all = [createItem('a', q(0, 5))];
        expect(setQueuePriority(all, 'a', 0)[0].meta.readingQueue).toMatchObject({ priority: 1 });
        expect(setQueuePriority(all, 'a', 5)).toEqual([]);
    });

    it('sorts by priority once, keeping the old order inside a priority', () => {
        const all = [createItem('a', q(0, 3)), createItem('b', q(1, 9)), createItem('c', q(2, 3)), createItem('d', q(3, 9))];
        expect(order(apply(all, sortQueueByPriority(all)))).toEqual(['b', 'd', 'a', 'c']);
    });
});

describe('isQueueable', () => {
    it('rejects finished and dropped only', () => {
        expect(['Planned', 'Viewing', 'On-hold'].map(s => isQueueable(createItem('x', false, s)))).toEqual([true, true, true]);
        expect(['Finished', 'Dropped'].map(s => isQueueable(createItem('x', false, s)))).toEqual([false, false]);
    });
});

describe('pickForMe', () => {
    const queue = [createItem('low', q(0, 1)), createItem('high', q(1, 9))];

    it('returns null for an empty queue', () => {
        expect(pickForMe([])).toBeNull();
    });

    it('weights by priority', () => {
        expect(pickForMe(queue, () => 0)?.id).toBe('low');
        expect(pickForMe(queue, () => 0.2)?.id).toBe('high'); // 0.2 * 10 = 2, past the weight-1 entry
        expect(pickForMe(queue, () => 0.999)?.id).toBe('high');
    });
});
