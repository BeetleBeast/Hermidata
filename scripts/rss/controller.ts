import type { Hermidata } from "../shared/types/index";

import { RssBuild } from "./build";

import { Subscribe } from "./build/Subscribe";
import { FeedItem } from "./build/feed";
import { Footer } from "./build/footer";
import { EventListener } from "./build/EventListener";
import { SortOption } from "./build/SortOption";
import { SortLogic } from "./build/SortLogic";
import { updatePolygons, positionDiamond } from "./build/SetPositionSvg";


export class BuildRSSController {
    private readonly hermidata: Hermidata;

    private allHermidata: Record<string, Hermidata> = {};

    constructor(hermidata: Hermidata) {
        this.hermidata = hermidata;
    }
    public async init(): Promise<void> {
        this.allHermidata = await RssBuild.init();
    }

    public async makeSubscibeBtn(): Promise<void> {
        new Subscribe(this.hermidata, this.allHermidata).makeSubscibeBtn();
    }
    public async activateAutoSubscribe(): Promise<void> {
        new Subscribe(this.hermidata, this.allHermidata).autoSubscribe();
    }

    public async makeSortSection(sortSection: HTMLElement): Promise<void> {
        
        // makeSortHeader(sortSection);
        await new SortOption(this.hermidata, this.allHermidata).makeSortOptions(sortSection);

        // needs to be after sort options and before notification are hidden
        updatePolygons(); // potential fix for svg position bug when opening RSS page and notification svg's are not set
        const allElements = await document.querySelectorAll<HTMLElement>('.hermidata-item');
        allElements.forEach(item => positionDiamond(item));

        await new SortLogic(this.hermidata, this.allHermidata).sortOptionLogic(sortSection);
    }

    public async makeFeedHeader(parent_section: HTMLElement): Promise<void> {
        new FeedItem(this.allHermidata).makeFeedHeader(parent_section);
    }
    
    public async makeItemHeader(): Promise<Node> {
        return new FeedItem(this.allHermidata).makeItemHeader();
    }
    
    public async makefeedItem(HermidataList: Record<string, Hermidata>, isRSSItem = false): Promise<DocumentFragment> {
        return new FeedItem(this.allHermidata).makefeedItem(HermidataList, isRSSItem);
    }
    
    public async makeFooterSection(): Promise<void> {
        new Footer(this.hermidata, this.allHermidata).makeFooterSection();
    }

    public async attachEventListeners(): Promise<void> {
        new EventListener(this.hermidata, this.allHermidata).attachEventListeners();
    }
}