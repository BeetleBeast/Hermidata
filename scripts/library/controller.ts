import type { Hermidata, Settings } from "../shared/types";
import { getElement } from "../shared/utils/Selection";
import { feed } from "./build/feed";
import { filter } from "./build/setFilter";

export class Controller {
    

    private readonly feed: feed;

    private readonly filter: filter;
    

    private readonly reloadData = getElement<HTMLButtonElement>("#reloadData");

    private readonly search = getElement<HTMLButtonElement>("#search");

    private readonly gridViewMode = getElement<HTMLButtonElement>("#library-entries-ViewMode-grid");
    private readonly listViewMode = getElement<HTMLButtonElement>("#library-entries-ViewMode-list");

    constructor(allHermidata: Record<string, Hermidata>, settings: Settings) {
        this.feed = new feed(allHermidata, settings);
        this.filter = new filter(allHermidata, settings);
    }



    public async init() {
        // build
        await this.feed.build();

        await this.filter.build();

        this.setEventListener();
    }

    private async reload() {
        await this.feed.reload();
    }

    private setEventListener() {
        this.removeEventListener();
        this.reloadData!.addEventListener('click', () => this.reload());
        this.search!.addEventListener('input', (e) => this.updateFeedList(e) );

        // viewMode toggle
        this.gridViewMode?.addEventListener('click', () => this.feed.setGridViewMode('grid'));
        this.listViewMode?.addEventListener('click', () => this.feed.setGridViewMode('list'));
    }
    private removeEventListener() {
        this.reloadData!.removeEventListener('click', () => this.reload());
    }

    private updateFeedList(e: Event) {
        const value = (e.target as HTMLInputElement).value;
        const AllHermidataContainer = document.querySelector<HTMLDivElement>('.all-entries-container');
        if (!AllHermidataContainer) return;
        const allFeeds = AllHermidataContainer?.querySelectorAll<HTMLDivElement>('.feed');

        if (value == '') {
            AllHermidataContainer?.classList.remove('filtered');
            allFeeds?.forEach(feed => feed.classList.remove('filtered'));
        }
        for (const feed of allFeeds || []) {
            if (feed.textContent?.toLowerCase().includes(value.toLowerCase())) {
                feed.classList.remove('filtered');
                continue;
            }
            feed.classList.add('filtered');
        }
    }
}