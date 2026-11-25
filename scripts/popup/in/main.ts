import { ErrorMessage, logConsoleError, WarningMessage } from "../../shared/utils/ErrorMessage";

import { ext } from '../../shared/utils/BrowserCompat';
import { getChapterFromTitle, generateHermidataHash } from '../../shared/utils/StringOutput';
import { type AnyNovelStatus, type AnyNovelType, type AnyReadStatus, type CurrentTab, type Hermidata, type Settings } from '../../shared/types/index';
import { getElement, setElement } from '../../shared/utils/Selection';
import { PastHermidata } from '../core/Past';
import { RSS } from '../../rss/main';
import { getAllHermidata, getSettings } from '../../shared/db/Storage';
import { checkSyncQuota } from '../../shared/sync/sync.engine';
import { TagsSystem } from '../core/Tags';
import { HermidataMigration } from '../../shared/migration/Hermidata';
import { BookmarkController } from '../core/Bookmark';
import { HermidataModel } from '../../shared/utils/HermidataSelector';
import { customConfirm } from '../frontend/confirm';
import { chooseItem } from '../frontend/itemChooser';
import { linkAsAdaptation } from '../core/save';
import { getSeparateProminence } from '../core/separateProminence';
import { HermidataService } from "./service";
import { shortcutEventListener } from "../core/shortcuts";
import { initTheme } from "../../shared/utils/Theme";

void initTheme();


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
    const { Hermidata, past } = await startupPromise;
    // initialize the controller class
    const controller = new HermidataController(Hermidata, past);
    // initialize the controller
    await controller.init();

    // After popup init — start quietly in the background
    await controller.RSS?.preloadRSS().catch(error => {
        new ErrorMessage("Could not prepare the RSS view.", undefined, {
            consoleLevel: 'error',
            details: [error]
        }).sendMessage();
    });

    setTimeout( async () => checkSyncQuota(), 500);
    // look for changes from other devices now instead of waiting for the next poll (fire and forget)
    ext.runtime.sendMessage({ type: 'SYNC_REFRESH' }).catch(() => undefined);
});

document.addEventListener('keydown', async (e) => shortcutEventListener(e));

class HermidataController {
    private hermidata: HermidataModel;

    private past: PastHermidata;

    public RSS: RSS | null = null;

    private bookmarkSystem: BookmarkController;

    private tagsSystem: TagsSystem = new TagsSystem();

    private duplicate: HermidataMigration = new HermidataMigration();

    private isSaving = false;

    get pastHermidata(): Hermidata | null { return this.past?.pastHermidata ?? null; }

    private service: HermidataService | null = null;

    public pageTitle: string | undefined;

    private readonly Testing = false;

    constructor(Hermidata: HermidataModel, past: PastHermidata) {
        this.hermidata = Hermidata;
        this.past = past;

        this.forceSetClassic();

        // initialize bookmark system
        this.bookmarkSystem = new BookmarkController(this.hermidata, this.pastHermidata === null);
        this.bookmarkSystem.init();
    }

    public async init(): Promise<void> {
        console.time('[POPUP] init: get-settings');
        const settings = await getSettings();
        console.timeEnd('[POPUP] init: get-settings');

        this.populateUI(settings);
        
        this.bindEvents();

        // initialize RSS mode
        this.RSS = new RSS(this.hermidata, await getAllHermidata());
        // open RSS mode if shortcut was used
        await this.openRSSIfSetInsideSession();

        // initialize tags system
        await this.tagsSystem.init(settings);

        this.service = new HermidataService(settings);

        // log a table of all potential duplicates
        // set it up in the background
        setTimeout(() => this.checkForDuplicates(), 0);
    }
    private async openRSSIfSetInsideSession(): Promise<void> {
        const { popupMode } = await ext.storage.session.get<{ popupMode: 'rss' | 'classic' }>('popupMode');
        await ext.storage.session.remove("popupMode");
        
        if (popupMode === 'rss') this.RSS?.openRSS(new PointerEvent('click'));
    }
    private async checkForDuplicates(): Promise<void> {
        await this.duplicate.init();
        const duplicates = await this.duplicate.findPotentialDuplicates(0.9);
        if (duplicates.length > 0) console.table(duplicates);
    }

