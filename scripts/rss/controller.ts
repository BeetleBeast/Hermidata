import type { Hermidata } from "../shared/types/index";
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

    private allHermidata: Record<string, Hermidata>;


    private subscriber: Subscribe;
    private SortOption: SortOption;
    private sortLogic: SortLogic;
    private feedItem: FeedItem;
    private eventListener: EventListener;
    private footer: Footer;

    constructor(hermidata: HermidataModel, allHermidata: Record<string, Hermidata>) {
        this.hermidata = hermidata;
        this.allHermidata = allHermidata;

        this.subscriber = new Subscribe(this.hermidata, this.allHermidata);
        this.SortOption = new SortOption(this.hermidata, this.allHermidata);
        this.sortLogic = new SortLogic(this.hermidata, this.allHermidata);
        this.feedItem = new FeedItem(this.allHermidata);
        this.eventListener = new EventListener(this.hermidata, this.allHermidata);
        this.footer = new Footer(this.hermidata, this.allHermidata);
    }

    public async makeSubscribeBtn(): Promise<void> {
        return this.subscriber.makeSubscribeBtn();
    }
    public async activateAutoSubscribe(): Promise<boolean> {
        return this.subscriber.autoSubscribe();
    }

    public async makeSortSection(sortSection: HTMLElement): Promise<void> {
        
        // makeSortHeader(sortSection);
        await this.SortOption.makeSortOptions(sortSection);

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

        await this.sortLogic.sortOptionLogic(sortSection);
    }

    public async makeFeedHeader(parent_section: HTMLElement): Promise<void> {
        this.feedItem.makeFeedHeader(parent_section);
    }
    
    public async makeItemHeader(): Promise<Node> {
        return this.feedItem.makeItemHeader();
    }
    
    public async makeFeedItem(HermidataList: Record<string, Hermidata>, isRSSItem = false, sortByLastUpdated: boolean = false): Promise<DocumentFragment> {
        return this.feedItem.makeFeedItem(HermidataList, isRSSItem, sortByLastUpdated);
    }
    
    public async makeFooterSection(): Promise<void> {
        this.footer.makeFooterSection();
    }

    public async attachEventListeners(): Promise<void> {
        this.eventListener.attachEventListeners();
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