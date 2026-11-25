import { describe, expect, it } from 'vitest';
import { HermidataModel } from '../scripts/shared/utils/HermidataSelector';
import type { Hermidata, ReadingQueue } from '../scripts/shared/types';
import { describeRow, pinAt, rankReadingList, setAutoPriority, settlePins, unpin } from '../scripts/reading-list/rank';

const NOW = new Date('2026-11-25T15:00:00').getTime(); // a Wednesday afternoon
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

type Options = {
    read?: number;
    latest?: number;
    releasedAt?: number;
    readAt?: number;
    status?: string;
    priority?: number;
    queue?: ReadingQueue | false;
    seen?: boolean;
};

/** A title with a feed whose newest chapter is `latest`, released `releasedAt`, and `read` chapters read at `readAt` */
function createItem(id: string, options: Options = {}): Hermidata {
    const { read = 10, latest = 12, releasedAt = NOW - HOUR, readAt = NOW - 30 * DAY, status = 'Viewing', priority, queue = false } = options;
    const model = HermidataModel.from('Manhwa', status, 'Ongoing');
    const hermidata = model.toJSON();
    hermidata.id = id;
    hermidata.title = `Title ${id}`;

    const bookmark = hermidata.chapter.bookmarks[hermidata.chapter.bookmarkInUse];
    bookmark.current = read;
    bookmark.history = [{ chapter: read, at: new Date(readAt).toISOString() }];
    bookmark.updatedAt = new Date(readAt).toISOString();

    hermidata.rss = [{
        id: `feed-${id}`, title: id, url: 'https://example.com/feed', image: null, domain: 'example.com', lastFetched: null,
        latestItem: { id: `item-${id}`, rawTitle: `Chapter ${latest}`, title: id, link: `https://example.com/${id}/${latest}`, chapter: latest, pubDate: new Date(releasedAt), guid: `${id}-${latest}` },
        ...(options.seen ? { seen: { chapter: latest, link: `https://example.com/${id}/${latest}`, pubDate: new Date(releasedAt).toISOString() } } : {}),
    }];
    if (priority !== undefined && !queue) hermidata.meta.readingQueue = { readNext: false, priority, queueIndex: 0, autoOnly: true };
    else hermidata.meta.readingQueue = queue;
    return hermidata;
}

const ids = (all: Hermidata[]) => rankReadingList(all, NOW).map(row => row.entry.id);
const groups = (all: Hermidata[]) => Object.fromEntries(rankReadingList(all, NOW).map(row => [row.entry.id, row.group]));
/** Pin the title with this id at a position, the way the page does */
const pin = (all: Hermidata[], id: string, index: number) => apply(all, pinAt(rankReadingList(all, NOW), all.find(entry => entry.id === id) as Hermidata, index));
const apply = (all: Hermidata[], changed: Hermidata[]) => all.map(entry => changed.find(candidate => candidate.id === entry.id) ?? entry);

describe('rankReadingList membership', () => {
    it('lists Viewing titles with an unread chapter', () => {
        expect(ids([createItem('a')])).toEqual(['a']);
    });

    it('leaves out titles that are caught up, dismissed, Finished or Dropped', () => {
        const all = [
            createItem('caught-up', { read: 12, latest: 12 }),
            createItem('dismissed', { seen: true }),
            createItem('finished', { status: 'Finished' }),
            createItem('dropped', { status: 'Dropped' }),
        ];
        expect(ids(all)).toEqual([]);
    });

    it('leaves out titles that are Planned or have no feed', () => {
        const noFeed = createItem('no-feed');
        noFeed.rss = [];
        expect(ids([createItem('planned', { status: 'Planned' }), noFeed])).toEqual([]);
    });

    it('ignores the manual queue', () => {
        const queued = createItem('queued', { read: 12, latest: 12, queue: { readNext: true, priority: 9, queueIndex: 0 } });
        expect(ids([queued])).toEqual([]);
    });

    it('a title returns with the next release', () => {
        const read = createItem('a', { read: 12, latest: 12 });
        expect(ids([read])).toEqual([]);
        expect(ids([createItem('a', { read: 12, latest: 13 })])).toEqual(['a']);
    });
});

