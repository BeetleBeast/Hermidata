import { PastHermidata } from "../popup/core/Past";
import type { RSSData, RSSDOM } from "../shared/types/index";
import type { HermidataModel } from "../shared/utils/HermidataSelector";
import { getElement, setElement } from "../shared/utils/Selection";
import { BuildRSSController } from "./controller";
import { getHermidataNotification } from "./load";


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

    constructor(hermidata: HermidataModel) {
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
        try {
            this.changePageToRSS(e);
            const sortSection = getElement<HTMLDivElement>("#sort-RSS-entries");
            const notification = getElement<HTMLDivElement>("#RSS-Notification");
            const allSec = getElement("#All-RSS-entries");

            if (!sortSection || !notification || !allSec) throw new Error('Element not found');


            // If already built in DOM, skip heavy rebuild and just run deferred layout updates
            if (notification.childElementCount > 0 || allSec.childElementCount > 0) { 
                // defer heavy layout-dependent work so browser can paint
                requestAnimationFrame(async () => {
                    await this.BuildRSS.makeSortSection(sortSection);
                    await this.BuildRSS.attachEventListeners();
                    await this.BuildRSS.makeFooterSection();
                    await this.BuildRSS.activateAutoSubscribe();
                    this.hideLoadingAnimation(); 
                }); 
                
                return; 
            }

            this.showLoadingAnimation();
            const t0 = performance.now();

            // If preloaded, use it instantly
            const dom = await (rssPreloadPromise ?? this.preloadRSS());

            notification.innerHTML = "";
            allSec.innerHTML = "";
            
            await this.BuildRSS.makeSubscibeBtn();
            
            await this.BuildRSS.makeFeedHeader(notification);
            
            this.insertRSSPage(dom, {notifSec: notification, allSec: allSec});

            requestAnimationFrame(async () => {
            
                await this.BuildRSS.makeSortSection(sortSection);

                await this.BuildRSS.attachEventListeners()

                await this.BuildRSS.makeFooterSection();

                await this.BuildRSS.activateAutoSubscribe();
            });

            setTimeout(() => this.hideLoadingAnimation(t0), 100); // slight delay so that any async calls have a chance to finish
        } catch (error) {
            console.error(error);
        }
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
        console.time('Build notification items');
        rssDomPackage.notifications.items.appendChild(await this.BuildRSS.makefeedItem(feeds, false, true));
        console.timeEnd('Build notification items');

        // Build all items header
        console.time('Build all items header');
        rssDomPackage.allItems.header.appendChild(await this.BuildRSS.makeItemHeader());
        console.timeEnd('Build all items header');
        // Build full items list
        console.time('Build all items list');
        rssDomPackage.allItems.items.appendChild(await this.BuildRSS.makefeedItem(hermidata, true));
        console.timeEnd('Build all items list');

        return rssDomPackage;
    }
    public async preloadRSS(): Promise<RSSDOM> {
        try {
            if (rssPreloadPromise) return rssPreloadPromise;

            console.time('get data');
            const data = await this.loadRSSData();
            console.timeEnd('get data');
            console.time('build dom');
            rssDOMCache = await this.buildRSSDom(data);
            console.timeEnd('build dom');
            console.time('RSS DOM preloaded and cached');
            rssPreloadPromise = Promise.resolve(rssDOMCache);
            console.timeEnd('RSS DOM preloaded and cached');
            return rssPreloadPromise;
        }
        catch (error) {
            console.error(error);
            throw error;
        }
    }
    // --- Private ---

    private async loadRSSData(): Promise<RSSData> {
        const [feeds, hermidata] = await Promise.all([
            getHermidataNotification(),
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
        document.body.style.height = '580px'; // chromium limit is 600px
        if (document.body.offsetWidth <= 300) document.body.style.width = '664px'; // chromium & firefox limit is 800px
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
    private hideLoadingAnimation(timer?: number) {
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

        if (timer) console.log('RSS page loaded in', performance.now() - timer, 'ms');
    }

}