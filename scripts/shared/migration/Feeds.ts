import type { Feed, FeedItem, Hermidata, RawFeed, SeenMarker, Settings } from "../types";
import { feedChapter, isNewerItem, readChapterOf, seenFromItem } from "../utils/Unread";

export const FEEDS_SEEN_MIGRATION_FLAG = 'migrated_Feeds_V3_seen';

type LegacyFeed = Feed & { Notified?: true };

/**
 * The marker a migrated feed starts with.
 * - latest chapter past the read one: seen up to the read chapter, so the item shows as unread
 * - otherwise ( caught up, or a chapter is unknown ): seen up to the latest item, so it stays quiet
 */
function migratedSeen(latest: FeedItem, readChapter: number | null): SeenMarker {
    const latestChapter = feedChapter(latest.chapter);
    const behind = latestChapter !== null && readChapter !== null && latestChapter > readChapter;
    return behind ? { chapter: readChapter, link: '', pubDate: new Date(0).toISOString() } : seenFromItem(latest);
}

/**
 * 0.28.0: the `Notified` flag is replaced by the `seen` marker.
 * - `Notified` is dropped, not carried over: nearly every old flag was a false positive
 * - every feed with a cached latest item gets `seen` ( see migratedSeen ): only items whose latest chapter
 *   is past the read chapter show as new after updating.
 *   The raw feed copy is used when it is newer: the RSS view merges it in, so it would otherwise count as new.
 * Returns only the items that changed.
 */
export function migrateFeedsToSeen(items: Hermidata[], rawFeeds: Record<string, RawFeed> = {}): Hermidata[] {
    const newest = (feed: Feed): FeedItem | undefined => {
        const raw = rawFeeds[feed.url]?.latestItem;
        if (!feed.latestItem) return raw;
        return raw && isNewerItem(raw, feed.latestItem) ? raw : feed.latestItem;
    };
    const changed: Hermidata[] = [];
    for (const item of items) {
        let itemChanged = false;
        const readChapter = readChapterOf(item);
        const rss = (item.rss ?? []).map((feed: LegacyFeed) => {
            const latest = newest(feed);
            if (!('Notified' in feed) && (feed.seen || !latest)) return feed;
            const { Notified: _dropped, ...rest } = feed;
            itemChanged = true;
            return rest.seen || !latest ? rest : { ...rest, seen: migratedSeen(latest, readChapter) };
        });
        if (itemChanged) changed.push({ ...item, rss });
    }
    return changed;
}

type MigrationDb = {
    get(store: 'settings', key: string): Promise<unknown>;
    put(store: 'settings', value: Settings, key: string): Promise<unknown>;
};

/** Runs once per device */
export async function runFeedsSeenMigration(
    db: MigrationDb,
    getAll: () => Promise<Record<string, Hermidata>>,
    getRawFeeds: () => Promise<Record<string, RawFeed>>,
    putAll: (items: Hermidata[]) => Promise<void>,
): Promise<void> {
    if (await db.get('settings', FEEDS_SEEN_MIGRATION_FLAG)) return;
    const changed = migrateFeedsToSeen(Object.values(await getAll()), await getRawFeeds());
    if (changed.length) await putAll(changed);
    await db.put('settings', true as unknown as Settings, FEEDS_SEEN_MIGRATION_FLAG);
    console.log(`[DB] Feeds: ${changed.length} items moved from "Notified" to "seen"`);
}
