import type { FeedFetchResult, FeedHttpMeta } from "../shared/types/index";
import { retryAfterMs } from "../shared/utils/RetryAfter";

/*
Fetching a feed, shared by the feed check ( feeds.ts ) and feed discovery ( rssCache.ts ).
Runs in the background, which is a service worker in Chrome: no DOMParser here.
*/

async function fetchWithRetry(url: string, headers: HeadersInit = {}, retries = 3, waitOnRateLimit = true): Promise<Response | null> {
    for (let i = 0; i < retries; i++) {
        const res = await fetch(url, { headers });
        if (res.status === 429 && waitOnRateLimit) {
            const wait = parseInt(res.headers.get("Retry-After") ?? "60") * 1000;
            console.warn(`[Hermidata] 429 on ${url}, waiting ${wait}ms`);
            await new Promise(r => setTimeout(r, wait));
            continue;
        }
        return res;
    }
    return null;
}

export function looksLikeHtml(text: string): boolean {
    return /^\s*(<!doctype\s+html|<html[\s>])/i.test(text);
}

/**
 * GETs a feed; with saved validators an unchanged feed answers 304 and comes back as 'unchanged'.
 * A 429 is waited out and tried again, unless `waitOnRateLimit` is false: then it comes back as 'failed' with what it asked for.
 */
export async function fetchFeedText(url: string, savedMeta: FeedHttpMeta = { etag: null, lastModified: null }, options: { waitOnRateLimit?: boolean } = {}): Promise<FeedFetchResult> {
    const headers: Record<string, string> = {};
    if (savedMeta.etag) headers["If-None-Match"] = savedMeta.etag;
    else if (savedMeta.lastModified) headers["If-Modified-Since"] = savedMeta.lastModified;

    const response = await fetchWithRetry(url, headers, 3, options.waitOnRateLimit ?? true);
    if (!response) return { status: 'failed' };
    if (response.status === 304) return { status: 'unchanged' };
    if (!response.ok) {
        console.warn(`[Hermidata] Feed GET failed: ${url} (${response.status})`);
        return { status: 'failed', httpStatus: response.status, retryAfterMs: retryAfterMs(response.headers.get('retry-after')) };
    }
    return {
        status: 'ok',
        text: await response.text(),
        meta: {
            etag: response.headers.get("etag"),
            lastModified: response.headers.get("last-modified"),
        },
    };
}
