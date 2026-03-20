import { detectAltTitleNeeded, PastHermidata } from "../popup/core/Past";
import { appendAltTitle, makeHermidataV3 } from "../popup/core/save";
import { customConfirm } from "../popup/frontend/confirm";
import { ext } from "../shared/BrowserCompat";
import { findByTitleOrAltV2, getChapterFromTitle, returnHashedTitle, TrimTitle } from "../shared/StringOutput";
import type { RawFeed } from "../shared/types/rssType";
import { getAllRawFeeds, getHermidataViaKey } from "../shared/types/Storage";
import { novelTypes, type AltCheck, type Hermidata, type NovelType } from "../shared/types/type";

export async function loadSavedFeedsViaSavedFeeds(): Promise<Record<string, RawFeed>> {
    const feedList: Record<string, RawFeed> = {};

    const savedFeeds: Record<string, RawFeed> = await getAllRawFeeds();
    const AllHermidata = await PastHermidata.getAllHermidata();
    

    for (const key in savedFeeds) {
        const feed = savedFeeds[key];
        if ( !feed.title || !feed.url ) continue;

        // check same domain
        if ( feed.domain !=  Object.values(AllHermidata).find(novel => novel.url.includes(feed.domain))?.url.replace(/^https?:\/\/(www\.)?/,'').split('/')[0] ) continue;

        const type = Object.values(AllHermidata).find(novel => novel.title == TrimTitle.trimTitle(feed?.items?.[0]?.title, '').title)?.type || novelTypes[0];
        const typeV2 = findByTitleOrAltV2(TrimTitle.trimTitle(feed?.items?.[0]?.title || feed.title, feed.url).title, AllHermidata)?.type || novelTypes[0];

        feedList[returnHashedTitle(feed?.items?.[0]?.title || feed.title, typeV2 || type, feed?.url) ] = feed;
    }
    return feedList;
}
// isn't utilised
export async function loadSavedFeeds(): Promise<Record<string, Hermidata>> {
    const feedList: Record<string, Hermidata> = {};
    const AllHermidata = await PastHermidata.getAllHermidata();
    const AllFeeds = await loadSavedFeedsViaSavedFeeds();
    
    for (const [id, feed] of Object.entries(AllHermidata)) {
        if ( feed?.rss ) {
            const updatedFeed = await updateFeed(feed, AllFeeds);
            feedList[id] = updatedFeed;
        }
    }
    return feedList;
}


export async function updateFeed(feed: Hermidata , allFeeds: Record<string, RawFeed>): Promise<Hermidata> {
    const rssInfo = feed.rss;
    if (!rssInfo?.url) return feed;
    const AllHermidata = await PastHermidata.getAllHermidata();
    const currentFeedTitle = findByTitleOrAltV2(rssInfo?.latestItem.title || feed.title, AllHermidata);
    const matchFeed = Object.values(allFeeds).find(f => {
        const sameDomain = f.domain === rssInfo.domain;
        const sameTitle = findByTitleOrAltV2(f?.items?.[0]?.title || f.title, AllHermidata) === currentFeedTitle;
        return sameDomain && sameTitle;
    });
    if (!matchFeed) return feed; // no match

    const latestFetchedItem = matchFeed.items?.[0];
    const currentLatestItem = rssInfo.latestItem;
    const isNew = latestFetchedItem && (latestFetchedItem.link !== currentLatestItem?.link);
    console.log("Latest item changed?", isNew, latestFetchedItem, currentLatestItem);

    // Update feed info
    feed.rss = {
        ...rssInfo,
        title: matchFeed.title || rssInfo.title,
        url: matchFeed.url || rssInfo.url,
        image: matchFeed.image || rssInfo.image,
        domain: matchFeed.domain || rssInfo.domain,
        lastFetched: new Date().toISOString(),
        latestItem: latestFetchedItem
    };
    // Optionally update latest chapter if we can parse it
    const latestChapter = getChapterFromTitle(latestFetchedItem.title, matchFeed.url);
    if (latestChapter) {
        feed.chapter.latest = latestChapter;
        feed.meta.updated = new Date().toISOString();
    }
    return feed;
}


/**
 *  merge RSS feed data into existing Hermidata entry
 * @param {String} title - the RSS Feed title
 * @param {String} type - the RSS input type
 * @param {Object} rssData  - the RSS feed data
*/
export async function linkRSSFeed(title: string, type: NovelType, url: string, rssData: RawFeed) {
    // check if new entry is inside database
    const altCheck = await detectAltTitleNeeded(title, type, rssData.domain, url);
    const AllHermidata = await PastHermidata.getAllHermidata();
    const titleOrAlt = findByTitleOrAltV2(title, AllHermidata)?.title || title
    const key = returnHashedTitle( titleOrAlt, type);

    const KeysToFetch = [key];
    if (altCheck.relatedKey && altCheck.relatedKey !== key) KeysToFetch.push(altCheck.relatedKey)
    
    const stored: Record<string, Hermidata> = {};
    for (const key of KeysToFetch) {
        const obj = await getHermidataViaKey(key);
        if (!obj) continue;
        stored[key] = obj;
    }

    const entry: Hermidata = await getEntry(title, stored, altCheck, type, url, key);

    entry.rss = {
        title: rssData.title,
        url: rssData.url,
        image: rssData.image,
        domain: rssData.domain,
        lastFetched: new Date().toISOString(),
        latestItem: rssData.items?.[0] ?? null
    };

    // Optionally update chapter.latest from feed title
    const latestChapter = getChapterFromTitle(rssData.items?.[0]?.title, entry.rss.url);
    if (latestChapter) entry.chapter.latest = latestChapter;

    await ext.storage.sync.set({ [key]: entry });
}

async function getEntry(title: string, stored: Record<string, Hermidata>, altCheck: AltCheck, type: NovelType, url: string, key: string): Promise<Hermidata> {
    let entry = stored[key];
    if (altCheck.relatedKey && !entry) entry = stored[altCheck.relatedKey]

    if (altCheck.needAltTitle && altCheck.relatedKey) {
        const relatedEntry = stored[altCheck.relatedKey];
        if (relatedEntry) {
            const confirmation = await customConfirm(
                `${altCheck.reason}\nAdd "${title}" as an alt title for "${relatedEntry.title}"?`
            );
            if (confirmation) await appendAltTitle(title, relatedEntry);
        }
    }

    if (!entry) entry = makeHermidataV3(title, url, type);

    return entry;
}