import { ext } from "../shared/BrowserCompat";
import type { Feed, FeedItem, RawFeed, Hermidata } from "../shared/types/index";
import { getAllHermidata, getAllRawFeeds, saveHermidataV3, setAllRawFeeds } from "../shared/db/Storage";
import { allHermidataCashed, setState } from "./state";
import { TrimTitle } from "../shared/StringOutput";

/** HTTP response metadata used to detect feed changes */
type Meta = {
    etag: string | null;
    lastModified: string | null;
};

/** Rate limit tracking for per-feed throttling on 429 errors */
type RateLimitStatus = {
    count: number; // Number of 429 errors encountered
    cooldownUntil: number; // Timestamp when cooldown expires
};

/** Storage key for rate limit tracking */
const RATE_LIMIT_STORAGE_KEY = "feedRateLimits";
/** Error count threshold before triggering cooldown */
const RATE_LIMIT_THRESHOLD = 5;
/** Cooldown duration in milliseconds (30 minutes for AWS standard reset) */
const RATE_LIMIT_COOLDOWN_MS = 30 * 60 * 1000;

/**
 * Initialize the feed checking system.
 * Starts a background interval that checks feeds for updates every 30 minutes.
 */
export function initFeeds() {
    setInterval(checkFeedsForUpdates, 30 * 60 * 1000);
}

/**
 * Main feed checking routine.
 * Performs a web search for new feeds, then checks all saved feeds for updates.
 * Updates are detected via HTTP headers (ETag, Last-Modified) and content hashing.
 * Respects rate limiting by skipping feeds in cooldown period.
 */
export async function checkFeedsForUpdates() {
    try {
        await webSearch();
        const savedFeeds = await getAllRawFeeds();
        const allHermidata = await getAllHermidata();

        if (Object.keys(allHermidata).length === 0) {
            console.log("[Hermidata] No Hermidata entries found, skipping feed check.");
            return;
        }

        for (const feed of Object.values(savedFeeds)) {
            try {
                if (shouldSkipFeed(feed, allHermidata)) continue;

                // Skip feed if it's currently rate-limited
                if (isRateLimited(feed.url)) {
                    console.log(`[Hermidata] Feed ${feed.title} is rate-limited, skipping until cooldown expires.`);
                    continue;
                }

                // Try to get HEAD metadata (ETag, Last-Modified)
                const meta = await fetchFeedHead(feed);
                if (isFeedUnchanged(feed, meta)) {
                    continue;
                }

                // Fetch the full feed
                const text = await fetchFeedText(feed);
                if (!text) continue;

                // Detect content changes via token or hash
                if (!await hasFeedChanged(feed, text)) {
                    continue;
                }

                // Parse and handle feed contents
                const xml = parseXmlSafely(text, feed.title);
                const items = parseItems(xml, feed.title);
                compareLastSeen(items, feed);

                // Save metadata
                saveFeedMetaData(feed, meta);
                
                // Reset rate limit counter on successful fetch
                resetRateLimitCounter(feed.url);

            } catch (err) {
                console.error(`[Hermidata] [✕] Failed to check feed ${feed.url}:`, err);
            }
        }

        setState.lastAutoFeedCheck(Date.now());
        await setAllRawFeeds(Object.values(savedFeeds));
        await ext.storage.local.set({ savedFeeds });
    } catch (err) {
        console.error(`[Hermidata] [✕] Failed to check feeds:`, err);
    }
}

/**
 * Searches all configured RSS feeds and updates the combined feed list.
 * Fetches feeds from Hermidata entries, parses them, and updates local storage.
 * Also updates Hermidata with the latest fetch metadata.
 */
