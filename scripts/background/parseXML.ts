import type { FeedItem } from "../shared/types";
import { getChapterFromTitle, returnHashedFeedId, TrimTitle } from "../shared/utils/StringOutput";

// A value that might come as a bare string, or as an object with #text (when it has attributes)
type TextOrObj = string | { "#text"?: string; };

interface AtomLink {
    "#text"?: string;
    "@_href"?: string;
    "@_rel"?: string;
}

interface FeedItemRaw {
    title?: string;
    link?: TextOrObj | AtomLink | AtomLink[];
    pubDate?: string;
    updated?: string;
    published?: string;
    guid?: TextOrObj;
    id?: string;
}

interface RssChannel {
    title?: string;
    item?: FeedItemRaw | FeedItemRaw[]; // <-- the key ambiguity
}

interface AtomFeedBody {
    entry?: FeedItemRaw | FeedItemRaw[];
    title?: string;
}

interface ParsedFeedDoc {
    rss?: { channel?: RssChannel; };  // RSS
    feed?: AtomFeedBody;    // Atom
}

// Always returns an array, whether input was undefined, a single object, or already an array
function toArray<T>(val: T | T[] | undefined): T[] {
    if (val === undefined) return [];
    return Array.isArray(val) ? val : [val];
}

// Pulls plain text out of a value that might be a string or a { "#text": ... } object
function textOf(val: TextOrObj | undefined): string {
    if (val === undefined) return "";
    if (typeof val === "string") return val;
    return typeof val["#text"] === "string" ? val["#text"] : "";
}

// Handles RSS <link>text</link> vs Atom <link href="..."/>
function linkOf(val: FeedItemRaw["link"]): string {
    if (val === undefined) return "";
    if (typeof val === "string") return val;
    if (Array.isArray(val)) {
        // Atom feeds can have multiple <link> tags; prefer rel="alternate" or the first with an href
        const withHref = val.find(l => l["@_href"]);
        return withHref?.["@_href"] ?? "";
    }
    // val is a single object: check each field's actual runtime type
    // if (typeof val["@_href"] === "string") return val["@_href"];
    if (typeof val["#text"] === "string") return val["#text"];
    return "";
}

export function parseItems(doc: ParsedFeedDoc, title: string): FeedItem | null {
    // Normalize RSS vs Atom into one flat list of raw items
    const rawEntries: FeedItemRaw[] = doc?.rss?.channel
        ? toArray(doc.rss.channel.item)
        : toArray(doc.feed?.entry);

    if (!rawEntries.length) {
        console.warn(`[Hermidata] No <item> or <entry> elements found in ${title}.`);
        return null;
    }

    const first = rawEntries[0];

    const rawTitle = first.title ?? title ?? "";
    const linkUrl = linkOf(first.link);
    const trimmedTitle = TrimTitle.trimTitle(rawTitle, linkUrl).title;

    const pubDateStr = first.pubDate ?? first.updated ?? first.published;
    const pubDate = new Date(pubDateStr ?? new Date().toISOString());

    const guid = textOf(first.guid) || first.id || linkUrl || "";

    return {
        id: returnHashedFeedId(trimmedTitle, linkUrl),
        rawTitle,
        chapter: getChapterFromTitle(rawTitle, linkUrl),
        title: trimmedTitle,
        link: linkUrl.trim(),
        pubDate,
        guid,
    };
}
export function getLatestToken(doc: ParsedFeedDoc, title: string): string | null {
    try {

        // Normalize RSS vs Atom into one flat list of raw items
        const rawEntries: FeedItemRaw[] = doc?.rss?.channel
            ? toArray(doc.rss.channel.item)
            : toArray(doc.feed?.entry);

        if (!rawEntries.length) {
            console.warn(`[Hermidata] No <item> or <entry> elements found in ${title}.`);
            return null;
        }

        // Prefer guid/id/link/pubDate/title — whichever exists first
        const first = rawEntries[0];

        if (first.guid) return `guid:${textOf(first.guid)}`;
        if (first.id) return `id:${first.id}`;

        const linkUrl = linkOf(first.link);
        if (linkUrl) return `link:${linkUrl}`;

        const pubDateStr = first.pubDate ?? first.updated ?? first.published;
        if (pubDateStr) return `pub:${pubDateStr}`;

        if (first.title) return `title:${first.title}`;

        return null;
    } catch (e) {
        console.warn("[Hermidata] XML parse error:", e);
        return null;
    }
}