// must be a self-contained IIFE bundle — no imports allowed

// ============================================================
// Types
// ============================================================

type RawFeed = {
    title: string;
    url: string;
    domain: string;
    lastFetched: string;
    lastBuildDate: string;
    image: string;
    items: FeedItem[];
    lastToken: string | null;
};

type FeedItem = {
    title: string;
    link: string;
    pubDate: Date;
    guid: string;
};

// ============================================================
// Globals
// ============================================================

declare const browser: typeof chrome | undefined;
const ext: typeof chrome = (browser ?? chrome);

// ============================================================
// Entry point
// ============================================================

addFeedToGlobalMain();

// ============================================================
// Detection
// ============================================================

async function getRssFeedsInHead(): Promise<Partial<RawFeed>[]> {
    const rssLinks = [
        ...document.querySelectorAll(
            'link[rel="alternate"][type="application/rss+xml"], link[rel="alternate"][type="application/atom+xml"]'
        )
    ];
    return rssLinks.map(link => ({
        title: link.getAttribute('title') || document.title,
        url: new URL(link.getAttribute('href') || '', location.origin).href
    }));
}

async function getRssFeedsInBody(feeds: Partial<RawFeed>[]): Promise<Partial<RawFeed>[]> {
    const existing = new Set(feeds.map(f => f.url));
    const anchorCandidates = [...document.querySelectorAll<HTMLAnchorElement>('a[href*="rss"], a[href*="feed"], a[href$=".xml"]')];

    for (const a of anchorCandidates) {
        const text = (a.textContent || '').toLowerCase();
        const href = a.getAttribute('href');
        if (!href) continue;

        const isRssLike =
            text.includes('rss') ||
            text.includes('feed') ||
            /\/(rss|feed|atom)(\.xml)?$/i.test(href);

        if (!isRssLike) continue;

        const fullUrl = new URL(href, location.origin).href;
        if (!existing.has(fullUrl)) {
            existing.add(fullUrl);
            feeds.push({
                title: a.textContent?.trim() || document.title,
                url: fullUrl
            });
        }
    }

    return feeds;
}

/**
 * Only called if head + body detection found nothing.
 * Probes common RSS paths — avoids unnecessary network requests on every page.
 */
async function getRssFeedsFromDefaultPaths(feeds: Partial<RawFeed>[]): Promise<Partial<RawFeed>[]> {
    if (feeds.length > 0) return feeds; // ← skip if we already found something

    const possiblePaths = ['/feed', '/rss', '/atom.xml', '/rss.xml'];
    const existing = new Set(feeds.map(f => f.url));

    for (const path of possiblePaths) {
        const testUrl = new URL(path, location.origin).href;
        if (existing.has(testUrl)) continue;

        try {
            const response = await fetch(testUrl, { method: 'HEAD' });
            const contentType = response.headers.get('Content-Type') || '';
            if (response.ok && contentType.includes('xml')) {
                console.log('[Hermidata] Found RSS feed at default path:', testUrl);
                feeds.push({ title: document.title, url: testUrl });
                break; // one is enough
            }
        } catch {
            // CORS / 404 — expected, ignore
        }
    }

    return feeds;
}

// ============================================================
// Fetch + parse
// ============================================================

async function fetchAndParseRSS(feedUrl: string): Promise<[FeedItem[], string | null, string | null]> {
    const response = await fetch(feedUrl);
    if (!response.ok) throw new Error(`Feed fetch failed: ${feedUrl} (${response.status})`);

    const text = await response.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'text/xml');

    if (xml.querySelector('parsererror')) {
        throw new Error(`XML parse error for feed: ${feedUrl}`);
    }

    const items: FeedItem[] = [...xml.querySelectorAll('item, entry')].slice(0, 10).map(item => ({
        title: item.querySelector('title')?.textContent?.trim() ?? '',
        link: (
            item.querySelector('link')?.getAttribute('href') ??
            item.querySelector('link')?.textContent ??
            ''
        ).trim(),
        pubDate: new Date(item.querySelector('pubDate, updated, published')?.textContent ?? Date.now()),
        guid: (
            item.querySelector('guid')?.textContent ??
            item.querySelector('id')?.textContent ??
            item.querySelector('link')?.textContent ??
            ''
        )
    }));

    const lastBuildDate = xml.querySelector('lastBuildDate, updated')?.textContent ?? null;
    const image = xml.querySelector('image > url')?.textContent ?? null;

    return [items, lastBuildDate, image];
}

function normalizeFeedData(feed: Partial<RawFeed>): Partial<RawFeed> {
    if (!feed.url || !feed.title) throw new Error(`Feed missing url or title: ${JSON.stringify(feed)}`);
    const domain = new URL(feed.url).hostname.replace(/^www\./, '');
    return {
        title: feed.title.trim(),
        url: feed.url,
        domain,
        items: [],
        lastToken: null
    };
}

async function buildFullFeed(partial: Partial<RawFeed>): Promise<RawFeed | null> {
    if (!partial.url) return null;
    try {
        const [items, lastBuildDate, image] = await fetchAndParseRSS(partial.url);
        return {
            ...partial,
            items,
            lastBuildDate: lastBuildDate ?? new Date().toISOString(),
            image: image ?? '',
            lastFetched: new Date().toISOString(),
            lastToken: null,
        } as RawFeed;
    } catch (err) {
        console.warn(`[Hermidata] Failed to fetch feed ${partial.url}:`, err);
        return null;
    }
}

// ============================================================
// Storage — content scripts can't use IndexedDB directly
// so we message the background to handle writes
// ============================================================

async function saveFeeds(feeds: RawFeed[]): Promise<void> {
    if (!feeds.length) return;

    try {
        // Send to background which writes to IndexedDB
        ext.runtime.sendMessage({
            type: 'SAVE_RAW_FEEDS',
            data: feeds
        });
        console.log(`[Hermidata] Sent ${feeds.length} feed(s) to background for saving`);
    } catch (err) {
        console.error('[Hermidata] Failed to send feeds to background:', err);
    }
}

// ============================================================
// Main
// ============================================================

async function addFeedToGlobalMain(): Promise<void> {
    try {
        console.log('[Hermidata] content.ts loaded on', location.href);

        // 1. Head detection (cheapest — no network)
        let partials: Partial<RawFeed>[] = await getRssFeedsInHead();

        // 2. Body link detection (no network)
        partials = await getRssFeedsInBody(partials);

        // 3. Default path probing (network, only if nothing found yet)
        partials = await getRssFeedsFromDefaultPaths(partials);

        if (!partials.length) {
            console.log('[Hermidata] No RSS feeds detected on this page');
            return;
        }

        console.log(`[Hermidata] Detected ${partials.length} possible RSS feed(s):`, partials.map(f => f.url));

        // 4. Normalize metadata (no network)
        const normalized = partials
            .map(f => { try { return normalizeFeedData(f) } catch { return null } })
            .filter(Boolean) as Partial<RawFeed>[];

        // 5. Fetch all feeds in parallel (network)
        const results = await Promise.allSettled(normalized.map(f => buildFullFeed(f)));

        const feeds: RawFeed[] = results
            .filter((r): r is PromiseFulfilledResult<RawFeed> => r.status === 'fulfilled' && r.value !== null)
            .map(r => r.value);

        if (!feeds.length) {
            console.warn('[Hermidata] No feeds successfully fetched');
            return;
        }

        console.log(`[Hermidata] Successfully built ${feeds.length} feed(s)`);

        // 6. Send to background for storage
        await saveFeeds(feeds);

    } catch (err) {
        console.error('[Hermidata] addFeedToGlobalMain failed:', err);
    }
}