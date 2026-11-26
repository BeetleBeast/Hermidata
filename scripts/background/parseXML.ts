import { XMLParser } from 'fast-xml-parser';
import type { FeedItem, FeedExtras, FeedChannelInfo } from "../shared/types";
import { getChapterFromTitle, generateRssFeedId, TrimTitle } from "../shared/utils/StringOutput";

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
    author?: TextOrObj | { name?: string };
    "dc:creator"?: TextOrObj;
    category?: TextOrObj | { "@_term"?: string } | (TextOrObj | { "@_term"?: string })[];
    enclosure?: { "@_url"?: string; "@_type"?: string };
    "media:thumbnail"?: { "@_url"?: string };
    "media:content"?: { "@_url"?: string };
}

interface RssChannel {
    title?: string;
    link?: FeedItemRaw["link"];
    lastBuildDate?: string;
    image?: { url?: string };
    item?: FeedItemRaw | FeedItemRaw[]; // <-- the key ambiguity
}

interface AtomFeedBody {
    entry?: FeedItemRaw | FeedItemRaw[];
    title?: string;
    link?: AtomLink | AtomLink[];
    updated?: string;
    logo?: string;
    icon?: string;
}

interface RdfBody {
    channel?: RssChannel;
    item?: FeedItemRaw | FeedItemRaw[]; // RSS 1.0 puts the items next to the channel
}

interface ParsedFeedDoc {
    rss?: { channel?: RssChannel; };  // RSS 2.0
    feed?: AtomFeedBody;    // Atom
    "rdf:RDF"?: RdfBody;    // RSS 1.0
}

/** Parses feed XML; null when the text is not an RSS, Atom or RDF document */
export function parseFeedXml(text: string): ParsedFeedDoc | null {
    try {
        const doc = new XMLParser({ ignoreAttributes: false }).parse(text) as ParsedFeedDoc;
        return doc?.rss || doc?.feed || doc?.["rdf:RDF"] ? doc : null;
    } catch {
        return null;
    }
}

/** RSS, Atom and RDF items as one flat list, newest first ( as the feed lists them ) */
function entriesOf(doc: ParsedFeedDoc): FeedItemRaw[] {
    if (doc?.rss?.channel) return toArray(doc.rss.channel.item);
    if (doc?.feed) return toArray(doc.feed.entry);
    return toArray(doc?.["rdf:RDF"]?.item);
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

/** The site page a channel points to: RSS <link>text</link>, or Atom's rel="alternate" link */
function pageLinkOf(val: FeedItemRaw["link"]): string {
    if (val === undefined) return "";
    if (typeof val === "string") return val.trim();
    const links: AtomLink[] = Array.isArray(val) ? val : [val as AtomLink]; // { "#text" } is an AtomLink without attributes
    const page = links.find(l => l["@_href"] && (!l["@_rel"] || l["@_rel"] === "alternate"));
    return (page?.["@_href"] ?? textOf(links[0]) ?? "").trim();
}

/** Link, image and build date of the feed itself */
export function parseChannelInfo(doc: ParsedFeedDoc): FeedChannelInfo {
    const channel = doc?.rss?.channel ?? doc?.["rdf:RDF"]?.channel;
    const atom = doc?.feed;
    const built = channel?.lastBuildDate ?? atom?.updated;
    const date = built ? new Date(built) : null;
    return {
        link: pageLinkOf(channel?.link ?? atom?.link),
        image: (channel?.image?.url ?? atom?.logo ?? atom?.icon ?? "").trim(),
        lastBuildDate: date && !Number.isNaN(date.getTime()) ? date : null,
    };
}

function authorOf(item: FeedItemRaw): string {
    const a = item.author;
    if (a && typeof a === "object" && "name" in a && typeof a.name === "string") return a.name.trim();
    return (textOf(a as TextOrObj | undefined) || textOf(item["dc:creator"])).trim();
}

function categoriesOf(item: FeedItemRaw): string[] {
    return toArray(item.category)
        .map(c => (typeof c === "object" && c && "@_term" in c && c["@_term"]) || textOf(c as TextOrObj))
        .map(c => String(c).trim())
        .filter(Boolean);
}

function imageOf(item: FeedItemRaw): string {
    const enclosure = item.enclosure;
    if (enclosure?.["@_url"] && (enclosure["@_type"] ?? "").startsWith("image")) return enclosure["@_url"];
    return item["media:thumbnail"]?.["@_url"] ?? item["media:content"]?.["@_url"] ?? "";
}

/** Author, categories and image from the latest item, for filling in Hermidata meta */
export function parseFeedExtras(doc: ParsedFeedDoc): FeedExtras {
    const first = entriesOf(doc)[0];
    if (!first) return {};
    const author = authorOf(first);
    const categories = categoriesOf(first);
    const image = imageOf(first);
    return {
        ...(author && { author }),
        ...(categories.length && { categories }),
        ...(image && { image }),
    };
}

export function parseItems(doc: ParsedFeedDoc, title: string): FeedItem | null {
    const rawEntries = entriesOf(doc);

    if (!rawEntries.length) {
        console.warn(`[Hermidata] No <item> or <entry> elements found in ${title}.`);
        return null;
    }

    const first = rawEntries[0];

    const rawTitle = first.title ?? title ?? "";
    // some feeds ( MangaUpdates ) give their items no link: point at the series page instead
    const linkUrl = linkOf(first.link) || parseChannelInfo(doc).link;
    const trimmedTitle = TrimTitle.trimTitle(rawTitle, linkUrl).title;

    const pubDateStr = first.pubDate ?? first.updated ?? first.published;
    const pubDate = new Date(pubDateStr ?? new Date().toISOString());

    const guid = textOf(first.guid) || first.id || linkUrl || "";

    return {
        id: generateRssFeedId(trimmedTitle, linkUrl),
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

        const rawEntries = entriesOf(doc);

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