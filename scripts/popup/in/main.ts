
import { ext } from '../../shared/BrowserCompat';
import * as StringOutput from '../../shared/StringOutput';
import * as dupplicateChecker from '../../utils/dupplication';
import type { TrimmedTitle } from '../../shared/types/type';
import { getElement } from '../../utils/Selection';
import { findByTitleOrAltV2, makeHermidataKey, returnHashedTitle, TrimTitle } from '../../shared/StringOutput';
import { getHermidataViaKey } from '../../shared/types/Storage';


export type novelType =  'Manga' | 'Manhwa' | 'Manhua' | 'Novel' | 'Webnovel' | 'Anime' | "TV-Series";
const novelTypes: novelType[] = ['Manga', 'Manhwa', 'Manhua', 'Novel', 'Webnovel', 'Anime', "TV-Series"];

// type novelStatus = 'Ongoing' | 'Completed' | 'Hiatus' | 'Canceled';

export type readStatus = 'Viewing' | 'Finished' | 'On-hold' | 'Dropped' | 'Planned';
const readStatus: readStatus[] = ['Viewing', 'Finished', 'On-hold', 'Dropped', 'Planned'];



// REMOVE THESE
const CalcDiffCache = new Map();
const preloadCache = new Map();
let rssPreloadPromise = null;
let rssDOMCache = null;
let AllHermidata: { [s: string]: Hermidata; };
let selectedIndex = -1;

export interface Hermidata {
    id: string;
    title: string;
    type: novelType;
    url: string;
    source: string;
    status: readStatus;
    chapter: {
        current: number;
        latest: number;
        history: number[];
        lastChecked: string;
    };
    rss: string | null;
    import: string | null;
    meta: {
        tags: string[];
        notes: string;
        added: string;
        updated: string;
        altTitles: string[];
    };
}
export type CurrentTab = {
    currentChapter: number;
    pageTitle: string;
    url: string;
}
const makeDefaultHermidata = (): Hermidata => ({
    id: '',
    title: '',
    type: 'Manga',
    url: '',
    source: '',
    status: 'Viewing',
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
    }
});

class HermidataController {
    public hermidata: Hermidata = makeDefaultHermidata();
    
    public pastHermidata: Hermidata | null = null;

    public googleSheetURL: string | undefined;
    public pageTitle: string | undefined;


    private readonly HARDCAP_RUNAWAYGROWTH = 300;

    private readonly Testing = false;

