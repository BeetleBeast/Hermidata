import type { FeedHttpMeta, FeedItem, RawFeed } from "../shared/types/index";
import { generateRssFeedId, TrimTitle } from "../shared/utils/StringOutput";

/** The stored feed for a fetched one: what a saved copy already knows ( id, title, domain, image ) wins */
export function toRawFeed(url: string, item: FeedItem, meta: FeedHttpMeta, token: string | null, saved: RawFeed | undefined, domain?: string, image?: string | null): RawFeed {
    return {
        id: saved?.id ?? generateRssFeedId(item.title, url),
        title: saved?.title ?? TrimTitle.trimTitle(item.title, url).title,
        url,
        domain: saved?.domain ?? domain ?? new URL(url).hostname.replace(/^www\./, ''),
        lastFetched: new Date().toISOString(),
        lastBuildDate: meta.lastModified ? new Date(meta.lastModified) : (saved?.lastBuildDate ?? new Date()),
        image: saved?.image || image || "",
        latestItem: item,
        lastToken: token,
        etag: meta.etag,
        lastModified: meta.lastModified,
    };
}
