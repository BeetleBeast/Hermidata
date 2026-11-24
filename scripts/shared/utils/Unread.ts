import type { Feed, FeedItem, Hermidata, SeenMarker } from "../types/index";

/*
"Unread" is never stored. An item is unread when the newest item of one of its feeds is newer than both
- what the user has read ( the chapter of the marker in use ), and
- what the user dismissed ( `feed.seen` ).
Every caller ( popup, badge, background check ) uses getUnread, so they can't disagree.
*/

export type UnreadInfo = {
    item: Hermidata;
    feed: Feed;
    /** chapter of the marker in use; null when unknown */
    readChapter: number | null;
    /** chapter of the newest feed item; null when the feed title has no number */
    latestChapter: number | null;
    /** latestChapter - readChapter, when both are known and at least 1 */
    newCount: number | null;
    link: string;
    pubDate: Date;
};

type Comparable = { chapter: number | null; link: string; pubDate: Date | string };

/** A feed chapter counts only when the title had a number in it ( unknown is NaN ) */
function feedChapter(chapter: number | null | undefined): number | null {
    return typeof chapter === 'number' && Number.isFinite(chapter) && chapter > 0 ? chapter : null;
}
function readChapterOf(item: Hermidata): number | null {
    const current = item.chapter?.bookmarks?.[item.chapter.bookmarkInUse]?.current;
    return typeof current === 'number' && Number.isFinite(current) && current >= 0 ? current : null;
}
/** Dates arrive as Date ( IndexedDB ) or as a string ( after a runtime message ) */
function timeOf(date: Date | string | undefined): number {
    if (date === undefined) return 0;
    const time = new Date(date).getTime();
    return Number.isNaN(time) ? 0 : time;
}

/**
 * Is `a` a newer release than `b`?
 * - both have a chapter number: compare the numbers
 * - otherwise: a different link that came out later
 */
export function isNewerItem(a: Comparable, b: Comparable): boolean {
    const chapterA = feedChapter(a.chapter);
    const chapterB = feedChapter(b.chapter);
    if (chapterA !== null && chapterB !== null) return chapterA > chapterB;
    return a.link !== b.link && timeOf(a.pubDate) > timeOf(b.pubDate);
}

export function seenFromItem(item: FeedItem): SeenMarker {
    return {
        chapter: feedChapter(item.chapter),
        link: item.link,
        pubDate: new Date(timeOf(item.pubDate)).toISOString(),
    };
}

function isFeedUnread(feed: Feed, readChapter: number | null): boolean {
    const latest = feed.latestItem;
    if (!latest) return false;

    const latestChapter = feedChapter(latest.chapter);
    // read up to ( or past ) the feed: nothing new for this user
    if (latestChapter !== null && readChapter !== null && readChapter >= latestChapter) return false;

    if (feed.seen) return isNewerItem(latest, feed.seen);
    // no dismiss marker yet: only a chapter number past the read one counts
    return latestChapter !== null && readChapter !== null;
}

/** The newest unread release of an item, or null when it has nothing new */
export function getUnread(item: Hermidata): UnreadInfo | null {
    const readChapter = readChapterOf(item);
    const unreadFeeds = (item.rss ?? []).filter(feed => isFeedUnread(feed, readChapter));
    if (!unreadFeeds.length) return null;

    const feed = unreadFeeds.reduce((newest, f) => isNewerItem(f.latestItem, newest.latestItem) ? f : newest);
    const latestChapter = feedChapter(feed.latestItem.chapter);
    const difference = latestChapter !== null && readChapter !== null ? Math.floor(latestChapter - readChapter) : 0;

    return {
        item,
        feed,
        readChapter,
        latestChapter,
        newCount: difference >= 1 ? difference : null,
        link: feed.latestItem.link,
        pubDate: new Date(timeOf(feed.latestItem.pubDate)),
    };
}

/** Every unread item, newest release first */
export function getAllUnread(all: Record<string, Hermidata> | Hermidata[]): UnreadInfo[] {
    const list = Array.isArray(all) ? all : Object.values(all);
    return list
        .map(getUnread)
        .filter((info): info is UnreadInfo => info !== null)
        .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
}

/** Dismiss: every feed of the item is marked seen up to its newest item. Returns a copy. */
export function markSeen(item: Hermidata): Hermidata {
    return {
        ...item,
        rss: item.rss.map(feed => feed.latestItem ? { ...feed, seen: seenFromItem(feed.latestItem) } : feed),
    };
}

/**
 * Puts a freshly fetched item on a feed. Returns true when it was newer than the cached one.
 * A feed without a dismiss marker gets one first ( from what it had, else from this item ),
 * so linking a feed or fetching it for the first time never counts as a new release by itself.
 */
export function applyLatestItem(feed: Feed, item: FeedItem): boolean {
    if (!feed.seen) feed.seen = seenFromItem(feed.latestItem ?? item);
    if (feed.latestItem && !isNewerItem(item, feed.latestItem)) return false;
    feed.latestItem = item;
    return true;
}

/** Short text for a row or a notification: "Ch. 45 → 47 (2 new)", "Chapter 47" or "New chapter" */
export function describeUnread(info: UnreadInfo): string {
    const { readChapter, latestChapter, newCount } = info;
    if (latestChapter === null) return 'New chapter';
    if (readChapter === null) return `Chapter ${latestChapter}`;
    return `Ch. ${readChapter} → ${latestChapter}${newCount ? ` (${newCount} new)` : ''}`;
}
