import type { AllHermidata } from "./type";

export type RSSDOM = {
    notifications: {
        items: DocumentFragment;
    };
    allItems: {
        header: DocumentFragment;
        items: DocumentFragment;
    }
}
export type RSSData = {
    feeds: AllHermidata; // this one has RSS the other is all
    hermidata: AllHermidata;
}

export type AllFeeds = Record<string, Feed>;

// Feed has single item
export type Feed = {
    title: string,
    url: string,
    image: null | string,
    domain: string,
    lastFetched: null | string, // Date when last fetched
    latestItem: FeedItem
    lastBuildDate?: null | Date,
}
// raw feed has multiple items
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
// FIXME: lastToken && guid have been added; sheck if it works
export type FeedItem = {
    title: string,
    link: string,
    pubDate: Date,
    guid: string
}