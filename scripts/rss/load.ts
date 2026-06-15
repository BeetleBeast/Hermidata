import { detectAltTitleNeeded, PastHermidata } from "../popup/core/Past";
import { appendAltTitle, makeHermidata } from "../popup/core/save";
import { customConfirm } from "../popup/frontend/confirm";
import { ext } from "../shared/utils/BrowserCompat";
import { findByTitleOrAlt, getChapterFromTitle, getChapterFromTitleReturn, returnHashedTitle, TrimTitle } from "../shared/utils/StringOutput";
import { type RawFeed, type AltCheck, type Hermidata, type AnyNovelType, type Feed } from "../shared/types/index";
import { getAllRawFeeds, getHermidataViaKey, getSettings, saveHermidata } from "../shared/db/Storage";
import { getAllHermidataWithRss } from "../shared/db/db";

/*

1. get all raw feeds from storage
    - filter out non possible Hermidata entries

2. get all hermidata with a RSS feed linked
// 3. merge raw feeds into hermidata


*/

async function getRawFeedsRecord( AllHermidata: Record<string, Hermidata> ): Promise<Record<string, RawFeed>> {
    const rawFeeds: Record<string, RawFeed> = await getAllRawFeeds();
    const rawFeedsValues = Object.values({...rawFeeds});
    
    const hermidataValues = Object.values(AllHermidata);
    const settings = await getSettings();
    
    const feedList: Record<string, RawFeed> = filterRawFeeds(rawFeedsValues, hermidataValues, settings.ContentTypesAndStatuses.TYPE_OPTIONS);

    return feedList;
}
function getAllDomainFromHermidata(hermidataValues: Hermidata[]): Map<string, Hermidata[]> {
    // Map domain → all Hermidata entries on that domain
        const domainToHermidata = new Map<string, Hermidata[]>();
        
        for (const novel of hermidataValues) {
            const domain = novel.url?.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
            if (!domainToHermidata.has(domain)) domainToHermidata.set(domain, []);
            domainToHermidata.get(domain)!.push(novel);
        }
        
        return domainToHermidata;
}

function filterRawFeeds(rawFeeds: RawFeed[], hermidataValues: Hermidata[], TYPE_OPTIONS: AnyNovelType[]): Record<string, RawFeed> {

    const filteredRawFeeds: Record<string, RawFeed> = {};
    
    const allNONmaches: RawFeed[] = [];
    
    const domainToHermidata = getAllDomainFromHermidata(hermidataValues);

    // Map trimmed hermidata title → Hermidata entry
    // trim once here so we compare like-for-like
    const titleMap = new Map<string, Hermidata>();
    for (const novel of hermidataValues) {
        const trimmed = TrimTitle.trimTitle(novel.title, novel.url).title;
        titleMap.set(trimmed, novel);
    }

    for (const feed of rawFeeds) {
        if (!feed.title || !feed.url ||!feed) continue;

        // Get all Hermidata entries for this feed's domain
        const domainCandidates = domainToHermidata.get(feed.domain);
        if (!domainCandidates?.length) continue;

        // Trim the feed title the same way as the titleMap keys
        const rawFeedTitle = feed?.items?.[0]?.title || feed.title;
        const feedTitle = TrimTitle.trimTitle(rawFeedTitle, feed.url).title;

        // Find the matching Hermidata entry by trimmed title among domain candidates only
        const matched = domainCandidates.find( n => TrimTitle.trimTitle(n.title, n.url).title === feedTitle );
        if (!matched) {
            allNONmaches.push(feed);
            continue;
        }
        
        const type = matched?.novelType ?? TYPE_OPTIONS[0];
        const id = returnHashedTitle(feedTitle, type, feed.url);

        filteredRawFeeds[id] = Object.freeze({ ...feed, items: [...(feed.items ?? [])] });
        // filteredRawFeeds[id] = feed;
    }

    console.log('filterRawFeeds result size', Object.keys(filteredRawFeeds).length);
    console.log('rawFeeds input size', Object.keys(rawFeeds).length);
    console.log('domainCandidates misses', allNONmaches.length);
    return filteredRawFeeds;
}
// only called in background after invalidation or on initial load
export async function getHermidataWithRss(): Promise<Record<string, Hermidata>> {
    console.groupCollapsed('[RSS Load] getHermidataWithRss');
    console.time('getAllHermidata');
    const AllHermidata = await PastHermidata.getAllHermidata();
    console.timeEnd('getAllHermidata');
    console.time('getRawFeedsRecord');
    const RawFeeds = await getRawFeedsRecord({ ...AllHermidata }); // ← shallow copy so mutations don't bleed back
    console.timeEnd('getRawFeedsRecord');
    // Collect all entries that have RSS
    console.time('filter entries with RSS');
    const hermidataWRSS = Object.values(await getAllHermidataWithRss(AllHermidata));
    console.timeEnd('filter entries with RSS');
    // Run all updateFeed calls in parallel
    console.time('updateFeed');
    const updated = await Promise.all(
        hermidataWRSS.map(async (feed) => ({
            id: feed.id,
            feed: await updateFeed(feed, RawFeeds, AllHermidata),
        }))
    );
    console.timeEnd('updateFeed');

    // Reassemble into record
    console.groupEnd();
    return Object.fromEntries(updated.map(({ id, feed }) => [id, feed]));
}
// whenever we need to get hermidata with RSS may be called everywhere
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
    const currentFeedTitle = findByTitleOrAlt(TrimTitle.trimTitle(rssInfo?.latestItem.title || feed.title, rssInfo.url || feed.url).title, AllHermidata);
    const matchFeed = Object.values(allFeeds).find(f => {
        const sameDomain = f.domain === rssInfo.domain;
        const sameTitle = findByTitleOrAlt(TrimTitle.trimTitle(f?.items?.[0]?.title || f.title, f.url).title, AllHermidata) === currentFeedTitle;
        return sameDomain && sameTitle;
    });
    if (!matchFeed) return feed; // no match

    const latestFetchedItem = matchFeed.items?.[0];
    const currentLatestItem = rssInfo.latestItem;

    // always update it with latest info NOT latest fetched item
    const latestFetchedIsNewer = new Date(latestFetchedItem.pubDate).getTime() > new Date(currentLatestItem.pubDate).getTime();

    const isNew = latestFetchedItem && (latestFetchedItem.link !== currentLatestItem?.link) && latestFetchedIsNewer;

    const latestFetchedChapter = getChapterFromTitleReturn(TrimTitle.trimTitle(latestFetchedItem.title, latestFetchedItem.link).title, latestFetchedItem.title, undefined,latestFetchedItem.link);
    const currentLatestChapter = getChapterFromTitleReturn(TrimTitle.trimTitle(currentLatestItem.title, currentLatestItem.link).title, currentLatestItem.title, undefined,currentLatestItem.link);
    const latestChapter = latestFetchedIsNewer ? latestFetchedChapter : currentLatestChapter;

    if (isNew) console.log(`
        New Release\n
        title: ${TrimTitle.trimTitle(latestFetchedItem.title, latestFetchedItem.link).title}\n
        New Chapter: ${latestFetchedChapter}\n
        Old Chapter: ${currentLatestChapter}\n
        new Date: ${new Date(latestFetchedItem.pubDate)}\n
        old Date: ${new Date(currentLatestItem.pubDate)}\n
        `);

    // only update feed if we have a newer chapter, otherwise we might overwrite with stale data
    const newFeed: Feed = {
        title: latestFetchedIsNewer ? matchFeed.title : rssInfo.title,
        url: latestFetchedIsNewer ? matchFeed.url : rssInfo.url,
        image: latestFetchedIsNewer ? matchFeed.image : rssInfo.image,
        domain: latestFetchedIsNewer ? matchFeed.domain : rssInfo.domain,
        lastFetched: new Date().toISOString(),
        latestItem: latestFetchedIsNewer ? latestFetchedItem : rssInfo.latestItem,
        lastBuildDate: feed.rss?.lastBuildDate
    };

    // Update feed info
    const updatedHermidata: Hermidata = {
        ...feed,
        rss: newFeed,
        chapter: {
            ...feed.chapter,
            latest: latestChapter
        },
    };
    return updatedHermidata;
}


