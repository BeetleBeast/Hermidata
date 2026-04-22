
import { ext } from '../../shared/BrowserCompat';
import * as StringOutput from '../../shared/StringOutput';
import { Duplicate } from '../../utils/dupplication';
import { type AnyNovelStatus, type AnyNovelType, type AnyReadStatus, type Hermidata, type InputArrayType, type Settings } from '../../shared/types/index';
import { getElement, setElement } from '../../utils/Selection';
import { PastHermidata, type PastHermidata as PastHermidataClass } from '../core/Past';
import { updateChapterProgress } from '../core/save';
import { RSS } from '../../rss/main';
import { getGoogleSheetURL, getSettings } from '../../shared/db/Storage';
import { checkSyncQuota } from '../../shared/db/sync';
import { TagsSystem } from '../core/Tags';

export type CurrentTab = {
    currentChapter: number;
    pageTitle: string;
    url: string;
}


export const makeDefaultHermidata = (type: AnyNovelType, status: AnyReadStatus, novelStatus: AnyNovelStatus): Hermidata => ({
    id: '',
    title: '',
    type:  type,
    url: '',
    source: '',
    status: status,
    chapter: { 
        current: 0,
        latest: 0,
        history: [],
        lastChecked: new Date().toISOString()
    },
    rss: null,
    import: null,
    meta: {
        tags: [],
        notes: '',
        added: new Date().toISOString(),
        updated: new Date().toISOString(),
        altTitles: [],
        originalRelease: null,
        novelStatus: novelStatus
    }
});

const stateConfig = {
    new: {
        text: 'New Item',
        tooltip: 'This is a new Item',
        color: '#3ca69d'
    },
    linked: {
        text: 'Linked Item',
        tooltip: 'This Item is linked to a RSS feed',
        color: 'rgba(1, 175, 118, 0.87)'
    },
    unlinked: {
        text: 'Unlinked Item',
        tooltip: 'This Item is not linked to a RSS feed',
        color: '#3c5ca6'
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const controller = new HermidataController();
    controller.init().catch(console.error);

    // FIXME: this is a hack
    // After popup init — start quietly in the background
    setTimeout(() => controller.RSS?.preloadRSS(), 200)  // slight delay so popup renders first

    setTimeout( () => checkSyncQuota(), 500);
});

class HermidataController {
    public hermidata: Hermidata = makeDefaultHermidata('', '', '');
    
    public past: PastHermidataClass | null = null;

    public RSS: RSS | null = null;

    private dupplicate: Duplicate | null = null;

    private tags: TagsSystem = new TagsSystem();

    get pastHermidata(): Hermidata | null { return this.past?.pastHermidata ?? null; }

    public googleSheetURL: string | undefined;
    public pageTitle: string | undefined;

    private readonly Testing = false;

    public async init(): Promise<void> {
        this.forceSetClassic()
        const [ CurrentTabInfo, googleSheetURL, settings ]: [CurrentTab, string, Settings] = await Promise.all([
            this.getCurrentTabInfo(),
            getGoogleSheetURL(),
            getSettings(),
        ]);
        
        this.hermidata = makeDefaultHermidata(settings.TYPE_OPTIONS[0], settings.STATUS_OPTIONS[0], settings.NOVEL_STATUS_OPTIONS[0]);

        this.googleSheetURL = googleSheetURL;

        // initialize Hermidata with current tab info
        await this.setHermidata(CurrentTabInfo);

        this.past = new PastHermidata(this.hermidata);
        const pastHermidata = await this.past.init();

        await this.setHermidata(CurrentTabInfo, pastHermidata);

        await this.checkForDuplicates();
        
        this.RSS = new RSS(this.hermidata);

        this.populateUI(settings);
        this.bindEvents();
        
        const tags = new TagsSystem();
        await tags.init();
    }
    private async checkForDuplicates(): Promise<void> {
        this.dupplicate = new Duplicate();
        await this.dupplicate.init();
        const dups = await this.dupplicate.findPotentialDuplicates(0.9);
        if (dups.length > 0) console.table(dups, ['potential duplicates']);
    }

