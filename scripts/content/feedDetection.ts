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

/// <reference types="firefox-webext-browser" />
declare const browser: typeof chrome | typeof globalThis.browser


export const ext: typeof chrome = (browser as typeof chrome) ?? chrome;


export class FeedDetection {

    public async addFeedToGlobalMain(): Promise<void> {
        try {
            console.log('[Hermidata] content.ts loaded on', location.href);
    
            // 1. Head detection (cheapest — no network)
            let partials: Partial<RawScrappedFeed>[] = await this.getRssFeedsInHead();
    
            // 2. Body link detection (no network)
            partials = await this.getRssFeedsInBody(partials);
    
            // 3. Default path probing (network, only if nothing found yet)
            partials = await this.getRssFeedsFromDefaultPaths(partials);
    
            if (!partials.length) {
                console.log('[Hermidata] No RSS feeds detected on this page');
                return;
            }
    
            console.log(`[Hermidata] Detected ${partials.length} possible RSS feed(s):`, partials.map(f => f.url));
    
            // 4. Normalize metadata (no network)
            const normalized = partials
                .map(f => { try { return this.normalizeFeedData(f) } catch { return null } })
                .filter(Boolean) as Partial<RawScrappedFeed>[];
    
            // 5. Fetch all feeds in parallel (network)
            const results = await Promise.allSettled(normalized.map(f => this.buildFullFeed(f)));
    
            const feeds: RawScrappedFeed[] = results
                .filter((r): r is PromiseFulfilledResult<RawScrappedFeed> => r.status === 'fulfilled' && r.value !== null)
                .map(r => r.value);
    
            if (!feeds.length) {
                console.warn('[Hermidata] No feeds successfully fetched');
                return;
            }
    
            console.log(`[Hermidata] Successfully built ${feeds.length} feed(s)`);
    
            // 6. Send to background for storage
            await this.saveFeeds(feeds);
    
        } catch (err) {
            console.error('[Hermidata] addFeedToGlobalMain failed:', err);
        }
    }
    // ============================================================
    // Detection
    // ============================================================
    
    private async getRssFeedsInHead(): Promise<Partial<RawScrappedFeed>[]> {
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
    
    private async getRssFeedsInBody(feeds: Partial<RawScrappedFeed>[]): Promise<Partial<RawScrappedFeed>[]> {
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
    private async getRssFeedsFromDefaultPaths(feeds: Partial<RawScrappedFeed>[]): Promise<Partial<RawScrappedFeed>[]> {
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
    
    private async fetchAndParseRSS(feedUrl: string): Promise<[RawScrapedItem[], string | null, string | null]> {
        const response = await fetch(feedUrl);
        if (!response.ok) throw new Error(`Feed fetch failed: ${feedUrl} (${response.status})`);
    
        const text = await response.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'text/xml');
    
        if (xml.querySelector('parsererror')) {
            throw new Error(`XML parse error for feed: ${feedUrl}`);
        }
    
        const items: RawScrapedItem[] = [...xml.querySelectorAll('item, entry')].slice(0, 10).map(item => ({
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
    
    private normalizeFeedData(feed: Partial<RawScrappedFeed>): Partial<RawScrappedFeed> {
        if (!feed.url || !feed.title) throw new Error(`Feed missing url or title: ${JSON.stringify(feed)}`);
        const domain = new URL(feed.url).hostname.replace(/^www\./, '');
        return {
            title: feed.title.trim(),
            url: feed.url,
            domain,
        };
    }
    
    private async buildFullFeed(partial: Partial<RawScrappedFeed>): Promise<RawScrappedFeed | null> {
        if (!partial.url) return null;
        try {
            const [items, lastBuildDate, image] = await this.fetchAndParseRSS(partial.url);
            return {
                title: partial.title ?? "",
                url: partial.url,
                domain: partial.domain ?? new URL(partial.url).hostname.replace(/^www\./, ''),
                latestItem: items[0],
                lastBuildDateStr: lastBuildDate ?? new Date().toISOString(),
                image: image ?? '',
                lastFetched: new Date().toISOString(),
                lastToken: null,
            };
        } catch (err) {
            console.warn(`[Hermidata] Failed to fetch feed ${partial.url}:`, err);
            return null;
        }
    }
    
    // ============================================================
    // Storage — content scripts can't use IndexedDB directly
    // so we message the background to handle writes
    // ============================================================
    
    private async saveFeeds(feeds: RawScrappedFeed[]): Promise<void> {
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
}