/**
 *  merge RSS feed data into existing Hermidata entry
 * @param {String} title - the RSS Feed title
 * @param {String} type - the RSS input type
 * @param {Object} rssData  - the RSS feed data
*/
export async function linkRSSFeed(title: string, type: AnyNovelType, url: string, rssData: RawFeed) {
    // check if new entry is inside database
    const altCheck = await detectAltTitleNeeded(title, type, rssData.domain, url);
    const AllHermidata = await PastHermidata.getAllHermidata();

    const existingEntry = findByTitleOrAlt(title, AllHermidata)
    const resolvedTitle = existingEntry ? existingEntry.title : title;
    const resolvedType = existingEntry ? existingEntry.novelType : type;
    const key = returnHashedTitle( resolvedTitle, resolvedType);

    const KeysToFetch = [key];
    if (altCheck.relatedKey && altCheck.relatedKey !== key) KeysToFetch.push(altCheck.relatedKey)
    
    const stored: Record<string, Hermidata> = {};
    for (const key of KeysToFetch) {
        const obj = await getHermidataViaKey(key);
        if (!obj) continue;
        stored[key] = obj;
    }

    const entry: Hermidata = await getEntry(title, stored, altCheck, resolvedType, url, key);

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

    const saveKey = stored[key] ? key : altCheck.relatedKey ?? key;
    await saveHermidata(saveKey, entry);
}

async function getEntry(title: string, stored: Record<string, Hermidata>, altCheck: AltCheck, type: AnyNovelType, url: string, key: string): Promise<Hermidata> {
    // Try to find the best matching entry among the possible keys
    // 1. direct key match
    let entry = stored[key];
    if (altCheck.relatedKey && !entry) entry = stored[altCheck.relatedKey]

    // 2. title match (including alt titles and fuzzy matches) Has priority over direct key match since keys can be outdated/stale
    if (altCheck.needAltTitle && altCheck.relatedKey) {
        const relatedEntry = stored[altCheck.relatedKey];
        if (relatedEntry) {
            const confirmation = await customConfirm(`${altCheck.reason}\nAdd "${title}" as an alt title for "${relatedEntry.title}"?`);
            if (confirmation) await appendAltTitle(title, relatedEntry);
        }
    }
    // fallback: if no entry found at all, create new one
    if (!entry) entry = await makeHermidata(title, url, type);

    return entry;
}