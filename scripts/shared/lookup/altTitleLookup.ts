import type { ExternalMatch, ExternalSource, Hermidata, Settings } from "../types";
import { kindOfType, normalizeTitle, pickCandidate, type LookupCandidate } from "./matching";
import { fetchSeriesTitles, parseSeriesLink, searchAniList, searchMangaUpdates, type Fetcher } from "./sources";

/** An item with no match is looked up again after this long */
export const RECHECK_MS = 30 * 24 * 60 * 60 * 1000;

/** What a lookup found; applied to the freshest copy of the item right before it is saved */
export interface LookupPatch {
    external: ExternalMatch;
    titles: string[];
}

export type SearchOutcome =
    | { status: 'matched'; candidate: LookupCandidate }
    | { status: 'ambiguous'; candidates: LookupCandidate[] }
    | { status: 'none' }
    | { status: 'error'; message: string };

export type ManualOutcome =
    | { status: 'applied'; patch: LookupPatch }
    | { status: 'pick'; candidates: LookupCandidate[] }
    | { status: 'none' }
    | { status: 'error'; message: string };

/** The lookup sends nothing online unless the user switched it on */
export function isLookupEnabled(settings: Settings | null | undefined): boolean {
    return settings?.ExtensionBehaviour?.AltTitleLookup?.Enable === true;
}

/** A matched item is never looked up again; a miss waits RECHECK_MS; a failed request is simply tried again */
export function shouldLookup(item: Hermidata, now: number = Date.now()): boolean {
    if (!kindOfType(item.novelType)) return false;
    const external = item.meta?.external;
    if (!external || external.status === 'error') return true;
    if (external.status === 'matched') return false;
    const checkedAt = Date.parse(external.checkedAt);
    return Number.isNaN(checkedAt) || now - checkedAt >= RECHECK_MS;
}

/** Searches AniList first ( tight results ), then MangaUpdates ( also covers novels ) */
export async function searchSeries(query: string, novelType: string, fetcher: Fetcher = fetch): Promise<SearchOutcome> {
    const kind = kindOfType(novelType);
    if (!kind || !normalizeTitle(query)) return { status: 'none' };

    let ambiguous: LookupCandidate[] | null = null;
    let failure: string | null = null;
    for (const search of [searchAniList, searchMangaUpdates]) {
        try {
            const picked = pickCandidate(query, kind, await search(query, fetcher));
            if (picked.status === 'matched') return picked;
            if (picked.status === 'ambiguous') ambiguous ??= picked.candidates;
        } catch (error) {
            failure ??= error instanceof Error ? error.message : String(error);
        }
    }
    if (ambiguous) return { status: 'ambiguous', candidates: ambiguous };
    // a source that failed may have held the answer, so this is not a "no match"
    if (failure) return { status: 'error', message: failure };
    return { status: 'none' };
}

const checkedNow = (now: number) => new Date(now).toISOString();

async function patchFor(source: ExternalSource, id: string, now: number, fetcher: Fetcher): Promise<LookupPatch> {
    const titles = await fetchSeriesTitles(source, id, fetcher);
    return { external: { status: 'matched', source, id, checkedAt: checkedNow(now) }, titles };
}

/** The automatic lookup of one item; null when it is not due */
export async function findPatch(item: Hermidata, fetcher: Fetcher = fetch, now: number = Date.now()): Promise<LookupPatch | null> {
    if (!shouldLookup(item, now)) return null;

    const outcome = await searchSeries(item.title, item.novelType, fetcher);
    const checkedAt = checkedNow(now);
    switch (outcome.status) {
        case 'matched':
            try { return await patchFor(outcome.candidate.source, outcome.candidate.id, now, fetcher); }
            catch { return { external: { status: 'error', checkedAt }, titles: [] }; }
        case 'ambiguous': return { external: { status: 'ambiguous', checkedAt }, titles: [] };
        case 'none': return { external: { status: 'none', checkedAt }, titles: [] };
        case 'error': return { external: { status: 'error', checkedAt }, titles: [] };
    }
}

/** The lookup the user asks for: a pasted link is used as is, a typed title is searched */
export async function lookupManual(item: Hermidata, input: string, fetcher: Fetcher = fetch, now: number = Date.now()): Promise<ManualOutcome> {
    const text = input.trim() || item.title;
    try {
        const link = parseSeriesLink(text);
        if (link) return { status: 'applied', patch: await patchFor(link.source, link.id, now, fetcher) };

        const outcome = await searchSeries(text, item.novelType, fetcher);
        if (outcome.status === 'matched') return { status: 'applied', patch: await patchFor(outcome.candidate.source, outcome.candidate.id, now, fetcher) };
        if (outcome.status === 'ambiguous') return { status: 'pick', candidates: outcome.candidates };
        return outcome;
    } catch (error) {
        return { status: 'error', message: error instanceof Error ? error.message : String(error) };
    }
}

/** The user picked one of the candidates of an ambiguous search */
export async function lookupCandidate(candidate: LookupCandidate, fetcher: Fetcher = fetch, now: number = Date.now()): Promise<ManualOutcome> {
    try {
        return { status: 'applied', patch: await patchFor(candidate.source, candidate.id, now, fetcher) };
    } catch (error) {
        return { status: 'error', message: error instanceof Error ? error.message : String(error) };
    }
}

/** Adds the new titles to the alt titles and stores the result; titles the item already has are skipped */
export function applyPatch(item: Hermidata, patch: LookupPatch): { item: Hermidata; added: string[] } {
    const known = new Set([item.title, ...(item.meta.altTitles ?? [])].map(normalizeTitle));
    const added: string[] = [];
    for (const title of patch.titles) {
        const key = normalizeTitle(title);
        if (!key || known.has(key)) continue;
        known.add(key);
        added.push(title);
    }
    return {
        item: { ...item, meta: { ...item.meta, altTitles: [...(item.meta.altTitles ?? []), ...added], external: patch.external } },
        added,
    };
}
