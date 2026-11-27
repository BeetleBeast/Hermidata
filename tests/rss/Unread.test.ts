import { describe, expect, it } from 'vitest';
import { applyLatestItem, describeUnread, getAllUnread, getUnread, isNewerItem, markSeen, seenFromItem } from '../../scripts/shared/utils/Unread';
import { migrateFeedsToSeen } from '../../scripts/shared/migration/Feeds';
import { itemNotificationText, summaryNotificationText } from '../../scripts/background/rssNotify';
import { formatRelativeDate } from '../../scripts/rss/build/feed';
import type { Feed, FeedItem, Hermidata } from '../../scripts/shared/types';

function release(chapter: number, day: number, site = 'site.com'): FeedItem {
    return {
        id: `${site}-${chapter}`,
        rawTitle: `Solo Leveling Chapter ${chapter}`,
        title: 'Solo Leveling',
        link: `https://${site}/solo-leveling/${Number.isNaN(chapter) ? `post-${day}` : `chapter-${chapter}`}`,
        chapter,
        pubDate: new Date(Date.UTC(2026, 10, day)),
        guid: `${site}-${chapter}-${day}`,
    };
}

function feed(latestItem: FeedItem | undefined, extra: Partial<Feed> = {}): Feed {
    return {
        id: 'feed', title: 'Solo Leveling', url: 'https://site.com/feed', image: null, domain: 'site.com',
        lastFetched: null, latestItem: latestItem as FeedItem, ...extra,
    };
}

function saved(read: number, rss: Feed[], id = 'solo'): Hermidata {
    return {
        id, title: 'Solo Leveling', novelType: 'Manga', source: 'site.com', rss, import: null,
        titleTrimming: {} as Hermidata['titleTrimming'],
        chapter: {
            latest: read, bookmarkInUse: 'bm1',
            bookmarks: { bm1: { id: 'bm1', current: read } as Hermidata['chapter']['bookmarks'][string] },
        } as unknown as Hermidata['chapter'],
        meta: { image: { kind: 'url', url: '' } } as unknown as Hermidata['meta'],
        version: 13,
    } as Hermidata;
}

describe('isNewerItem', () => {
    it('compares chapter numbers when both have one', () => {
        expect(isNewerItem(release(47, 1), release(45, 20))).toBe(true);
        expect(isNewerItem(release(45, 20), release(47, 1))).toBe(false);
        expect(isNewerItem(release(47, 1), release(47, 2))).toBe(false);
    });
    it('falls back to a different link that came out later', () => {
        expect(isNewerItem(release(NaN, 5), release(NaN, 3))).toBe(true);
        expect(isNewerItem(release(NaN, 3), release(NaN, 5))).toBe(false);
        const same = release(NaN, 5);
        expect(isNewerItem({ ...same, pubDate: new Date(Date.UTC(2026, 10, 9)) }, same)).toBe(false); // same link, re-dated
    });
    it('reads dates that came through a runtime message as strings', () => {
        const a = { ...release(NaN, 5), pubDate: release(NaN, 5).pubDate.toISOString() };
        expect(isNewerItem(a, release(NaN, 3))).toBe(true);
    });
});

describe('getUnread', () => {
    it('is unread when the feed is past both the read chapter and the seen one', () => {
        const info = getUnread(saved(45, [feed(release(47, 10), { seen: seenFromItem(release(45, 1)) })]));
        expect(info).not.toBeNull();
        expect(info!.newCount).toBe(2);
        expect(describeUnread(info!)).toBe('Ch. 45 → 47 (2 new)');
    });
    it('is read once the user reads up to the feed', () => {
        expect(getUnread(saved(47, [feed(release(47, 10), { seen: seenFromItem(release(45, 1)) })]))).toBeNull();
        expect(getUnread(saved(50, [feed(release(47, 10), { seen: seenFromItem(release(45, 1)) })]))).toBeNull();
    });
    it('is read once cleared, until a newer chapter arrives', () => {
        const cleared = markSeen(saved(45, [feed(release(47, 10), { seen: seenFromItem(release(45, 1)) })]));
        expect(getUnread(cleared)).toBeNull();
        cleared.rss[0].latestItem = release(48, 12);
        expect(getUnread(cleared)?.latestChapter).toBe(48);
    });
    it('uses link and date when the feed has no chapter numbers', () => {
        const item = saved(0, [feed(release(NaN, 10), { seen: seenFromItem(release(NaN, 3)) })]);
        const info = getUnread(item);
        expect(info).not.toBeNull();
        expect(info!.latestChapter).toBeNull();
        expect(describeUnread(info!)).toBe('New chapter');
        expect(getUnread(markSeen(item))).toBeNull();
    });
    it('without a seen marker only counts a chapter number past the read one', () => {
        expect(getUnread(saved(45, [feed(release(47, 10))]))).not.toBeNull();
        expect(getUnread(saved(45, [feed(release(NaN, 10))]))).toBeNull();
    });
    it('is never unread without a fetched item ( fresh device )', () => {
        expect(getUnread(saved(1, [feed(undefined, { seen: seenFromItem(release(1, 1)) })]))).toBeNull();
    });
    it('shows one row per item, from its newest feed', () => {
        const item = saved(40, [
            feed(release(42, 10, 'a.com'), { url: 'https://a.com/feed', seen: seenFromItem(release(40, 1, 'a.com')) }),
            feed(release(44, 8, 'b.com'), { url: 'https://b.com/feed', seen: seenFromItem(release(40, 1, 'b.com')) }),
        ]);
        expect(getUnread(item)?.feed.url).toBe('https://b.com/feed');
    });
    it('getAllUnread sorts by release date, newest first', () => {
        const older = saved(1, [feed(release(5, 2), { seen: seenFromItem(release(1, 1)) })], 'older');
        const newer = saved(1, [feed(release(5, 9), { seen: seenFromItem(release(1, 1)) })], 'newer');
        const read = saved(5, [feed(release(5, 12), { seen: seenFromItem(release(1, 1)) })], 'read');
        expect(getAllUnread({ older, newer, read }).map(i => i.item.id)).toEqual(['newer', 'older']);
    });
});

