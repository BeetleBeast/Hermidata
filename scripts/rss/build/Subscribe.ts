import { PastHermidata } from "../../popup/core/Past";
import { getAllRawFeeds, getSettings } from "../../shared/db/Storage";
import { HermidataMigration } from "../../shared/migration/Hermidata";
import { findByTitleOrAltV2, TrimTitle } from "../../shared/StringOutput";
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
    private async autoSubscribe(): Promise<boolean> {
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

        // 3. find matching feed
        const mathingFeeds = await this.findMatchingFeeds(allRawFeeds, allHermidata, allowSimilarityScanning, autoSubscribeThreshold);
        if (!mathingFeeds || mathingFeeds.length === 0) return false;
        
        // 4. link matching feed
        for (const { RawFeed, Hermidata } of mathingFeeds) {
            linkRSSFeed(Hermidata.title, Hermidata.type, Hermidata.url, RawFeed);
        }
        return true;
    }
    private async findMatchingFeeds(allRawFeeds: Record<string, RawFeed>, allHermidata: Record<string, Hermidata>, allowSimilarityScanning = false, _threshold = 1.0,): Promise<match[] | null> {
        // enforce at least 90%
        const threshold = this.enforcePointNine(_threshold);
        if (!threshold) return null;

        const matches: match[] = [];
        for (const RawFeed of Object.values(allRawFeeds)) {
            // find matching entry
            const rawFeedTitle = RawFeed.items[0].title ?? RawFeed.title; // use first item title if available otherwise use raw feed title ( some feeds have no items )
            const rawFeedTitleTrimmed = TrimTitle.trimTitle(rawFeedTitle, RawFeed.url).title;
            const matchedEntry = findByTitleOrAltV2(rawFeedTitleTrimmed, allHermidata); // 100% match only
            if (matchedEntry) matches.push({ RawFeed, Hermidata: matchedEntry });
            else if (threshold < 1.0 && allowSimilarityScanning) {
                const possibleMatchList = await HermidataMigration.findPotentialSameHermidata(rawFeedTitleTrimmed, allHermidata, threshold); // 90% at least match
                if (possibleMatchList) {
                    const possibleMatch = possibleMatchList[0];
                    console.table(possibleMatchList);
                    matches.push({ RawFeed, Hermidata: this.AllHermidata[possibleMatch.key] });
                }
            }
        }
        if (matches.length > 0) return matches;
        return null;
    }
    private enforcePointNine(value: number): AtLeastPointNine | null {
        if (value < 0.9 || value > 1.1 || typeof value !== 'number') return null
        return value as AtLeastPointNine;
    }
}