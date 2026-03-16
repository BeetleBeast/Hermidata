
import { ext } from '../../shared/BrowserCompat';
import * as StringOutput from '../../shared/StringOutput';

type novelType =  'Manga' | 'Manhwa' | 'Manhua' | 'Novel' | 'Webnovel' | 'Anime' | "TV-Series";
type novelStatus = 'Ongoing' | 'Completed' | 'Hiatus' | 'Canceled';
type readStatus = 'Viewing' | 'Finished' | 'On-hold' | 'Dropped' | 'Planned';



// REMOVE THESE
const Testing = false;
const CalcDiffCache = new Map();
const preloadCache = new Map();
let rssPreloadPromise = null;
let rssDOMCache = null;
let AllHermidata;
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
type CurrentTab = {
    currentChapter: number;
    pageTitle: string;
    url: string;
}
const defaultHermidata: Hermidata = {
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
        notes: "",
        added: new Date().toISOString(),
        updated: new Date().toISOString(),
        altTitles: []
    }
}

class Foo {
    public hermidata: Hermidata = defaultHermidata;
    
    public pastHermidata: Hermidata | null = null;

    public googleSheetURL: string;
    public pageTitle: string;


    private readonly HARDCAP_RUNAWAYGROWTH = 300;

    constructor() {
        this.findDuplicates();
    }
    async getCurrentTabInfo(): Promise<CurrentTab> {
        // Get active tab info
        try {
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
        } catch (error) {
            throw new Error(`Extention error inside getCurrentTab: ${error}`);
        }
    }
    findDuplicates() {
        const dups = await findPotentialDuplicates(0.9);
        if ( dups.length > 0) console.table(dups , 'potential duplicates table');
    }

    public async onDOMContentLoaded() {
        console.log('Start of new Hermidata');

        const currentTabInfo = await this.getCurrentTabInfo();

        this.googleSheetURL = await getGoogleSheetURL();


        this.setHermidata(currentTabInfo);

    }
    private async setHermidata(currentTabInfo: CurrentTab) {
        this.hermidata.title = currentTabInfo.pageTitle;
        this.hermidata.url = currentTabInfo.url;
        this.hermidata.chapter.current = currentTabInfo.currentChapter;
        
        // set title
        this.hermidata.title = trimTitle(this.hermidata.title);
    }
}


/*
```

---

**Suggested source structure**

src/
  background.ts
  content.ts
  RSS.ts
  popup/
    popup.ts
    popup.html
  settings/
    settings.ts
    settings.html
  shared/                   ← safe to import everywhere
    types.ts                ← all your interfaces/types
    storage.ts              ← chrome.storage wrappers
    messaging.ts            ← sendMessage types + helpers
    browserCompat.ts        ← chrome vs browser API shim ← key file!
dist/                       ← built output, matches your current layout
pages/
assets/
```

*/
// On popup load
document.addEventListener("DOMContentLoaded", async () => {
    console.log('Start of new Hermidata');
    const dups = await findPotentialDuplicates(0.9);
    if ( dups.length > 0) console.table(dups , 'potential duplicates table');

    AllHermidata = await getAllHermidata();
    HermidataV3 = await getCurrentTab();
    HermidataV3.title = trimTitle(HermidataNeededKeys.Page_Title);
    HermidataNeededKeys.GoogleSheetURL = await getGoogleSheetURL();
    populateType()
    populateStatus()
    changePageToClassic();
    HermidataNeededKeys.Past = await getHermidata();
    HermidataV3.chapter.current = getChapterFromTitleReturn(HermidataV3.title, HermidataNeededKeys.Page_Title, HermidataV3.chapter.current, HermidataV3.url) || HermidataV3.chapter.current;
    trycapitalizingTypesAndStatus();
    document.getElementById('isNewHermidata').textContent = HermidataNeededKeys.Past?.title ? '' : 'New Hermidata!';
    document.getElementById("Pagetitle").textContent = HermidataNeededKeys.Page_Title;
    document.getElementById("title").value =  HermidataNeededKeys.Past?.title || HermidataV3.title;
    document.getElementById("title_HDRSS").value = HermidataNeededKeys.Past?.title || HermidataV3.title;
    document.getElementById("Type").value = HermidataNeededKeys.Past?.type || HermidataV3.type;
    document.getElementById("Type_HDRSS").value = HermidataNeededKeys.Past?.type || HermidataV3.type;
    document.getElementById("chapter").value = HermidataV3.chapter.current;
    document.getElementById("url").value = HermidataV3.url;
    document.getElementById("status").value =  HermidataNeededKeys.Past?.status || HermidataV3.status;
    document.getElementById("date").value = new Intl.DateTimeFormat('en-GB').format(new Date()) || "";
    document.getElementById("tags").value =  HermidataNeededKeys.Past?.meta?.tags || HermidataV3.meta.tags;
    document.getElementById("notes").value = HermidataV3.meta.notes;
    FixTableSize()
    document.getElementById("save").addEventListener("click", async () => await saveSheet());
    document.getElementById("HDClassicBtn").addEventListener("click", (e) => openClassic(e));
    document.getElementById("HDRSSBtn").addEventListener('mouseenter', (e) =>  preloadRSS());
    document.getElementById("HDRSSBtn").addEventListener("click", async (e) => await openRSS(e));
    document.getElementById("openSettings").addEventListener("click", () => {
        try {
            browserAPI.runtime.openOptionsPage();
        } catch (error) {
            console.error('Extention error trying open extention settings: ',error)
        }
    });
    document.getElementById("openFullPage").addEventListener("click", () => {
        try {
            browserAPI.tabs.create({ url: HermidataNeededKeys.GoogleSheetURL });
        } catch (error) {
            console.error('Extention error trying to open new tab GoogleSheetURL: ',error)
        }
    });
});