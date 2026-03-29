
import { ext } from '../../shared/BrowserCompat';
import * as StringOutput from '../../shared/StringOutput';
import { Duplicate, makeDefaultHermidata } from '../../utils/dupplication';
import { type Hermidata, type NovelType, type ReadStatus, novelTypes, readStatus, type TrimmedTitle } from '../../shared/types/popupType';
import { getElement, setElement } from '../../utils/Selection';
import { PastHermidata, type PastHermidata as PastHermidataClass } from '../core/Past';
import { updateChapterProgress } from '../core/save';
import { RSS } from '../../rss/main';
import { getAllTags, getGoogleSheetURL, getSuggestedTags } from '../../shared/Storage';
import { customPrompt } from '../frontend/confirm';

export type CurrentTab = {
    currentChapter: number;
    pageTitle: string;
    url: string;
}

document.addEventListener('DOMContentLoaded', () => {
    const controller = new HermidataController();
    controller.init().catch(console.error);

    // After popup init — start quietly in the background
    setTimeout(() => controller.RSS?.preloadRSS(), 500)  // slight delay so popup renders first
});

class HermidataController {
    public hermidata: Hermidata = makeDefaultHermidata();
    
    public past: PastHermidataClass | null = null;

    public RSS: RSS | null = null;

    private dupplicate: Duplicate | null = null;

    get pastHermidata(): Hermidata | null { return this.past?.pastHermidata ?? null; }

    public googleSheetURL: string | undefined;
    public pageTitle: string | undefined;

    private readonly HARDCAP_RUNAWAYGROWTH = 300;

    private readonly Testing = false;

