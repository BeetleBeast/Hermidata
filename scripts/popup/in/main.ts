
import { ext } from '../../shared/BrowserCompat';
import * as StringOutput from '../../shared/StringOutput';
import { Duplicate, makeDefaultHermidata } from '../../utils/dupplication';
import { type Hermidata, type NovelType, type ReadStatus, novelTypes, readStatus, type TrimmedTitle } from '../../shared/types/type';
import { getElement, setElement } from '../../utils/Selection';
import { PastHermidata, type PastHermidata as PastHermidataClass } from '../core/Past';
import { updateChapterProgress } from '../core/save';
import { RSS } from '../../rss/main';
import { getGoogleSheetURL } from '../../shared/types/Storage';

export type CurrentTab = {
    currentChapter: number;
    pageTitle: string;
    url: string;
}

document.addEventListener('DOMContentLoaded', () => {
    new HermidataController().init().catch(console.error);
});

class HermidataController {
    public hermidata: Hermidata = makeDefaultHermidata();
    
    public past: PastHermidataClass | null = null;

    private RSS: RSS | null = null;

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
        this.past = new PastHermidata(this.hermidata);
        this.past.init().catch(console.error);

        await this.setHermidata(CurrentTabInfo);

        await this.checkForDuplicates();
        
        this.RSS = new RSS(this.hermidata);

        this.populateUI();
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
    private async setHermidata(currentTabInfo: CurrentTab) {

        if(this.pastHermidata) this.hermidata = this.pastHermidata;


        this.pageTitle = currentTabInfo.pageTitle;
        this.hermidata.url = currentTabInfo.url;
        this.hermidata.chapter.current = currentTabInfo.currentChapter;
        
        if (!this.pastHermidata) {
            // set title & notes
            const trimmedTitle: TrimmedTitle = StringOutput.TrimTitle.trimTitle( currentTabInfo.pageTitle, currentTabInfo.url );
            this.hermidata.title = trimmedTitle.title;
            this.hermidata.meta.notes = trimmedTitle.note ?? '';
        }
    }
    
    private populateUI(): void {
        // All the getElementById calls live here
        const display = this.pastHermidata ?? this.hermidata;

        
        this.RSS?.changePageToClassic();

        this.populateType();
        this.populateStatus();

        // backward compatibility for past hermidata
        this.trycapitalizingTypesAndStatus();

        setElement("#Pagetitle", el => el.textContent = this.pageTitle || '');

        setElement<HTMLInputElement>('#title', el => el.value = display.title);
        setElement<HTMLSelectElement>('#Type', el => el.value = display.type);
        setElement<HTMLSelectElement>('#status', el => el.value = display.status);
        setElement<HTMLInputElement>('#chapter', el => el.value  = String(this.hermidata.chapter.current));
        setElement<HTMLInputElement>('#url', el => el.value  = this.hermidata.url);
        setElement<HTMLInputElement>("#date", el => el.value = new Intl.DateTimeFormat('en-GB').format(new Date()) || "");
        setElement<HTMLInputElement>("#tags", el => el.value = display.meta.tags.toString());
        setElement<HTMLInputElement>('#notes', el => el.value = this.hermidata.meta.notes);

        setElement('#isNewHermidata', el => el.textContent = this.pastHermidata?.title ? '' : 'New!');
        this.FixTableSize()
        
        // HDR RSS
        setElement<HTMLInputElement>("#title_HDRSS", el => el.value = display.title);
        setElement<HTMLInputElement>("#Type_HDRSS", el => el.value = display.type);
    }

    private bindEvents(): void {
        getElement('#save')?.addEventListener('click', () => this.saveSheet());
        getElement('#HDRSSBtn')?.addEventListener('mouseenter', () => this.RSS?.preloadRSS());

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
    private FixTableSize() {
        const inputs = document.querySelectorAll<HTMLInputElement>('input.autoInput');
        inputs.forEach(input => {
            const td = input.closest('td');
            const table = input.closest('table');
            const columnIndex = td?.cellIndex ?? -1;
            const th = table?.querySelectorAll('th')[columnIndex];
            if (!th) return;

            const measureText = (text: string, inputEl: Element) => {
                const span = document.createElement('span');
                span.style.position = 'absolute';
                span.style.visibility = 'hidden';
                span.style.whiteSpace = 'pre';
                span.style.font = getComputedStyle(inputEl).font;
                span.textContent = text || '';
                document.body.appendChild(span);
                const width = span.offsetWidth;
                span.remove();
                return width;
            };
            const resize = () => {
                const value = input.value;
                if (!value) {
                    input.style.width = '42px'; // empty = no width
                    return;
                }
                const textWidth = measureText(value, input);
                const parent = getElement('#ParentPreview');
                if (!parent) {
                    input.style.width = '42px'; // no parent = no width
                    return;
                }
                const parentMaxWidth = 10000; // same as your CSS
                const parentStyle = getComputedStyle(parent);
                const parentPadding = Number.parseFloat(parentStyle.paddingLeft) + Number.parseFloat(parentStyle.paddingRight);
                // Actual usable space in the parent
                const maxContainerWidth = (document.body.offsetWidth, parentMaxWidth) - parentPadding;
                // Get all first-row cells and subtract other columns' widths
                const row = table.rows[0];
                const cells = row.cells;
                let otherColsWidth = 0;
                for (let i = 0; i < cells.length; i++) {
                    if (i !== columnIndex) {
                        otherColsWidth += cells[i].offsetWidth;
                    }
                }
                // Remaining space available for this input
                const availableWidth = maxContainerWidth - otherColsWidth - 200; // no clue what 200 is 
                // Clamp final width
                const clampedWidth = Math.min(textWidth + 12, availableWidth, this.HARDCAP_RUNAWAYGROWTH);
                input.style.width = `${clampedWidth}px`;
            };
            // Defer initial call to allow proper layout
            requestAnimationFrame(() => resize());
                input.addEventListener('input', resize);
        })
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