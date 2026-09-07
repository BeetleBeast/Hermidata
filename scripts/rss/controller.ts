import type { Hermidata } from "../shared/types/index";

import { RssBuild } from "./build";

import { Subscribe } from "./build/Subscribe";
import { FeedItem } from "./build/feed";
import { Footer } from "./build/footer";
import { EventListener } from "./build/EventListener";
import { SortOption } from "./build/SortOption";
import { SortLogic } from "./build/SortLogic";
import { positionDiamondBatch, updatePolygons } from "./build/SetPositionSvg";
import type { HermidataModel } from "../shared/utils/HermidataSelector";


export class BuildRSSController {
    private readonly hermidata: HermidataModel;

    constructor(hermidata: HermidataModel) {
        this.hermidata = hermidata;
    }
    public async makeSubscibeBtn(): Promise<void> {
        new Subscribe(this.hermidata,  await RssBuild.init()).makeSubscibeBtn();
    }
    public async activateAutoSubscribe(): Promise<void> {
        new Subscribe(this.hermidata,  await RssBuild.init()).autoSubscribe();
    }

    public async makeSortSection(sortSection: HTMLElement): Promise<void> {
        
        // makeSortHeader(sortSection);
        await new SortOption(this.hermidata,  await RssBuild.init()).makeSortOptions(sortSection);

        // needs to be after sort options and before notification are hidden
        updatePolygons();

        const allElements = Array.from(document.querySelectorAll<HTMLElement>('.hermidata-item'));

        // set position svg
        positionDiamondBatch(allElements);

        // set tag ellipsis
        this.trimTagOverflowBatch(allElements);

        // set title header if no saved items
        if (allElements.length === 0) {
            const Header = document.querySelector('#All-RSS-entries')?.querySelector('.titleHeader');
            if (Header) Header.textContent = 'No saved items';
        }

        await new SortLogic(this.hermidata,  await RssBuild.init()).sortOptionLogic(sortSection);
    }

    public async makeFeedHeader(parent_section: HTMLElement): Promise<void> {
        new FeedItem( await RssBuild.init()).makeFeedHeader(parent_section);
    }
    
    public async makeItemHeader(): Promise<Node> {
        return new FeedItem( await RssBuild.init()).makeItemHeader();
    }
    
    public async makefeedItem(HermidataList: Record<string, Hermidata>, isRSSItem = false, sortByLastUpdated: boolean = false): Promise<DocumentFragment> {
        return new FeedItem( await RssBuild.init()).makefeedItem(HermidataList, isRSSItem, sortByLastUpdated);
    }
    
    public async makeFooterSection(): Promise<void> {
        new Footer(this.hermidata,  await RssBuild.init()).makeFooterSection();
    }

    public async attachEventListeners(): Promise<void> {
        new EventListener(this.hermidata,  await RssBuild.init()).attachEventListeners();
    }
    private trimTagOverflowBatch(items: HTMLElement[]): void {
        interface Update {
            shrinkTag?: HTMLElement;
            maxWidth?: number;
            hideTags?: HTMLElement[];
        }

        const updates: Update[] = [];
        // read phase
        for (const item of items) {
            const container = item.querySelector<HTMLElement>('.hermidata-item-tag-container');
            if (!container) continue;

            const tags = Array.from(container.querySelectorAll<HTMLElement>('.tag-div'));
            if (tags.length === 0) continue;

            const containerRect = container.getBoundingClientRect();
            const tagRects = tags.map(t => t.getBoundingClientRect()); // one read pass per item, no writes yet

            for (let i = 0; i < tags.length; i++) {
                if (tagRects[i].right > containerRect.right) {
                    const update: Update = {};

                    if (i > 0) {
                        update.shrinkTag = tags[i];
                        update.maxWidth = containerRect.right - tagRects[i].left;
                    }

                    update.hideTags = tags.slice(i + 1);

                    updates.push(update);
                    break; // exit tag loop
                }
            }
        }

        // write phase
        for (const { shrinkTag, maxWidth, hideTags } of updates) {
            if (shrinkTag && maxWidth != null) {
                shrinkTag.style.textOverflow = 'ellipsis';
                shrinkTag.style.flexShrink = '1';
                shrinkTag.style.minWidth = '0';
                shrinkTag.style.maxWidth = maxWidth + 'px';
            }
            hideTags?.forEach(tag => { tag.style.display = 'none'; });
        }
    }
}