import type { Hermidata, RankedRow, ReadingGroup, ReadingPin, ReadingQueue } from "../shared/types";
import { getUnread, readChapterOf } from "../shared/utils/Unread";
import { QUEUE_PRIORITY_DEFAULT, clampPriority, getActiveStatus, getPriorityBand, isQueueable, priorityOf, withQueue } from "./queue";

/*
The automatic reading list: "what to read today", computed from releases. Nothing about an automatic title is stored.

- in the list: Viewing titles with a chapter I have not read ( getUnread ), and pinned titles
- out of the list: caught up, dismissed, Finished or Dropped; it returns with the next release
- order: new today, high-priority backlog, earlier releases, other backlog; pins sit where the user put them
*/

/** Heading of each group of automatic titles; pinned rows belong to no group of their own */
export const GROUP_LABEL: Record<Exclude<ReadingGroup, 'pinned'>, string> = {
    'new-today': 'New today',
    'priority-backlog': 'High-priority backlog',
    'earlier': 'Earlier releases',
    'backlog': 'Backlog',
};

/** Order of the groups, top first. Pinned rows are placed afterwards, by position. */
const GROUP_ORDER: readonly ReadingGroup[] = ['new-today', 'priority-backlog', 'earlier', 'backlog'];

function timeOf(value: Date | string | undefined): number {
    if (value === undefined) return 0;
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? 0 : time;
}

/** When the marker in use last had progress saved, epoch ms */
function lastReadAt(entry: Hermidata): number {
    const bookmark = entry.chapter.bookmarks[entry.chapter.bookmarkInUse];
    if (!bookmark) return 0;
    return timeOf(bookmark.history?.at(-1)?.at) || timeOf(bookmark.updatedAt);
}

function isSameDay(a: number, b: number): boolean {
    return new Date(a).toDateString() === new Date(b).toDateString();
}

/** The pin of an entry, unless it is spent: the title was read past the chapter it was pinned at, or is finished */
function activePin(entry: Hermidata): ReadingPin | null {
    const pin = entry.meta.readingQueue ? entry.meta.readingQueue.pin : undefined;
    if (!pin || !isQueueable(entry)) return null;
    return (readChapterOf(entry) ?? -1) <= pin.from ? pin : null;
}

function describe(entry: Hermidata, now: number): Omit<RankedRow, 'position' | 'group'> & { group: Exclude<ReadingGroup, 'pinned'> | null } {
    const unread = getUnread(entry);
    if (!unread || getActiveStatus(entry) !== 'Viewing') return { entry, group: null, releasedAt: null, behind: null };

    const releasedAt = unread.pubDate.getTime();
    const isNew = releasedAt > lastReadAt(entry);
    const group = isNew
        ? (isSameDay(releasedAt, now) ? 'new-today' : 'earlier')
        : (getPriorityBand(priorityOf(entry)) === 'High' ? 'priority-backlog' : 'backlog');
    return { entry, group, releasedAt, behind: unread.newCount };
}

function byRelease(a: RankedRow, b: RankedRow): number {
    return priorityOf(b.entry) - priorityOf(a.entry) || (b.releasedAt ?? 0) - (a.releasedAt ?? 0) || a.entry.title.localeCompare(b.entry.title);
}

function byBacklog(a: RankedRow, b: RankedRow): number {
    return priorityOf(b.entry) - priorityOf(a.entry) || (a.behind ?? Infinity) - (b.behind ?? Infinity) || a.entry.title.localeCompare(b.entry.title);
}

/** Position a pin asks for: how many of the titles that were above it are still in the list */
function pinSlot(pin: ReadingPin, present: ReadonlySet<string>): number {
    return pin.ahead.filter(id => present.has(id)).length;
}

/** Every title of the automatic list in reading order, with the reason it is there */
export function rankReadingList(all: readonly Hermidata[], now: number = Date.now()): RankedRow[] {
    const pinned: Hermidata[] = [];
    const auto: RankedRow[] = [];

    for (const entry of all) {
        if (activePin(entry)) { pinned.push(entry); continue; }
        const described = describe(entry, now);
        if (described.group) auto.push({ ...described, group: described.group, position: 0 });
    }

    const rows = GROUP_ORDER.flatMap(group => auto
        .filter(row => row.group === group)
        .sort(group === 'new-today' || group === 'earlier' ? byRelease : byBacklog));

    const present = new Set([...rows.map(row => row.entry.id), ...pinned.map(entry => entry.id)]);
    const pins = pinned
        .map(entry => ({ entry, queue: entry.meta.readingQueue as ReadingQueue }))
        .map(({ entry, queue }) => ({ entry, queue, slot: pinSlot(queue.pin as ReadingPin, present) }))
        .sort((a, b) => a.slot - b.slot || a.queue.queueIndex - b.queue.queueIndex || a.entry.title.localeCompare(b.entry.title));

    for (const { entry, slot } of pins) {
        const unread = getUnread(entry);
        rows.splice(Math.min(slot, rows.length), 0, {
            entry,
            group: 'pinned',
            position: 0,
            releasedAt: unread ? unread.pubDate.getTime() : null,
            behind: unread ? unread.newCount : null,
        });
    }
    return rows.map((row, position) => ({ ...row, position }));
}

