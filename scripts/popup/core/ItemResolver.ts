import { CalcDiff, levenshteinDistance } from "./Past";
import { getSeriesUrl, TrimTitle } from "../../shared/utils/StringOutput";
import { HermidataModel } from "../../shared/utils/HermidataSelector";
import type { Hermidata, ItemResolution, ItemResolveInput, ScoredCandidate } from "../../shared/types/index";

// Weights sum to 1, so a score is always between 0 and 1
const URL_WEIGHT = 0.7;
const TITLE_WEIGHT = 0.2;
const HOST_WEIGHT = 0.1;

/** The best candidate must at least reach this score to be picked automatically */
export const MIN_MATCH_SCORE = 0.5;
/** ...and beat the runner-up by this much, otherwise the user decides */
export const MATCH_MARGIN = 0.15;

function getHost(url: string): string {
    try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); }
    catch { return ''; }
}

/** Fuzzy similarity of two series urls; different sites never count as similar */
function seriesUrlSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    const [hostA, ...pathA] = a.split('/');
    const [hostB, ...pathB] = b.split('/');
    if (hostA !== hostB) return 0;

    const left = pathA.join('/');
    const right = pathB.join('/');
    const longest = Math.max(left.length, right.length);
    if (longest === 0) return 1;
    return 1 - levenshteinDistance(left, right) / longest;
}

export function scoreCandidate(input: ItemResolveInput, item: Hermidata): ScoredCandidate {
    const model = new HermidataModel(item);

    const currentSeries = getSeriesUrl(input.url);
    const markerSeries = model.GetMarkerUrls().map(getSeriesUrl);

    const urlScore = Math.max(0, ...markerSeries.map(series => seriesUrlSimilarity(currentSeries, series)));
    const exactUrl = currentSeries !== '' && markerSeries.includes(currentSeries);

    const title = TrimTitle.trimTitle(input.title, input.url).title;
    const titleScore = Math.max(0, ...[model.title, ...(model.GetAltTitles() ?? [])].filter(Boolean).map(t => CalcDiff(title, t)));

    const host = getHost(input.url);
    const knownHost = host !== '' && (model.source === host || (model.GetAltSources() ?? []).includes(host));

    const score = urlScore * URL_WEIGHT + titleScore * TITLE_WEIGHT + (knownHost ? HOST_WEIGHT : 0);
    return { item, score, exactUrl };
}

/**
 * Picks which of the same-titled candidates the current page belongs to.
 * - one candidate: that one (the normal one-click case)
 * - exactly one marker on the same series page: that one
 * - otherwise the top score must clear MIN_MATCH_SCORE and beat the runner-up by MATCH_MARGIN
 * - anything else is ambiguous and must be decided by the user, never merged silently
 */
export function resolveItem(input: ItemResolveInput, items: Hermidata[]): ItemResolution {
    if (items.length === 0) return { kind: 'none' };

    const candidates = items.map(item => scoreCandidate(input, item)).sort((a, b) => b.score - a.score);
    if (candidates.length === 1) return { kind: 'match', item: candidates[0].item, candidates };

    const exact = candidates.filter(candidate => candidate.exactUrl);
    if (exact.length === 1) return { kind: 'match', item: exact[0].item, candidates };

    const [best, runnerUp] = candidates;
    if (best.score >= MIN_MATCH_SCORE && best.score - runnerUp.score >= MATCH_MARGIN) {
        return { kind: 'match', item: best.item, candidates };
    }
    return { kind: 'ambiguous', candidates };
}