    private forceSetClassic() {
        setElement("#HDRSSBtn", el => el.classList = "Btn");
        setElement(".HDRSS", el => el.style.opacity = '0');
        setElement(".HDRSS", el => el.style.display = 'none');
        setElement(".HDClassic", el => el.style.opacity = '1');
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

    
    async getCurrentTabInfo(): Promise<CurrentTab> {
        // Get active tab info
        const promise: Promise<CurrentTab> = new Promise((resolve, reject) => {
            ext.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const tab = tabs[0];
                if (!tab.title || !tab.url) reject(new Error(ext.runtime.lastError?.message)); 
                const currentTab: CurrentTab = {
                    currentChapter: StringOutput.getChapterFromTitle(tab.title!, tab.url!) || 0,
                    pageTitle: tab.title || "Untitled Page",
                    url: tab.url || "NO URL FOUND"
                };
                resolve(currentTab);
            });
        });
        return promise;
    }
    private populateSelect(options: AnyNovelStatus[] | AnyReadStatus[] | AnyNovelType[], selectEl: string) {
        const folderSelect = getElement(selectEl);

        if (!folderSelect) return;

        options.forEach(element => {
            const option = document.createElement("option");
            option.value = element;
            option.textContent = element;
            folderSelect.appendChild(option);
        });
    }
    private async setHermidata(currentTabInfo: CurrentTab, pastHermidata: Hermidata | null = null): Promise<void> {

        if(pastHermidata) this.hermidata = pastHermidata;


        this.pageTitle = currentTabInfo.pageTitle;
        this.hermidata.url = currentTabInfo.url;
        this.hermidata.chapter.current = currentTabInfo.currentChapter;
        
        if (!pastHermidata) {
            // set title & notes
            const trimmedTitle = StringOutput.TrimTitle.trimTitle( currentTabInfo.pageTitle, currentTabInfo.url );
            this.hermidata.title = trimmedTitle.title;
            this.hermidata.meta.notes = trimmedTitle.note ?? '';
        }
    }
    private getState(): keyof typeof stateConfig {
        if (!this.pastHermidata?.title) return 'new';
        if (this.pastHermidata.rss?.latestItem.title) return 'linked';
        return 'unlinked';
    };
    private setChapterPastNumber(hasPast: Hermidata | null = null): void {
        
        const chapter = getElement<HTMLInputElement>("#chapter");
        const previousChapter = getElement<HTMLInputElement>("#previousChapter");
        const chapterContainer = getElement<HTMLInputElement>(".chapter-container");
        const chapterArrow = getElement<HTMLInputElement>("#chapterArrow");
        
        if (!chapter || !previousChapter || !chapterContainer || !chapterArrow) return;

        chapter.dataset.hasPreviousChapter = hasPast ? "true" : 'false';
        previousChapter.dataset.hasPreviousChapter = hasPast ? "true" : 'false';
        chapterContainer.dataset.hasPreviousChapter = hasPast ? "true" : 'false';
        chapterArrow.dataset.hasPreviousChapter = hasPast ? "true" : 'false';
    }
    // data-has-previous-chapter="true"
    private populateUI(settings: Settings): void {
        // All the getElementById calls live here
        const display = this.pastHermidata ?? this.hermidata;

        
        this.RSS?.changePageToClassic();

        this.populateSelect(settings.TYPE_OPTIONS, "#Type");
        this.populateSelect(settings.TYPE_OPTIONS, "#Type_HDRSS");
        this.populateSelect(settings.STATUS_OPTIONS, "#status");
        this.populateSelect(settings.NOVEL_STATUS_OPTIONS, "#NovelStatus");

        this.setChapterPastNumber(this.pastHermidata);



        // backward compatibility for past hermidata
        this.trycapitalizingTypesAndStatus(settings.TYPE_OPTIONS, settings.STATUS_OPTIONS);

        setElement<HTMLInputElement>('#title', el => el.value = display.title);
        setElement<HTMLInputElement>('#previousChapter', el => el.textContent = String(this.hermidata.chapter.history.at(-1) || 0));
        setElement<HTMLInputElement>('#chapter', el => el.value = String(this.hermidata.chapter.current));
        setElement<HTMLSelectElement>('#Type', el => el.value = display.type);
        setElement<HTMLSelectElement>('#status', el => el.value = display.status);
        setElement<HTMLSelectElement>("#NovelStatus", el => el.value = display.meta.novelStatus ?? settings.NOVEL_STATUS_OPTIONS[0]);
        
        this.tags.populateTagPills(this.hermidata.meta.tags, settings.tagColoring);
        
        setElement<HTMLInputElement>('#notes', el => el.value = this.hermidata.meta.notes);

        const state = stateConfig[this.getState()];
        setElement<HTMLHeadingElement>('#isNewHermidata', el => el.textContent = state.text);
        setElement<HTMLTitleElement>('.RSSLinkState-title', el => el.textContent = state.tooltip);
        setElement<SVGPolygonElement>('.RSSLinkState-polygon', el => el.style.fill = state.color);
        
        setElement<HTMLSpanElement>(".version", el => el.textContent = ext.runtime.getManifest().version);

        // HDR RSS
        setElement<HTMLInputElement>("#title_HDRSS", el => el.value = display.title);
        setElement<HTMLInputElement>("#Type_HDRSS", el => el.value = display.type);
    }
    private bindEvents(): void {
        getElement('#save')?.addEventListener('click', () => this.saveSheet());

        getElement("#HDClassicBtn")?.addEventListener("click", (e) => this.RSS?.openClassic(e as PointerEvent));
        getElement("#HDRSSBtn")?.addEventListener("click", async (e) => await this.RSS?.openRSS(e as PointerEvent));

        getElement('.openSettings')?.addEventListener('click', () => {
            ext.runtime.openOptionsPage()
            .catch((error) => console.error('Extention error trying open extention settings: ',error)); 
        });
    }
    private trycapitalizingTypesAndStatus(novelTypes: AnyNovelType[], readStatus: AnyReadStatus[]): void {
        if (this.pastHermidata && Object.values(this.pastHermidata).length > 0) {
            if (!novelTypes.includes(this.pastHermidata.type)) {
                let capitalizeFirstLetterOfStringLetterType = capitalizeFirstLetterOfString(this.pastHermidata.type)
                if ( novelTypes.includes(capitalizeFirstLetterOfStringLetterType) ) this.pastHermidata.type = capitalizeFirstLetterOfStringLetterType
                else {
                    console.warn('type can\'t be found in past', this.pastHermidata.type)
                }
            }
            if (!readStatus.includes(this.pastHermidata.status)) {
                let capitalizeFirstLetterOfStringLetterStatus = capitalizeFirstLetterOfString(this.pastHermidata.status)
                if ( readStatus.includes(capitalizeFirstLetterOfStringLetterStatus) ) this.pastHermidata.status = capitalizeFirstLetterOfStringLetterStatus
                else {
                    console.warn('status can\'t be found in past', this.pastHermidata.status)
                }
            }
        } else console.log('[Main Popup] no past hermidata')
    }

    private async saveSheet(): Promise<void> { 

        // from front-end
        const title = getElement<HTMLInputElement>("#title")?.value;
        const Type = getElement<HTMLSelectElement>('#Type')?.value as AnyNovelType;
        const Chapter = getElement<HTMLInputElement>("#chapter")?.value;
        const status = getElement<HTMLSelectElement>('#status')?.value as AnyReadStatus;
        const notes = getElement<HTMLInputElement>("#notes")?.value || "";
        // from back-end
        const url = this.hermidata.url;
        const date = new Intl.DateTimeFormat('en-GB').format(new Date());

        const tagsArray = this.tags.getTags();

        if (!title || !Type || !Chapter || !status) throw new Error('Missing required fields');

        this.hermidata.title = title;
        this.hermidata.type = Type;
        this.hermidata.chapter.current = Number(Chapter);
        this.hermidata.chapter.history.push(this.hermidata.chapter.current);
        this.hermidata.status = status;
        this.hermidata.meta.tags = tagsArray;
        this.hermidata.meta.notes = notes;

        // save to Browser in JSON format
        await updateChapterProgress(title, Type, this.hermidata);
        this.past = null;

        const data: InputArrayType = [title, Type, Number(Chapter), url, status, date, tagsArray, notes]

        // save to google sheet & bookmark/replace bookmark
        ext.runtime.sendMessage({
            type: "SAVE_NOVEL",
            data: data,
            args: ""
        });

        if(!this.Testing) setTimeout( () => window.close(), 400);
    }
}

function capitalizeFirstLetterOfString<T extends AnyNovelType | AnyReadStatus>(str: AnyNovelType | AnyReadStatus ): T {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) as T : str as T;
}