async function webSearch() {
    const savedFeeds = await getAllRawFeeds();
    const allHermidata = await getAllHermidata();
    const allnovelRSS = Object.values(allHermidata).map(novel => novel?.rss).filter(Boolean);

    console.groupCollapsed(`[Hermidata] Web search - total RSS feeds to check: ${allnovelRSS.length}`);

    const combined = Object.values(savedFeeds) ?? [];

    for (const novel of allnovelRSS) {
        if (!novel) continue;
        if (!novel.domain || !novel.latestItem?.title || !novel.url) {
            console.groupEnd();
            continue;
        }
        console.groupCollapsed(`[Hermidata] Web search for ${novel.latestItem?.title} in ${novel.domain}`);

        // get the rss feed text
        const feedText = await fetchFeedText(novel);
        if (!feedText) {
            console.warn("No feed text found:", novel.url);
            console.groupEnd();
            continue;
        }

        // get the latest token
        const token = getFeedLatestToken(feedText);
        if (!token) {
            console.warn("No token for feed:", novel.url);
            console.groupEnd();
            continue;
        }
        console.log(`[Hermidata] Latest token: ${token}`);

        // get the items
        const xml = parseXmlSafely(feedText, novel.latestItem?.title);
        const items: FeedItem[] = parseItems(xml, novel.latestItem?.title);
        if (!items.length) {
            console.warn("No items found in feed:", novel.url);
            console.groupEnd();
            continue;
        }

        const newFeed: RawFeed = {
            title: TrimTitle.trimTitle(novel.latestItem?.title, novel.url).title,
            url: novel.url,
            domain: novel.domain,
            lastFetched: new Date().toISOString(),
            lastBuildDate: novel.lastBuildDate ?? new Date(),
            image: novel.image || "",
            items: items,
            lastToken: token,
        };

        console.log(`[Hermidata] Adding feed title: ${items[0].title}`);

        const existingIndex = combined.findIndex(f => f.url === newFeed.url && f.url !== undefined);
        console.log(`[Hermidata] existingIndex: ${existingIndex}`);
        if (existingIndex === -1) {
            combined.push(newFeed);
            console.log(`[Hermidata] New feed added: ${newFeed.items[0].title}`);
        } else {
            // Existing feed → update if newer
            const existing = combined[existingIndex];
            console.log(`[Hermidata] Existing feed found: ${existing.items[0].title}`);
            console.log(`[Hermidata] Existing feed lastFetched: ${existing.lastFetched}, New feed lastFetched: ${newFeed.lastFetched}`);
            if (newFeed.lastFetched > existing.lastFetched) {
                combined[existingIndex] = { ...existing, ...newFeed };
                console.log(`[Hermidata] Updated feed: ${newFeed.items[0].title}`);
            }
        }

        console.groupEnd();
    }

    await ext.storage.local.set({ savedFeeds: combined });
    console.log(`[Hermidata] ${combined.length} feeds saved to local storage`);

    const HermidataToUpdate: Record<string, Hermidata> = {};
    for (const feed of combined) {
        const related = Object.values(allHermidata).find(h => h.rss?.url === feed.url);
        if (related?.rss) {
            related.rss.lastFetched = feed.lastFetched;
            related.rss.latestItem = feed.items[0];
            HermidataToUpdate[related.id] = related;
        }
    }
    for (const [key, value] of Object.entries(HermidataToUpdate)) {
        await saveHermidataV3(key, value);
    }

    console.groupEnd();
}
/**
 * Checks if a feed should be skipped during processing.
 * A feed is skipped if it's not associated with any Hermidata entry.
 */
function shouldSkipFeed(feed: RawFeed, allHermidata: Record<string, Hermidata>) {
    const novel = Object.values(allHermidata).find(novel => novel?.rss?.url === feed.url);
    return novel === undefined;
}

// ===== Rate Limiting Helpers =====

/**
 * Checks if a feed is currently under rate-limit cooldown.
 * Returns true if the feed has exceeded the error threshold and cooldown hasn't expired.
 */
function isRateLimited(feedUrl: string): boolean {
    const status = getRateLimitStatus(feedUrl);
    if (status.count < RATE_LIMIT_THRESHOLD) {
        return false;
    }
    const now = Date.now();
    return now < status.cooldownUntil;
}

/**
 * Retrieves the current rate-limit status for a feed.
 * Returns default values if feed has no recorded issues.
 */
function getRateLimitStatus(feedUrl: string): RateLimitStatus {
    try {
        const storage = localStorage.getItem(RATE_LIMIT_STORAGE_KEY);
        if (!storage) return { count: 0, cooldownUntil: 0 };

        const rateLimits = JSON.parse(storage) as Record<string, RateLimitStatus>;
        return rateLimits[feedUrl] || { count: 0, cooldownUntil: 0 };
    } catch {
        return { count: 0, cooldownUntil: 0 };
    }
}

/**
 * Updates the rate-limit status for a feed after encountering a 429 error.
 * Increments the error count and starts cooldown when threshold is reached.
 */
function incrementRateLimitCounter(feedUrl: string): void {
    try {
        const storage = localStorage.getItem(RATE_LIMIT_STORAGE_KEY);
        const rateLimits = storage ? JSON.parse(storage) : {};

        const status = rateLimits[feedUrl] || { count: 0, cooldownUntil: 0 };
        status.count += 1;

        // Activate cooldown when threshold is reached
        if (status.count >= RATE_LIMIT_THRESHOLD) {
            status.cooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
            console.warn(
                `[Hermidata] Feed ${feedUrl} hit rate limit threshold. ` +
                `Cooling down for ${RATE_LIMIT_COOLDOWN_MS / 1000 / 60} minutes.`
            );
        }

        rateLimits[feedUrl] = status;
        localStorage.setItem(RATE_LIMIT_STORAGE_KEY, JSON.stringify(rateLimits));
    } catch (err) {
        console.error("[Hermidata] Failed to update rate limit status:", err);
    }
}

