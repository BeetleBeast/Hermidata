import { type AllHermidata, type Hermidata } from "../shared/types/type";
import {  loadSavedFeeds } from "./load";
import { PastHermidata } from "../popup/core/Past";

import { FeedItem } from "./build/feed";

export abstract class RssBuild {
    protected readonly hermidata: Hermidata;

    protected AllHermidata: AllHermidata;

    constructor(hermidata: Hermidata, AllHermidata: AllHermidata) {
        this.hermidata = hermidata;
        this.AllHermidata = AllHermidata;
    }
    public static async init(): Promise<AllHermidata> {
        return await PastHermidata.getAllHermidata();
    }
    protected removeAllChildNodes(parent: HTMLElement) {
        while (parent.firstChild) parent.lastChild!.remove();
    }
    protected async reloadContent(NotificationSection: HTMLElement,AllItemSection: HTMLElement) {
        this.removeAllChildNodes(NotificationSection) // clear front-end
        this.removeAllChildNodes(AllItemSection) // clear front-end

        new FeedItem(this.AllHermidata).makeFeedHeader(NotificationSection);

        const feedListLocalReload = await loadSavedFeeds();
    
        NotificationSection.appendChild(await new FeedItem(this.AllHermidata).makefeedItem(feedListLocalReload, false));
        AllItemSection.appendChild(new FeedItem(this.AllHermidata).makeItemHeader());
        AllItemSection.appendChild(await new FeedItem(this.AllHermidata).makefeedItem(feedListLocalReload, true));
    }
    protected GetHashItem(item: HTMLElement): string {
        const newVersion = item.dataset.hashKey;
        if(!newVersion) throw new Error('hash not found');

        return newVersion;
    }
}