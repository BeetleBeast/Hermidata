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

/** Domain restrictions tracking (no-HEAD or no-requests) */
type DomainRestriction = {
    domain: string;
    type: "normal" | "no-head" | "no-requests"; // restriction type
    since: number; // timestamp when restriction was set
};

/** Feed validation result with error details */
type FeedValidationResult = {
    valid: boolean;
    errors: string[]; // List of validation errors
    itemsValidated: number;
};

/** Storage key for rate limit tracking */
const RATE_LIMIT_STORAGE_KEY = "feedRateLimits";
/** Error count threshold before triggering cooldown */
const RATE_LIMIT_THRESHOLD = 5;
/** Cooldown duration in milliseconds (30 minutes for AWS standard reset) */
const RATE_LIMIT_COOLDOWN_MS = 30 * 60 * 1000;

/** Storage key for domain restrictions */
const DOMAIN_RESTRICTIONS_KEY = "domainRestrictions";
/** Storage key for feed validation history */
const FEED_VALIDATION_LOG_KEY = "feedValidationLog";

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
 * Filters feeds by domain - only processes feeds from followed websites.
 * Validates feed content for malformed data.
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

                // Skip feed if domain is not in followed list
                if (!isFollowedDomain(feed.domain, allHermidata)) {
                    console.log(`[Hermidata] Domain ${feed.domain} is not in followed sites, skipping feed ${feed.title}.`);
                    continue;
                }

                // Skip if domain is fully restricted from requests
                if (isDomainRestricted(feed.domain, "no-requests")) {
                    console.log(`[Hermidata] Domain ${feed.domain} is blocked from requests, skipping feed ${feed.title}.`);
                    continue;
                }

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

                // Parse and validate feed content
                const xml = parseXmlSafely(text, feed.title);
                const items = parseItems(xml, feed.title);
                
                // Validate feed items before processing
                const validationResult = validateFeedItems(items, feed.url);
                if (!validationResult.valid) {
                    console.warn(
                        `[Hermidata] Feed ${feed.url} failed validation: ${validationResult.errors.join(", ")}`
                    );
                    logFeedValidation(feed.url, false, validationResult.errors);
                    continue;
                }
                
                logFeedValidation(feed.url, true, []);
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

// ===== Domain Filtering Helpers =====

/**
 * Checks if a domain is in the user's followed websites list.
 * A domain is considered followed if it has any Hermidata entry.
 * Compares feed domain against all Hermidata domains.
 */
function isFollowedDomain(feedDomain: string, allHermidata: Record<string, Hermidata>): boolean {
    return Object.values(allHermidata).some(entry => {
        const entryDomain = entry?.rss?.domain || entry?.url?.split("/")[2];
        return entryDomain && entryDomain.toLowerCase() === feedDomain.toLowerCase();
    });
}

/**
 * Checks if a domain has restrictions (no HEAD requests or no requests at all).
 * Returns true if the domain has the specified restriction type.
 */
function isDomainRestricted(domain: string, restrictionType: "no-head" | "no-requests"): boolean {
    const restriction = getDomainRestriction(domain);
    return restriction.type === restrictionType;
}

/**
 * Retrieves domain restriction data from localStorage.
 * Returns "normal" if no restriction exists.
 */
function getDomainRestriction(domain: string): DomainRestriction {
    try {
        const storage = localStorage.getItem(DOMAIN_RESTRICTIONS_KEY);
        if (!storage) return { domain, type: "normal", since: 0 };

        const restrictions = JSON.parse(storage) as Record<string, DomainRestriction>;
        return restrictions[domain] || { domain, type: "normal", since: 0 };
    } catch {
        return { domain, type: "normal", since: 0 };
    }
}

/**
 * Marks a domain as restricted in localStorage.
 * Call when a domain fails HEAD request or refuses all requests.
 * Types: "no-head" (skip HEAD, use GET only) or "no-requests" (don't fetch at all)
 */
