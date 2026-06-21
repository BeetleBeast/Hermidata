import { type Hermidata } from "../shared/types/index";
import {  getHermidataWithRssFromBackground } from "./load";
import { PastHermidata } from "../popup/core/Past";

import { FeedItem } from "./build/feed";

export abstract class RssBuild {
    protected readonly hermidata: Hermidata;

    protected AllHermidata: Record<string, Hermidata>;

    constructor(hermidata: Hermidata, AllHermidata: Record<string, Hermidata>) {
        this.hermidata = hermidata;
        this.AllHermidata = AllHermidata;
    }
    public static async init(): Promise<Record<string, Hermidata>> {
        return await PastHermidata.getAllHermidata();
    }
    protected removeAllChildNodes(parent: HTMLElement) {
        while (parent.firstChild) parent.lastChild!.remove();
    }
    protected async reloadContent(NotificationSection: HTMLElement,AllItemSection: HTMLElement) {
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