    private forceSetClassic() {
        setElement("#HDRssBtn", el => { el.classList = "Btn"; el.setAttribute("aria-pressed", "false"); });
        setElement(".HDRss", el => el.style.opacity = '0');
        setElement(".HDRss", el => el.style.display = 'none');
        setElement(".HDClassic", el => el.style.opacity = '1');
        setElement(".HDClassic", el => el.style.overflow = 'hidden');
        
        // deactivate links in classic
        document.querySelectorAll<HTMLButtonElement>(".HDRss").forEach(a => {
            a.style.pointerEvents = 'none';
        });
        // activate links in RSS
        document.querySelectorAll<HTMLButtonElement>(".HDClassic").forEach(a => {
            a.style.pointerEvents = 'auto';
        });
        document.body.style.height = '';
    }

    
    static async getCurrentTabInfo(): Promise<CurrentTab> {
        // Get active tab info
        return new Promise<CurrentTab>((resolve, reject) => {
            ext.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const tab = tabs[0];
                if (!tab.title || !tab.url) reject(new Error(ext.runtime.lastError?.message)); 
                const currentTab: CurrentTab = {
                    currentChapter: getChapterFromTitle(tab.title, tab.url!) || 0,
                    pageTitle: tab.title || "Untitled Page",
                    url: tab.url || "NO URL FOUND"
                };
                resolve(currentTab);
            });
        });
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
    private getState(): keyof typeof stateConfig {
        if (!this.pastHermidata?.title) return 'new';
        if (this.pastHermidata.rss.some(feed => feed.latestItem?.title)) return 'linked';
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


        this.RSS?.changePageToClassic();

        this.populateSelect(settings.ContentTypesAndStatuses.TYPE_OPTIONS, "#Type");
        this.populateSelect(settings.ContentTypesAndStatuses.TYPE_OPTIONS, "#Type_HDRss");
        this.populateSelect(settings.ContentTypesAndStatuses.STATUS_OPTIONS, "#status");
        this.populateSelect(settings.ContentTypesAndStatuses.NOVEL_STATUS_OPTIONS, "#NovelStatus");

        this.setChapterPastNumber(this.pastHermidata);



        // backward compatibility for past hermidata
        this.tryCapitalizingTypesAndStatus(settings.ContentTypesAndStatuses.TYPE_OPTIONS, settings.ContentTypesAndStatuses.STATUS_OPTIONS);

        setElement<HTMLInputElement>('#title', el => el.value = this.hermidata.title);
        setElement<HTMLInputElement>('#previousChapter', el => el.textContent = String(this.hermidata.GetLatestReadChapter()));
        setElement<HTMLInputElement>('#chapter', el => el.value = String(this.hermidata.GetChapter()));
        setElement<HTMLSelectElement>('#Type', el => el.value = this.hermidata.novelType);
        setElement<HTMLSelectElement>('#status', el => el.value = this.hermidata.GetReadStatus());
        setElement<HTMLSelectElement>("#NovelStatus", el => el.value = this.hermidata.meta.novelStatus ?? settings.ContentTypesAndStatuses.NOVEL_STATUS_OPTIONS[0]);
        
        this.tagsSystem.populateTagPills(this.hermidata.meta.tags, settings.TagManagement.tagColoring);
        
        setElement<HTMLInputElement>('#notes', el => el.value = this.hermidata.meta.notes);

        this.updateSeparateProminence();

        const state = stateConfig[this.getState()];
        setElement<HTMLHeadingElement>('#isNewHermidata', el => el.textContent = state.text);
        setElement<HTMLTitleElement>('.RSSLinkState-title', el => el.textContent = state.tooltip);
        setElement('.RSSLinkState-svg', el => el.setAttribute('aria-label', state.tooltip));
        setElement<SVGPolygonElement>('.RSSLinkState-polygon', el => el.style.fill = state.color);
        
        setElement<HTMLSpanElement>(".version", el => el.textContent = ext.runtime.getManifest().version);

        // HDR RSS
        setElement<HTMLInputElement>("#title_HDRss", el => el.value = this.hermidata.title);
        setElement<HTMLInputElement>("#Type_HDRss", el => el.value = this.hermidata.novelType);
    }
    private bindEvents(): void {
        getElement('#save')?.addEventListener('click', () => this.saveSheet());
        getElement('#saveSeparate')?.addEventListener('click', () => this.saveAsSeparateItem());
        getElement('#Type')?.addEventListener('change', () => this.updateSeparateProminence());

        getElement("#HDClassicBtn")?.addEventListener("click", (e) => this.RSS?.openClassic(e as PointerEvent));
        getElement("#HDRssBtn")?.addEventListener("click", async (e) => await this.RSS?.openRSS(e as PointerEvent));

        getElement('.openSettings')?.addEventListener('click', () => {
            ext.runtime.openOptionsPage()
            .catch((error) => new ErrorMessage("Could not open settings.", undefined, {
                consoleLevel: 'error',
                details: [error]
            }).sendMessage());
        });

        


    }
    private tryCapitalizingTypesAndStatus(novelTypes: AnyNovelType[], readStatus: AnyReadStatus[]): void {
        if (this.pastHermidata && Object.values(this.pastHermidata).length > 0) {
            if (!novelTypes.includes(this.pastHermidata.novelType)) {
                let capitalizeFirstLetterOfStringLetterType = capitalizeFirstLetterOfString(this.pastHermidata.novelType)
                if ( novelTypes.includes(capitalizeFirstLetterOfStringLetterType) ) this.pastHermidata.novelType = capitalizeFirstLetterOfStringLetterType
                else {
                    new WarningMessage(`The saved item uses an unavailable content type: ${this.pastHermidata.novelType}.`).sendMessage();
                }
            }
            if (!readStatus.includes(this.pastHermidata.chapter.bookmarks[this.pastHermidata.chapter.bookmarkInUse].readStatus)) {
                let capitalizeFirstLetterOfStringLetterStatus = capitalizeFirstLetterOfString(this.pastHermidata.chapter.bookmarks[this.pastHermidata.chapter.bookmarkInUse].readStatus)
                if ( readStatus.includes(capitalizeFirstLetterOfStringLetterStatus) ) this.pastHermidata.chapter.bookmarks[this.pastHermidata.chapter.bookmarkInUse].readStatus = capitalizeFirstLetterOfStringLetterStatus
                else {
                    new WarningMessage(`The saved item uses an unavailable reading status: ${this.pastHermidata.chapter.bookmarks[this.pastHermidata.chapter.bookmarkInUse].readStatus}.`).sendMessage();
                }
            }
        } else console.log('[Main Popup] no past hermidata')
    }

    private async saveSheet(): Promise<void> {
        if (this.isSaving) return;
        this.isSaving = true;
        this.setSaveInProgress(true, '#save');
        let closeAfterSave = false;

        try {
            // update this.hermidata with latest values
            this.updateHermidata();


            // if new novel type, then merge the old to new
            const hasMergedNovelType = await this.updateNovelType();
            if (!hasMergedNovelType) return;

            // migrate if duplicate
            const hasMigrated = await this.migrateIfDuplicate();
            if (hasMigrated) console.info('migration plan activated');

            const settings = await getSettings();
            
            // update settings ( add new tags if new added in UI )
            await this.updateSettings(settings);

            const saved = await this.service?.saveHermidata(this.hermidata);

            if (!this.Testing && saved) {
                closeAfterSave = true;
                setTimeout(() => window.close(), 400);
            }
        } catch (error) {
            new ErrorMessage("Could not save this item.", undefined, {
                consoleLevel: 'error',
                details: [error]
            }).sendMessage();
        } finally {
            if (!closeAfterSave) {
                this.isSaving = false;
                this.setSaveInProgress(false, '#save');
            }
        }
    }
    /** Both save buttons lock while saving, but only the one that was clicked shows it is working */
    private setSaveInProgress(isSaving: boolean, clicked: '#save' | '#saveSeparate'): void {
        for (const selector of ['#save', '#saveSeparate'] as const) {
            setElement<HTMLButtonElement>(selector, button => {
                const isBusy = isSaving && selector === clicked;
                button.disabled = isSaving;
                button.setAttribute('aria-busy', String(isBusy));
                button.dataset.saving = String(isBusy);
            });
        }
    }
    /** Shows "Save as separate item" as prominently as the match calls for ( styled by .saveActions[data-separate] ) */
    private updateSeparateProminence(): void {
        const past = this.pastHermidata;
        const type = getElement<HTMLSelectElement>('#Type')?.value;
        const prominence = getSeparateProminence({
            hasSameTitled: past !== null || this.past.isAmbiguous,
            declinedAll: past === null && this.past.isAmbiguous,
            exactMatch: this.past.isExactMatch,
            typeChanged: past !== null && type !== undefined && type !== past.novelType,
        });
        setElement<HTMLDivElement>('.saveActions', el => el.dataset.separate = prominence);
    }
    /** Saves the page as its own item, leaving the same-titled saved item untouched */
    private async saveAsSeparateItem(): Promise<void> {
        if (this.isSaving || !this.service) return;
        this.isSaving = true;
        this.setSaveInProgress(true, '#saveSeparate');
        let closeAfterSave = false;

        try {
            const page = await this.createSeparatePage();
            const original = this.pastHermidata;

            // same title and type is the risky case ( two items that look identical ): ask first.
            // a different type was chosen on purpose ( novel <-> manga ) and is asked about linking below
            const sameTypeAsSaved = original !== null && original.novelType === page.novelType;
            if (sameTypeAsSaved && !await customConfirm(
                `Save this page as a new item? "${original.title}" (${original.novelType}) stays as it is.`,
                { accept: "Save as new", reject: "Cancel" }
            )) return;

            // a different type of the same title is most likely an adaptation ( novel <-> manga )
            const link = original !== null && original.novelType !== page.novelType && await customConfirm(
                `Link "${page.title}" (${page.novelType}) and "${original.title}" (${original.novelType}) as adaptations of each other?`,
                { accept: "Link", reject: "Don't link" }
            );

            await this.updateSettings(await getSettings());
            const saved = await this.service.saveAsSeparateItem(page);

            if (saved && link && original) await linkAsAdaptation(original.id, page.id).catch(error => new ErrorMessage("Saved the new item, but could not link it to the existing one.", undefined, {
                consoleLevel: 'error',
                details: [error]
            }).sendMessage());

            if (!this.Testing && saved) {
                closeAfterSave = true;
                setTimeout(() => window.close(), 400);
            }
        } catch (error) {
            new ErrorMessage("Could not save this page as a separate item.", undefined, {
                consoleLevel: 'error',
                details: [error]
            }).sendMessage();
        } finally {
            if (!closeAfterSave) {
                this.isSaving = false;
                this.setSaveInProgress(false, '#saveSeparate');
            }
        }
    }
    /** A fresh item from the current tab and the form, without the saved item's markers or history */
    private async createSeparatePage(): Promise<HermidataModel> {
        const { title, Type, Chapter, status, novelStatuses, notes } = this.getLatestValueFromUI();
        if (!title || !Type || !status || !novelStatuses) throw new Error('Missing required fields');

        const page = HermidataModel.from(Type, status, novelStatuses);
        page.SetFromTab(await HermidataController.getCurrentTabInfo());
        page.title = title;
        page.SetChapter(Chapter);
        page.meta.tags = this.tagsSystem.tags;
        page.meta.notes = notes;
        return page;
    }
    /** merge novel type if changed */
    private async updateNovelType(): Promise<boolean> {
        // 1. check if the novel type has changed
        const novelTypeChanged = this.past.pastHermidata ? this.past.pastHermidata?.novelType !== this.hermidata.novelType : false;

        // 2. If the novel type has *not* changed, return true (no merge needed)
        if (!novelTypeChanged || !this.past.pastHermidata) return true;

        // an item not stored under the hash of its title and type ( a separate item ) has nothing to move:
        // it keeps its id and the save changes its type in place
        const past = this.past.pastHermidata;
        if (past.id !== generateHermidataHash(past.title, past.novelType)) {
            if (!await this.confirmNovelTypeChange(past, this.hermidata.novelType)) return false;
            this.hermidata.id = past.id;
            return true;
        }

        // 3. If the novel type has changed, generate a new id
        const newId = generateHermidataHash(this.hermidata.title, this.hermidata.novelType);

        // that title and type is already another saved item ( e.g. a separate manga ): merging into it would overwrite it
        const holder = (await PastHermidata.getAllHermidata())[newId];
        if (holder && holder.id !== this.past.pastHermidata.id) {
            new WarningMessage(`"${holder.title}" (${holder.novelType}) is already saved, so the type was not changed and nothing was saved.`).sendMessage();
            return false;
        }
        this.hermidata.id = newId;
        
        // 4. If the user confirms the merge, merge the two hermidatas and return the new hermidata, else return false
        const newHermidata = await this.mergeNovelType(this.hermidata, this.past.pastHermidata)

        if (!newHermidata) return false;
        
        this.hermidata = new HermidataModel(newHermidata);
        return true;
    }
    private confirmNovelTypeChange(older: Hermidata, newType: AnyNovelType): Promise<boolean> {
        const msg = `
            The Novel Type of "${older.title}" will changed from "${older.novelType}" to "${newType}".
            <br>
            <br>
            Are you sure you want to change it?
        `;
        return customConfirm(msg, { accept: "Change", reject: "Cancel"});
    }
    private async mergeNovelType(newer: Hermidata, older: Hermidata): Promise<Hermidata | false> {
        // 1. let user confirm the merge
        const confirmed = await this.confirmNovelTypeChange(older, newer.novelType);

        if (!confirmed) {
            logConsoleError('new Hermidata has different novel type and user declined to merge');
            return false;
        }
        // 2. merge
        const merged = await HermidataMigration.mergeTwoHermidata(newer, older);

        if (merged instanceof Error) {
            new ErrorMessage("Could not merge the existing item.", undefined, {
                consoleLevel: 'error',
                details: [merged]
            }).sendMessage();
            return false;
        }
        // 3. return
        console.log(`Merged "${older.title}" with "${newer.title}"`);
        return merged;
    }
    private async updateSettings(settings: Settings): Promise<void> {
        // update tags in settings if new tags are added
        await this.tagsSystem.saveTags(settings);
    }
    private async migrateIfDuplicate(): Promise<boolean> {
        // if the Hermidata is a past entry but with a modified Type
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
    /** Updates the Hermidata from the UI & back-end  */
    private updateHermidata() {

        
        // from front-end
        const { title, Type, Chapter, status, novelStatuses, notes } = this.getLatestValueFromUI();
        
        if (!title || !Type || ( Chapter === undefined || Chapter === null ) || !status || !novelStatuses) throw new Error('Missing required fields');
        
        
        // get latest values from UI and back-end
        this.hermidata.chapter.bookmarkInUse = this.bookmarkSystem.bookmarkInUseID ?? this.hermidata.chapter.bookmarkInUse;
        this.hermidata.title = title;
        this.hermidata.novelType = Type;
        this.hermidata.SetChapter(Chapter);
        this.hermidata.SetReadStatus(status);
        this.hermidata.meta.novelStatus = novelStatuses;
        this.hermidata.meta.tags = this.tagsSystem.tags;
        this.hermidata.meta.notes = notes;
    }
    private getLatestValueFromUI() {
        const title = getElement<HTMLInputElement>("#title")?.value;
        const Type = getElement<HTMLSelectElement>('#Type')?.value as AnyNovelType || undefined;
        const Chapter = getElement<HTMLInputElement>("#chapter")?.value;
        const status = getElement<HTMLSelectElement>('#status')?.value as AnyReadStatus || undefined;
        const novelStatuses = getElement<HTMLSelectElement>('#NovelStatus')?.value as AnyNovelStatus || undefined;
        const notes = getElement<HTMLInputElement>("#notes")?.value || "";
        return {
            title,
            Type,
            Chapter: Number(Chapter),
            status,
            novelStatuses,
            notes
        }
    }
}

