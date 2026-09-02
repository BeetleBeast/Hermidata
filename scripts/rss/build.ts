import { type Hermidata } from "../shared/types/index";
import {  getHermidataWithRssFromBackground } from "./load";
import { PastHermidata } from "../popup/core/Past";
import { FeedItem } from "./build/feed";
import { HermidataModel } from "../shared/utils/HermidataSelector";
import { getElement, setElement } from "../shared/utils/Selection";
import { BuildRSSController } from "./controller";
import type { PickedElementData, RuntimeMessage } from "../shared/types/rss";

export abstract class RssBuild {
    protected readonly hermidata: HermidataModel;

    protected AllHermidata: Record<string, Hermidata>;

    protected pendingPick: ((data: PickedElementData | null) => void) | null = null;

    constructor(hermidata: HermidataModel, AllHermidata: Record<string, Hermidata>) {
        this.hermidata = hermidata;
        this.AllHermidata = AllHermidata;

        // Register exactly once, for the lifetime of the popup.
        chrome.runtime.onMessage.addListener((msg: RuntimeMessage) => {
            // Handle messages related to element picking and user feedback
            if (!this.pendingPick) return;

            if (msg.action === "elementPicked") this.pendingPick(msg.data); 
            else if (msg.action === "pickingCancelled") this.pendingPick(null);

            // Clear the pending callbacks after handling the message
            this.pendingPick = null;
        });
    }
    public static async init(): Promise<Record<string, Hermidata>> {
        return await PastHermidata.getAllHermidata();
    }
    protected removeAllChildNodes(parent: HTMLElement) {
        while (parent.firstChild) parent.lastChild!.remove();
    }
    protected async reloadContent(NotificationSection: HTMLElement,AllItemSection: HTMLElement) {

        this.showLoadingAnimation();

        this.removeAllChildNodes(NotificationSection) // clear front-end
        this.removeAllChildNodes(AllItemSection) // clear front-end

        new FeedItem(this.AllHermidata).makeFeedHeader(NotificationSection);

        await chrome.runtime.sendMessage({ type: 'INVALIDATE_RSS' });

        const [feeds, hermidata] = await Promise.all([
            getHermidataWithRssFromBackground(),
            PastHermidata.getAllHermidata()
        ]);
    
        NotificationSection.appendChild(await new FeedItem(this.AllHermidata).makefeedItem(feeds, false));
        AllItemSection.appendChild(new FeedItem(this.AllHermidata).makeItemHeader());
        AllItemSection.appendChild(await new FeedItem(this.AllHermidata).makefeedItem(hermidata, true));

        const sortSection = getElement<HTMLDivElement>("#sort-RSS-entries");
        if (!sortSection) throw new Error('sort section not found');

        const BuildRSS = new BuildRSSController(this.hermidata);

        await BuildRSS.makeSortSection(sortSection);

        await BuildRSS.attachEventListeners()

        await BuildRSS.makeFooterSection();

        await BuildRSS.activateAutoSubscribe();

        this.hideLoadingAnimation();
    }
    private showLoadingAnimation() {
            setElement(".HDClassic", el => {
                el.style.opacity = '0';
                el.style.overflow = 'clip'; // make it no be ablr to scroll while waiting
                el.style.cursor = 'wait'; // make the cursor a wait cursor
                el.style.pointerEvents = 'none'; // make it not clickable
            });
            setElement(".HDRSS", el => {
                el.style.opacity = '0';
                el.style.overflow = 'clip'; // make it no be ablr to scroll while waiting
                el.style.cursor = 'wait'; // make the cursor a wait cursor
                el.style.pointerEvents = 'none'; // make it not clickable
    
            });
            setElement('.material-symbols-outlinedContainer', el => el.style.display = 'flex');
        }
        private hideLoadingAnimation() {
            setElement(".HDClassic", el => {
                el.style.opacity = '0';
                el.style.overflow = 'hidden';
                el.style.cursor = 'default';
                el.style.pointerEvents = 'auto';
            });
            setElement(".HDRSS", el => {
                el.style.opacity = '1';
                el.style.overflowY = 'auto';
                el.style.overflowX = 'hidden';
                el.style.cursor = 'default';
                el.style.pointerEvents = 'auto';
            });
            setElement('.material-symbols-outlinedContainer', el => el.style.display = 'none');
        }
    protected GetHashItem(item: HTMLElement): string {
        const newVersion = item.dataset.hashKey;
        if(!newVersion) throw new Error('hash not found');

        return newVersion;
    }
    protected updateTab(tab: chrome.tabs.Tab, url: URL | string, scrollPositionY: number): void {
        chrome.tabs.update(tab.id!, { url: url.toString() }, (updatedTab) => {
            if (!updatedTab?.id) return;

            const tabId = updatedTab.id;

            chrome.tabs.onUpdated.addListener(function listener(changedTabId, info) {
                if (changedTabId === tabId && info.status === "complete") {
                    chrome.tabs.onUpdated.removeListener(listener);

                    chrome.scripting.executeScript({
                        target: { tabId },
                        func: (y) => window.scrollTo(0, y),
                        args: [scrollPositionY],
                    });
                }
            });
        });
    }
    protected openNewTab(url: URL | string, scrollPositionY: number): void {

        chrome.tabs.create({ url: url.toString() }, (tab) => {
            chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                if (tabId === tab.id && info.status === "complete") {
                chrome.tabs.onUpdated.removeListener(listener);

                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: (y) => window.scrollTo(0, y),
                    args: [scrollPositionY],
                });
                }
            });
            });
    }

}