    public async init(): Promise<void> {
        this.forceSetClassic()
        const [ CurrentTabInfo, googleSheetURL ]: [CurrentTab, string] = await Promise.all([
            this.getCurrentTabInfo(),
            getGoogleSheetURL(),
        ])

        this.googleSheetURL = googleSheetURL;

        // initialize Hermidata with current tab info
        await this.setHermidata(CurrentTabInfo);

        this.past = new PastHermidata(this.hermidata);
        const pastHermidata = await this.past.init();

        await this.setHermidata(CurrentTabInfo, pastHermidata);

        await this.checkForDuplicates();
        
        this.RSS = new RSS(this.hermidata);

        this.populateUI(await PastHermidata.getAllHermidata());
        this.bindEvents();
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
    
    private populateType() {
        const folderSelect = getElement("#Type");
        const folderSelect2 = getElement("#Type_HDRSS")

        if (!folderSelect || !folderSelect2) return;

        novelTypes.forEach(element => {
            const option = document.createElement("option");
            option.value = element;
            option.textContent = element;
            folderSelect.appendChild(option);
            const option2 = document.createElement("option");
            option2.value = element;
            option2.textContent = element;
            folderSelect2.appendChild(option2);
        });
    }
    private populateStatus() {
        const folderSelect = getElement("#status");

        if (!folderSelect) return;

        readStatus.forEach(element => {
            const option = document.createElement("option");
            option.value = element;
            option.textContent = element;
            folderSelect.appendChild(option);
        });
    }
    private initTags(AllHermidata: Record<string, Hermidata>): void {
        const select = getElement<HTMLSelectElement>('#tags');
        if (!select) return;

        const allTags = getAllTags(AllHermidata);
        const currentTags = this.hermidata.meta.tags ?? [];

        // Clear and rebuild
        select.innerHTML = '';

        // Default none option
        const noneOption = document.createElement('option');
        noneOption.value = '';
        noneOption.textContent = 'None';
        select.appendChild(noneOption);

        // Existing tags
        for (const [tag, count] of allTags.entries()) {
            const option = document.createElement('option');
            option.value = tag;
            option.textContent = `${tag} (${count})`;
            option.selected = currentTags.includes(tag);
            select.appendChild(option);
        }

        // Divider
        select.appendChild(document.createElement('hr'));

        // New tag option
        const newOption = document.createElement('option');
        newOption.value = '__new__';
        newOption.textContent = '+ New tag...';
        select.appendChild(newOption);

        // Handle selection
        select.addEventListener('change', () => {
            if (select.value === '__new__') {
                this.promptNewTag(select, allTags);
                return;
            }
            if (select.value === '') {
                this.hermidata.meta.tags = [];
                return;
            }
            // AND selection — toggle tag in/out of selected list
            if (this.hermidata.meta.tags.includes(select.value)) {
                this.hermidata.meta.tags = this.hermidata.meta.tags.filter(t => t !== select.value);
            } else {
                this.hermidata.meta.tags.push(select.value);
            }
            this.updateTagDisplay(select);
        });
    }

    private async promptNewTag( select: HTMLSelectElement, allTags: Map<string, number> ): Promise<void> {
        
        const newTag = await customPrompt('Enter new tag name:', 'Tag...');
        if (!newTag) return;

        // Reset select back so it doesn't stay on "+ New tag..."
        select.value = newTag && this.hermidata.meta.tags.includes(newTag)
            ? newTag
            : (this.hermidata.meta.tags[0] ?? '');

        if (!newTag) return;
        if (allTags.has(newTag)) {
            // Tag already exists — just select it
            this.hermidata.meta.tags.push(newTag);
            this.updateTagDisplay(select);
            return;
        }

        // Add new tag as option and select it
        const option = document.createElement('option');
        option.value = newTag;
        option.textContent = `${newTag} (1)`;
        option.selected = true;
        // Insert before the hr + new tag option (last 2 elements)
        select.insertBefore(option, select.options[select.options.length - 2]);
        this.hermidata.meta.tags.push(newTag);
        select.value = newTag;
    }

    private updateTagDisplay(select: HTMLSelectElement): void {
        // Visually mark selected tags with a checkmark
        for (const option of select.options) {
            if (this.hermidata.meta.tags.includes(option.value)) {
                option.textContent = `✓ ${option.value.replace(/^✓ /, '')}`;
            } else {
                option.textContent = option.textContent.replace(/^✓ /, '');
            }
        }
    }
    private async setHermidata(currentTabInfo: CurrentTab, pastHermidata: Hermidata | null = null): Promise<void> {

        if(pastHermidata) this.hermidata = pastHermidata;


        this.pageTitle = currentTabInfo.pageTitle;
        this.hermidata.url = currentTabInfo.url;
        this.hermidata.chapter.current = currentTabInfo.currentChapter;
        
        if (!pastHermidata) {
            // set title & notes
            const trimmedTitle: TrimmedTitle = StringOutput.TrimTitle.trimTitle( currentTabInfo.pageTitle, currentTabInfo.url );
            this.hermidata.title = trimmedTitle.title;
            this.hermidata.meta.notes = trimmedTitle.note ?? '';
        }
    }
    
    private populateUI(AllHermidata: Record<string, Hermidata>): void {
        // All the getElementById calls live here
        const display = this.pastHermidata ?? this.hermidata;

        
        this.RSS?.changePageToClassic();

        this.populateType();
        this.populateStatus();
        this.initTags(AllHermidata);

        // backward compatibility for past hermidata
        this.trycapitalizingTypesAndStatus();

        setElement("#Pagetitle", el => el.textContent = this.pageTitle || '');

        setElement<HTMLInputElement>('#title', el => el.value = display.title);
        setElement<HTMLSelectElement>('#Type', el => el.value = display.type);
        setElement<HTMLSelectElement>('#status', el => el.value = display.status);
        setElement<HTMLInputElement>('#chapter', el => el.value  = String(this.hermidata.chapter.current));
        setElement<HTMLInputElement>('#url', el => el.value  = this.hermidata.url);
        setElement<HTMLInputElement>("#date", el => el.value = new Intl.DateTimeFormat('en-GB').format(new Date()) || "");
        setElement<HTMLInputElement>('#notes', el => el.value = this.hermidata.meta.notes);

        setElement('#isNewHermidata', el => el.textContent = this.pastHermidata?.title ? '' : 'New!');
        
        // HDR RSS
        setElement<HTMLInputElement>("#title_HDRSS", el => el.value = display.title);
        setElement<HTMLInputElement>("#Type_HDRSS", el => el.value = display.type);
    }

    private bindEvents(): void {
        getElement('#save')?.addEventListener('click', () => this.saveSheet());

        getElement("#HDClassicBtn")?.addEventListener("click", (e) => this.RSS?.openClassic(e));
        getElement("#HDRSSBtn")?.addEventListener("click", async (e) => await this.RSS?.openRSS(e));

        getElement('#openSettings')?.addEventListener('click', () => {
            ext.runtime.openOptionsPage()
            .catch((error) => console.error('Extention error trying open extention settings: ',error)); 
        });
        getElement('#openFullPage')?.addEventListener('click', () => {
            if (!this.googleSheetURL) return;
            ext.tabs.create({ url: this.googleSheetURL })
            .catch((error) => console.error('Extention error trying to open new tab GoogleSheetURL: ',error));
        });
    }
    private trycapitalizingTypesAndStatus() {
        if (this.pastHermidata && Object.values(this.pastHermidata).length > 0) {
            if (!novelTypes.includes(this.pastHermidata.type)) {
                let capitalizeFirstLetterOfStringLetterType = capitalizeFirstLetterOfString(this.pastHermidata.type) as NovelType
                if ( novelTypes.includes(capitalizeFirstLetterOfStringLetterType) ) this.pastHermidata.type = capitalizeFirstLetterOfStringLetterType
                else {
                    console.warn('type can\'t be found in past', this.pastHermidata.type)
                }
            }
            if (!readStatus.includes(this.pastHermidata.status)) {
                let capitalizeFirstLetterOfStringLetterStatus = capitalizeFirstLetterOfString(this.pastHermidata.status) as ReadStatus
                if ( readStatus.includes(capitalizeFirstLetterOfStringLetterStatus) ) this.pastHermidata.status = capitalizeFirstLetterOfStringLetterStatus
                else {
                    console.warn('status can\'t be found in past', this.pastHermidata.status)
                }
            }
        } else console.log('no past hermidata')
    }

    private async saveSheet(): Promise<void> { 

        const title = getElement<HTMLInputElement>("#title")?.value;
        const Type = getElement<HTMLSelectElement>('#Type')?.value as NovelType;
        const Chapter = getElement<HTMLInputElement>("#chapter")?.value;
        const url = getElement<HTMLInputElement>("#url")?.value;
        const status = getElement<HTMLSelectElement>('#status')?.value as ReadStatus;
        const date = getElement<HTMLInputElement>("#date")?.value;
        const tags = getElement<HTMLInputElement>("#tags")?.value || "";
        const notes = getElement<HTMLInputElement>("#notes")?.value || "";
        const args = '';

        const tagsArray = tags.split(',').map((tag) => tag.trim());

        if (!title || !Type || !Chapter || !url || !status || !date) throw new Error('Missing required fields');

        this.hermidata.title = title;
        this.hermidata.type = Type;
        this.hermidata.chapter.current = Number(Chapter);
        this.hermidata.url = url;
        this.hermidata.status = status;
        this.hermidata.meta.tags = tagsArray;
        this.hermidata.meta.notes = notes;

        // save to Browser in JSON format
        await updateChapterProgress(title, Type, Number(Chapter), this.hermidata);
        this.past = null;

        type InputArrayType = [string, NovelType, number, string, ReadStatus, string, string[], string]
        const data: InputArrayType = [title, Type, Number(Chapter), url, status, date, tagsArray, notes]

        // save to google sheet & bookmark/replace bookmark
        ext.runtime.sendMessage({
            type: "SAVE_NOVEL",
            data: data,
            args
        });

        if(!this.Testing) setTimeout( () => window.close(), 400);
    }
}

function capitalizeFirstLetterOfString<T extends NovelType | ReadStatus>(str: NovelType | ReadStatus ): NovelType | ReadStatus {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) as T : str;
}