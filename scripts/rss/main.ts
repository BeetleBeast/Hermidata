import { PastHermidata } from "../popup/core/Past";
import type { RSSData, RSSDOM } from "../shared/types/rssType";
import type { Hermidata } from "../shared/types/popupType";
import { getElement, setElement } from "../utils/Selection";
import { BuildRSSController } from "./controller";
import { getHermidataWithRssFromBackground } from "./load";
import { positionDiamond, positionItemLines, updatePolygons } from "./build";


let rssPreloadPromise: Promise<RSSDOM> | null = null;

let rssDOMCache: RSSDOM | null = null;

/*
0. Cashe constants

1. Preload RSS data

( IN RSSDOM Class )

2. Build RSS DOM 
3. Insert RSS DOM
*/



export class RSS {

    private readonly BuildRSS: BuildRSSController;

    constructor(hermidata: Hermidata) {
        this.BuildRSS = new BuildRSSController(hermidata);
    }

    public openClassic(e: PointerEvent) {
        this.changePageToClassic();
        this.changclassListofClassic(e);
    }
    private changclassListofClassic(e: PointerEvent): void {
        const target = e.target as HTMLButtonElement;
        target.classList = "active Btn";
    }

    public async openRSS(e: PointerEvent) {
        this.changePageToRSS(e);
        const sortSection = getElement("#sort-RSS-entries");
        const notification = getElement("#RSS-Notification")
        const allSec = getElement("#All-RSS-entries");

        if (!sortSection || !notification || !allSec) throw new Error('Element not found');

        // If preloaded, use it instantly
        const dom = await (rssPreloadPromise ?? this.preloadRSS());

        notification.innerHTML = "";
        allSec.innerHTML = "";
        
        await this.BuildRSS.makeSubscibeBtn();
        
        await this.BuildRSS.makeFeedHeader(notification);
        
        this.insertRSSPage(dom, {notifSec: notification, allSec: allSec});
        
        await this.BuildRSS.makeSortSection(sortSection);
        
        updatePolygons(); // needs to be after sort
        document.querySelectorAll<HTMLElement>('.hermidata-item').forEach(li => positionItemLines(li));
        document.querySelectorAll<HTMLElement>('.hermidata-item').forEach(li => positionDiamond(li));

        await this.BuildRSS.attachEventListeners()

        await this.BuildRSS.makeFooterSection();
    }
    public changePageToClassic() {
        setElement("#HDRSSBtn", el => el.classList = "Btn");
        setElement(".HDRSS", el => el.style.opacity = String(0));
        setElement(".HDRSS", el => el.style.display = 'none');
        setElement(".HDClassic", el => el.style.opacity = String(1));
        setElement(".HDClassic", el => el.style.overflow = 'hidden');
        
        // deactivate links in classic
        document.querySelectorAll<HTMLButtonElement>(".HDRSS").forEach(a => {
            a.style.pointerEvents = 'none';
        });
        // activate links in RSS
        document.querySelectorAll<HTMLButtonElement>(".HDClassic").forEach(a => {
            a.style.pointerEvents = 'auto';
        });
        document.body.style.height = '';
    }
    public async buildRSSDom(data: RSSData) {
        const { feeds, hermidata } = data;

        const rssDomPackage = {
            notifications: {
                items: document.createDocumentFragment(),
            },
            allItems: {
                header: document.createDocumentFragment(),
                items: document.createDocumentFragment(),
            },
        };

        // Build notification items
        rssDomPackage.notifications.items.appendChild(await this.BuildRSS.makefeedItem(feeds, false));

        // Build all items header
        rssDomPackage.allItems.header.appendChild(await this.BuildRSS.makeItemHeader());

        // Build full items list
        rssDomPackage.allItems.items.appendChild(await this.BuildRSS.makefeedItem(hermidata, true));

        return rssDomPackage;
    }
    public async preloadRSS(): Promise<RSSDOM> {
        if (rssPreloadPromise) return rssPreloadPromise;

        rssPreloadPromise = (async () => {
            const data = await this.loadRSSData();
            rssDOMCache = await this.buildRSSDom(data);
            return rssDOMCache;
        })();

        return rssPreloadPromise;
    }
    // --- Private ---

    private async loadRSSData(): Promise<RSSData> {
        const [feeds, hermidata] = await Promise.all([
            getHermidataWithRssFromBackground(),
            PastHermidata.getAllHermidata()
        ]);
        const merged = { ...hermidata, ...feeds }; // Overwrite stale hermidata entries with the updated RSS ones

        return { feeds, hermidata: merged };
    }

    private insertRSSPage(dom: RSSDOM, {notifSec, allSec}: { notifSec: Element; allSec: Element; }) {
        try {
            notifSec.appendChild(dom.notifications.items.cloneNode(true));
            allSec.appendChild(dom.allItems.header.cloneNode(true));
            allSec.appendChild(dom.allItems.items.cloneNode(true));
        } catch (error) {
            console.error('Failed to insert RSS page',error);
        }
    }

    private changePageToRSS(e: PointerEvent) {
        const target = e.target as HTMLButtonElement;
        target.classList = "active Btn";
        setElement("#HDClassicBtn", el => el.classList = "Btn");
        setElement(".HDClassic", el => el.style.opacity = '0');
        setElement(".HDRSS", el => el.style.display = 'block');
        setElement(".HDRSS", el => el.style.opacity = '1');
        // deactivate links in classic
        document.querySelectorAll<HTMLButtonElement>(".HDClassic").forEach(a => {
            a.style.pointerEvents = 'none';
        });
        // activate links in RSS
        document.querySelectorAll<HTMLButtonElement>(".HDRSS").forEach(a => {
            a.style.pointerEvents = 'auto';
        });
        
        document.body.style.height = '650px';
        if (document.body.offsetWidth <= 300) document.body.style.width = '664px';
    }

}