describe('applyLatestItem', () => {
    it('a first fetch sets the seen marker, so linking is not a release', () => {
        const f = feed(undefined);
        expect(applyLatestItem(f, release(47, 10))).toBe(true);
        expect(f.seen?.chapter).toBe(47);
        expect(getUnread(saved(10, [f]))).toBeNull();
    });
    it('keeps the cached item when the fetched one is not newer', () => {
        const f = feed(release(47, 10), { seen: seenFromItem(release(47, 10)) });
        expect(applyLatestItem(f, release(46, 12))).toBe(false);
        expect(f.latestItem.chapter).toBe(47);
    });
    it('a newer fetch makes the item unread', () => {
        const f = feed(release(47, 10), { seen: seenFromItem(release(47, 10)) });
        expect(applyLatestItem(f, release(48, 12))).toBe(true);
        expect(getUnread(saved(47, [f]))?.latestChapter).toBe(48);
    });
    it('a feed without a marker gets one from what it had before the new item', () => {
        const f = feed(release(47, 10));
        applyLatestItem(f, release(48, 12));
        expect(f.seen?.chapter).toBe(47);
    });
});

describe('migrateFeedsToSeen ( 0.28.0 )', () => {
    it('drops Notified and marks a caught-up feed as seen', () => {
        const legacy = saved(47, [{ ...feed(release(47, 10)), Notified: true } as Feed]);
        const [migrated] = migrateFeedsToSeen([legacy]);
        expect('Notified' in migrated.rss[0]).toBe(false);
        expect(migrated.rss[0].seen?.chapter).toBe(47);
        expect(getUnread(migrated)).toBeNull();
    });
    it('shows an item as unread when the latest chapter is past the read one', () => {
        const legacy = saved(45, [{ ...feed(release(47, 10)), Notified: true } as Feed]);
        const [migrated] = migrateFeedsToSeen([legacy]);
        expect(migrated.rss[0].seen?.chapter).toBe(45);
        expect(getUnread(migrated)?.newCount).toBe(2);
    });
    it('keeps it unread after the next fetch and clears it on dismiss', () => {
        const [migrated] = migrateFeedsToSeen([saved(45, [feed(release(47, 10))])]);
        applyLatestItem(migrated.rss[0], release(47, 10));
        expect(getUnread(migrated)).not.toBeNull();
        expect(getUnread(markSeen(migrated))).toBeNull();
    });
    it('stays quiet when a chapter number is unknown', () => {
        const [migrated] = migrateFeedsToSeen([saved(45, [feed(release(Number.NaN, 10))])]);
        expect(getUnread(migrated)).toBeNull();
    });
    it('uses the raw feed copy when it is newer than the stored item', () => {
        const legacy = saved(49, [{ ...feed(release(47, 10)), Notified: true } as Feed]);
        const raw = { 'https://site.com/feed': { latestItem: release(49, 12) } } as unknown as Parameters<typeof migrateFeedsToSeen>[1];
        const [migrated] = migrateFeedsToSeen([legacy], raw);
        expect(migrated.rss[0].seen?.chapter).toBe(49);
    });
    it('leaves items that need nothing alone', () => {
        const done = saved(10, [feed(release(47, 10), { seen: seenFromItem(release(47, 10)) })]);
        const fresh = saved(10, [feed(undefined)]);
        expect(migrateFeedsToSeen([done, fresh])).toEqual([]);
    });
});

describe('notification text', () => {
    const info = () => getUnread(saved(45, [feed(release(47, 10), { seen: seenFromItem(release(45, 1)) })]))!;
    it('short: title and chapter', () => {
        expect(itemNotificationText(info(), false)).toEqual({ title: 'Solo Leveling', message: 'Chapter 47' });
    });
    it('detailed: chapters behind, chapter title and site, without stray indentation', () => {
        const { message } = itemNotificationText(info(), true);
        expect(message).toBe('Ch. 45 → 47 (2 new)\nSolo Leveling Chapter 47\nsite.com');
    });
    it('summary: count, up to 5 titles, and where to look', () => {
        const many = Array.from({ length: 7 }, () => info());
        const { title, message } = summaryNotificationText(many);
        expect(title).toBe('7 series have new chapters');
        expect(message.split('\n')).toHaveLength(7); // 5 titles + "and 2 more" + hint
        expect(message).toContain('and 2 more');
        expect(message).toContain('Open the popup to see them.');
    });
});

describe('formatRelativeDate', () => {
    const now = Date.UTC(2026, 10, 24, 12);
    it.each([
        [now - 30_000, 'just now'],
        [now - 5 * 60_000, '5 min ago'],
        [now - 3 * 3_600_000, '3h ago'],
        [now - 30 * 3_600_000, 'yesterday'],
        [now - 4 * 86_400_000, '4 days ago'],
    ])('%s → %s', (time, text) => {
        expect(formatRelativeDate(new Date(time), now)).toBe(text);
    });
});
