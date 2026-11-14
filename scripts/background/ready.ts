let resolve!: () => void;
let reject!: (e: unknown) => void;

export const ready = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
export const markReady = () => resolve();
export const markFailed = (e: unknown) => reject(e);

/** Wrap a listener so it waits for startup to finish before running. */
export function whenReady<A extends unknown[], R>(fn: (...args: A) => R | Promise<R>) {
    return async (...args: A): Promise<R> => {
        await ready;
        return fn(...args);
    };
}