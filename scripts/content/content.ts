// must be a self-contained IIFE bundle

// --- Types ---
export type RawFeed = {
    title: string,
    url: string,
    domain: string,
    lastFetched: string,
    lastBuildDate: string,
    image: string,
    items: FeedItem[],
    lastToken: string | null
}
export type FeedItem = {
    title: string,
    link: string,
    pubDate: Date,
    guid: string
}
// --- Globals ---
declare const browser: typeof chrome | undefined;

const ext: typeof chrome = ( browser ?? chrome );



// content.js
await addFeedToGlobalMain();


async function getAllRawFeeds(): Promise<Record<string, RawFeed>> {
    return new Promise<Record<string, RawFeed>>((resolve, reject) => {
        ext.storage.local.get("savedFeeds", (result: { savedFeeds: Record<string, RawFeed> }) => {
            if (ext.runtime.lastError) return reject(new Error(ext.runtime.lastError?.message));
            resolve(result?.savedFeeds || {});
        });
    }).catch(error => {
        console.error('Extention error: Failed Premise savedFeeds: ',error);
        return {};
    })
}

async function getRssFeedsInHead(): Promise<Partial<RawFeed>[]> {
    const rssLinks = [...document.querySelectorAll('link[rel="alternate"][type="application/rss+xml"], link[rel="alternate"][type="application/atom+xml"]')];
    const feeds = rssLinks.map(link => ({
        title: link.getAttribute('title') || document.title,
        url: new URL(link.getAttribute('href') || '', location.origin).href
    }));

    return feeds;
}
async function getRssFeedsInBody(feeds: Partial<RawFeed>[]): Promise<Partial<RawFeed>[]> {
    const anchorCandidates = [...document.querySelectorAll('a[href*="rss"], a[href*="feed"], a[href$=".xml"]')];
    for (const a of anchorCandidates) {
        const text = (a.textContent || "").toLowerCase();
        const href = a.getAttribute("href");
        if (!href) continue;

        // If it *looks* like an RSS link based on text or href pattern
        if (text.includes("rss") || text.includes("feed") || new RegExp(/\/(rss|feed|atom)(\.xml)?$/i).exec(href)) {
            const fullUrl = new URL(href, location.origin).href;
            feeds.push({
                title: a.textContent.trim() || document.title,
                url: fullUrl
            });
        }
    }
    return feeds;
}
async function getRssFeedsFromDefaultPaths(feeds: Partial<RawFeed>[]): Promise<Partial<RawFeed>[]> {
    const possibleFeeds = ['/feed', '/rss', '/atom.xml', '/rss.xml'];
    for (const path of possibleFeeds) {
        const testUrl = new URL(path, location.origin).href;
        try {
            const response = await fetch(testUrl, { method: 'HEAD' });
            if (response.ok && response.headers.get('Content-Type')?.includes('xml')) {
                console.log('Found valid RSS feed at', testUrl);
                feeds.push({ title: document.title, url: testUrl });
                break;
            }
        } catch (err) {
            // ignore CORS/404
            console.warn('Error checking feed URL', testUrl, err);
        }
    }
    return feeds;
}