/**
 * Resets the rate-limit counter for a feed after a successful fetch.
 * This allows the feed to be checked again without cooldown penalties.
 */
function resetRateLimitCounter(feedUrl: string): void {
    try {
        const storage = localStorage.getItem(RATE_LIMIT_STORAGE_KEY);
        if (!storage) return;

        const rateLimits = JSON.parse(storage) as Record<string, RateLimitStatus>;
        if (rateLimits[feedUrl]) {
            rateLimits[feedUrl] = { count: 0, cooldownUntil: 0 };
            localStorage.setItem(RATE_LIMIT_STORAGE_KEY, JSON.stringify(rateLimits));
            console.log(`[Hermidata] Reset rate limit counter for ${feedUrl}`);
        }
    } catch (err) {
        console.error("[Hermidata] Failed to reset rate limit counter:", err);
    }
}

/**
 * Computes SHA-1 hash of a string and returns it as a hex string.
 * Used as a fallback change detector when no token is available.
 */
async function sha1Hex(str: string) {
    const enc = new TextEncoder();
    const data = enc.encode(str);
    const hashBuffer = await crypto.subtle.digest("SHA-1", data);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Extracts a unique identifier token from the latest feed items.
 * Attempts multiple fallbacks: guid, id, link, pubDate, or title.
 * This token is used to detect if the feed has new content.
 */
function getFeedLatestToken(xmlText: string) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlText, "text/xml");
        const items = [...doc.querySelectorAll("item, entry")].slice(0, 2);
        if (items.length === 0) return null;

        const item = items[0];
        const guid = item.querySelector("guid")?.textContent?.trim();
        if (guid) return `guid:${guid}`;
        const id = item.querySelector("id")?.textContent?.trim();
        if (id) return `id:${id}`;

        const linkEl = item.querySelector("link");
        const href = linkEl?.getAttribute?.("href");
        if (href) return `link:${href}`;
        const linkText = linkEl?.textContent?.trim();
        if (linkText) return `link:${linkText}`;

        const pub = item.querySelector("pubDate, updated, published")?.textContent?.trim();
        if (pub) return `pub:${pub}`;

        const title = item.querySelector("title")?.textContent?.trim();
        if (title) return `title:${title}`;

        return null;
    } catch (e) {
        console.warn("[Hermidata] XML parse error:", e);
        return null;
    }
}


/**
 * Fetches HTTP response headers from a feed URL using a HEAD request.
 * Returns ETag and Last-Modified headers if available, which can be used
 * to detect if the feed has changed without downloading the full content.
 * Tracks 429 errors for rate-limit detection.
 */
async function fetchFeedHead(feed: RawFeed) {
    let meta: Meta = { etag: null, lastModified: null };
    try {
        const head = await fetch(feed.url, { method: "HEAD" });
        
        // Detect rate limiting response
        if (head.status === 429) {
            incrementRateLimitCounter(feed.url);
            console.warn(`[Hermidata] Feed ${feed.url} returned 429 Too Many Requests`);
            return meta;
        }
        
        if (head.ok) {
            meta.etag = head.headers.get("etag");
            meta.lastModified = head.headers.get("last-modified");
        } else {
            console.warn(`[Hermidata] HEAD not allowed for ${feed.domain} (${feed.title} | ${head.status}). Falling back to GET.`);
        }
    } catch {
        console.warn(`[Hermidata] HEAD failed for ${feed.title}, using GET fallback`);
    }
    return meta;
}
/**
 * Determines if a feed has changed by comparing HTTP metadata.
 * Checks both ETag (exact match) and Last-Modified date.
 * Returns true if feed appears unchanged.
 */
function isFeedUnchanged(feed: RawFeed, meta: Meta) {
    if (!meta.etag || !meta.lastModified) {
        return false;
    }

    // Check ETag first (most reliable)
    if (feed.lastToken === meta.etag) {
        return true;
    }

    // Fallback: compare modification date (day-level granularity)
    const lastModifiedDate = new Date(meta.lastModified);
    const feedBuildDate = feed.lastBuildDate instanceof Date
        ? feed.lastBuildDate
        : new Date(feed.lastBuildDate);

    return feedBuildDate.getTime() >= lastModifiedDate.getTime();
}
/**
 * Fetches the complete feed content as text.
 * Handles both RawFeed and Feed types.
 * Tracks 429 errors for rate-limit detection.
 */
