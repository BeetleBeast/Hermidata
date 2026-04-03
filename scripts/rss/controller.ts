import { type Hermidata } from "../shared/types/popupType";

import {RssBuild } from "./build";

import { Subscribe } from "./build/Subscribe";
import { FeedItem } from "./build/feed";
import { Footer } from "./build/footer";
import { EventListener } from "./build/EventListener";
import { SortOption } from "./build/SortOption";
import { SortLogic } from "./build/SortLogic";
import { updatePolygons, positionDiamond } from "./build/SetPositionSvg";


export class BuildRSSController {
    private readonly hermidata: Hermidata;

    constructor(hermidata: Hermidata) {
        this.hermidata = hermidata;
    }

    public async makeSubscibeBtn(): Promise<void> {
        new Subscribe(this.hermidata, await RssBuild.init()).makeSubscibeBtn();
    }

    public async makeSortSection(sortSection: HTMLElement): Promise<void> {
        // makeSortHeader(sortSection);
        await new SortOption(this.hermidata, await RssBuild.init()).makeSortOptions(sortSection);

        // needs to be after sort options and before notification are hidden
        updatePolygons();
        document.querySelectorAll<HTMLElement>('.hermidata-item').forEach(item => positionDiamond(item));

        await new SortLogic(this.hermidata, await RssBuild.init()).sortOptionLogic(sortSection);
    }

    public async makeFeedHeader(parent_section: HTMLElement): Promise<void> {
        new FeedItem(await RssBuild.init()).makeFeedHeader(parent_section);
    }
    
    public async makeItemHeader(): Promise<Node> {
        return new FeedItem(await RssBuild.init()).makeItemHeader();
    }
    
    public async makefeedItem(HermidataList: Record<string, Hermidata>, isRSSItem = false): Promise<DocumentFragment> {
        return new FeedItem(await RssBuild.init()).makefeedItem(HermidataList, isRSSItem);
    }
    
    public async makeFooterSection(): Promise<void> {
        new Footer(this.hermidata, await RssBuild.init()).makeFooterSection();
    }

    public async attachEventListeners(): Promise<void> {
        new EventListener(this.hermidata, await RssBuild.init()).attachEventListeners();
    }
}