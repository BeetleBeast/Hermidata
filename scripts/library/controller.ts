import { dbAccess } from "../shared/db/Storage";
import type { Hermidata, Settings } from "../shared/types";
import { getElement } from "../shared/utils/Selection";
import { openLink } from "../shared/utils/StringOutput";
import { feed } from "./build/feed";
import { filter } from "./build/setFilter";
import { FilterLogic } from "./build/filterLogic";
import { HermidataMerge } from "./build/merge";
import type { DualRangeSlider } from "../shared/utils/DualRangeSlider";

export class Controller {
    

    private readonly feed: feed;

    private readonly filter: filter;
    
    private readonly filterLogic: FilterLogic;

    private readonly merger: HermidataMerge;

    private readonly reloadData = getElement<HTMLButtonElement>("#reloadData");
    private readonly openReadingList = getElement<HTMLButtonElement>("#openReadingList");

    private readonly gridViewMode = getElement<HTMLButtonElement>("#library-entries-ViewMode-grid");
    private readonly listViewMode = getElement<HTMLButtonElement>("#library-entries-ViewMode-list");

    constructor(allHermidata: Record<string, Hermidata>, settings: Settings) {
        this.feed = new feed(allHermidata, settings);
        this.filter = new filter(allHermidata, settings, this);
        this.filterLogic = new FilterLogic(allHermidata, settings, this);
        this.merger = new HermidataMerge(allHermidata, settings, () => this.reload());
    }

    public range: DualRangeSlider | null = null;


    public async init() {
        // build
        this.feed.build();


        this.filter.build();

        await this.filterLogic.build();
        
        this.merger.build();


        this.setEventListener();
    }

    private async reload() {
        const allHermidata = await new dbAccess().getAllHermidata();

        for (const builder of [this.feed, this.filter, this.filterLogic, this.merger]) builder.setData(allHermidata);

        this.feed.reload();
        this.merger.reload();
        await this.filterLogic.reload();
    }

    private setEventListener() {
        this.removeEventListener();
        this.reloadData!.addEventListener('click', () => this.reload());
        this.openReadingList?.addEventListener('click', () => void openLink('ReadingList.html', 'sameTab'));

        // viewMode toggle
        this.gridViewMode?.addEventListener('click', () => this.feed.setGridViewMode('grid'));
        this.listViewMode?.addEventListener('click', () => this.feed.setGridViewMode('list'));
    }
    private removeEventListener() {
        this.reloadData!.removeEventListener('click', () => this.reload());
    }
}