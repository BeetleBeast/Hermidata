import { ext } from "../shared/BrowserCompat";
import type { Feed, FeedItem, RawFeed } from "../shared/types/rssType";
import { getAllHermidata, getAllRawFeeds } from "../shared/Storage";
import type { Hermidata } from "../shared/types/popupType";
import { allHermidataCashed, setState } from "./state";
import { TrimTitle } from "../shared/StringOutput";


type Meta = {
    etag: string | null;
    lastModified: string | null
}



export function initFeeds() {
    setInterval(checkFeedsForUpdates, 30 * 60 * 1000)
}

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

            } catch (err) {
                console.error(`[Hermidata] [✕] Failed to check feed ${feed.url}:`, err);
            }
        }

        setState.lastAutoFeedCkeck(Date.now());
        await ext.storage.local.set({ savedFeeds });
    } catch (err) {
        console.error(`[Hermidata] [✕] Failed to check feeds:`, err);
    }
}

async function webSearch() {
    // search the web for new releases

    // get the links to check
    const savedFeeds = await getAllRawFeeds();
    const allHermidata = await getAllHermidata();
    const allnovelRSS = Object.values(allHermidata).map(novel => novel?.rss).filter(Boolean);

    console.groupCollapsed(`[Hermidata] Web search - total RSS feeds to check: ${allnovelRSS.length}`);

    const combined = Object.values(savedFeeds)
    //const test = Object.values(savedFeeds).flatMap(f => f?.items).filter(Boolean);

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

        // check if the feed is already in savedFeeds via token
        // const existingFeed = savedFeeds.find(f => f.lastToken === token);
        // if (existingFeed?.items?.[0]?.title === items[0].title) {
        //     console.log(`[Hermidata] Feed already exists v1: ${existingFeed.items[0].title}`);
        //     console.log(`[Hermidata] Feed already exists v2: ${items[0].title}`);
        //     console.groupEnd();
        //     continue;
        // }
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
    ext.storage.local.set({ savedFeeds: combined }).then(() => {
        console.log(`[Hermidata] ${Object.keys(savedFeeds).length} feeds saved to local storage`);
    });
    
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
        await ext.storage.sync.set({ [key]: value });
    };

    console.groupEnd();
}
function shouldSkipFeed(feed: RawFeed, allHermidata: Record<string, Hermidata>) {
    const novel = Object.values(allHermidata).find(novel => novel?.rss?.url === feed.url);
    return novel === undefined;
}

// Helper: SHA-1 hash as hex
async function sha1Hex(str: string) {
    const enc = new TextEncoder();
    const data = enc.encode(str);
    const hashBuffer = await crypto.subtle.digest("SHA-1", data);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

// ==== feed helpers ====

// Helper: parse only the first 1–2 items
function getFeedLatestToken(xmlText: string) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlText, "text/xml");
        const items = [...doc.querySelectorAll("item, entry")].slice(0, 2); // Only first 2
        if (items.length === 0) return null;

        // Prefer guid/id/link/pubDate/title — whichever exists first
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


async function fetchFeedHead(feed: RawFeed) {
    
    let meta: Meta = { etag: null, lastModified: null };
    try {
        const head = await fetch(feed.url, { method: "HEAD" });
        if (head.ok) {
            meta.etag = head.headers.get("etag");
            meta.lastModified = head.headers.get("last-modified");
        } else {
        console.warn(`[Hermidata] HEAD not allowed for ${feed.domain} ( ${feed.title} | ${head.status} ). Falling back to GET.`);
    }
    } catch {
        console.warn(`[Hermidata] HEAD failed for ${feed.title}, using GET fallback`);
    }
    return meta;
}
function isFeedUnchanged(feed: RawFeed, meta: Meta) {
    return (
        meta.etag &&
        meta.lastModified &&
        feed.lastToken === meta.etag &&
        feed.lastBuildDate.getDate() === new Date(meta.lastModified).getDate() // FIXME: check this out, bullsh*t
    );
}
async function fetchFeedText(feed: RawFeed | Feed) {
    const response = await fetch(feed.url);
    if (!response.ok) {
        console.warn(`[Hermidata] Feed GET failed: ${feed.url} (${response.status})`);
        return null;
    }
    return await response.text();
}
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
function parseXmlSafely(text: string, title: string) {
    const parser = new DOMParser();
    let xml = parser.parseFromString(text, "text/xml");

    if (xml.querySelector("parsererror")) {
        console.warn(`[Hermidata] XML parsing failed for ${title}, falling back to text/html mode.`);
        xml = parser.parseFromString(text, "text/html");
    }

    return xml;
}

function parseItems(xml: Document, title: string): FeedItem[] {
    const entries = [...xml.querySelectorAll("item, entry")];
    if (!entries.length) {
        console.warn(`[Hermidata] No <item> or <entry> elements found in ${title}.`);
        return [];
    }
    
    return entries.slice(0, 10).map(item => ({
        title: item.querySelector("title")?.textContent.trim() ?? "",
        link: (
            item.querySelector("link")?.getAttribute?.("href") ??
            item.querySelector("link")?.textContent ??
            ""
        ).trim(),
        pubDate: new Date(item.querySelector("pubDate, updated, published")?.textContent.trim() ?? new Date().toISOString()),
        guid:
        item.querySelector("guid")?.textContent ??
        item.querySelector("id")?.textContent ??
        item.querySelector("link")?.textContent ??
        ""
    }));
}

function saveFeedMetaData(feed: RawFeed, meta: Meta) {
    if (meta.lastModified) feed.lastBuildDate = new Date(meta.lastModified);
    feed.lastFetched = new Date().toISOString();
}

function compareLastSeen(items: FeedItem[], feed: RawFeed) {
    if (!items.length) return feed;
    // FIXME: this was bullsh*t redo it
    /*
    const latest = items[0];
    if (latest.guid !== feed.lastToken || latest.pubDate !== feed.lastBuildDate) {
        const newCount = items.findIndex(i => i.guid === feed.lastSeenGuid && i.pubDate === feed.lastSeenDate);
        const newItems = newCount === -1 ? items : items.slice(0, newCount);
        notifyUser(feed, newItems);

        const Foo = latest.pubDate;
    }
    */

    return feed;
}

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

export function getCurrentDate() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${day}/${month}/${year}`;
}