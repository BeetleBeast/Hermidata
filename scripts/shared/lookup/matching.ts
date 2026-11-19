import type { ExternalSource } from "../types";

export type TitleKind = 'novel' | 'comic';

export interface LookupCandidate {
    source: ExternalSource;
    id: string;
    kind: TitleKind;
    title: string;
    /** Every other title the search result already carries ( synonyms, the title that matched the search ) */
    titles: string[];
    year?: number | null;
}

export type PickResult =
    | { status: 'matched'; candidate: LookupCandidate }
    | { status: 'ambiguous'; candidates: LookupCandidate[] }
    | { status: 'none' };

/** A candidate counts as close from this similarity on */
export const MATCH_THRESHOLD = 0.9;

/** Which kind of work a saved item is; null for types the servers do not cover ( anime, series... ) */
export function kindOfType(novelType: string): TitleKind | null {
    if (/novel/i.test(novelType)) return 'novel';
    if (/manga|manhwa|manhua|comic|webtoon/i.test(novelType)) return 'comic';
    return null;
}

/**
 * Lowercase, unicode-safe form used to compare titles. A trailing "(Novel)" tag is dropped,
 * a year such as "(2025)" is kept because it can be the only difference between two works.
 */
export function normalizeTitle(title: string): string {
    return title
        .normalize('NFKC')
        .toLowerCase()
        .replace(/\s*\((?:light |web )?novel\)\s*$/u, '')
        .replaceAll(/[^\p{L}\p{N}\s]/gu, '')
        .replaceAll(/\s+/g, ' ')
        .trim();
}

function editDistance(a: string, b: string): number {
    if (a === b) return 0;
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
        const current = [i];
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
        }
        previous = current;
    }
    return previous[b.length];
}

/** 1 for equal normalised titles, 0 when either is empty */
export function titleSimilarity(a: string, b: string): number {
    const left = normalizeTitle(a);
    const right = normalizeTitle(b);
    if (!left || !right) return 0;
    if (left === right) return 1;
    return 1 - editDistance(left, right) / Math.max(left.length, right.length);
}

/**
 * Picks the one search result that is the searched work.
 * - only results of the same kind ( novel / comic ) count
 * - the title or any other title of a result must be close to the query
 * - exactly one close result: that one
 * - several: only an exactly equal title counts, and only if it is the one
 * - otherwise it is ambiguous and nothing is stored
 */
export function pickCandidate(query: string, kind: TitleKind, candidates: LookupCandidate[], threshold = MATCH_THRESHOLD): PickResult {
    const close = candidates
        .filter(candidate => candidate.kind === kind)
        .map(candidate => ({
            candidate,
            score: Math.max(0, ...[candidate.title, ...candidate.titles].map(title => titleSimilarity(query, title))),
        }))
        .filter(entry => entry.score >= threshold);

    if (close.length === 0) return { status: 'none' };
    if (close.length === 1) return { status: 'matched', candidate: close[0].candidate };

    const exact = close.filter(entry => entry.score === 1);
    if (exact.length === 1) return { status: 'matched', candidate: exact[0].candidate };

    return { status: 'ambiguous', candidates: close.map(entry => entry.candidate) };
}
