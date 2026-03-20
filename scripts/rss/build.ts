import { type AllHermidata, type Hermidata } from "../shared/types/type";
import {  loadSavedFeeds } from "./load";
import { PastHermidata } from "../popup/core/Past";

import { FeedItem } from "./build/feed";
import { Subscribe } from "./build/Subscribe";
import { Sort } from "./build/Sort";
import { EventListener } from "./build/EventListener";
import { Footer } from "./build/footer";

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

        new FeedItem(this.hermidata, this.AllHermidata).makeFeedHeader(NotificationSection);

        const feedListLocalReload = await loadSavedFeeds();
    
        NotificationSection.appendChild(await new FeedItem(this.hermidata, this.AllHermidata).makefeedItem(feedListLocalReload, false));
        AllItemSection.appendChild(new FeedItem(this.hermidata, this.AllHermidata).makeItemHeader());
        AllItemSection.appendChild(await new FeedItem(this.hermidata, this.AllHermidata).makefeedItem(feedListLocalReload, true));
    }
}


export class BuildRSSController {
    private readonly hermidata: Hermidata;

    constructor(hermidata: Hermidata) {
        this.hermidata = hermidata;
    }

    public async makeSubscibeBtn(): Promise<void> {
        new Subscribe(this.hermidata, await RssBuild.init()).makeSubscibeBtn();
    }

    public async makeSortSection(sortSection: HTMLElement): Promise<void> {
        new Sort(this.hermidata, await RssBuild.init()).makeSortSection(sortSection);
    }

    public async makeFeedHeader(parent_section: HTMLElement): Promise<void> {
        new FeedItem(this.hermidata, await RssBuild.init()).makeFeedHeader(parent_section);
    }
    
    public async makeItemHeader(): Promise<Node> {
        return new FeedItem(this.hermidata, await RssBuild.init()).makeItemHeader();
    }
    
    public async makefeedItem(HermidataList: Record<string, Hermidata>, isRSSItem = false): Promise<DocumentFragment> {
        return new FeedItem(this.hermidata, await RssBuild.init()).makefeedItem(HermidataList, isRSSItem);
    }
    
    public async makeFooterSection(): Promise<void> {
        new Footer(this.hermidata, await RssBuild.init()).makeFooterSection();
    }

    public async attachEventListeners(): Promise<void> {
        new EventListener(this.hermidata, await RssBuild.init()).attachEventListeners();
    }
}