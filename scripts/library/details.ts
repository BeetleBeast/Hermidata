import { dbAccess, resolveIdRedirect } from "../shared/db/Storage";
import type { Hermidata, Settings } from "../shared/types";
import { getElement } from "../shared/utils/Selection";
import { openLink } from "../shared/utils/StringOutput";
import { Detail } from "./build/detail";
import { EditDetail } from "./build/edit";
import { MarkerList } from "./build/markers";
import { HermidataModel } from "../shared/utils/HermidataSelector";
import { initTheme } from "../shared/utils/Theme";

void initTheme();

let currentController: Controller | null = null;

document.addEventListener('DOMContentLoaded', handleNavigation);

window.addEventListener('hashchange', handleNavigation);

async function handleNavigation(): Promise<void> {

    if (currentController) currentController.reloadDetails();    
    else {

        const getDb = new dbAccess();
        
        const settings = await getDb.getSettings();
        const allHermidata = await getDb.getAllHermidata();

        // the entry may have been renamed (new id) in the popup while this page was open
        if (!await ensureEntryExists(allHermidata)) return;

        currentController = new Controller(allHermidata, settings);

        await currentController.init();
    }
}

/** Make sure the id in the url points at an existing entry, following id changes when needed. */
async function ensureEntryExists(allHermidata: Record<string, Hermidata>): Promise<boolean> {
    const match = window.location.hash.match(/^#\/id\/(.+)$/);
    const id = match?.[1];
    if (id && allHermidata[id]) return true;

    const movedTo = id ? await resolveIdRedirect(id) : null;
    if (movedTo && allHermidata[movedTo]) {
        history.replaceState(null, '', `#/id/${movedTo}`);
        return true;
    }

    const message = document.createElement('p');
    message.className = 'hermidata-not-found';
    message.textContent = 'This entry no longer exists, it may have been renamed, merged or deleted.';
    document.body.prepend(message);
    document.querySelector<HTMLButtonElement>('#back-btn')?.addEventListener('click', () => openLink('./Library.html', 'sameTab'));
    return false;
}

export class Controller {

    private readonly detail: Detail;

    private readonly editDetail: EditDetail;

    private readonly markers: MarkerList;

    private readonly reloadData = getElement<HTMLButtonElement>("#reload-info-btn");

    private readonly backToLibrary = getElement<HTMLButtonElement>("#back-btn");

    constructor(allHermidata: Record<string, Hermidata>, settings: Settings) {
        // one model for the whole page, so a change made in one part is seen by the others
        const hermidata = new HermidataModel(allHermidata[getIdFromUrl()]);
        this.detail = new Detail(allHermidata, settings, hermidata);
        this.editDetail = new EditDetail(allHermidata, settings, hermidata);
        this.markers = new MarkerList(allHermidata, settings, hermidata, this.editDetail.commit);
        this.editDetail.onRestore = () => this.markers.render();
    }

    public async init() {
        // the fields first: a slow or failing cover must not keep them from working
        this.editDetail.build();
        this.markers.build();
        await this.detail.build();

        this.reloadData?.addEventListener('click', () => this.reloadDetails());
        this.backToLibrary?.addEventListener('click', () => openLink('./Library.html', 'sameTab'));
    }

    public reloadDetails() {
        this.detail.reload();
    }
}

function getIdFromUrl(): string {
    const id = window.location.hash.match(/^#\/id\/(.+)$/)?.[1];
    if (!id) throw new Error('No id found in url');
    return id;
}
