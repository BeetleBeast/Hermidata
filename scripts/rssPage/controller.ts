import type { Hermidata, Settings } from "../shared/types";
import { getElement } from "../shared/utils/Selection";
import { Bulk } from "./build/bulk";
import { feed } from "./build/feed";

export class RSSPageController {

    private readonly feed: feed;
    private readonly bulk: Bulk;

    private readonly reloadData = getElement<HTMLButtonElement>("#reloadData");

    private readonly search = getElement<HTMLButtonElement>("#search");

    constructor(allHermidata: Record<string, Hermidata>, settings: Settings) {
        this.feed = new feed(allHermidata, settings);
        this.bulk = new Bulk(allHermidata, settings);
    }



    public async init() {
        // build
        await this.feed.build();
        await this.bulk.build();

        this.setEventListener();
    }

    private async reload() {
        await this.feed.reload();
        await this.bulk.reload();
    }

    private setEventListener() {
        this.removeEventListener();
        this.reloadData!.addEventListener('click', () => this.reload());
        this.search!.addEventListener('input', (e) => this.updateFeedList(e) );
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