import { cullRawFeeds } from "../rss/load";
import type { Hermidata } from "../shared/types";
import { ConsoleMessage } from "../shared/utils/ErrorMessage";

const CULL_DELAY_MS = 5_000;               // let the UI settle first
const CULL_COOLDOWN_MS = 60 * 60 * 1000;   // at most once per hour
const IDLE_TIMEOUT_MS = 10_000;            // run even if never idle after this
const BUSY_RETRY_MS = 30_000;              // retry delay if a sync is running
const MAX_BUSY_RETRIES = 5;

let isCulling = false;
let lastCullTime = 0;
let delayTimer: ReturnType<typeof setTimeout> | undefined;
let idleHandle: number | undefined;

/** Run a callback when the main thread is idle, with a fallback for Safari etc. */
function runWhenIdle(callback: () => void) {
    if (typeof requestIdleCallback === "function") {
        idleHandle = requestIdleCallback(
            () => {
                idleHandle = undefined;
                callback();
            },
            { timeout: IDLE_TIMEOUT_MS }
        );
    } else {
        delayTimer = setTimeout(() => {
            delayTimer = undefined;
            callback();
        }, 0);
    }
}

/** Cancel any cull that is scheduled but has not started yet. */
function cancelScheduledCull() {
    if (delayTimer !== undefined) {
        clearTimeout(delayTimer);
        delayTimer = undefined;
    }
    if (idleHandle !== undefined && typeof cancelIdleCallback === "function") {
        cancelIdleCallback(idleHandle);
        idleHandle = undefined;
    }
}

/**
 * Schedule a background cull of raw feeds. Safe to call as often as you like
 * (e.g. after every sync): repeated calls are debounced and rate limited.
 *
 * @param getAllHermidata  returns the *current* Hermidata at run time
 * @param isBusy           return true while a sync/fetch is running
 */
export function scheduleCull(getAllHermidata: () => Record<string, Hermidata>, isBusy: () => boolean = () => false) {
    schedule(getAllHermidata, isBusy, CULL_DELAY_MS, 0);
}

function schedule(getAllHermidata: () => Record<string, Hermidata>, isBusy: () => boolean, delayMs: number, busyRetries: number) {
    // guards that apply at scheduling time
    if (isCulling) return;
    if (Date.now() - lastCullTime < CULL_COOLDOWN_MS) return;

    // debounce: replace any pending schedule
    cancelScheduledCull();

    delayTimer = setTimeout(() => {
        delayTimer = undefined;

        runWhenIdle(async () => {
            // re-check guards, things may have changed while waiting
            if (isCulling) return;
            if (Date.now() - lastCullTime < CULL_COOLDOWN_MS) return;

            // a sync is running: back off and try again later
            if (isBusy()) {
                if (busyRetries < MAX_BUSY_RETRIES) schedule(getAllHermidata, isBusy, BUSY_RETRY_MS, busyRetries + 1);
                return;
            }

            isCulling = true;
            try {
                await cullRawFeeds(getAllHermidata());
            } catch (err) {
                // never let housekeeping errors reach the user
                new ConsoleMessage("cullRawFeeds failed", undefined, {
                    details: err instanceof Error ? [err.message] : [err]
                }).sendMessage();
            } finally {
                isCulling = false;
                // set even on failure so a broken cull can't retry in a loop
                lastCullTime = Date.now();
            }
        });
    }, delayMs);
}