async function fetchFeedText(feed: RawFeed | Feed) {
    const response = await fetch(feed.url);
    
    // Detect rate limiting response
    if (response.status === 429) {
        incrementRateLimitCounter(feed.url);
        console.warn(`[Hermidata] Feed ${feed.url} returned 429 Too Many Requests`);
        return null;
    }
    
    if (!response.ok) {
        console.warn(`[Hermidata] Feed GET failed: ${feed.url} (${response.status})`);
        return null;
    }
    return await response.text();
}
/**
 * Detects if feed content has changed since last check.
 * Primary method: compares unique token from latest items.
 * Fallback: SHA-1 hash of first 5KB if no token available.
 * Updates feed.lastToken on change for future comparisons.
 */
async function hasFeedChanged(feed: RawFeed, text: string) {
    const latestToken = getFeedLatestToken(text);
    let feedChanged = false;

    if (latestToken && feed.lastToken !== latestToken) {
        feedChanged = true;
        feed.lastToken = latestToken;
    } else if (!latestToken) {
        // fallback: hash of first 5KB
        const snippet = text.slice(0, 5000);
        const hash = await sha1Hex(snippet);
        if (feed.lastToken !== hash) {
            feedChanged = true;
            feed.lastToken = hash;
        }
    }

    return feedChanged;
}
/**
 * Parses XML feed content with fallback to HTML parsing.
 * If XML parsing produces errors, retries with HTML mode.
 */
function parseXmlSafely(text: string, title: string) {
    const parser = new DOMParser();
    let xml = parser.parseFromString(text, "text/xml");

    if (xml.querySelector("parsererror")) {
        console.warn(`[Hermidata] XML parsing failed for ${title}, falling back to text/html mode.`);
        xml = parser.parseFromString(text, "text/html");
    }

    return xml;
}

/**
 * Parses feed items (entries) from XML document.
 * Extracts title, link, pubDate, and guid from each item.
 * Limits results to first 10 items.
 */
function parseItems(xml: Document, title: string): FeedItem[] {
    const entries = [...xml.querySelectorAll("item, entry")];
    if (!entries.length) {
        console.warn(`[Hermidata] No <item> or <entry> elements found in ${title}.`);
        return [];
    }

    return entries.slice(0, 10).map(item => ({
        title: item.querySelector("title")?.textContent?.trim() ?? "",
        link: (
            item.querySelector("link")?.getAttribute?.("href") ??
            item.querySelector("link")?.textContent?.trim() ??
            ""
        ).trim(),
        pubDate: new Date(item.querySelector("pubDate, updated, published")?.textContent?.trim() ?? new Date().toISOString()),
        guid:
            item.querySelector("guid")?.textContent?.trim() ??
            item.querySelector("id")?.textContent?.trim() ??
            item.querySelector("link")?.textContent?.trim() ??
            ""
    }));
}

/**
 * Updates feed metadata with HTTP response headers and current timestamp.
 * Sets lastBuildDate from Last-Modified header if available.
 * Always updates lastFetched to current time.
 */
function saveFeedMetaData(feed: RawFeed, meta: Meta) {
    if (meta.lastModified) feed.lastBuildDate = new Date(meta.lastModified);
    feed.lastFetched = new Date().toISOString();
}

/**
 * Placeholder for feed item tracking logic.
 * TODO: Implement tracking of items seen by user to detect truly new items.
 * Currently a no-op as the original implementation was incomplete.
 */
function compareLastSeen(items: FeedItem[], feed: RawFeed) {
    // Implementation pending - would track which items user has already seen
    // to determine which items are actually new since last check
}

/**
 * Sends a browser notification to the user when new feed items are found.
 * Uses cached Hermidata if available, otherwise fetches from storage.
 */
async function notifyUser(feed: RawFeed, newItems: FeedItem[]) {
    const allHermidata = allHermidataCashed || await getAllHermidata();
    if (shouldSkipFeed(feed, allHermidata)) return;
    const title = `${feed.title}: ${newItems.length} new chapter${newItems.length > 1 ? "s" : ""}`;
    const message = newItems[0].title.concat("\n");
    ext.notifications.create({
        type: "basic",
        iconUrl: "assets/icon48.png",
        title,
        message
    });
}

/**
 * Returns the current date formatted as DD/MM/YYYY.
 */
export function getCurrentDate() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${day}/${month}/${year}`;
}