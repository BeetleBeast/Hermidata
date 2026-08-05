import { getAllHermidata, getSettings } from "../shared/db/Storage";
import type { Hermidata, Settings } from "../shared/types";
import { getElement } from "../shared/utils/Selection";
import { Detail } from "./build/detail";

document.addEventListener('DOMContentLoaded', async () => {
    const settings = await getSettings();
    const allHermidata = await getAllHermidata();
    const rssPage = new Controller(allHermidata, settings);
    await rssPage.init()
});


export class Controller {

    private readonly detail: Detail;

    private readonly reloadData = getElement<HTMLButtonElement>("#reload-info-btn");

    private readonly chapterViewMode = getElement<HTMLButtonElement>("#library-entries-ViewMode-grid");
    private readonly dateViewMode = getElement<HTMLButtonElement>("#library-entries-ViewMode-list");

    constructor(allHermidata: Record<string, Hermidata>, settings: Settings) {
        this.detail = new Detail(allHermidata, settings);
    }

    public async init() {
    
        // build
        this.detail.build();

        this.setEventListener();
    }

    private async reload() {
        this.detail.reload();
    }

    private setEventListener() {
        this.removeEventListener();
        this.reloadData!.addEventListener('click', () => this.reload());

        // viewMode toggle
        // this.chapterViewMode?.addEventListener('click', () => this.detail.setGridViewMode('chapter'));
        // this.dateViewMode?.addEventListener('click', () => this.detail.setGridViewMode('date'));
    }
    private removeEventListener() {
        this.reloadData!.removeEventListener('click', () => this.reload());
    }
}