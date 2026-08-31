import type { Hermidata, Settings } from "../shared/types";
import { getElement } from "../shared/utils/Selection";
import { openLink } from "../shared/utils/StringOutput";
import { dbAcsess } from "./build";
import { Detail } from "./build/detail";
import { EditDetail } from "./build/edit";

let currentController: Controller | null = null;

document.addEventListener('DOMContentLoaded', handleNavigation);

window.addEventListener('hashchange', handleNavigation);

async function handleNavigation(): Promise<void> {

    if (currentController) currentController.reloadDetails();    
    else {

        const getDb = new dbAcsess();
        
        const settings = await getDb.getSettings();
        const allHermidata = await getDb.getAllHermidata();

        currentController = new Controller(allHermidata, settings);

        await currentController.init();
    }
}

export class Controller {

    private readonly detail: Detail;

    protected readonly editDetail: EditDetail;

    private readonly editInfoBtn = document.querySelector<HTMLDivElement>('#edit-info-btn');

    private readonly reloadData = getElement<HTMLButtonElement>("#reload-info-btn");

    private readonly backToLibrary = getElement<HTMLButtonElement>("#back-btn");

    private readonly chapterViewMode = getElement<HTMLButtonElement>("#library-entries-ViewMode-grid");
    private readonly dateViewMode = getElement<HTMLButtonElement>("#library-entries-ViewMode-list");

    constructor(allHermidata: Record<string, Hermidata>, settings: Settings) {
        this.detail = new Detail(allHermidata, settings);
        this.editDetail = new EditDetail(allHermidata, settings);
    }

    public async init() {
    
        // build
        this.detail.build();

        this.editDetail.build();

        this.setEventListener();
    }

    public reloadDetails() {
        this.detail.reload();
    }

    private async reload() {
        this.detail.reload();
    }

    private setEventListener() {
        this.removeEventListener();
        this.reloadData!.addEventListener('click', () => this.reload());

        // on clicked Edit button
        this.editInfoBtn?.addEventListener('click', this.editDetail.activate);

        // on clicked Back button
        this.backToLibrary?.addEventListener('click', () => openLink('./dist/pages/Library.html', 'sameTab'));

        // viewMode toggle
        // this.chapterViewMode?.addEventListener('click', () => this.detail.setGridViewMode('chapter'));
        // this.dateViewMode?.addEventListener('click', () => this.detail.setGridViewMode('date'));
    }
    private removeEventListener() {
        this.reloadData!.removeEventListener('click', () => this.reload());
    }
}