function setDomainRestriction(domain: string, restrictionType: "no-head" | "no-requests"): void {
    try {
        const storage = localStorage.getItem(DOMAIN_RESTRICTIONS_KEY);
        const restrictions = storage ? JSON.parse(storage) : {};

        restrictions[domain] = {
            domain,
            type: restrictionType,
            since: Date.now()
        };

        localStorage.setItem(DOMAIN_RESTRICTIONS_KEY, JSON.stringify(restrictions));
        console.log(`[Hermidata] Marked domain ${domain} as ${restrictionType}`);
    } catch (err) {
        console.error("[Hermidata] Failed to set domain restriction:", err);
    }
}

// ===== Feed Validation Helpers =====

/**
 * Validates feed items for required fields and data integrity.
 * Checks each item for title, link, pubDate, and guid.
 * Returns validation result with list of errors.
 */
function validateFeedItems(items: FeedItem[], feedUrl: string): FeedValidationResult {
    const errors: string[] = [];
    let validCount = 0;

    if (!items || items.length === 0) {
        return {
            valid: false,
            errors: ["No items found in feed"],
            itemsValidated: 0
        };
    }

    items.forEach((item, index) => {
        const itemErrors: string[] = [];

        // Check required fields
        if (!item.title || item.title.trim().length === 0) {
            itemErrors.push(`Item ${index}: missing or empty title`);
        }
        if (!item.link || item.link.trim().length === 0) {
            itemErrors.push(`Item ${index}: missing or empty link`);
        }
        if (!item.pubDate || !(item.pubDate instanceof Date) || isNaN(item.pubDate.getTime())) {
            itemErrors.push(`Item ${index}: missing or invalid pubDate`);
        }
        if (!item.guid || item.guid.trim().length === 0) {
            itemErrors.push(`Item ${index}: missing or empty guid`);
        }

        if (itemErrors.length === 0) {
            validCount++;
        } else {
            errors.push(...itemErrors);
        }
    });

    const valid = errors.length === 0;
    if (!valid) {
        console.warn(`[Hermidata] Feed validation errors for ${feedUrl}: ${validCount}/${items.length} items valid`);
    }

    return {
        valid,
        errors,
        itemsValidated: validCount
    };
}

/**
 * Validates XML feed structure for well-formedness.
 * Checks for parser errors and required root elements.
 * Returns true if XML is valid and parseable.
 */
function validateXmlStructure(xml: Document): boolean {
    // Check for parser errors
    if (xml.querySelector("parsererror")) {
        return false;
    }

    // Check for required feed elements
    const hasFeedElements = xml.querySelectorAll("item, entry").length > 0;
    return hasFeedElements;
}

/**
 * Logs feed validation result to localStorage for history and debugging.
 * Tracks whether feed passed validation and any errors encountered.
 */
function logFeedValidation(feedUrl: string, valid: boolean, errors: string[]): void {
    try {
        const storage = localStorage.getItem(FEED_VALIDATION_LOG_KEY);
        const log = storage ? JSON.parse(storage) : {};

        log[feedUrl] = {
            lastValidation: Date.now(),
            valid,
            errors,
            validationCount: (log[feedUrl]?.validationCount || 0) + 1
        };

        localStorage.setItem(FEED_VALIDATION_LOG_KEY, JSON.stringify(log));
    } catch (err) {
        console.error("[Hermidata] Failed to log feed validation:", err);
    }
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
 * Skips HEAD request if domain has "no-head" restriction.
 */
async function fetchFeedHead(feed: RawFeed) {
    let meta: Meta = { etag: null, lastModified: null };
    
    // Skip HEAD request if domain is restricted
    if (isDomainRestricted(feed.domain, "no-head")) {
        console.log(`[Hermidata] Skipping HEAD request for ${feed.domain} (restricted), will use GET only.`);
        return meta;
    }
    
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
        } else if (head.status === 405 || head.status === 403) {
            // 405 Method Not Allowed, 403 Forbidden - mark domain as no-head
            setDomainRestriction(feed.domain, "no-head");
            console.warn(`[Hermidata] Domain ${feed.domain} doesn't allow HEAD requests, marked for future requests.`);
        } else {
            console.warn(`[Hermidata] HEAD not allowed for ${feed.domain} (${feed.title} | ${head.status}). Falling back to GET.`);
        }
    } catch (err) {
        console.warn(`[Hermidata] HEAD failed for ${feed.title}, using GET fallback. Error: ${err}`);
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