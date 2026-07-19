// must be a self-contained IIFE bundle — no imports allowed

// ============================================================
// Types
// ============================================================

type RawScrappedFeed = {
    title: string;
    url: string;
    domain: string;
    lastFetched: string;
    lastBuildDateStr: string;
    image: string;
    latestItem: RawScrapedItem;
    lastToken: string | null;
};

type RawScrapedItem  = {
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

async function getRssFeedsInHead(): Promise<Partial<RawScrappedFeed>[]> {
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

async function getRssFeedsInBody(feeds: Partial<RawScrappedFeed>[]): Promise<Partial<RawScrappedFeed>[]> {
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
async function getRssFeedsFromDefaultPaths(feeds: Partial<RawScrappedFeed>[]): Promise<Partial<RawScrappedFeed>[]> {
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


function normalizeFeedData(feed: Partial<RawScrappedFeed>): Partial<RawScrappedFeed> {
    if (!feed.url || !feed.title) throw new Error(`Feed missing url or title: ${JSON.stringify(feed)}`);
    const domain = new URL(feed.url).hostname.replace(/^www\./, '');
    return {
        title: feed.title.trim(),
        url: feed.url,
        domain,
    };
}

// ============================================================
// Main
// ============================================================

async function addFeedToGlobalMain(): Promise<void> {
    try {
        console.log('[Hermidata] content.ts loaded on', location.href);

        // 1. Head detection (cheapest — no network)
        let partials: Partial<RawScrappedFeed>[] = await getRssFeedsInHead();

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
            .filter(Boolean) as Partial<RawScrappedFeed>[];

        // 5. Send to background for fetching + parsing
        //    (background script handles CSP issues)
        ext.runtime.sendMessage({
            type: 'BUILD_AND_SAVE_FEEDS',
            data: normalized
        });

    } catch (err) {
        console.error('[Hermidata] addFeedToGlobalMain failed:', err);
    }
}