    public async init(): Promise<void> {
        const [ CurrentTabInfo, googleSheetURL, pastHermidata ]: [CurrentTab, string, Hermidata | null] = await Promise.all([
            this.getCurrentTabInfo(),
            StringOutput.getGoogleSheetURL(),
            this.getPastHermidata() ?? null,
        ])

        this.googleSheetURL = googleSheetURL;
        this.pastHermidata = pastHermidata;
        await this.setHermidata(CurrentTabInfo);

        const dups = await dupplicateChecker.findPotentialDuplicates(0.9);
        if (dups.length > 0) console.table(dups, ['potential duplicates']);

        this.populateUI();
        this.bindEvents();
    }

    
    async getCurrentTabInfo(): Promise<CurrentTab> {
        // Get active tab info
        const promise: Promise<CurrentTab> = new Promise((resolve) => {
            ext.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const tab = tabs[0];
                if (!tab.title || !tab.url) throw new Error('No title or url found'); 
                const currentTab: CurrentTab = {
                    currentChapter: StringOutput.getChapterFromTitle(tab.title, tab.url) || 0,
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

        readStatus.forEach(element => {
            const option = document.createElement("option");
            option.value = element;
            option.textContent = element;
            folderSelect.appendChild(option);
        });
    }
    private async setHermidata(currentTabInfo: CurrentTab) {
        this.pageTitle = currentTabInfo.pageTitle;
        this.hermidata.url = currentTabInfo.url;
        this.hermidata.chapter.current = currentTabInfo.currentChapter;
        
        // set title & notes
        const trimmedTitle: TrimmedTitle = StringOutput.TrimTitle.trimTitle( currentTabInfo.pageTitle, currentTabInfo.url );
        this.hermidata.title = trimmedTitle.title;
        this.hermidata.meta.notes = trimmedTitle.note;


        AllHermidata = await getAllHermidata();
    }
    private trycapitalizingTypesAndStatus() {
    if (this.pastHermidata && Object.values(this.pastHermidata).length > 0) {
        if (!novelTypes.includes(this.pastHermidata.type)) {
            let capitalizeFirstLetterType = capitalizeFirst(this.pastHermidata.type) as novelType
            if ( novelTypes.includes(capitalizeFirstLetterType) ) this.pastHermidata.type = capitalizeFirstLetterType
            else {
                console.warn('type can\'t be found in past', this.pastHermidata.type)
            }
        }
        if (!readStatus.includes(this.pastHermidata.status)) {
            let capitalizeFirstLetterStatus = capitalizeFirst(this.pastHermidata.status) as readStatus
            if ( readStatus.includes(capitalizeFirstLetterStatus) ) this.pastHermidata.status = capitalizeFirstLetterStatus
            else {
                console.warn('status can\'t be found in past', this.pastHermidata.status)
            }
        }
    } else console.log('no past hermidata')
}
    private populateUI(): void {
        // All the getElementById calls live here
        const display = this.pastHermidata ?? this.hermidata;

        this.populateType();
        this.populateStatus();

        // backward compatibility for past hermidata
        this.trycapitalizingTypesAndStatus();

        getElement("#Pagetitle").textContent = this.pageTitle || '';

        getElement<HTMLInputElement>('#title').value = display.title;
        (document.getElementById('Type') as HTMLSelectElement).value = display.type;
        (document.getElementById('status') as HTMLSelectElement).value = display.status;
        getElement<HTMLInputElement>('#chapter').value  = String(this.hermidata.chapter.current);
        getElement<HTMLInputElement>('#url').value  = this.hermidata.url;
        getElement<HTMLInputElement>("#date").value = new Intl.DateTimeFormat('en-GB').format(new Date()) || "";
        getElement<HTMLInputElement>("#tags").value = display.meta.tags.toString();
        getElement<HTMLInputElement>('#notes').value = this.hermidata.meta.notes;

        getElement('#isNewHermidata').textContent = this.pastHermidata?.title ? '' : 'New!';
        this.FixTableSize()
        
        // HDR RSS
        getElement<HTMLInputElement>("#title_HDRSS").value = display.title;
        getElement<HTMLInputElement>("#Type_HDRSS").value = display.type;
    }

    private bindEvents(): void {
        getElement('#save').addEventListener('click', () => this.saveSheet());
        getElement('#HDRSSBtn').addEventListener('mouseenter', () => preloadRSS());

        getElement("#HDClassicBtn").addEventListener("click", (e) => openClassic(e));
        getElement("#HDRSSBtn").addEventListener("click", async (e) => await openRSS(e));

        getElement('#openSettings').addEventListener('click', () => {
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

    private async saveSheet(): Promise<void> { 

        const title = getElement<HTMLInputElement>("#title").value;
        const Type = (document.getElementById('Type') as HTMLSelectElement).value as novelType;
        const Chapter = getElement<HTMLInputElement>("#chapter").value;
        const url = getElement<HTMLInputElement>("#url").value;
        const status = (document.getElementById('status') as HTMLSelectElement).value as readStatus;
        const date = getElement<HTMLInputElement>("#date").value;
        const tags = getElement<HTMLInputElement>("#tags").value || "";
        const notes = getElement<HTMLInputElement>("#notes").value || "";
        const args = '';

        const tagsArray = tags.split(',').map((tag) => tag.trim());

        this.hermidata.title = title;
        this.hermidata.type = Type;
        this.hermidata.chapter.current = Number(Chapter);
        this.hermidata.url = url;
        this.hermidata.status = status;
        this.hermidata.meta.tags = tagsArray;
        this.hermidata.meta.notes = notes;

        // save to Browser in JSON format
        await updateChapterProgress(title, Type, Chapter);
        this.pastHermidata = null;

        // save to google sheet & bookmark/replace bookmark
        ext.runtime.sendMessage({
            type: "SAVE_NOVEL",
            data: [title, Type, Chapter, url, status, date, tags, notes],
            args
        });

        if(!this.Testing) setTimeout( () => window.close(), 400);
    }
    /**
     * Title
     * Type
     * needs both 
     * @returns the hermidata json object
     */
    private async getPastHermidata(): Promise<Hermidata | null> {
        // ojective => find if the Hermidata already exists in the browser storage

        // get all Hermidata
        const allHermidata = AllHermidata || await getAllHermidata();

        // find title from alt ( includes main title and alt title )
        const potentialTrueTitle = this.getTitleFromAlt(allHermidata) || '';

        // find title from fuzzy seach
        const { possibleObj, AltKeyNeeded, fuzzyKey } = await this.getTitleFromFuzzy(potentialTrueTitle);

        // early returns

        // add alt title to Object
        if (AltKeyNeeded?.needAltTitle && fuzzyKey && possibleObj[fuzzyKey]) {
            const confirmation = await customConfirm(`${AltKeyNeeded.reason}\nAdd "${this.hermidata.title}" as an alt title for "${possibleObj[fuzzyKey].title}"?`);
            if (confirmation) await appendAltTitle(this.hermidata.title, possibleObj[fuzzyKey]);
        }

        // only 1 result -> return
        if ( Object.keys(possibleObj).length == 1 ) return Object.values(possibleObj)[0]

        // more then 1 result -> filter it
        if ( Object.keys(possibleObj).length > 1 ) {
            const byOtherMeans = await this.tryToFindByOtherMeans(possibleObj);
            if (byOtherMeans ) return byOtherMeans;
            const objs = Object.values(possibleObj);
            // Check for possible same-series different-type pairs
            return await migrateCopy(objs)
        }

        const key: string = makeHermidataKey(this.hermidata.title, this.hermidata.type, this.hermidata.url);

        return getHermidataViaKey(key).catch(error => {
            console.error('Extention error: Failed Premise getHermidata: ',error);
            console.log('Key',key,'\n', '\n','this.hermidata', this.hermidata);
            return null;
        })
    }
    private getTitleFromAlt(allHermidata: { [s: string]: Hermidata; }): string | undefined {

        const posibleTitleV2 = this.hermidata.meta.notes.replace('Chapter Title: ', '');

        const TrueTitle = findByTitleOrAltV2(this.hermidata.title, allHermidata)?.title ?? findByTitleOrAltV2(posibleTitleV2, allHermidata)?.title;
        if  (!TrueTitle) this.hermidata.meta.notes = '';
        return TrueTitle
    }
    private async getTitleFromFuzzy(trueTitle: string): Promise<{ possibleObj: { [key: string]: Hermidata }, AltKeyNeeded: { needAltTitle: boolean, reason: string }, fuzzyKey: string | null | undefined  }> {
        const AltKeyNeeded = await detectAltTitleNeeded(this.hermidata.title, this.hermidata.type, this.hermidata.source, this.hermidata.url);
        const fuzzyKey = AltKeyNeeded?.relatedKey;
        // Generate all possible keys
        const possibleKeys = novelTypes.map(type => returnHashedTitle(trueTitle, type));
        // add fuzzy key if not inside possible keys
        if (fuzzyKey && !possibleKeys.includes(fuzzyKey)) possibleKeys.push(fuzzyKey);
        // get all posible hermidata Obj
        const possibleObj: { [key: string]: Hermidata } = {};
        for (const key of possibleKeys) {
            const obj = await getHermidataViaKey(key);
            if ( obj && Object.keys(obj).length) possibleObj[key] = obj;
        }
        console.log('posible Objects', possibleObj)

        const returnObj = {
            possibleObj: possibleObj,
            AltKeyNeeded: AltKeyNeeded,
            fuzzyKey: fuzzyKey,
        }

        return returnObj;
    }
    private async tryToFindByOtherMeans(possibleObj: { [key: string]: Hermidata }): Promise<Hermidata | null> {
    // Try to find by URL domain or substring
    const urlDomain = this.hermidata.url ? new URL(this.hermidata.url).hostname.replace(/^www\./, '') : "";
    const byUrl = Object.values(possibleObj).find(item => {
        try {
            const storedDomain = new URL(item.url || "").hostname.replace(/^www\./, '');
            return storedDomain === urlDomain;
        } catch { return false; }
    });
    if (byUrl) return byUrl;

    // Try to find same title + newest date
    const sameTitleMatches = Object.values(possibleObj).filter(item => {
        return TrimTitle.trimTitle(item.title, item.url).title.toLowerCase() === TrimTitle.trimTitle(this.hermidata.title, this.hermidata.url).title.toLowerCase();
    });
    if (sameTitleMatches.length) {
        sameTitleMatches.sort((a, b) => new Date(b.meta.updated).getDate() - new Date(a.meta.updated).getDate());
        return sameTitleMatches[0];
    }
     // Prefer the same type if exists
    const typeKey = returnHashedTitle(this.hermidata.title, this.hermidata.type);
    if (possibleObj[typeKey]) return possibleObj[typeKey];

    // Fallback: old V1 hash (title only)
    const fallbackKey = returnHashedTitle(this.hermidata.title, this.hermidata.type, this.hermidata.url);
    const fallbackObj = await getHermidataViaKey(fallbackKey);
    if (fallbackObj) return fallbackObj;

    // Nothing found
    return null;
}
}

async function getAllHermidata() {
    const allData = await new Promise((resolve: (value: { [s: string]: any; }) => void, reject) => {
        ext.storage.sync.get(null, (result: { [s: string]: Hermidata; }) => {
            if (ext.runtime.lastError) reject(new Error(`${ext.runtime.lastError}`));
            else resolve(result || {});
        });
    });

    let allHermidata: { [s: string]: Hermidata; } = {};
    let Count = 0;
    for (const [key, value] of Object.entries(allData)) {
        // Ensure the value is a valid Hermidata entry
        if (!value || typeof value !== "object" ||  ( !value.title && !value.Title )|| ( typeof value.title !== "string" && typeof value.Title !== "string" ) ) continue;

        allHermidata[key] = value;
        Count++;
    }
    // Nothing to do
    if (Count === 0) console.log("No entries detected.");
    console.log(`Total entries: ${Count}`);
    return allHermidata;
}


document.addEventListener('DOMContentLoaded', () => {
    new HermidataController().init().catch(console.error);
});


function capitalizeFirst<T extends novelType | readStatus>(str: novelType | readStatus ): novelType | readStatus {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) as T : str;
}

/**
 * returns an Object with inside the argument of the input needs an alt name
 * @param {String} title - Input title
 * @param {String} type - Input type
 * @param {String} source - Input source - default this.hermidata.source
 * @param {Float} threshold  - float number of height to probality it is the same novel - default 0.85
 * @returns {Premise<{
 *  needAltTitle: boolean,
 *  reason: String,
 *  similarity: number|null,
 *  relatedKey: String|null,
 *  relatedTitle: String|null
 * }>}
 */
async function detectAltTitleNeeded(title: string, type: novelType, source: string, url: string, threshold = 0.85) {
    const data = AllHermidata ?? await getAllHermidata();
    if (!data) return { needAltTitle: false, reason: "No data loaded" };

    const normalizedTitle = TrimTitle.trimTitle(title, url).title;
    const titleOrAltMatch = findByTitleOrAltV2(normalizedTitle, data);

    // 1. Already exists by title or alt title → no alt title needed
    if (titleOrAltMatch) {
        return { 
            needAltTitle: false,
            reason: "Title or alt title already exists",
            existingKey: returnHashedTitle(titleOrAltMatch.title, type)
        };
    }

    // 2. Compute candidate similarities (same source/type only)
    const candidates = Object.entries(data)
        .filter(([, entry]) => entry.source !== source && entry.type === type);

    let bestMatch = null;
    let bestScore = 0;

    for (const [key, entry] of candidates) {
        const sim = CalcDiff(normalizedTitle, entry.title.toLowerCase());
        if (sim > bestScore) {
            bestScore = sim;
            bestMatch = { key, entry };
        }
    }

    // 3. Decide threshold
    if (bestScore >= threshold) {
        return {
            needAltTitle: true,
            reason: "Similar title detected",
            similarity: bestScore,
            relatedKey: bestMatch?.key ?? null,
            relatedTitle: bestMatch?.entry.title ?? null
        };
    }

    // 4. No similar title found
    return {
        needAltTitle: false,
        reason: "No close matches found"
    };
}

function CalcDiff(a: string, b: string) {
    if (!a || !b) return 0;

    // Create a stable key for caching
    const key = a < b ? `${a}__${b}` : `${b}__${a}`;
    if (CalcDiffCache.has(key)) return CalcDiffCache.get(key);

    // Normalize text
    const clean = (str: string) => str.toLowerCase().replaceAll(/[^a-z0-9\s]/gi, '').trim();
    const A = clean(a), B = clean(b);

    if (A === B) {
        CalcDiffCache.set(key, 1);
        return 1;
    }

    const wordsA = A.split(/\s+/);
    const wordsB = B.split(/\s+/);

    const common = wordsA.filter(w => wordsB.includes(w)).length;
    const wordScore = common / Math.max(wordsA.length, wordsB.length);

    const charScore = 1 - levenshteinDistance(A, B) / Math.max(A.length, B.length);
    const score = (wordScore * 0.4) + (charScore * 0.6);

    CalcDiffCache.set(key, score);
    return score;
}

function levenshteinDistance(a: string, b: string) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;

    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost
            );
        }
    }

    return dp[m][n];
}

    // TODO: move to shared
    // changePageToClassic();