import { PastHermidata } from "../../popup/core/Past";
import { getAllRawFeeds } from "../../shared/Storage";
import { findByTitleOrAltV2, TrimTitle } from "../../shared/StringOutput";
import type { Hermidata, NovelType } from "../../shared/types/popupType";
import type { RawFeed } from "../../shared/types/rssType";
import { getElement } from "../../utils/Selection";
import { RssBuild } from "../build";
import { linkRSSFeed } from "../load";

export class Subscribe extends RssBuild {

    private matchedFeed: RawFeed | null = null;

    public async makeSubscibeBtn(): Promise<void> {
        const [feedListGlobal, allHermidata] = await Promise.all([ getAllRawFeeds(), PastHermidata.getAllHermidata() ]);
        const subscribeBtn = getElement<HTMLButtonElement>("#subscribeBtn");
        const notificationSection = getElement("#RSS-Notification");
        const allItemSection = getElement("#All-RSS-entries");

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
        subscribeBtn.onclick = () => this.onSubscribeClick( notificationSection,  allItemSection );
    }

    private async findMatchingFeed( feedList: Record<string, RawFeed>, allHermidata: Record<string, Hermidata>, currentTitle: string ): Promise<RawFeed | null> {
        for (const feed of Object.values(feedList)) {
            const feedTitle = TrimTitle.trimTitle( feed?.items?.[0]?.title || feed.title, feed.url ).title;
            const matchedTitle = findByTitleOrAltV2(feedTitle, allHermidata)?.title;
            if (matchedTitle === currentTitle) return feed;
        }
        return null;
    }

    private onSubscribeClick( notificationSection: HTMLElement, allItemSection: HTMLElement ): void {
        if (!this.matchedFeed) return;

        const currentType = getElement<HTMLInputElement>('#Type_HDRSS')?.value as NovelType || this.hermidata.type;
        const currentTitle = getElement<HTMLInputElement>('#title_HDRSS')?.value || this.hermidata.title;

        linkRSSFeed(currentTitle, currentType, this.hermidata.url, this.matchedFeed);
        this.reloadContent(notificationSection, allItemSection);
        console.log('Linked RSS to extension');
    }
}