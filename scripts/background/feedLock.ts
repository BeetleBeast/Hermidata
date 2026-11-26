/*
The feed check and the MangaUpdates linking both read items, change them and write them back.
Run at the same moment, one could write over the other's change, so they take turns.
*/

let tail: Promise<unknown> = Promise.resolve();

/** Runs the task after every task started before it; a failing task does not stop the ones behind it */
export function withFeedLock<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task, task);
    tail = run.catch(() => {});
    return run;
}