/** Ids above each pin, from the order the list will have */
function pinsFor(order: readonly string[], pinnedIds: ReadonlySet<string>): Map<string, string[]> {
    const ahead = new Map<string, string[]>();
    order.forEach((id, index) => { if (pinnedIds.has(id)) ahead.set(id, order.slice(0, index)); });
    return ahead;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * Pin a title ( in the list or not ) at a 0-based position of the list, or move a pin there.
 * Every pin is rewritten from the new order, so a pin that was passed does not count a title that is now behind it.
 * Returns only the entries that changed.
 */
export function pinAt(rows: readonly RankedRow[], moved: Hermidata, toIndex: number): Hermidata[] {
    const id = moved.id;
    const order = rows.filter(row => row.entry.id !== id).map(row => row.entry.id);
    order.splice(Math.min(Math.max(toIndex, 0), order.length), 0, id);

    const pinnedIds = new Set([id, ...rows.filter(row => row.group === 'pinned').map(row => row.entry.id)]);
    const ahead = pinsFor(order, pinnedIds);

    const changed: Hermidata[] = [];
    const affected = [moved, ...rows.map(row => row.entry).filter(entry => entry.id !== id && pinnedIds.has(entry.id))];
    for (const entry of affected) {
        const nextAhead = ahead.get(entry.id) as string[];
        const current = entry.meta.readingQueue;
        const pin = current ? current.pin : undefined;
        if (entry.id !== id && pin && sameIds(pin.ahead, nextAhead)) continue;

        const base: ReadingQueue = current || { readNext: false, priority: QUEUE_PRIORITY_DEFAULT, queueIndex: 0, autoOnly: true };
        changed.push(withQueue(entry, { ...base, queueIndex: order.indexOf(entry.id), pin: { ahead: nextAhead, from: pin && entry.id !== id ? pin.from : readChapterOf(entry) ?? -1 } }));
    }
    return changed;
}

/** Remove a pin. An entry that only existed for the automatic list is cleared when nothing else is left on it. */
export function unpin(entry: Hermidata): Hermidata[] {
    const current = entry.meta.readingQueue;
    if (!current || !current.pin) return [];

    const { pin: _pin, ...rest } = current;
    const holdsNothing = rest.autoOnly && rest.priority === QUEUE_PRIORITY_DEFAULT;
    return [withQueue(entry, holdsNothing ? false : rest)];
}

/** Change the priority of an automatic title; it never makes the title part of the manual queue */
export function setAutoPriority(entry: Hermidata, priority: number): Hermidata[] {
    const next = clampPriority(priority);
    const current = entry.meta.readingQueue;
    if (current && current.priority === next) return [];
    return [withQueue(entry, current ? { ...current, priority: next } : { readNext: false, priority: next, queueIndex: 0, autoOnly: true })];
}

/** Clean up pins that are spent: the title was read past its pin, or is Finished or Dropped */
export function settlePins(all: readonly Hermidata[]): Hermidata[] {
    return all
        .filter(entry => entry.meta.readingQueue && entry.meta.readingQueue.pin && !activePin(entry))
        .flatMap(unpin);
}

/** The short reason a title is where it is: "New today", "2 days ago", "14 behind", "Pinned" */
export function describeRow(row: RankedRow, now: number = Date.now()): string {
    if (row.group === 'pinned') return 'Pinned';
    if (row.group === 'new-today') return 'New today';
    if (row.group === 'earlier' && row.releasedAt !== null) {
        const days = Math.max(1, Math.round((startOfDay(now) - startOfDay(row.releasedAt)) / DAY_MS));
        return days === 1 ? 'Yesterday' : `${days} days ago`;
    }
    return row.behind ? `${row.behind} behind` : 'Backlog';
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(time: number): number {
    const date = new Date(time);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
