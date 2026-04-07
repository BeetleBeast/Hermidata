export type NormalSortsType = 'Alphabet' | 'Recently-Added' | 'Latest-Updates';
export type ExeptionSortsType = '';
export type ReverseAllsortsType = `Reverse-${NormalSortsType}`;

export type AllsortsType = (NormalSortsType | ReverseAllsortsType) | ExeptionSortsType;

export const AllSorts: AllsortsType[] = ['Alphabet', 'Recently-Added', 'Latest-Updates']

export type MenuOption = {
    label: string;
    action: () => void | Promise<void>;
}
export type separator = "separator";

export type Filters = {
    include: Record<string, string[]>; // { type: ['Manga'], status: ['Ongoing'] }
    exclude: Record<string, string[]>;
    sort: AllsortsType;
}

export interface FilterName {
    Sort: string,
    Type: string,
    Status: string,
    NovelStatus: string,
    Source: string,
    Tag: string,
    Date: string
}
export interface FilterClassName {
    [key: string]: string;
    Sort: string,
    Type: string ,
    Status: string ,
    NovelStatus: string,
    Source: string,
    Tag: string,
    Date: string,
}

export const filterClassName: FilterClassName = {
    Sort: 'filter-sort',
    Type: 'filter-type', 
    Status: 'filter-status', 
    NovelStatus: 'filter-novel-status',
    Source: 'filter-source', 
    Tag: 'filter-tag', 
    Date: 'filter-date'
}
export const filterName: FilterName = {
    Sort: 'Sort',
    Type: 'Type', 
    Status: 'Read-Status', 
    NovelStatus: 'Novel-Status',
    Source: 'Source', 
    Tag: 'Tag', 
    Date: 'Date'
}


import type { AllHermidata } from "./popup";

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
    lastBuildDate: Date,
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