describe('rankReadingList order', () => {
    it('puts releases of today first, newest first', () => {
        const all = [
            createItem('morning', { releasedAt: NOW - 5 * HOUR }),
            createItem('latest', { releasedAt: NOW - HOUR }),
        ];
        expect(ids(all)).toEqual(['latest', 'morning']);
        expect(Object.values(groups(all))).toEqual(['new-today', 'new-today']);
    });

    it('lets priority reorder titles inside a group, newest first among equal priorities', () => {
        const all = [
            createItem('newest', { releasedAt: NOW - HOUR }),
            createItem('older', { releasedAt: NOW - 5 * HOUR }),
            createItem('important', { releasedAt: NOW - 9 * HOUR, priority: 8 }),
        ];
        expect(ids(all)).toEqual(['important', 'newest', 'older']);

        const raised = apply(all, setAutoPriority(all[1], 9));
        expect(ids(raised)).toEqual(['older', 'important', 'newest']);
    });

    it('puts earlier releases after today, newest first', () => {
        const all = [
            createItem('older', { releasedAt: NOW - 3 * DAY }),
            createItem('today', { releasedAt: NOW - HOUR }),
            createItem('yesterday', { releasedAt: NOW - DAY }),
        ];
        expect(ids(all)).toEqual(['today', 'yesterday', 'older']);
        expect(groups(all)).toEqual({ today: 'new-today', yesterday: 'earlier', older: 'earlier' });
    });

    it('treats a chapter released before my last read as backlog, not new', () => {
        const all = [createItem('behind', { read: 2, latest: 40, releasedAt: NOW - 5 * DAY, readAt: NOW - DAY })];
        expect(groups(all)).toEqual({ behind: 'backlog' });
    });

    it('lifts high-priority backlog above earlier releases but never above today', () => {
        const all = [
            createItem('earlier', { releasedAt: NOW - 2 * DAY }),
            createItem('high-backlog', { read: 2, latest: 40, releasedAt: NOW - 5 * DAY, readAt: NOW - DAY, priority: 8 }),
            createItem('today', { releasedAt: NOW - HOUR }),
            createItem('low-backlog', { read: 2, latest: 40, releasedAt: NOW - 5 * DAY, readAt: NOW - DAY, priority: 3 }),
        ];
        expect(ids(all)).toEqual(['today', 'high-backlog', 'earlier', 'low-backlog']);
    });

    it('orders backlog by priority, then by fewest chapters left', () => {
        const base = { releasedAt: NOW - 5 * DAY, readAt: NOW - DAY };
        const all = [
            createItem('far', { ...base, read: 1, latest: 100, priority: 5 }),
            createItem('near', { ...base, read: 90, latest: 100, priority: 5 }),
            createItem('important', { ...base, read: 1, latest: 100, priority: 6 }),
        ];
        expect(ids(all)).toEqual(['important', 'near', 'far']);
    });
});

