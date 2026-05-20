import { PastHermidata } from "../../popup/core/Past";
import { customConfirm } from "../../popup/frontend/confirm";
import { getAllRawFeeds, getSettings, setSettings } from "../../shared/db/Storage";
import { HermidataMigration } from "../../shared/migration/Hermidata";
import { findByTitleOrAltV2, returnRawFeedHash, TrimTitle } from "../../shared/StringOutput";
import type { AnyNovelType, Hermidata, RawFeed } from "../../shared/types/index";
import { getElement } from "../../utils/Selection";
import { RssBuild } from "../build";
import { linkRSSFeed } from "../load";

type match = {
    Hermidata: Hermidata,
    RawFeed: RawFeed
}
type AtLeastPointNine = number & { readonly __brand: 'AtLeastPointNine' };
export class Subscribe extends RssBuild {

    private matchedFeed: RawFeed | null = null;

    public async makeSubscibeBtn(): Promise<void> {
        const [feedListGlobal, allHermidata] = await Promise.all([ getAllRawFeeds(), PastHermidata.getAllHermidata() ]);
        const subscribeBtn = getElement<HTMLButtonElement>("#subscribeBtn");
        const notificationSection = getElement<HTMLDivElement>("#RSS-Notification");
        const allItemSection = getElement<HTMLDivElement>("#All-RSS-entries");

        if (!subscribeBtn || !notificationSection || !allItemSection) throw new Error('Subscribe: required elements not found');

        // set default state
        subscribeBtn.className = "Btn";
        subscribeBtn.textContent = "Subscribe to RSS Feed";
        subscribeBtn.disabled = true;
        subscribeBtn.title = "this site doesn't have a RSS link";
        subscribeBtn.ariaLabel = "this site doesn't have a RSS link";

        // if already subscribed, disable button and return
        if (this.hermidata.rss?.latestItem) {
            subscribeBtn.className = "Btn";
            subscribeBtn.textContent = "Already Subscribed to RSS Feed";
            subscribeBtn.disabled = true;
            subscribeBtn.title = "Already subscribed to RSS feed";
            subscribeBtn.ariaLabel = "Already subscribed to RSS feed";
            return;
        }

        const currentTitle = getElement<HTMLInputElement>("#title_HDRSS")?.value || this.hermidata.title;

        this.matchedFeed = await this.findMatchingFeed( feedListGlobal,  allHermidata,  currentTitle );

        if (this.matchedFeed) {
            console.log('found matching feed:', this.matchedFeed);
            subscribeBtn.disabled = false
            subscribeBtn.title = "subscribe to recieve notifications"
            subscribeBtn.ariaLabel = "subscribe to recieve notifications"
        }
        subscribeBtn.onclick = async () => this.onSubscribeClick( notificationSection,  allItemSection );
    }

    private async findMatchingFeed( feedList: Record<string, RawFeed>, allHermidata: Record<string, Hermidata>, currentTitle: string ): Promise<RawFeed | null> {
        for (const feed of Object.values(feedList)) {
            const feedTitle = TrimTitle.trimTitle( feed?.items?.[0]?.title || feed.title, feed.url ).title;
            const matchedTitle = findByTitleOrAltV2(feedTitle, allHermidata)?.title;
            if (matchedTitle === currentTitle) return feed;
        }
        return null;
    }

