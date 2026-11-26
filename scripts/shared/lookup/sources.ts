import type { ExternalSource } from "../types";
import type { LookupCandidate } from "./matching";
import { retryAfterMs } from "../utils/RetryAfter";

export type Fetcher = typeof fetch;

const ANILIST_URL = 'https://graphql.anilist.co';
const MANGAUPDATES_URL = 'https://api.mangaupdates.com/v1';
const TIMEOUT_MS = 10_000;
/**
 * The MangaUpdates search is slow for some titles: a run of "?" or "*" ( "??? Rank no Ura Soubi Musou" ) takes 13 to 15 seconds,
 * any other title about 1. It is given more time than the rest, but under the 30 seconds after which the browser
 * may stop the background worker.
 */
const MANGAUPDATES_SEARCH_TIMEOUT_MS = 25_000;

/** The server did not give a usable answer ( network, timeout, HTTP error, bad body ) */
export class LookupError extends Error {
    readonly status?: number;
    /** what a 429 asked for ( Retry-After ), in milliseconds */
    readonly retryAfterMs?: number;
    constructor(message: string, status?: number, retryAfterMs?: number) {
        super(message);
        this.name = 'LookupError';
        this.status = status;
        this.retryAfterMs = retryAfterMs;
    }
}

/** The server did not answer within TIMEOUT_MS: slow, not refusing */
export class LookupTimeoutError extends LookupError {
    constructor(timeoutMs: number) {
        super(`no answer within ${timeoutMs / 1000} seconds`);
        this.name = 'LookupTimeoutError';
    }
}

async function requestJson(fetcher: Fetcher, url: string, init: RequestInit = {}, timeoutMs: number = TIMEOUT_MS): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetcher(url, { ...init, signal: controller.signal });
        if (!response.ok) {
            // the start of the body says why ( a block page, a rate limit, an API error )
            const body = (await response.text().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 200);
            throw new LookupError(`HTTP ${response.status}${body ? `: ${body}` : ''}`, response.status, retryAfterMs(response.headers.get('retry-after')));
        }
        const text = await response.text();
        if (!text.trim()) throw new LookupError('Empty response');
        try { return JSON.parse(text); }
        catch { throw new LookupError('Response was not JSON'); }
    } catch (error) {
        if (error instanceof LookupError) throw error;
        // our own timer cancelled the request ( the browser words it "signal is aborted without reason" )
        if (controller.signal.aborted) throw new LookupTimeoutError(timeoutMs);
        throw new LookupError(error instanceof Error ? error.message : String(error));
    } finally {
        clearTimeout(timer);
    }
}

const postJson = (body: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
});

const unique = (titles: unknown[]): string[] => [...new Set(titles.filter((title): title is string => typeof title === 'string').map(title => title.trim()).filter(Boolean))];

// --- AniList ---

const ANILIST_TITLES = 'id format title { romaji english native } synonyms startDate { year }';

function aniListTitles(media: any): string[] {
    return unique([media.title?.romaji, media.title?.english, media.title?.native, ...(media.synonyms ?? [])]);
}

export async function searchAniList(query: string, fetcher: Fetcher = fetch): Promise<LookupCandidate[]> {
    const data = await requestJson(fetcher, ANILIST_URL, postJson({
        query: `query($s:String){Page(perPage:10){media(search:$s,type:MANGA){${ANILIST_TITLES}}}}`,
        variables: { s: query },
    }));
    const media: any[] = data?.data?.Page?.media ?? [];
    return media.map(entry => {
        const titles = aniListTitles(entry);
        return {
            source: 'anilist' as const,
            id: String(entry.id),
            kind: entry.format === 'NOVEL' ? 'novel' as const : 'comic' as const,
            title: entry.title?.english ?? entry.title?.romaji ?? titles[0] ?? '',
            titles,
            year: entry.startDate?.year ?? null,
        };
    });
}

// --- MangaUpdates ---

export async function searchMangaUpdates(query: string, fetcher: Fetcher = fetch): Promise<LookupCandidate[]> {
    if (!/[\p{L}\p{N}]/u.test(query)) return []; // a title of only symbols: nothing to look for, and a slow search for nothing
    const data = await requestJson(fetcher, `${MANGAUPDATES_URL}/series/search`, postJson({ search: query }), MANGAUPDATES_SEARCH_TIMEOUT_MS);
    const merged = new Map<string, LookupCandidate>();
    for (const result of data?.results ?? []) {
        const record = result?.record;
        if (!record?.series_id) continue;
        const id = String(record.series_id);
        const existing = merged.get(id);
        // the search says which of the series' titles matched; that title is what we compare against
        if (existing) {
            existing.titles = unique([...existing.titles, result.hit_title]);
            continue;
        }
        merged.set(id, {
            source: 'mangaupdates',
            id,
            kind: record.type === 'Novel' ? 'novel' : 'comic',
            title: record.title ?? '',
            titles: unique([result.hit_title]),
            year: Number.parseInt(record.year, 10) || null,
        });
    }
    return [...merged.values()];
}

// --- all the titles of one series ---

export async function fetchSeriesTitles(source: ExternalSource, id: string, fetcher: Fetcher = fetch): Promise<string[]> {
    if (source === 'anilist') {
        const data = await requestJson(fetcher, ANILIST_URL, postJson({
            query: `query($id:Int){Media(id:$id,type:MANGA){${ANILIST_TITLES}}}`,
            variables: { id: Number(id) },
        }));
        if (!data?.data?.Media) throw new LookupError('Series not found');
        return aniListTitles(data.data.Media);
    }
    const series = await requestJson(fetcher, `${MANGAUPDATES_URL}/series/${encodeURIComponent(id)}`);
    if (!series?.title) throw new LookupError('Series not found');
    return unique([series.title, ...(series.associated ?? []).map((associated: any) => associated?.title)]);
}

/** The full size cover of a MangaUpdates series; null when it has none */
export async function fetchMangaUpdatesCover(seriesId: string, fetcher: Fetcher = fetch): Promise<string | null> {
    const series = await requestJson(fetcher, `${MANGAUPDATES_URL}/series/${encodeURIComponent(seriesId)}`);
    const url = series?.image?.url?.original;
    return typeof url === 'string' && url.startsWith('https://') ? url : null;
}

/** Reads the series id from a pasted AniList or MangaUpdates page link */
export function parseSeriesLink(text: string): { source: ExternalSource; id: string } | null {
    const input = text.trim();

    const aniList = /anilist\.co\/manga\/(\d+)/i.exec(input);
    if (aniList) return { source: 'anilist', id: aniList[1] };

    if (!/mangaupdates\.com/i.test(input)) return null;
    // old style link: series.html?id=65954658329
    const old = /[?&]id=(\d+)/i.exec(input);
    if (old) return { source: 'mangaupdates', id: old[1] };
    // current link: /series/uarp82h/lord-of-the-mysteries ( the id in base 36 )
    const slug = /\/series\/([0-9a-z]+)/i.exec(input);
    if (!slug) return null;
    const id = Number.parseInt(slug[1], 36);
    return Number.isSafeInteger(id) ? { source: 'mangaupdates', id: String(id) } : null;
}
