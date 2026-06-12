import type { Hermidata, Settings } from "../shared/types";
import { getElement } from "../shared/utils/Selection";
import { RSSPageBuilder } from "./build";
import { Bulk } from "./build/bulk";
import { Detail } from "./build/detail";
import { feed } from "./build/feed";

export class RSSPageController {

    private readonly feed: feed;
    private readonly bulk: Bulk;

    private readonly reloadData = getElement<HTMLButtonElement>("#reloadData");

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
    }
    private removeEventListener() {
        this.reloadData!.removeEventListener('click', () => this.reload());
    }
}