const startupPromise = (async () => startup())();
export async function startup(): Promise<{Hermidata: HermidataModel, past: PastHermidata}> {
    const [ CurrentTabInfo, settings ]: [CurrentTab, Settings] = await Promise.all([
        HermidataController.getCurrentTabInfo(),
        getSettings(),
    ]);

    const defaultNovelType = settings.ContentTypesAndStatuses.TYPE_OPTIONS[0];
    const defaultNovelStatus = settings.ContentTypesAndStatuses.NOVEL_STATUS_OPTIONS[0];
    const defaultReadStatus = settings.ContentTypesAndStatuses.STATUS_OPTIONS[0];

    // create a Hermidata baseplate
    const Hermidata = new HermidataModel(HermidataModel.from(defaultNovelType, defaultReadStatus, defaultNovelStatus));
    // set the values from the tab
    Hermidata.SetFromTab(CurrentTabInfo);
    // initialize the  PastHermidata class
    const past = new PastHermidata(Hermidata);
    // create the Hermidata with all values set from a past if it exists
    await Hermidata.SetPast(past);

    // several same-titled items and no clear winner: the user decides, nothing is picked for them
    if (past.resolution?.kind === 'ambiguous') {
        const chosen = await chooseItem(past.resolution.candidates);
        if (chosen) {
            past.choose(chosen);
            await Hermidata.SetPast(past);
        }
    }

    return { Hermidata, past };
}

function capitalizeFirstLetterOfString<T extends AnyNovelType | AnyReadStatus>(str: AnyNovelType | AnyReadStatus ): T {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) as T : str as T;
}