describe('pins', () => {
    const auto = () => [
        createItem('a', { releasedAt: NOW - 1 * HOUR }),
        createItem('b', { releasedAt: NOW - 2 * HOUR }),
        createItem('c', { releasedAt: NOW - 3 * HOUR }),
        createItem('d', { releasedAt: NOW - 4 * HOUR }),
    ];

    it('places a pinned title at the position asked for', () => {
        const all = auto();
        const pinned = pin(all, 'd', 1);
        expect(ids(pinned)).toEqual(['a', 'd', 'b', 'c']);
        expect(groups(pinned).d).toBe('pinned');
    });

    it('moves up when the title above it is read (the example in the design)', () => {
        const all = auto();
        const pinned = pin(all, 'd', 1);

        const readA = pinned.map(entry => entry.id === 'a' ? createItem('a', { read: 12, latest: 12 }) : entry);
        expect(ids(readA)).toEqual(['d', 'b', 'c']);
    });

    it('keeps its position when a new release arrives', () => {
        const all = auto();
        const pinned = pin(all, 'd', 0);
        const withNew = [...pinned, createItem('fresh', { releasedAt: NOW - 10 * 60 * 1000 })];
        expect(ids(withNew)).toEqual(['d', 'fresh', 'a', 'b', 'c']);
    });

    it('pins a title that is not in the list otherwise', () => {
        const all = [...auto(), createItem('planned', { status: 'Planned', read: 0, latest: 0 })];
        const pinned = pin(all, 'planned', 0);
        expect(ids(pinned)[0]).toBe('planned');
    });

    it('is spent once the title is read', () => {
        const all = auto();
        const pinned = pin(all, 'd', 0);
        const read = pinned.map(entry => entry.id === 'd' ? createItem('d', { read: 13, latest: 13, queue: entry.meta.readingQueue }) : entry);
        expect(ids(read)).toEqual(['a', 'b', 'c']);
        expect(settlePins(read).map(entry => entry.id)).toEqual(['d']);
    });

    it('is removed when the title is finished', () => {
        const all = auto();
        const pinned = pin(all, 'd', 0);
        const finished = pinned.map(entry => entry.id === 'd' ? createItem('d', { status: 'Finished', queue: entry.meta.readingQueue }) : entry);
        expect(ids(finished)).toEqual(['a', 'b', 'c']);
    });

    it('keeps several pins in the order they were placed', () => {
        let all = auto();
        all = pin(all, 'c', 0);
        all = pin(all, 'd', 1);
        expect(ids(all)).toEqual(['c', 'd', 'a', 'b']);
    });

    it('rewrites other pins when one is moved past them', () => {
        let all = auto();
        all = pin(all, 'c', 0);
        all = pin(all, 'd', 1);
        all = pin(all, 'c', 3);
        expect(ids(all)).toEqual(['d', 'a', 'b', 'c']);
    });

    it('unpinning returns the title to its automatic place and leaves the manual queue alone', () => {
        const all = auto();
        const pinned = pin(all, 'd', 0);
        const pinnedEntry = pinned.find(entry => entry.id === 'd') as Hermidata;
        expect((pinnedEntry.meta.readingQueue as ReadingQueue).autoOnly).toBe(true);

        const unpinned = apply(pinned, unpin(pinnedEntry));
        expect(ids(unpinned)).toEqual(['a', 'b', 'c', 'd']);
        expect((unpinned.find(entry => entry.id === 'd') as Hermidata).meta.readingQueue).toBe(false);
    });

    it('keeps the manual queue data of a title that was queued by hand', () => {
        const queued = createItem('d', { releasedAt: NOW - 4 * HOUR, queue: { readNext: false, priority: 8, queueIndex: 3 } });
        const all = [...auto().slice(0, 3), queued];
        const pinned = pin(all, 'd', 0);
        const back = apply(pinned, unpin(pinned.find(entry => entry.id === 'd') as Hermidata));
        expect((back.find(entry => entry.id === 'd') as Hermidata).meta.readingQueue).toMatchObject({ priority: 8 });
        expect(((back.find(entry => entry.id === 'd') as Hermidata).meta.readingQueue as ReadingQueue).autoOnly).toBeUndefined();
    });
});

describe('setAutoPriority', () => {
    it('stores the priority for the automatic list only', () => {
        const [changed] = setAutoPriority(createItem('a'), 9);
        expect(changed.meta.readingQueue).toMatchObject({ priority: 9, autoOnly: true });
    });

    it('changes nothing when the priority is the same', () => {
        expect(setAutoPriority(createItem('a', { priority: 6 }), 6)).toEqual([]);
    });
});

describe('describeRow', () => {
    const reasons = (all: Hermidata[]) => Object.fromEntries(rankReadingList(all, NOW).map(row => [row.entry.id, describeRow(row, NOW)]));

    it('says why each title is where it is', () => {
        const all = [
            createItem('today', { releasedAt: NOW - HOUR }),
            createItem('yesterday', { releasedAt: NOW - DAY }),
            createItem('older', { releasedAt: NOW - 3 * DAY }),
            createItem('behind', { read: 2, latest: 40, releasedAt: NOW - 5 * DAY, readAt: NOW - DAY }),
        ];
        expect(reasons(all)).toEqual({ today: 'New today', yesterday: 'Yesterday', older: '3 days ago', behind: '38 behind' });
    });

    it('labels a pinned title as pinned', () => {
        const all = [createItem('a'), createItem('b')];
        expect(reasons(pin(all, 'b', 0)).b).toBe('Pinned');
    });
});