async function normalizeAndStoreFeeds(feeds: Partial<RawFeed>[]): Promise<RawFeed[]> {
    const partialFeeds: Partial<RawFeed>[] = feeds.map(feed => normalizeFeedData(feed));

    const GlobalFeeds: RawFeed[] = [];
    for (const partialFeed of partialFeeds) {
        const feed = await fetchSampleText(partialFeed);
        addFeedToGlobal(feed, GlobalFeeds);
    }

    return GlobalFeeds;

}
// --- Helper functions ---
function normalizeFeedData(feed: Partial<RawFeed>): Partial<RawFeed> {
    if (!feed.url || !feed.title) throw new Error('No URL or title');

    const domain = new URL(feed.url).hostname.replace(/^www\./, '');
    return {
        title: feed.title.trim(),
        url: feed.url,
        domain,
        items: [],
        lastToken: null
    };
}
async function fetchSampleText(feed: Partial<RawFeed>): Promise<RawFeed> {
    const ReturnError = (message: string) => { throw new Error(message) };

    if (!feed.url) throw new Error('No URL');

    const [items, lastBuildDate, image] = await fetchAndParseRSS(feed.url);
    feed.lastBuildDate = lastBuildDate ?? ReturnError('No lastBuildDate');
    feed.image = image  ?? ReturnError('No image');
    feed.items = items ?? ReturnError('No items');
    feed.lastFetched = new Date().toISOString();

    console.log(`Fetched ${items.length} items from ${feed.url}`);

    return feed as RawFeed;
}

async function fetchAndParseRSS(feedUrl: string): Promise<[FeedItem[], null | string, null | string]> {
    const response = await fetch(feedUrl);
    const text = await response.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, "text/xml");
    const items = [...xml.querySelectorAll("item")].map(item => ({
        title: item.querySelector("title")?.textContent ?? "",
        link: item.querySelector("link")?.textContent ?? "",
        pubDate: new Date(item.querySelector("pubDate")?.textContent ?? 0),
        guid: item.querySelector("guid")?.textContent ?? ""
    }));
    const lastBuildDate = xml.querySelector("lastBuildDate")?.textContent ?? null;
    const image = xml.querySelector("image > url")?.textContent ?? null;
    return [items, lastBuildDate, image];
}

function addFeedToGlobal(feed: RawFeed, globalArr: RawFeed[]) {
    if (!globalArr.some(f => f.url === feed.url)) {
        globalArr.push(feed);
    }
}

async function saveFeeds(GlobalFeeds: RawFeed[]) {
    const savedFeeds = await getAllRawFeeds().catch(error => { console.error('Extention error: Failed Premise savedFeeds: ',error); return {}; }) as Record<string, RawFeed>;

    const combined: RawFeed[] = Object.values(savedFeeds);
    for (const feed of GlobalFeeds) {
        console.log(`[Hermidata] Checking feed: ${feed.title}`);
        const existingIndex = combined.findIndex(f => f.url === feed.url);
        console.log(`[Hermidata] existingIndex: ${existingIndex}`);
        if (existingIndex === -1) combined.push(feed);
        else {
            // Existing feed → update if newer
            const existing = combined[existingIndex];
            if ((feed.lastFetched || 0) > (existing.lastFetched || 0)) {
                combined[existingIndex] = { ...existing, ...feed };
                console.log(`[Hermidata] Updated feed: ${feed.title}`);
            }
        }
    }
    ext.storage.local.set({ savedFeeds: combined }).then(() => {
        console.log(`[Hermidata] ${GlobalFeeds.length} feeds saved to local storage`);
    });
}



async function addFeedToGlobalMain() {
    try {
        console.log("[Hermidata] content.js loaded on", globalThis.location.href);

        // --- 1. Detect RSS <link rel="alternate"> in head ---
        let feeds: Partial<RawFeed>[] = await getRssFeedsInHead();
        
        // --- 2. Detect RSS-looking <a> links in body ---
        feeds = await getRssFeedsInBody(feeds);


        console.log('Detected possible RSS links:', feeds);
        // --- 3. Try common default paths ---
        feeds = await getRssFeedsFromDefaultPaths(feeds);
        
        // --- 4. Normalize & store ---
        const GlobalFeeds: RawFeed[] = await normalizeAndStoreFeeds(feeds);

        // --- 5. Fetch sample items ---
        for (const feed of GlobalFeeds) fetchSampleText(feed);

        console.log('Final GlobalFeeds:', GlobalFeeds);

        // Save all found feeds to local storage
        await saveFeeds(GlobalFeeds);

    } catch (err) {
        console.error(err);
    };
}

