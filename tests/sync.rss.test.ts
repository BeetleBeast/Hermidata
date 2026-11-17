// sync.rss.test.ts
// An RSS refresh only changes per-device cache fields (lastFetched / latestItem), which are deliberately
// not synced. These tests pin down what a refresh may and may not cost or break.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./browser', () => ({ ext: {} }));

import { FakeCloud, makeDevice, makeNovel, settle, resetDevices } from './sync.testKit';

beforeEach(() => {
    resetDevices();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-11-16T12:00:00.000Z'));
});
afterEach(() => vi.useRealTimers());

async function syncedPair(count = 3) {
    const cloud = new FakeCloud();
    const novels = Array.from({ length: count }, (_, i) => makeNovel(i + 1));
    const a = makeDevice(cloud, 'A', novels);
    const b = makeDevice(cloud, 'B');
    await a.start();
    await b.start();
    return { cloud, a, b, novels };
}

describe('RSS refresh: what it costs', () => {
    it('a refresh that only changes the RSS cache does not write to storage.sync', async () => {
        const { cloud, a, novels } = await syncedPair();
        const writes = cloud.area.setCalls;
        const rev = cloud.rev;

        for (let i = 0; i < 5; i++) {
            a.refreshRss(novels[0].id);
            await settle(10_000);
        }

        expect(cloud.area.setCalls).toBe(writes);   // no cloud writes
        expect(cloud.rev).toBe(rev);                // no new revision for other devices to pull
    });

    it('refreshing every feed in one burst costs at most one write', async () => {
        const { cloud, a, novels } = await syncedPair(20);
        const writes = cloud.area.setCalls;

        // worst case: the RSS path also stamps meta.updated, so the content really does change
        for (const n of novels) a.refreshRss(n.id, { bumpUpdated: true });
        await settle();

        expect(cloud.area.setCalls - writes).toBeLessThanOrEqual(1);
    });

    it('a refresh followed by a real edit publishes the edit, in a single write', async () => {
        const { cloud, a, b, novels } = await syncedPair();
        const writes = cloud.area.setCalls;

        a.refreshRss(novels[0].id);
        a.edit(novels[0].id, h => { h.chapter.bookmarks['bm1'].current = 42; });
        await settle();

        expect(b.db.get(novels[0].id)!.chapter.bookmarks['bm1'].current).toBe(42);
        expect(cloud.area.setCalls - writes).toBe(1);
    });
});

describe('RSS refresh: correctness', () => {
    it('the RSS cache never travels to other devices', async () => {
        const { a, b, novels } = await syncedPair();

        a.refreshRss(novels[0].id, { bumpUpdated: true });   // forces a real write
        await settle();

        const feed = b.db.get(novels[0].id)!.rss[0] as any;
        expect(feed.latestItem).toBeUndefined();
        expect(feed.lastFetched).toBeUndefined();
    });

    it("a device keeps its own RSS cache when it pulls another device's edit", async () => {
        const { a, b, novels } = await syncedPair();

        a.refreshRss(novels[0].id);
        const cache = (a.db.get(novels[0].id)!.rss[0] as any).latestItem;

        b.edit(novels[0].id, h => { h.chapter.bookmarks['bm1'].current = 99; });
        await settle();

        const got = a.db.get(novels[0].id)!;
        expect(got.chapter.bookmarks['bm1'].current).toBe(99);       // edit arrived
        expect((got.rss[0] as any).latestItem).toEqual(cache);       // cache survived the merge
    });

    it('a real change to a feed (its URL) still syncs', async () => {
        // guards against "fixing" the cost by ignoring RSS changes altogether
        const { a, b, novels } = await syncedPair();

        a.edit(novels[0].id, h => { (h.rss[0] as any).url = 'https://example.com/new-feed'; });
        await settle();

        expect((b.db.get(novels[0].id)!.rss[0] as any).url).toBe('https://example.com/new-feed');
    });
});

describe('RSS refresh: races with a reader on another device', () => {
    it('a refresh that leaves meta.updated alone never overwrites a newer edit', async () => {
        const { a, b, novels } = await syncedPair();

        b.edit(novels[0].id, h => { h.chapter.bookmarks['bm1'].current = 50; }); // reading progress
        await vi.advanceTimersByTimeAsync(1000);
        a.refreshRss(novels[0].id);                                              // background refresh, later
        await settle();

        for (const dev of [a, b]) {
            expect(dev.db.get(novels[0].id)!.chapter.bookmarks['bm1'].current).toBe(50);
        }
    });

    // KNOWN HAZARD (it.fails: passes while the hazard exists, and starts failing once it is fixed).
    // If the RSS code stamps meta.updated when it refreshes, a background refresh looks like the
    // newest edit and wins over real reading progress made earlier on another device.
    // Fix on the app side: don't touch meta.updated in the RSS refresh path.
    it.fails('a refresh that bumps meta.updated can overwrite a newer edit from another device', async () => {
        const { a, b, novels } = await syncedPair();

        b.edit(novels[0].id, h => { h.chapter.bookmarks['bm1'].current = 50; });
        await vi.advanceTimersByTimeAsync(1000);
        a.refreshRss(novels[0].id, { bumpUpdated: true });
        await settle();

        for (const dev of [a, b]) {
            expect(dev.db.get(novels[0].id)!.chapter.bookmarks['bm1'].current).toBe(50);
        }
    });
});