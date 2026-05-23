
import { ext } from '../../shared/BrowserCompat';
import * as StringOutput from '../../shared/StringOutput';
import { type AnyNovelStatus, type AnyNovelType, type AnyReadStatus, type Hermidata, type InputArrayType, type LatestValue, type NovelStatus, type ReadStatus, type Settings } from '../../shared/types/index';
import { getElement, setElement } from '../../utils/Selection';
import { PastHermidata, type PastHermidata as PastHermidataClass } from '../core/Past';
import { updateChapterProgress } from '../core/save';
import { RSS } from '../../rss/main';
import { getGoogleSheetURL, getSettings } from '../../shared/db/Storage';
import { checkSyncQuota } from '../../shared/db/sync';
import { TagsSystem } from '../core/Tags';
import { HermidataMigration } from '../../shared/migration/Hermidata';
import { returnBookmarkHash } from '../../shared/StringOutput';
import { BookmarkController } from '../core/Bookmark';

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
        bookmarks: {
            [returnBookmarkHash('Primary')]: {
                id: returnBookmarkHash('Primary'),
                current: 0,
                history: [],
                label: 'Primary',
                color: 'blue',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                note: '',
                isPrimary: true
            }
        },
        latest: 0,
        lastChecked: new Date().toISOString(),
        revisitingCount: 0
    },
    rss: null,
    import: null,
    meta: {
        tags: [],
        notes: '',
        added: new Date().toISOString(),
        updated: new Date().toISOString(),
        altSources: [],
        altTitles: [],
        originalRelease: null,
        novelStatus: novelStatus,
        bookmarkInUse: returnBookmarkHash('Primary')
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

document.addEventListener('DOMContentLoaded', async () => {
    const controller = new HermidataController();
    await controller.init();

    // FIXME: this is a hack
    // After popup init — start quietly in the background
    setTimeout(() => controller.RSS?.preloadRSS(), 500)  // slight delay so popup renders first

    setTimeout( () => checkSyncQuota(), 500);
});

class HermidataController {
    public hermidata: Hermidata = makeDefaultHermidata('', '', '');
    
    public past: PastHermidataClass | null = null;

    public RSS: RSS | null = null;

    private dupplicate: HermidataMigration | null = null;

    private tagsSystem: TagsSystem = new TagsSystem();

    private bookmarkSystem: BookmarkController | null = null;

    get pastHermidata(): Hermidata | null { return this.past?.pastHermidata ?? null; }

    public pageTitle: string | undefined;

    private CurrentTabInfo: CurrentTab | null = null;

    private readonly Testing = false;

    public async init(): Promise<void> {
        this.forceSetClassic()
        const [ CurrentTabInfo, settings ]: [CurrentTab, Settings] = await Promise.all([
            this.getCurrentTabInfo(),
            getSettings(),
        ]);
        
        this.hermidata = makeDefaultHermidata(
            settings.ContentTypesAndStatuses.TYPE_OPTIONS[0], 
            settings.ContentTypesAndStatuses.STATUS_OPTIONS[0], 
            settings.ContentTypesAndStatuses.NOVEL_STATUS_OPTIONS[0]
        );

        this.CurrentTabInfo = CurrentTabInfo;

        // initialize Hermidata with current tab info
        await this.setHermidata(CurrentTabInfo);

        this.past = new PastHermidata(this.hermidata);
        const pastHermidata = await this.past.init();

        await this.setHermidata(CurrentTabInfo, pastHermidata);

        await this.checkForDuplicates();
        
        this.RSS = new RSS(this.hermidata);

        const isNewHermidata = this.pastHermidata === null;

        this.bookmarkSystem = new BookmarkController(this.hermidata, isNewHermidata);
        this.bookmarkSystem.init();

        this.populateUI(settings);
        this.bindEvents();
        
        await this.tagsSystem.init();
    }
    private async checkForDuplicates(): Promise<void> {
        this.dupplicate = new HermidataMigration();
        await this.dupplicate.init();
        const dups = await this.dupplicate.findPotentialDuplicates(0.9);
        if (dups.length > 0) console.table(dups);
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
        this.hermidata.chapter.bookmarks[this.hermidata.meta.bookmarkInUse].current = currentTabInfo.currentChapter;
        
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

        this.populateSelect(settings.ContentTypesAndStatuses.TYPE_OPTIONS, "#Type");
        this.populateSelect(settings.ContentTypesAndStatuses.TYPE_OPTIONS, "#Type_HDRSS");
        this.populateSelect(settings.ContentTypesAndStatuses.STATUS_OPTIONS, "#status");
        this.populateSelect(settings.ContentTypesAndStatuses.NOVEL_STATUS_OPTIONS, "#NovelStatus");

        this.setChapterPastNumber(this.pastHermidata);



        // backward compatibility for past hermidata
        this.trycapitalizingTypesAndStatus(settings.ContentTypesAndStatuses.TYPE_OPTIONS, settings.ContentTypesAndStatuses.STATUS_OPTIONS);

        setElement<HTMLInputElement>('#title', el => el.value = display.title);
        setElement<HTMLInputElement>('#previousChapter', el => el.textContent = String(this.hermidata.chapter.bookmarks[this.hermidata.meta.bookmarkInUse]?.history?.at(-1) || 0));
        setElement<HTMLInputElement>('#chapter', el => el.value = String(this.hermidata.chapter.bookmarks[this.hermidata.meta.bookmarkInUse].current));
        setElement<HTMLSelectElement>('#Type', el => el.value = display.type);
        setElement<HTMLSelectElement>('#status', el => el.value = display.status);
        setElement<HTMLSelectElement>("#NovelStatus", el => el.value = display.meta.novelStatus ?? settings.ContentTypesAndStatuses.NOVEL_STATUS_OPTIONS[0]);
        
        this.tagsSystem.populateTagPills(this.hermidata.meta.tags, settings.TagManagement.tagColoring);
        
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

        // get latest values from UI and back-end
        const latestValue = this.getLatestValue();
        // update this.hermidata with latest values
        this.updateHermidata(latestValue);

        
        // TODO: sheck if it works
        // migrate if duplicate
        const hasMigrated = await this.migrateIfDuplicate();
        
        const settings = await getSettings();
        const allowedSendSHeet = settings.ExtensionBehaviour.SaveTarget.GoogleSpreadsheet;
        const allowedSendBookmark = settings.ExtensionBehaviour.SaveTarget.BrowserBookmark;
        // update settings ( add new tags if new added in UI )
        await this.updateSettings(settings);

        // save to Browser in JSON format
        const savedInStorage = await updateChapterProgress(latestValue.title, latestValue.Type, this.hermidata);
        // save to google sheet
        const saved = await this.saveBookmarkOrAndSheet({allowedSendBookmark, allowedSendSHeet}, latestValue);

        if (!this.Testing && savedInStorage && saved ) setTimeout( () => window.close(), 400);
    }
    private async saveBookmarkOrAndSheet(allowenced: {allowedSendBookmark: boolean, allowedSendSHeet: boolean }, latestValue: LatestValue): Promise<boolean> {
        const data: InputArrayType = [latestValue.title, latestValue.Type, latestValue.Chapter, latestValue.url, latestValue.status, latestValue.date, latestValue.tagsArray, latestValue.notes]
        // save to google sheet & bookmark/replace bookmark
        if (allowenced.allowedSendBookmark || allowenced.allowedSendSHeet || (allowenced.allowedSendBookmark && allowenced.allowedSendSHeet)) {
            const saved = await ext.runtime.sendMessage({
                type: "SAVE_NOVEL",
                data: data,
                args: { 
                    allowedSendSHeet: allowenced.allowedSendSHeet, 
                    allowedSendBookmark: allowenced.allowedSendBookmark
                },
            }) as boolean;
            return saved
        }
        return true
    }
    private async updateSettings(settings: Settings): Promise<void> {
        // update tags in settings if new tags are added
        await this.tagsSystem.saveTags(settings);
    }
    private async migrateIfDuplicate(): Promise<boolean> {
        // if the Hermidata is a past entry but with a mofified Type
        // then give option to migrate it to the new type
        const newPast = new PastHermidata(this.hermidata);
        const newHermidata = await newPast.checkForDuplicates();
        console.log('oldHermidata', this.hermidata);
        console.log('newHermidata', newHermidata);
        if (newHermidata) {
        // this.hermidata = newHermidata;
        return true
        }
        return false
    }
    private updateHermidata(latestValue: LatestValue) {
        const { title, Type, Chapter, status, novelStatuses, tagsArray, notes } = latestValue;
        this.hermidata.title = title;
        this.hermidata.type = Type;
        this.hermidata.chapter.bookmarks[this.hermidata.meta.bookmarkInUse].current = Number(Chapter);
        this.updateHermidataChapterHistory();
        this.hermidata.status = status;
        this.hermidata.meta.novelStatus = novelStatuses;
        this.hermidata.meta.tags = tagsArray;
        this.hermidata.meta.notes = notes;
        this.updateHermidataSources();
    }
    private updateHermidataSources() {
        const url = this.CurrentTabInfo?.url;
        if (!url) return
        const currentUrlSource = new URL(url).hostname.replace(/^www\./, "");
        const savedUrlSource = new URL(this.hermidata.url).hostname.replace(/^www\./, "");
        const possibleRSSSource = this.hermidata.rss?.domain;
        const altSources = this.hermidata.meta.altSources;

        // check if url is already in sources
        if (!altSources.includes(currentUrlSource)) this.hermidata.meta.altSources.push(currentUrlSource);
        // check if RSS source is different / isn't saved in alt sources
        if (possibleRSSSource && !altSources.includes(possibleRSSSource)) this.hermidata.meta.altSources.push(possibleRSSSource);
        // check if current url source is different from saved url source
        // NOTE: hermidata.source is the latest source used NOT the first used
        // NOTE: first used is the first item in altSources
        if (currentUrlSource !== savedUrlSource) this.hermidata.source = currentUrlSource;

        // remove duplicates & empty entries
        this.hermidata.meta.altSources = Array.from( new Set(this.hermidata.meta.altSources) ).filter(Boolean);
    }
    private updateHermidataChapterHistory() {
        // if history is undefined
        if (this.hermidata.chapter.bookmarks[this.hermidata.meta.bookmarkInUse]?.history === undefined) this.hermidata.chapter.bookmarks[this.hermidata.meta.bookmarkInUse].history = [];
        // max 20 entries in history
        
        if (this.hermidata.chapter.bookmarks[this.hermidata.meta.bookmarkInUse]?.history?.length >= 20) {
            this.hermidata.chapter.bookmarks[this.hermidata.meta.bookmarkInUse]?.history?.shift()
        }
        this.hermidata.chapter.bookmarks[this.hermidata.meta.bookmarkInUse]?.history?.push(this.hermidata.chapter.bookmarks[this.hermidata.meta.bookmarkInUse].current);
        // only unique entries in history
        this.hermidata.chapter.bookmarks[this.hermidata.meta.bookmarkInUse].history = Array.from( new Set(this.hermidata.chapter.bookmarks[this.hermidata.meta.bookmarkInUse]?.history) );
        
    }
    private getLatestValue(): LatestValue {
        // from front-end
        const { title, Type, Chapter, status, novelStatuses, notes } = this.getLatestValueFromUI();
        // from back-end
        const { url, date, tagsArray } = this.getLatestValueFromBackEnd();

        if (!title || !Type || !Chapter || !status) throw new Error('Missing required fields');

        return { title, Type, Chapter: Number(Chapter), url, status, novelStatuses, date, tagsArray, notes }
    }
    private getLatestValueFromUI() {
        const title = getElement<HTMLInputElement>("#title")?.value;
        const Type = getElement<HTMLSelectElement>('#Type')?.value as AnyNovelType;
        const Chapter = getElement<HTMLInputElement>("#chapter")?.value;
        const status = getElement<HTMLSelectElement>('#status')?.value as AnyReadStatus;
        const novelStatuses = getElement<HTMLSelectElement>('#NovelStatus')?.value as AnyNovelStatus;
        const notes = getElement<HTMLInputElement>("#notes")?.value || "";
        return {
            title,
            Type,
            Chapter,
            status,
            novelStatuses,
            notes
        }
    }
    private getLatestValueFromBackEnd() {
        const url = this.hermidata.url;
        const date = new Intl.DateTimeFormat('en-GB').format(new Date());

        const tagsArray = this.tagsSystem.tags;

        return {
            url,
            date,
            tagsArray
        }
    }
}

function capitalizeFirstLetterOfString<T extends AnyNovelType | AnyReadStatus>(str: AnyNovelType | AnyReadStatus ): T {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) as T : str as T;
}