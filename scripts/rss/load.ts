import { detectAltTitleNeeded, PastHermidata } from "../popup/core/Past";
import { appendAltTitle, makeHermidataV3 } from "../popup/core/save";
import { customConfirm } from "../popup/frontend/confirm";
import { ext } from "../shared/BrowserCompat";
import { findByTitleOrAltV2, getChapterFromTitle, returnHashedTitle, TrimTitle } from "../shared/StringOutput";
import type { RawFeed } from "../shared/types/rssType";
import { getAllRawFeeds, getHermidataViaKey } from "../shared/Storage";
import { novelTypes, type AltCheck, type Hermidata, type NovelType } from "../shared/types/popupType";

export async function getRawFeedsRecord(AllHermidata: Record<string, Hermidata>): Promise<Record<string, RawFeed>> {
    const feedList: Record<string, RawFeed> = {};

    const savedFeeds: Record<string, RawFeed> = await getAllRawFeeds();
    
    const hermidataValues = Object.values(AllHermidata);
    const domainMap = new Map<string, string>(
        hermidataValues.map(novel => [novel.url, novel.url.replace(/^https?:\/\/(www\.)?/,'').split('/')[0]])
    );
    const titleMap = new Map<string, Hermidata>(
        hermidataValues.map(novel => [
            TrimTitle.trimTitle(novel.title, novel.url).title, novel])
    );

    for (const key in savedFeeds) {
        const feed = savedFeeds[key];
        if ( !feed.title || !feed.url ) continue;

        const matchedDomain = hermidataValues.find(n => n.url.includes(feed.domain));
        if (feed.domain !== domainMap.get(matchedDomain?.url || '')) continue;

        const feedTitle = TrimTitle.trimTitle( feed?.items?.[0]?.title || feed.title, feed.url ).title;
        const typeV2 = titleMap.get(feedTitle)?.type || novelTypes[0];
        const id = returnHashedTitle(feedTitle, typeV2, feed?.url );

        feedList[id] = feed;
    }
    return feedList;
}
// isn't utilised
export async function getHermidataWithRss(): Promise<Record<string, Hermidata>> {
    console.group('getHermidataWithRss');
    console.time('getAllHermidata');
    const AllHermidata = await PastHermidata.getAllHermidata();
    console.timeEnd('getAllHermidata');
    console.time('getRawFeedsRecord');
    const AllFeeds = await getRawFeedsRecord(AllHermidata);
    console.timeEnd('getRawFeedsRecord');
    // Collect all entries that have RSS
    console.time('filter entries with RSS');
    const rssEntries = Object.entries(AllHermidata).filter(([_, feed]) => feed?.rss);
    console.timeEnd('filter entries with RSS');
    // Run all updateFeed calls in parallel
    console.time('updateFeed');
    const updated = await Promise.all(
        rssEntries.map(async ([id, feed]) => ({
            id,
            feed: await updateFeed(feed, AllFeeds, AllHermidata),
        }))
    );
    console.timeEnd('updateFeed');

    // Reassemble into record
    console.groupEnd();
    return Object.fromEntries(updated.map(({ id, feed }) => [id, feed]));
}
// load.ts or wherever loadSavedFeeds is called from popup
export async function getHermidataWithRssFromBackground(): Promise<Record<string, Hermidata>> {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'GET_RSS' }, (response) => {
            if (ext.runtime.lastError) reject(new Error(ext.runtime.lastError.message));
            else resolve(response.data);
        });
    });
}


export async function updateFeed(feed: Hermidata, allFeeds: Record<string, RawFeed>, AllHermidata: Record<string, Hermidata>): Promise<Hermidata> {
    const rssInfo = feed.rss;
    if (!rssInfo?.url) return feed;
    const currentFeedTitle = findByTitleOrAltV2(TrimTitle.trimTitle(rssInfo?.latestItem.title || feed.title, rssInfo.url || feed.url).title, AllHermidata);
    // FIXME: allFeeds is not correct here see here
    console.log(`[Hermidata] allFeeds: ${Object.values(allFeeds)}`);
    console.log(`[Hermidata] currentFeed: ${feed}`);
    const matchFeed = Object.values(allFeeds).find(f => {
        const sameDomain = f.domain === rssInfo.domain;
        const sameTitle = findByTitleOrAltV2(TrimTitle.trimTitle(f?.items?.[0]?.title || f.title, f.url).title, AllHermidata) === currentFeedTitle;
        return sameDomain && sameTitle;
    });
    if (!matchFeed) return feed; // no match

    const latestFetchedItem = matchFeed.items?.[0];
    const currentLatestItem = rssInfo.latestItem;
    const isNew = latestFetchedItem && (latestFetchedItem.link !== currentLatestItem?.link);
    if (isNew) console.log("Latest item changed?", latestFetchedItem, currentLatestItem);

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