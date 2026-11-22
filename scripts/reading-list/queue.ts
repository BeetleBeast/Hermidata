import type { Hermidata, QueuePosition, ReadingQueue, ReadingQueuePriorityBand } from "../shared/types";
import { HermidataModel } from "../shared/utils/HermidataSelector";

export const QUEUE_PRIORITY_MIN = 1;
export const QUEUE_PRIORITY_MAX = 10;
export const QUEUE_PRIORITY_DEFAULT = 5;

/** Statuses that mean "done with it": such an entry leaves the queue */
const FINISHED_STATUSES: readonly string[] = ['Finished', 'Dropped'];

/** Status of the bookmark in use, or undefined when the entry has no usable bookmark */
export function getActiveStatus(entry: Hermidata): string | undefined {
    return entry.chapter.bookmarks[entry.chapter.bookmarkInUse]?.readStatus;
}

export function isQueued(entry: Hermidata): boolean {
    return entry.meta.readingQueue !== false;
}

/** Finished and dropped titles cannot be queued */
export function isQueueable(entry: Hermidata): boolean {
    const status = getActiveStatus(entry);
    return status === undefined || !FINISHED_STATUSES.includes(status);
}

export function clampPriority(priority: number): number {
    if (!Number.isFinite(priority)) return QUEUE_PRIORITY_DEFAULT;
    return Math.min(QUEUE_PRIORITY_MAX, Math.max(QUEUE_PRIORITY_MIN, Math.round(priority)));
}

/** High 7-10, Medium 4-6, Low 1-3 (same split the MAL export uses) */
export function getPriorityBand(priority: number): ReadingQueuePriorityBand {
    if (priority >= 7) return 'High';
    if (priority >= 4) return 'Medium';
    return 'Low';
}

function queueOf(entry: Hermidata): ReadingQueue {
    return entry.meta.readingQueue as ReadingQueue;
}

/**
 * Queued entries in reading order.
 * Ties on the index (imports all start at 0) fall back to priority, then date added.
 */
export function getQueue(all: readonly Hermidata[]): Hermidata[] {
    return all
        .filter(isQueued)
        .sort((a, b) =>
            queueOf(a).queueIndex - queueOf(b).queueIndex ||
            queueOf(b).priority - queueOf(a).priority ||
            a.meta.added.localeCompare(b.meta.added) ||
            a.title.localeCompare(b.title)
        );
}

/** A copy of the entry with new queue data; the original stays untouched so it can be restored by undo */
function withQueue(entry: Hermidata, queue: ReadingQueue | false): Hermidata {
    const model = new HermidataModel(structuredClone(entry));
    model.SetReadingQueue(queue);
    return model.toJSON();
}

/**
 * Give an ordered list contiguous indexes and a single `readNext`.
 * Returns only the entries whose queue data changed.
 */
function reindex(ordered: readonly Hermidata[]): Hermidata[] {
    const changed: Hermidata[] = [];
    ordered.forEach((entry, index) => {
        const current = entry.meta.readingQueue;
        const priority = current ? current.priority : QUEUE_PRIORITY_DEFAULT;
        const next: ReadingQueue = { readNext: index === 0, priority, queueIndex: index };
        const same = current && current.readNext === next.readNext && current.queueIndex === next.queueIndex && current.priority === next.priority;
        if (!same) changed.push(withQueue(entry, next));
    });
    return changed;
}

/**
 * Repair the queue: drop finished titles, make indexes contiguous, keep one `readNext`.
 * Returns only the changed entries (empty when the queue is already clean).
 */
export function normaliseQueue(all: readonly Hermidata[]): Hermidata[] {
    const dropped = getQueue(all).filter(entry => !isQueueable(entry)).map(entry => withQueue(entry, false));
    const keep = getQueue(all).filter(isQueueable);
    return [...dropped, ...reindex(keep)];
}

/** Queue the given ids at the top or bottom with one priority. Unknown, queued or finished ids are skipped. */
export function addToQueue(all: readonly Hermidata[], ids: readonly string[], priority: number, position: QueuePosition): Hermidata[] {
    const wanted = new Set(ids);
    const added = all.filter(entry => wanted.has(entry.id) && !isQueued(entry) && isQueueable(entry))
        .map(entry => withQueue(entry, { readNext: false, priority: clampPriority(priority), queueIndex: 0 }));
    if (added.length === 0) return [];

    const queue = getQueue(all);
    return reindex(position === 'top' ? [...added, ...queue] : [...queue, ...added]);
}

export function removeFromQueue(all: readonly Hermidata[], id: string): Hermidata[] {
    const queue = getQueue(all);
    const removed = queue.find(entry => entry.id === id);
    if (!removed) return [];
    return [withQueue(removed, false), ...reindex(queue.filter(entry => entry.id !== id))];
}

/** Move an entry to a 0-based position in the queue */
export function moveInQueue(all: readonly Hermidata[], id: string, toIndex: number): Hermidata[] {
    const queue = getQueue(all);
    const from = queue.findIndex(entry => entry.id === id);
    if (from === -1) return [];

    const [moved] = queue.splice(from, 1);
    queue.splice(Math.min(Math.max(toIndex, 0), queue.length), 0, moved);
    return reindex(queue);
}

export function setQueuePriority(all: readonly Hermidata[], id: string, priority: number): Hermidata[] {
    const entry = all.find(candidate => candidate.id === id);
    if (!entry || !isQueued(entry)) return [];

    const current = queueOf(entry);
    const next = clampPriority(priority);
    if (current.priority === next) return [];
    return [withQueue(entry, { ...current, priority: next })];
}

/** One-off reorder: highest priority first, current order kept inside a priority */
export function sortQueueByPriority(all: readonly Hermidata[]): Hermidata[] {
    const queue = getQueue(all);
    const sorted = queue.map((entry, index) => ({ entry, index }))
        .sort((a, b) => queueOf(b.entry).priority - queueOf(a.entry).priority || a.index - b.index)
        .map(item => item.entry);
    return reindex(sorted);
}

/**
 * Random title from the queue, weighted by priority (a 10 is ten times as likely as a 1).
 * `random` is injectable so tests stay deterministic.
 */
export function pickForMe(queue: readonly Hermidata[], random: () => number = Math.random): Hermidata | null {
    if (queue.length === 0) return null;

    const weights = queue.map(entry => queueOf(entry).priority);
    let roll = random() * weights.reduce((sum, weight) => sum + weight, 0);
    for (let i = 0; i < queue.length; i++) {
        roll -= weights[i];
        if (roll < 0) return queue[i];
    }
    return queue[queue.length - 1];
}
