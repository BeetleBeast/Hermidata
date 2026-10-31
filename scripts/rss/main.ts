import { ErrorMessage, logConsoleError } from "../shared/utils/ErrorMessage";
import { PastHermidata } from "../popup/core/Past";
import type { Hermidata, RSSData, RssDOM } from "../shared/types/index";
import type { HermidataModel } from "../shared/utils/HermidataSelector";
import { getElement, setElement } from "../shared/utils/Selection";
import { BuildRSSController } from "./controller";
import { getHermidataNotification } from "./load";


let rssPreloadPromise: Promise<RssDOM> | null = null;

let rssDOMCache: RssDOM | null = null;

/*
0. Cache constants

1. Preload RSS data

( IN RssDOM Class )

2. Build RSS DOM 
3. Insert RSS DOM
*/



export class RSS {

    private readonly BuildRSS: BuildRSSController;

    constructor(hermidata: HermidataModel, allHermidata: Record<string, Hermidata>) {
        this.BuildRSS = new BuildRSSController(hermidata, allHermidata);
    }

    public openClassic(e: PointerEvent) {
        this.changePageToClassic();
        this.changClassListOfClassic(e);
    }
    private changClassListOfClassic(e: PointerEvent): void {
        const target = e.target as HTMLButtonElement;
        target.classList = "active Btn";
    }

    public async openRSS(e: PointerEvent) {
        try {

            const reportBackgroundError = (error: unknown) => {
                new ErrorMessage("Could not finish the RSS subscribe setup.", undefined, {
                    consoleLevel: 'error',
                    details: [error]
                }).sendMessage();
            };


            this.changePageToRSS(e);
            const sortSection = getElement<HTMLDivElement>("#sort-RSS-entries");
            const notification = getElement<HTMLDivElement>("#RSS-Notification");
            const allSec = getElement("#All-RSS-entries");

            if (!sortSection || !notification || !allSec) throw new Error('Element not found');

            this.showLoadingAnimation();

            notification.innerHTML = "";
            allSec.innerHTML = "";
            
            const subscribeBtn = this.BuildRSS.makeSubscribeBtn().catch(reportBackgroundError); // makeSubscribeBtn is async and can take a while
            this.changeLoadingBar(5, 'assigning subscribe button');
            
            this.changeLoadingBar(10, 'assigning feed header');
            await this.BuildRSS.makeFeedHeader(notification);
            
            this.changeLoadingBar(50, 'inserting RSS items');
            // If preloaded, use it instantly
            const dom = await (rssPreloadPromise ?? this.preloadRSS());
            this.insertRSSPage(dom, {notificationSec: notification, allSec: allSec});
            
            this.changeLoadingBar(20, 'making sort section');
            await this.BuildRSS.makeSortSection(sortSection);

            this.changeLoadingBar(5, 'attaching event listeners');
            await this.BuildRSS.attachEventListeners()

            this.changeLoadingBar(5, 'adding footer');
            await this.BuildRSS.makeFooterSection();

            this.changeLoadingBar(4, 'adding flutters'); // autoSubscribe is optional so it should't always be shown to the user
            const autoSubscribe = this.BuildRSS.activateAutoSubscribe().catch(reportBackgroundError); // autoSubscribe is async and can take a while

            this.changeLoadingBar(1, 'finished');
            setTimeout(() => this.hideLoadingAnimation(), 100); // slight delay so that any async calls have a chance to finish


        } catch (error) {
            new ErrorMessage("Could not open the RSS view.", undefined, {
                consoleLevel: 'error',
                details: [error]
            }).sendMessage();
            this.hideLoadingAnimation();
        }
    }
    public changePageToClassic() {
        setElement("#HDRssBtn", el => el.classList = "Btn");
        setElement(".HDRss", el => el.style.opacity = String(0));
        setElement(".HDRss", el => el.style.display = 'none');
        setElement(".HDClassic", el => el.style.opacity = String(1));
        setElement(".HDClassic", el => el.style.overflow = 'hidden');
        
        // deactivate links in classic
        document.querySelectorAll<HTMLButtonElement>(".HDRss").forEach(a => {
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
        rssDomPackage.notifications.items.appendChild(await this.BuildRSS.makeFeedItem(feeds, false, true));

        // Build all items header
        rssDomPackage.allItems.header.appendChild(await this.BuildRSS.makeItemHeader());

        // Build full items list
        rssDomPackage.allItems.items.appendChild(await this.BuildRSS.makeFeedItem(hermidata, true));

        return rssDomPackage;
    }
    public async preloadRSS(): Promise<RssDOM> {
        try {
            if (rssPreloadPromise) return rssPreloadPromise;


            const data = await this.loadRSSData();
            rssDOMCache = await this.buildRSSDom(data);

            rssPreloadPromise = Promise.resolve(rssDOMCache);

            return rssPreloadPromise;
        }
        catch (error) {
            logConsoleError(error);
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

    private insertRSSPage(dom: RssDOM, {notificationSec, allSec}: { notificationSec: Element; allSec: Element; }) {
        try {
            notificationSec.appendChild(dom.notifications.items.cloneNode(true));
            allSec.appendChild(dom.allItems.header.cloneNode(true));
            allSec.appendChild(dom.allItems.items.cloneNode(true));
        } catch (error) {
            new ErrorMessage("Could not display the RSS entries.", undefined, {
                consoleLevel: 'error',
                details: [error]
            }).sendMessage();
        }
    }

    private changePageToRSS(e: PointerEvent) {
        const target = e.target as HTMLButtonElement;
        target.classList = "active Btn";
        setElement("#HDClassicBtn", el => el.classList = "Btn");
        setElement(".HDClassic", el => el.style.opacity = '0');
        setElement(".HDRss", el => el.style.display = 'block');
        setElement(".HDRss", el => el.style.opacity = '1');
        // deactivate links in classic
        document.querySelectorAll<HTMLButtonElement>(".HDClassic").forEach(a => {
            a.style.pointerEvents = 'none';
        });
        // activate links in RSS
        document.querySelectorAll<HTMLButtonElement>(".HDRss").forEach(a => {
            a.style.pointerEvents = 'auto';
        });
        document.body.style.height = '580px'; // chromium limit is 600px
        if (document.body.offsetWidth <= 300) document.body.style.width = '664px'; // chromium & firefox limit is 800px
    }
    private showLoadingAnimation() {
        setElement(".HDClassic", el => {
            el.style.opacity = '0';
            el.style.overflow = 'clip'; // make it no be able to scroll while waiting
            el.style.cursor = 'wait'; // make the cursor a wait cursor
            el.style.pointerEvents = 'none'; // make it not clickable
        });
        setElement(".HDRss", el => {
            el.style.opacity = '0';
            el.style.overflow = 'clip'; // make it no be able to scroll while waiting
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
        setElement(".HDRss", el => {
            el.style.opacity = '1';
            el.style.overflowY = 'auto';
            el.style.overflowX = 'hidden';
            el.style.cursor = 'default';
            el.style.pointerEvents = 'auto';
        });
        setElement('.material-symbols-outlinedContainer', el => el.style.display = 'none');
    }
    private percent: number = 0;

    private changeLoadingBar(adding: number, label?: string) {
        //if (this.percent > 100) return;

        this.percent += adding;
        const percent = this.percent > 100 ? 100 : this.percent;

        setElement('.loading-bar', el => el.style.width = `${percent}%`);
        if (label) setElement('.loading-bar-label', el => el.innerHTML = label);
    }

}