    private async onSubscribeClick( notificationSection: HTMLElement, allItemSection: HTMLElement ): Promise<void> {
        if (!this.matchedFeed) return;

        const currentType = getElement<HTMLInputElement>('#Type_HDRSS')?.value as AnyNovelType || this.hermidata.type;
        const currentTitle = getElement<HTMLInputElement>('#title_HDRSS')?.value || this.hermidata.title;

        linkRSSFeed(currentTitle, currentType, this.hermidata.url, this.matchedFeed);
        await this.reloadContent(notificationSection, allItemSection);
        console.log('Linked RSS to extension');
    }
    /**
     * - take all raw feeds and all hermidata with no rss link and find matching feed 
     * - confirm with user
     * - link to feed if user confirms
     * 
     * @returns true if it has subscribed to any feed
     */
    public async autoSubscribe(): Promise<boolean> {
        const settings = await getSettings();
        const autoSubscribe = settings?.ExtensionBehaviour.AutoSubscribe.EnableAutoSubscribe ?? false;
        const allowSimilarityScanning = settings?.ExtensionBehaviour.AutoSubscribe.AllowSimilarityScanning ?? false;
        const autoSubscribeThreshold = settings?.ExtensionBehaviour.AutoSubscribe.Threshold ?? false;
        if (!autoSubscribe) return false;
        // 1. take all raw feeds
        // raw feeds are automaticly collected by the background script
        const allRawFeeds = await getAllRawFeeds();
        
        // 2. take all hermidata
        const allHermidata = await PastHermidata.getAllHermidata();
        const RSSIdsNotAllowed = settings?.ExtensionBehaviour.AutoSubscribe.HermidataNotLinkedToRSS;
        const allHimidataWithNoRSS = Object.entries(allHermidata).filter(list => {
            const Hermidata = list[1];
            const hasRSS = Hermidata.rss === null;
            const isNotAllowed = typeof RSSIdsNotAllowed[Hermidata.id] === 'string';
            return hasRSS && !isNotAllowed;
        });
        const allHermidataWithNoRSSRecord: Record<string, Hermidata> = Object.fromEntries(allHimidataWithNoRSS);

        // 3. find matching feed
        const mathingFeeds = await this.findMatchingFeeds(allRawFeeds, allHermidataWithNoRSSRecord, allowSimilarityScanning, autoSubscribeThreshold);
        if (!mathingFeeds || mathingFeeds.length === 0) return false;
        
        for (const { RawFeed, Hermidata } of mathingFeeds) {
            // 4. confirm with user
            const confirmationMsg = `
                Subscribe to "${Hermidata.title}"?

                example of linked feed:
                ${RawFeed.image ? `image: ${RawFeed.image}` : ''}\n
                title: ${RawFeed.items[0].title}\n
                <a href="${RawFeed.url}" target="_blank">${RawFeed.items[0].title}</a>

                Is this the feed you want to subscribe to?
                <br>
                <b>note:</b> you can always unsubscribe at any time by clicking the "Unsubscribe" button by right clicking on the RSS feed item
                `;
            const shouldSubscribe = await customConfirm(confirmationMsg);
            if (!shouldSubscribe) {
                const RawFeedID = returnRawFeedHash(RawFeed.items[0].title, RawFeed.url);
                const newRecord: Record<string, string> = { [Hermidata.id]: RawFeedID };
                const HermidataNotLinkedToRSS = settings.ExtensionBehaviour.AutoSubscribe.HermidataNotLinkedToRSS;
                settings.ExtensionBehaviour.AutoSubscribe.HermidataNotLinkedToRSS = HermidataNotLinkedToRSS ? { ...HermidataNotLinkedToRSS, ...newRecord } : newRecord;
                await setSettings(settings);
                continue;
            }
            // 5. link matching feed
            linkRSSFeed(Hermidata.title, Hermidata.type, Hermidata.url, RawFeed);
        }
        return true;
    }
    private async findMatchingFeeds(allRawFeeds: Record<string, RawFeed>, allHermidata: Record<string, Hermidata>, allowSimilarityScanning = false, _threshold = 1.0): Promise<match[] | null> {
        // enforce at least 90%
        const threshold = this.enforcePointNine(_threshold);
        if (!threshold) return null;

        const matches: match[] = [];

        console.groupCollapsed('Scanning for matching feeds...');
        console.log('Raw Feeds:', Object.keys(allRawFeeds).length);
        console.log('Hermidata:', Object.keys(allHermidata).length);

        for (const RawFeed of Object.values(allRawFeeds)) {
            // find matching entry
            const rawFeedTitle = RawFeed.items[0].title ?? RawFeed.title; // use first item title if available otherwise use raw feed title ( some feeds have no items )
            const rawFeedTitleTrimmed = TrimTitle.trimTitle(rawFeedTitle, RawFeed.url).title;
            const matchedEntry = findByTitleOrAltV2(rawFeedTitleTrimmed, allHermidata); // 100% match only

            // add to matches
            if (matchedEntry) matches.push({ RawFeed, Hermidata: matchedEntry });
            // if title is too short, skip similarity scanning as the similarity score will result in false positives
            if (rawFeedTitleTrimmed.length < 6 && allowSimilarityScanning) continue;
            // if similarity scanning is enabled and threshold is at least 90%
            else if (threshold < 1.0 && allowSimilarityScanning) {
                const possibleMatch = await HermidataMigration.findPotentialSameHermidata(rawFeedTitleTrimmed, allHermidata, threshold); // 90% at least match
                if (possibleMatch.amountFound === 0 || !possibleMatch.result) {
                    console.log(`No possible matches found for "${rawFeedTitleTrimmed}" (threshold: ${threshold})`); 
                    continue;
                }
                if (possibleMatch.amountFound > 1) {
                    console.warn(`Found ${possibleMatch.amountFound} possible matches for "${rawFeedTitleTrimmed}" (threshold: ${threshold})`);
                    continue;
                }
                console.table(possibleMatch);
                matches.push({ RawFeed, Hermidata: this.AllHermidata[possibleMatch.result.key] });
            }
        }
        console.log(`Found ${matches.length} matching feeds.`);
        console.table(matches);
        console.groupEnd();
        if (matches.length > 0) return matches;
        return null;
    }
    private enforcePointNine(value: number): AtLeastPointNine | null {
        if (value < 0.9 || value > 1.1 || typeof value !== 'number') return null
        return value as AtLeastPointNine;
    }
}