import type { Hermidata, Settings } from "../shared/types";
import { getElement } from "../shared/utils/Selection";
import { feed } from "./build/feed";
import { filter } from "./build/setFilter";
import { FilterLogic } from "./build/filterLogic";
import { HermidataMerge } from "./build/merge";

export class Controller {
    

    private readonly feed: feed;

    private readonly filter: filter;
    
    private readonly filterLogic: FilterLogic;

    private readonly merger: HermidataMerge;

    private readonly reloadData = getElement<HTMLButtonElement>("#reloadData");

    private readonly gridViewMode = getElement<HTMLButtonElement>("#library-entries-ViewMode-grid");
    private readonly listViewMode = getElement<HTMLButtonElement>("#library-entries-ViewMode-list");

    constructor(allHermidata: Record<string, Hermidata>, settings: Settings) {
        this.feed = new feed(allHermidata, settings);
        this.filter = new filter(allHermidata, settings);
        this.filterLogic = new FilterLogic(allHermidata, settings);
        this.merger = new HermidataMerge(allHermidata, settings);
    }



    public async init() {
        // build
        await this.feed.build();


        this.filter.build();

        this.filterLogic.build();
        
        this.merger.build();


        this.setEventListener();
    }

    private async reload() {
        await this.feed.reload();
    }

    private setEventListener() {
        this.removeEventListener();
        this.reloadData!.addEventListener('click', () => this.reload());

        // viewMode toggle
        this.gridViewMode?.addEventListener('click', () => this.feed.setGridViewMode('grid'));
        this.listViewMode?.addEventListener('click', () => this.feed.setGridViewMode('list'));
    }
    private removeEventListener() {
        this.reloadData!.removeEventListener('click', () => this.reload());
    }
}