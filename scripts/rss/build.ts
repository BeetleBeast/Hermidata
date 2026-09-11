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

    constructor(hermidata: HermidataModel, AllHermidata: Record<string, Hermidata>) {
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

}