import type { Hermidata, MangaUpdatesFeedProgress, MangaUpdatesFeedScan, Settings } from "../types/index";
import { isLookupEnabled } from "./altTitleLookup";
import { formatDuration, MAX_ETA_MS } from "./mangaUpdatesPace";
import { kindOfType, pickCandidate } from "./matching";
import { searchMangaUpdates, type Fetcher } from "./sources";

/*
MangaUpdates publishes a free release feed per series: api.mangaupdates.com/v1/series/<id>/rss
Its items are "<series> c.<chapter>" with no link or date; parseItems points them at the series page.
The series id comes from the alt-title lookup ( meta.external ). That lookup tries AniList first and stops at
the first match, so most comics carry an AniList id: those are searched on MangaUpdates by title here.
*/

export const MANGAUPDATES_DOMAIN = 'mangaupdates.com';
/** Items linked per minute while some are left: the same pace as the alt-title backfill */
export const MANGAUPDATES_BATCH_SIZE = 8;
/** storage.local: item id → ISO time before which it is not tried again ( every device keeps its own ) */
export const MANGAUPDATES_RETRY_KEY = 'mangaUpdatesRetryAfter';
/** A title MangaUpdates had no clear match for is searched again after this long */
export const MANGAUPDATES_NO_MATCH_WAIT_MS = 30 * 24 * 60 * 60 * 1000;
/** A title whose search timed out waits this long, so one that always times out doesn't hold up the rest */
export const MANGAUPDATES_TIMEOUT_WAIT_MS = 60 * 60 * 1000;
/** An item whose feed could not be linked ( no such feed, an empty one ) is tried again after this long, so it can't hold up the others */
export const MANGAUPDATES_FAILED_WAIT_MS = 24 * 60 * 60 * 1000;
/** Titles tried per item: the title, then alt titles */
const MAX_SEARCHES_PER_ITEM = 3;

const FEED_URL_PATTERN = /^https:\/\/api\.mangaupdates\.com\/v1\/series\/[^/]+\/rss$/;

export function mangaUpdatesFeedUrl(seriesId: string): string {
    return `https://api.mangaupdates.com/v1/series/${encodeURIComponent(seriesId)}/rss`;
}

export function isMangaUpdatesFeedUrl(url: string): boolean {
    return FEED_URL_PATTERN.test(url);
}

/** Where the background keeps the linking progress ( storage.local: every device runs its own ) */
export const MANGAUPDATES_PROGRESS_KEY = 'mangaUpdatesFeedProgress';

/**
 * A sub-option of the alt-title lookup: it needs the series ids and searches the lookup finds, so it is on only while
 * the lookup is on too. Settings saved before this option existed count as off.
 */
export function isMangaUpdatesFeedsEnabled(settings: Settings | null | undefined): boolean {
    return isLookupEnabled(settings) && settings?.ExtensionBehaviour?.MangaUpdatesFeeds?.Enable === true;
}

/** Text for the progress line under the setting; `now` lets the countdown tick without a new progress */
export function mangaUpdatesFeedLabel(progress: MangaUpdatesFeedProgress, now: number = Date.now()): string {
    const { running, unavailable, done, total, waiting, etaAt, etaCapped, pausedUntil } = progress;
    if (running) {
        const left = etaAt === null ? 0 : etaAt - now;
        const eta = etaCapped ? `More than ${formatDuration(MAX_ETA_MS)} to go.` : etaAt === null || left <= 0 ? 'Almost done.' : `Done in ${formatDuration(left)}.`;
        const pause = pausedUntil !== null && pausedUntil > now ? ` Paused to give MangaUpdates a rest, continuing in ${formatDuration(pausedUntil - now)}.` : '';
        return `Linking MangaUpdates feeds: ${done} of ${total}.${pause} ${eta}`;
    }
    if (unavailable) return `MangaUpdates did not answer: ${done} of ${total} linked, trying again within the hour.`;
    const retry = waiting ? ` ${waiting} will be tried again later.` : '';
    return `MangaUpdates feeds linked for ${done} of ${total} item${total === 1 ? '' : 's'}.${retry}`;
}

/**
 * Sorts every item for the MangaUpdates feed step and counts why the others are left out ( for the log ).
 * - `notLinked`: declined in auto-subscribe, or unsubscribed
 * - `retryAfter`: item id → ISO time before which the item is left alone ( it had no match, or its feed would not link )
 */
export function scanForMangaUpdatesFeeds(items: Hermidata[], notLinked: Record<string, string>, retryAfter: Record<string, string>, now: number = Date.now()): MangaUpdatesFeedScan {
    const scan: MangaUpdatesFeedScan = { candidates: [], linked: 0, unsubscribed: 0, notMatched: 0, waiting: 0 };
    for (const item of items) {
        const external = item?.meta?.external;
        if (external?.status !== 'matched') {
            scan.notMatched++;
            continue;
        }
        if ((item.rss ?? []).some(feed => isMangaUpdatesFeedUrl(feed.url))) {
            scan.linked++;
            continue;
        }
        if (item.id in notLinked) {
            scan.unsubscribed++;
            continue;
        }
        if (Date.parse(retryAfter[item.id] ?? '') > now) {
            scan.waiting++;
            continue;
        }
        scan.candidates.push({ item, seriesId: external.source === 'mangaupdates' ? external.id : null });
    }
    return scan;
}

/**
 * Searches MangaUpdates for the item's series by its title, then its alt titles.
 * Null when no title gives a single close match; throws when MangaUpdates can't be reached.
 */
export async function findMangaUpdatesSeriesId(item: Hermidata, fetcher: Fetcher = fetch): Promise<string | null> {
    const kind = kindOfType(item.novelType);
    if (!kind) return null;
    const titles = [...new Set([item.title, ...(item.meta?.altTitles ?? [])].map(title => title?.trim()).filter(Boolean))];
    for (const title of titles.slice(0, MAX_SEARCHES_PER_ITEM)) {
        const picked = pickCandidate(title, kind, await searchMangaUpdates(title, fetcher));
        if (picked.status === 'matched') return picked.candidate.id;
    }
    return null;
}
