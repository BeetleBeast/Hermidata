const browserAPI = typeof browser !== "undefined" ? browser : chrome;

const HARDCAP_RUNAWAYGROWTH = 300;

const novelType =  ['Manga', 'Manhwa', 'Manhua', 'Novel', 'Webnovel', 'Anime', "TV-Series"]
const novelStatus = ['Ongoing', 'Completed', 'Hiatus', 'Canceled']
const readStatus = ['Viewing', 'Finished', 'On-hold', 'Dropped', 'Planned']
let HermidataNeededKeys = {
    Page_Title: '',
    GoogleSheetURL: '',
    Past: {},
}
let HermidataV3 = {
    id: '',
    title: '',
    type: novelType[0],
    url: '',
    source: '',
    status: readStatus[0],
    chapter: {
        current: 0,
        latest: null,
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

class HermidataUtils {
    constructor() {
        this.id = '';
        this.title = '';
        this.type = novelType[0];
        this.url = '';
        this.source = '';
        this.status = readStatus[0];
        this.chapter = {
            current: 0,
            latest: null,
            history: [],
            lastChecked: new Date().toISOString()
        };
        this.rss = null;
        this.import = null;
        this.meta = {
            tags: [],
            notes: "",
            added: new Date().toISOString(),
            updated: new Date().toISOString(),
            altTitles: []
        };
    }
    getValues() {
        return {
            id: this.id,
            title: this.title,
            type: this.type,
            url: this.url,
            source: this.source,
            status: this.status,
            chapter: this.chapter,
            rss: this.rss,
            import: this.import,
            meta: this.meta
        };
    }
    setTitle(title) {
        this.title = title;
    }
    getTitle() {
        return this.title;
    }
    setType(type) {
        this.type = type;
    }
    getType() {
        return this.type;
    }
    setUrl(tab) {
        this.url = tab.url || "NO URL";;
    }
    getUrl() {
        return this.url;
    }
    setSource(source) {
        this.source = source;
    }
    getSource() {
        return this.source;
    }
    setStatus(status) {
        this.status = status;
    }
    getStatus() {
        return this.status;
    }
    setChapter(tab) {
        this.chapter.current = getChapterFromTitleReturn(trimTitle(tab.title), tab.title, getChapterFromTitle(tab.title, tab.url) || 0, tab.url) || getChapterFromTitle(tab.title, tab.url) || 0;
    }
    getChapter() {
        return this.chapter;
    }
    getChapterCurrent() {
        return this.chapter.current;
    }
    setRss(rss) {
        this.rss = rss;
    }
    getRss() {
        return this.rss;
    }
    async getCurrentTab() {
        return new Promise((resolve) => {
            try {
                browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    resolve(tabs[0]);
                });
            } catch (error) {
                console.error('Extention error inside getCurrentTab: ',error)
            }
        });
    }
    async __post_init__() {
        const tab = await this.getCurrentTab()
        this.setTitle(trimTitle(tab.title));
        this.setUrl(tab.url);
        this.setType(novelType[0]);
        this.setStatus(readStatus[0]);
        this.setChapter(tab);
    }
}
// const utils = new HermidataUtils();

// await utils.__post_init__(); // initialize


const Testing = false;

const CalcDiffCache = new Map();

const preloadCache = new Map();

let AllHermidata;
let selectedIndex = -1;

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
    document.getElementById("HDRSSBtn").addEventListener("click", (e) =>  openRSS(e));
    document.getElementById("HDRSSBtn").addEventListener('mouseenter', (e) =>  enableHoverPreload(e));
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

function removeKeysFromSync(key) {
    return new Promise((resolve, reject) => {
        browserAPI.storage.sync.remove(key, () => {
            if(browserAPI.runtime.lastError) reject(new Error(browserAPI.runtime.lastError));
            else {
                console.log("Removed key:", key);
                resolve();
            }
        });
    });
}

// Get active tab info
function getCurrentTab() {
    return new Promise((resolve) => {
        try {
            browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const tab = tabs[0];
                HermidataV3.chapter.current = getChapterFromTitle(tab.title, tab.url) || 0;
                HermidataNeededKeys.Page_Title = tab.title || "Untitled Page";
                HermidataV3.url = tab.url || "NO URL";
                resolve(HermidataV3);
            });
        } catch (error) {
            console.error('Extention error inside getCurrentTab: ',error)
        }
    });
}

function trycapitalizingTypesAndStatus() {
    if (Object.values(HermidataNeededKeys?.Past).length > 0) {
        if (!novelType.includes(HermidataNeededKeys.Past?.type)) {
            let capitalizeFirstLetterType = capitalizeFirst(HermidataNeededKeys.Past?.type)
            if ( novelType.includes(capitalizeFirstLetterType) ) HermidataNeededKeys.Past.type = capitalizeFirstLetterType
            else {
                console.warn('type can\'t be found in past',HermidataNeededKeys.Past?.type)
            }
        }
        if (!readStatus.includes(HermidataNeededKeys.Past?.status)) {
            let capitalizeFirstLetterStatus = capitalizeFirst(HermidataNeededKeys.Past?.status)
            if ( readStatus.includes(capitalizeFirstLetterStatus) ) HermidataNeededKeys.Past.status = capitalizeFirstLetterStatus
            else {
                console.warn('status can\'t be found in past',HermidataNeededKeys.Past?.status)
            }
        }
    } else console.log('no past hermidata')
}

function findByTitleOrAltV2(title, allData) {
    title = trimTitle(title);
    return Object.values(allData).find(novel => 
        trimTitle(novel.title) === title ||
        (novel.meta?.altTitles || []).some(t => trimTitle(t) === title)
    );
}

function getChapterFromTitle(title, url) {
    // Regex to find the first number (optionally after "chapter", "chap", "ch")
    const chapterNumberRegex = /(?:Episode|chapter|chap|ch)[-.\s]*?(\d+[A-Z]*)|(\d+[A-Z]*)/i;

    // create chapter based on URL
    const parts = url?.split("/") || [];
    const chapterPartV1 = parts.at(-1).match(/[\d.]+/)?.[0] || ''
    // create chapter based on title
    const titleParts = title?.split(/[-–—|:]/).map(p => p.trim());
    const chapterPartV2 = titleParts.find(p => /^\d+(\.\d+)?$/.test(p));
    // create chapter based on title regex
    const chapterPartV3 = (titleParts
    .find(p => chapterNumberRegex.test(p)) || ""
    ).replace(/([A-Z])/gi, '').replace(/[^\d.]/g, '').trim();
    // If no chapter found, use empty string
    return chapterPartV2 || chapterPartV3 || "";
}

// Get GoogleSheet URL
function getGoogleSheetURL() {
    return new Promise((resolve, reject) => {
        try {
            browserAPI.storage.sync.get(["spreadsheetUrl"], (result) => {
                let url = result?.spreadsheetUrl?.trim();
                if (url && isValidGoogleSheetUrl(url)) return resolve(url);
                return sheetUrlInput(resolve, reject);
            });
        } catch (error) {
            console.error('Extention error inside getGoogleSheetURL: ',error)
        }
    });
}
/**
 * Title
 * Type
 * needs both 
 * @returns the hermidata json object
 */
async function getHermidata() {
try {
    // get all Hermidata
    const allHermidata = await getAllHermidata();

    let absoluteObj = {}

    // find title from alt
    const TrueTitle = findByTitleOrAltV2(HermidataV3.title, allHermidata)?.title;
    // find title from fuzzy seach
    const AltKeyNeeded = await detectAltTitleNeeded(HermidataV3.title, HermidataV3.type);
    const fuzzyKey = AltKeyNeeded?.relatedKey;
    // Generate all possible keys
    const possibleKeys = novelType.map(type => returnHashedTitle(TrueTitle, type));
    // add fuzzy key if not inside possible keys
    if (fuzzyKey && !possibleKeys.includes(fuzzyKey)) possibleKeys.push(fuzzyKey);
    // get all posible hermidata Obj
    const possibleObj = {}
    for (const key of possibleKeys) {
        const obj = await getHermidataViaKey(key);
        if ( obj && Object.keys(obj).length) possibleObj[key] = obj;
    }
    console.log('posible Objects', possibleObj)

    // add alt title to Object
    if (AltKeyNeeded?.needAltTitle && fuzzyKey && possibleObj[fuzzyKey]) {
        const confirmation = await customConfirm(`${AltKeyNeeded.reason}\nAdd "${HermidataV3.title}" as an alt title for "${possibleObj[fuzzyKey].title}"?`);
        if (confirmation) await appendAltTitle(HermidataV3.title, possibleObj[fuzzyKey]);
    }

    if ( Object.keys(possibleObj).length == 1 ) {
        absoluteObj = Object.values(possibleObj)[0]
        return absoluteObj
    }
    // more then 1 result -> filter it
    if ( Object.keys(possibleObj).length > 1 ) {
        absoluteObj = await tryToFindByOtherMeans(possibleObj)

        const objs = Object.values(possibleObj);
        // Check for possible same-series different-type pairs
        return await migrateCopy(objs)
    }
    if ( Object.entries(absoluteObj).length > 0) return absoluteObj

    const key = makeHermidataKey();
    return new Promise((resolve, reject) => {
        browserAPI.storage.sync.get([key], (result) => {
            if (browserAPI.runtime.lastError) return reject(new Error(browserAPI.runtime.lastError));
            resolve(result?.[key] || {});
        });
    }).catch(error => {
        console.error('Extention error: Failed Premise getHermidata: ',error);
        console.log('Key',key,'\n', '\n','HermidataV3', HermidataV3);
        return {};
    })
} catch (err) {
    console.error("Fatal error in getHermidata:", err);
    return {};
}
}

async function migrateCopy(objs) {
    // Compare pairs and pick which one is newer vs older
    for (let i = 0; i < objs.length; i++) {
        for (let j = i + 1; j < objs.length; j++) {
            const obj1 = objs[i];
            const obj2 = objs[j];
            if (isSameSeries(obj1, obj2) && obj1.type !== obj2.type) return await migrationSteps(obj1, obj2);
        }
    }
    console.warn("No migratable pair found, returning most recent");
    objs.sort((a, b) => new Date(b.lastUpdated || 0) - new Date(a.lastUpdated || 0));
    return objs[0] || {};
}
async function migrationSteps(obj1, obj2, options = {}) {
    // Pick by date or lastUpdated
    const date1 = new Date(obj1.lastUpdated || obj1.date || 0);
    const date2 = new Date(obj2.lastUpdated || obj2.date || 0);

    let newer = obj1;
    let older = obj2;

    if (date1 < date2) {
        newer = obj2;
        older = obj1;
    }

    // Confirm with clear indication which is which
    const confirmMerge = await confirmMigrationPrompt(newer, older, options );

    if (confirmMerge) {
        const migrated = await migrateHermidataV5(newer, older);
        return migrated; // Stop after successful merge
    } else {
        console.log("User canceled migration; switching it up");
        // Confirm with clear indication which is which
        let New_older = newer;
        let New_newer = older
        const confirm_NewMerge = await confirmMigrationPrompt(New_newer, New_older, options );

        if (confirm_NewMerge) {
            const migrated = await migrateHermidataV5(New_newer, New_older);
            return migrated; // Stop after successful merge
        } else {
            console.log("User canceled migration; keeping newer data.");
            return newer;
        }   
    }
}
async function tryToFindByOtherMeans(possibleObj) {
    // Try to find by URL domain or substring
    const urlDomain = HermidataV3.url ? new URL(HermidataV3.url).hostname.replace(/^www\./, '') : "";
    const byUrl = Object.values(possibleObj).find(item => {
        try {
            const storedDomain = new URL(item.url || "").hostname.replace(/^www\./, '');
            return storedDomain === urlDomain;
        } catch { return false; }
    });
    if (byUrl) return byUrl;

    // Try to find same title + newest date
    const sameTitleMatches = Object.values(possibleObj).filter(item => {
        return trimTitle(item.title).toLowerCase() === trimTitle(HermidataV3.title).toLowerCase();
    });
    if (sameTitleMatches.length) {
        sameTitleMatches.sort((a, b) => new Date(b.lastUpdated || 0) - new Date(a.lastUpdated || 0));
        return sameTitleMatches[0];
    }
     // Prefer the same type if exists
    const typeKey = returnHashedTitle(HermidataV3.title, HermidataV3.type);
    if (possibleObj[typeKey]) return possibleObj[typeKey];

    // Fallback: old V1 hash (title only)
    const fallbackKey = returnHashedTitle(HermidataV3.title);
    const fallbackObj = await getHermidataViaKey(fallbackKey);
    if (fallbackObj) return fallbackObj;

    // Nothing found
    return '';
}

async function getHermidataViaKey(key) {
    return new Promise((resolve, reject) => {
        browserAPI.storage.sync.get([key], (result) => {
            if (browserAPI.runtime.lastError) return reject(new Error(browserAPI.runtime.lastError));
            resolve(result?.[key] || {});
        });
    }).catch(error => {
        console.error('Extention error: Failed Premise getHermidata: ',error);
        console.log('Key',key,'\n');
        return {};
    })
}

/**
 *  Detect if two Hermidata entries refer to the same series (by title similarity)
 */
function isSameSeries(a, b) {
    if (!a || !b) return false;
    const titleA = trimTitle(a.title || "").toLowerCase();
    const titleB = trimTitle(b.title || "").toLowerCase();
    if (!titleA || !titleB) return false;

    // Exact match or fuzzy match (ignoring punctuation)
    return (
        titleA === titleB ||
        titleA.replace(/\W/g, "") === titleB.replace(/\W/g, "")
    );
}

/**
 *  Create a clear confirmation message for user
 */
async function confirmMigrationPrompt(newer, older, options = {}) {
    try {
        const msg = options.message || 
            `
            Same title detected with different types.
    
            Title: ${newer.title}
    
            • Old type: ${older.type}
            • New type: ${newer.type}
    
            Chapters:
            • Old: ${older.chapter?.current || "?"}
            • New: ${newer.chapter?.current || "?"}
    
            Notes:
            • Old: ${older.meta?.notes || "(none)"}
            • New: ${newer.meta?.notes || "(none)"}
    
            → Keep the newer type (“${newer.type}”) and merge?
        `;
        return await customConfirm(msg);
    } catch (error) {
        console.warn("Prompt blocked; auto-selecting newest entry:", error.message);
        return false;
    }
}

function deactivateother() {
    // deactivate links in classic
    document.querySelectorAll(".HDClassic").forEach(a => {
        a.style.pointerEvents = 'none';
    });
    // deactivate links in HDRSS
    document.querySelectorAll(".HDRSS").forEach(a => {
        a.style.pointerEvents = 'none';
    });
    const classicCurrentActive = document.querySelector(`#${'HDClassicBtn'}.${'active'}`);
    document.querySelector(".HDRSS").style.opacity = classicCurrentActive ? 0 : 0.2;
    document.querySelector(".HDClassic").style.opacity = classicCurrentActive ? 0.2 : 0;
}
function activateother() {
    const classicCurrentActive = document.querySelector(`#${'HDClassicBtn'}.${'active'}`);
    // de/activate links in classic depending on current active
    document.querySelectorAll(".HDClassic").forEach(a => {
        a.style.pointerEvents = classicCurrentActive ? 'auto' : 'none';
    });
    // de/activate links in HDRSS depending on current active
    document.querySelectorAll(".HDRSS").forEach(a => {
        a.style.pointerEvents =  classicCurrentActive ? 'none' : 'auto';
    });
    document.querySelector(".HDRSS").style.opacity = classicCurrentActive ? 0 : 1;
    document.querySelector(".HDClassic").style.opacity = classicCurrentActive ? 1 : 0;
}
function customPrompt(msg, defaultInput) {
    return new Promise((resolve) => {
        const container = document.querySelector('.promptSection');
        const input = document.querySelector('.genericInput');
        const label = document.querySelector('.genericLabel');
        const btn1 = document.querySelector('.genericButton1');
        const btn2 = document.querySelector('.genericButton2');
        const activateConfirmSetup = () => {
            deactivateother();
            container.style.display = 'flex';
            container.style.height = `${document.body.offsetHeight / 2}px`;
            label.style.display = 'block';
            input.style.display = 'block';
            btn1.style.display = 'block';
            btn2.style.display = 'block';
        }
        const deactivateConfirmSetup = () => {
            activateother();
            container.style.display = 'none';
            label.style.display = 'none';
            input.style.display = 'none';
            btn1.style.display = 'none';
            btn2.style.display = 'none';
        }
        const cleanup = () => {
            deactivateConfirmSetup();
            btn1.removeEventListener('click', onYes);
            btn2.removeEventListener('click', onNo);
        };
        const onYes = () => {
            cleanup();
            resolve(input.value);
        };

        const onNo = () => {
            cleanup();
            resolve(false);
        };

        activateConfirmSetup();
        label.textContent = msg;
        input.value = defaultInput;

        btn1.addEventListener('click', onYes);
        btn2.addEventListener('click', onNo);
    });
}
function customConfirm(msg) {
    return new Promise((resolve) => {
        const container = document.querySelector('.promptSection');
        const label = document.querySelector('.genericLabel');
        const btn1 = document.querySelector('.genericButton1');
        const btn2 = document.querySelector('.genericButton2');
        const activateConfirmSetup = () => {
            deactivateother();
            container.style.display = 'flex';
            container.style.height = `${document.body.offsetHeight / 2}px`;
            label.style.display = 'block';
            btn1.style.display = 'block';
            btn2.style.display = 'block';
        }
        const deactivateConfirmSetup = () => {
            activateother();
            container.style.display = 'none';
            label.style.display = 'none';
            btn1.style.display = 'none';
            btn2.style.display = 'none';
        }
        const cleanup = () => {
            deactivateConfirmSetup();
            btn1.removeEventListener('click', onYes);
            btn2.removeEventListener('click', onNo);
        };
        const onYes = () => {
            cleanup();
            resolve(true);
        };

        const onNo = () => {
            cleanup();
            resolve(false);
        };

        activateConfirmSetup();
        label.textContent = msg;

        btn1.addEventListener('click', onYes);
        btn2.addEventListener('click', onNo);
    });
}

/**
 * merge two Hermidata object entries into one object & migrates to new key
 * @param {object} newer - the object to keep as primary ( newest data )
 * @param {object} older - the object to be merged/remplaced
 * @returns {Premise<{
 *  id: string
 *  title: string
 *  type: string
 *  url: string
 *  source: string
 *  status: string
 *  chapter: {
 *   current: number
 *   latest: number|null
 *   history: number[]
 *   lastChecked: string
 *  }
 *  rss: object|null
 *  import: object|null
 *  meta: {
 *   tags: string[]
 *   notes: string
 *   altTitles: string[]
 *   added: string
 *   updated: string
 *  }
 * }|null>} The merged Hermidata entry
 */
async function migrateHermidataV5(newer, older, OLD_KEY = 'DEFAULT', NEW_KEY = 'DEFAULT') {
    // step 1. new key
    // re-make keys
    const [ newTitle, newType ] = [newer.title, newer.type]
    const [ oldTitle, oldType ] = [older.title, older.type]
    const newKey = NEW_KEY == 'DEFAULT' ? returnHashedTitle(newTitle, newType) : getOldIDType(newer);
    const oldKey = OLD_KEY == 'DEFAULT' ? returnHashedTitle(oldTitle, oldType) : getOldIDType(older);
    // check keys validity
    if ( newKey !== newer.id || oldKey !== older.id) return null;
    // step 2. start with shell
    const mergeAltTitles = (mainTitle, ...altLists) => {
        return [
            mainTitle,
            ...Array.from(new Set( altLists.flat().filter(t => trimTitle(t) && trimTitle(t) !== trimTitle(mainTitle)) ) )
        ];
    }
    const base = makeHermidataV3(newTitle, newer.url || older.url, newType);
    const merged = {
        ...base,
        id: newKey,
        title: newTitle || oldTitle,
        type: newType || oldType,
        url: newer.url || older.url,
        source: newer.source || older.source,
        status: newer.status || older.status || "Planned",
        chapter: {
            current: newer.chapter?.current ?? older.chapter?.current ?? 0,
            latest: newer.chapter?.latest ?? older.chapter?.latest ?? null,
            history: Array.from( new Set([...(older.chapter?.history || []), ...(newer.chapter?.history || [])]) ).sort((a, b) => a - b),
            lastChecked: newer.chapter?.lastChecked || older.chapter?.lastChecked || new Date().toISOString()
        },
        rss: newer.rss || older.rss || null,
        import: newer.import || older.import || null,
        meta: {
            tags: Array.from(
                new Set([
                    ...(older.meta?.tags || []),
                    ...(newer.meta?.tags || [])
                ])
            ),
            notes: newer.meta?.notes || older.meta?.notes || "",
            altTitles: mergeAltTitles(
                newTitle,
                older.meta?.altTitles || [],
                newer.meta?.altTitles || [],
                [newer.title, older.title]
            ),
            added: older.meta?.added || base.meta.added,
            updated: new Date().toISOString(),
            originalRelease: null // TODO
        }
    }
    // step 3. save & remove key
    await browserAPI.storage.sync.set({ [newKey]: merged });
    await browserAPI.storage.sync.remove(oldKey);

    console.log(`Migrated from ${oldKey} → ${newKey}`);
    return merged;
}

async function getSettings() {
    return await new Promise((resolve, reject) => {
        browserAPI.storage.sync.get("Settings", (result) => {
            if (browserAPI.runtime.lastError) reject(new Error(browserAPI.runtime.lastError));
            else resolve(result.Settings || {});
        });
    });
}

function detectHashType(obj) {
    if (!obj?.title || !obj?.type || !obj?.id) return "unknown";

    const normalizedTitle = trimTitle(obj.title).toLowerCase();

    const oldHash = (() => {
        let hash = 0, chr;
        const str = `${obj.type}:${normalizedTitle}`;
        for (let i = 0; i < str.length; i++) {
            chr = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0;
        }
        return hash.toString();
    })();

    const newHash = (() => {
        let hash = 0, chr;
        const str = `${obj.type}:${normalizedTitle}`;
        for (let i = 0; i < str.length; i++) {
            chr = str.codePointAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash = Math.trunc(hash);
        }
        return hash.toString();
    })();

    if (obj.id === oldHash) return "old";
    if (obj.id === newHash) return "new";
    return "unknown";
}



function getOldIDType(Obj) {
    const OLD_simpleHash = (str) => {
        let hash = 0, i, chr;
        if (str.length === 0) return hash.toString();
        for (i = 0; i < str.length; i++) {
            chr = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0;
        }
        return hash.toString();
    }
    const oldId = OLD_simpleHash(`${Obj.type}:${trimTitle(Obj.title).toLowerCase()}`);
    return oldId
}

function returnHashedTitle(title,type) {
    return type 
    ? simpleHash(`${type}:${trimTitle(title).toLowerCase()}`) // V2
    : simpleHash(trimTitle(title).toLowerCase()) // V1
}
function makeHermidataKey() {
    HermidataV3.id = returnHashedTitle(HermidataV3.title, HermidataV3.type);
    return HermidataV3.id;
}

function simpleHash(str) {
    let hash = 0, i, chr;
    if (str.length === 0) return hash.toString();
    for (i = 0; i < str.length; i++) {
        chr = str.codePointAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash = Math.trunc(hash); // Convert to 32bit integer
    }
    return hash.toString();
}

function sheetUrlInput(resolve, reject) {
    document.getElementById("spreadsheetPrompt").style.display = "block";
    // document.getElementById('body').style.display = 'none';
    const saveBtn = document.getElementById("saveSheetUrlBtn");
    saveBtn.onclick = () => {
        const url = document.getElementById("sheetUrlInput").value.trim();
        if (!isValidGoogleSheetUrl(url)) return reject(new Error("Invalid URL format."));
        try {
            browserAPI.storage.sync.set({ spreadsheetUrl: url }, () => {
                document.getElementById("spreadsheetPrompt").style.display = "none";
                document.getElementById('body').style.display = 'block';
                return resolve(url)
            });
        } catch (error) {
            console.error('Extention error inside sheetUrlInput: ',error)
        }
    };
}
function isValidGoogleSheetUrl(url) {
    return /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+/.test(url);
}
function trimTitle(title) {
    let cleanString = (str) => {
    if (!str) return "";
    return str
        // Remove all control characters (C0 + C1), zero-width chars, and formatting chars
        .replace(/[\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, '')
        // Normalize multiple spaces to a single space
        .replace(/\s{2,}/g, ' ')
        .trim();
}
    if (!title) return "";

    // Extract domain name from url
    const siteMatch = new RegExp(/:\/\/(?:www\.)?([^./]+)/i).exec(HermidataV3.url);
    const siteName = siteMatch ? siteMatch[1] : "";

    // Split title by common separators
    let cleanstring = cleanString(title);
    const parts = cleanstring.split(/ (?:(?:-+)|–|-|:|#|—|,|\|) /g).map(p => p.trim()).filter(Boolean);

    // "Chapter 222: Illythia's Mission - The Wandering Fairy [LitRPG World-Hopping] | Royal Road"

    // Regex patterns
    const chapterRemoveRegexV2 = /(\b\d{1,4}(?:\.\d+)?[A-Z]*\b\s*)?(\b(?:Episode|chapter|chap|ch)\b\.?\s*)(\b\d{1,4}(?:\.\d+)?[A-Z]*\b)?/gi
    
    const chapterRegex = /\b(?:Episode|chapter|chap|ch)\.?\s*\d+[A-Z]*/gi;
    const readRegex = /^\s*read(\s+\w+)*(\s*online)?\s*$/i;
    const junkRegex = /\b(all page|novel bin|online)\b/i;
    const cleanTitleKeyword = (title) => {
        return title
        .replace(/^\s*(manga|novel|anime|tv-series)\b\s*/i, '') // start
        .replace(/\s*\b(manga|novel|anime|tv-series)\s*$/i, '') // end
        .trim();
}
    const siteNameRegex = new RegExp(`\\b${siteName}\\b`, 'i');
    const flexibleSiteNameRegex = new RegExp(`\\b${siteName
        .replace(/[-/\\^$*+?.()|[\]{}]/g, "").split("")
        .map(ch => ch.replace(/\s+/, ""))
        .map(ch => `${ch}[\\s._-]*`)
        .join("")}\\b`, 'i');

    // Remove junk and site name
    let filtered = parts
        .filter(p => !readRegex.test(p))
        .filter(p => !junkRegex.test(p))
        .filter(p => !siteNameRegex.test(p))
        .filter(p => !flexibleSiteNameRegex.test(p))
        .map(p => cleanTitleKeyword(p))
        .map(p => p.replace(/^[\s:;,\-–—|]+/, "").trim()) // remove leading punctuation + spaces
        .map(p => p.replace('#', '').trim()) // remove any '#' characters
        .filter(Boolean)

    // Remove duplicates
    filtered = filtered.filter((item, idx, arr) =>
        arr.findIndex(i => i.toLowerCase() === item.toLowerCase()) === idx
    );

    // Extract main title (remove chapter info)
    let mainTitle = '';
    let Url_filter_parts = HermidataV3.url.split('/')
    let Url_filter = Url_filter_parts.at(-1).replace(/-/g,' ').toLowerCase().trim();
    let MakemTitle = (filter) => {
        if (!filter.length) return '';
        // Edge case: if first looks like "chapter info" but second looks like a real title → swap them
        if (
            filter.length > 1 &&
            /^\s*(chapter|ch\.?)\s*\d+/i.test(filter[0]) && // first is chapter info
            !/^\s*(chapter|ch\.?)\s*\d+/i.test(filter[1])   // second is NOT chapter info
        ) {
            [filter[0], filter[1]] = [filter[1], filter[0]]; // swap
        }
        // if first el is chapter info place it at the end
        if (filtered[0]?.replace(/\s*([–—-]|:|#|\|)\s*/g,' ').toLowerCase() === Url_filter) {// fip the first to last
            filter[filter.length] = filter[0];
            filter.shift();
        }

        mainTitle = filter[0]
        .replace(chapterRemoveRegexV2, '').trim() // remove optional leading/trailing numbers (int/float + optional letter) & remove the "chapter/chap/ch" part
        .replace(/^[\s:;,\-–—|]+/, "").trim() // remove leading punctuation + spaces
        .replace(/[:;,\-–—|]+$/,"") // remove trailing punctuation
        .trim();
        if(mainTitle === '' ) return MakemTitle(filter.slice(1));
        
        if (filter.length < 2) return mainTitle;
        let Chapter_Title = filter[1]
        .replace(chapterRegex, '').trim() // remove 'chapter' and any variation
        .replace(/\b\d+(\.\d+)?\b/g, "") // remove numbers
        .replace(/^[\s:;,\-–—|]+/, "").trim() // remove leading punctuation + spaces
        .replace(/[:;,\-–—|]+$/,"") // remove trailing punctuation
        .trim();

        if (Chapter_Title === '' && filter.length == 2) return mainTitle;
        if (Chapter_Title === '') return [mainTitle, ...MakemTitle(filter.slice(1))];
        HermidataV3.meta.notes = `Chapter Title: ${Chapter_Title}`;
        return mainTitle;
    }
    mainTitle = MakemTitle(filtered);
    return mainTitle.trim() || title;
}
function getCurrentDate() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are 0-based
    const year = now.getFullYear();
    return `${day}/${month}/${year}`;
}
function populateType() {
    const folderSelect = document.getElementById("Type");
    const folderSelect2 = document.getElementById("Type_HDRSS")
    novelType.forEach(element => {
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
function populateStatus() {
    const folderSelect = document.getElementById("status");
    readStatus.forEach(element => {
        const option = document.createElement("option");
        option.value = element;
        option.textContent = element;
        folderSelect.appendChild(option);
    });
}

function capitalizeFirst(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

async function saveSheet() {
    const title = document.getElementById("title").value;
    const Type = document.getElementById("Type").value;
    const Chapter = document.getElementById("chapter").value;
    const url = document.getElementById("url").value;
    const status = document.getElementById("status").value;
    const date = document.getElementById("date").value;
    const tags = document.getElementById("tags").value || "";
    const notes = document.getElementById("notes").value || "";
    const args = '';
    const sheetList = [title, Type, Chapter, url, status, date, tags, notes]
    HermidataV3.title = sheetList[0]
    HermidataV3.type = sheetList[1]
    HermidataV3.chapter.current = sheetList[2]
    HermidataV3.url = sheetList[3]
    HermidataV3.status = sheetList[4]
    HermidataV3.meta.tags = sheetList[6]
    HermidataV3.meta.notes = sheetList[7]
    // save to Browser in JSON format
    await updateChapterProgress(title, Type, Chapter);
    HermidataNeededKeys.Past = {};

    // save to google sheet & bookmark/replace bookmark
    browserAPI.runtime.sendMessage({
        type: "SAVE_NOVEL",
        data: [title, Type, Chapter, url, status, date, tags, notes],
        args
    });

    if(!Testing) setTimeout( () => window.close(), 400);
}

function FixTableSize() {
    const inputs = document.querySelectorAll('input.autoInput');
    inputs.forEach(input => {
        const td = input.closest('td');
        const table = input.closest('table');
        const columnIndex = td?.cellIndex ?? -1;
        const th = table?.querySelectorAll('th')[columnIndex];
        if (!th) return;

        const measureText = (text, inputEl) => {
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
            const parent = document.getElementById('ParentPreview');
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
            const clampedWidth = Math.min(textWidth + 12, availableWidth, HARDCAP_RUNAWAYGROWTH);
            input.style.width = `${clampedWidth}px`;
        };
        // Defer initial call to allow proper layout
        requestAnimationFrame(() => resize());
            input.addEventListener('input', resize);
    })
}
function changePageToClassic() {
    document.querySelector("#HDRSSBtn").classList = "Btn";
    document.querySelector(".HDRSS").style.opacity = 0;
    document.querySelector(".HDClassic").style.opacity = 1;
    document.querySelector(".HDClassic").style.overflow = 'hidden';
    
    // deactivate links in classic
    document.querySelectorAll(".HDRSS").forEach(a => {
        a.style.pointerEvents = 'none';
    });
    // activate links in RSS
    document.querySelectorAll(".HDClassic").forEach(a => {
        a.style.pointerEvents = 'auto';
    });
    document.body.style.height = '';
}
function openClassic(e) {
    const changclassListofClassic = (e) => {
        e.target.classList = "active Btn";
    }
    changePageToClassic();
    changclassListofClassic(e);
}

async function openRSS(e) {
    const changePageToRSS = (e) => {
        e.target.classList = "active Btn";
        document.querySelector("#HDClassicBtn").classList = "Btn";
        document.querySelector(".HDClassic").style.opacity = 0;
        document.querySelector(".HDRSS").style.opacity = 1;
        // deactivate links in classic
        document.querySelectorAll(".HDClassic").forEach(a => {
            a.style.pointerEvents = 'none';
        });
        // activate links in RSS
        document.querySelectorAll(".HDRSS").forEach(a => {
            a.style.pointerEvents = 'auto';
        });
        
        document.body.style.height = '650px';
        if (document.body.offsetWidth <= 300) document.body.style.width = '664px';
    }
    changePageToRSS(e);

    // If preloaded, use it instantly
    if (preloadCache.has("RSSPage")) {
        console.log("[Preload] Using preloaded RSS page");
        const prebuilt = preloadCache.get("RSSPage");
        document.querySelector("#All-RSS-entries").appendChild(prebuilt);
        makeSortSection(document.querySelector("#sort-RSS-entries"));
    } else {
        console.log("[Preload] Preloading fallback...");
        setTimeout(async () => {
            await makeRSSPage(); // fallback if user clicks before hover
        }, 300);
    }
}

async function getAllHermidata() {
    const allData = await new Promise((resolve, reject) => {
        browserAPI.storage.sync.get(null, (result) => {
            if (browserAPI.runtime.lastError) reject(new Error(browserAPI.runtime.lastError));
            else resolve(result || {});
        });
    });

    let allHermidata = {};
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

async function makeRSSPage(Preloading = false) {
    let itemPreloadSection = null;
    const sortSection = document.querySelector("#sort-RSS-entries")
    const NotificationSection = document.querySelector("#RSS-Notification")
    const AllItemSection = document.querySelector("#All-RSS-entries")

    // subscribe section
    makeSubscibeBtn();

    if (Preloading) {
        // item & notification section
        itemPreloadSection = await makeItemSection(NotificationSection, AllItemSection, Preloading) 
    } else {
        // sort section
        makeSortSection(sortSection);
        // item & notification section
        makeItemSection(NotificationSection, AllItemSection);
    }

    // footer
    makeFooterSection();

    return itemPreloadSection
}
async function enableHoverPreload(e) {
    // Avoid running twice
    if (preloadCache.has("RSSPage")) return;

    console.log("[Preload] Preparing RSS page in background...");

    // Run the same logic that `openRSS` uses, but don't insert yet.
    const preloadResult = await makeRSSPage(true);
    console.log("[Preload] Preloaded RSS page", preloadResult);
    preloadCache.set("RSSPage", preloadResult);
}


function makeFooterSection() {
    
    // clear notification
    const clearNotification = document.querySelector("#clear-notifications");
    clearNotification.addEventListener('click', () => {
        removeAllChildNodes(document.querySelector("#RSS-Notification")) // clear front-end
        setNotificationList(null) // clear back-end
    });
    // open RSS full page
    const FullpageRSSButton = document.querySelector(".fullpage-RSS-btn");
    FullpageRSSButton.addEventListener('click', () => open('./RSSFullpage.html'))
    
    // sync text & button
    SyncTextAndButtonOfRSS()

    // manifest version
    document.querySelector("#version").innerHTML = chrome.runtime.getManifest().version;
}

function SyncTextAndButtonOfRSS() {
    const latestRSSSync = document.querySelector("#RSS-latest-sync-div");
    const latestSyncSpan = document.querySelector("#lastSync");
    
    chrome.runtime.sendMessage({ type: "GET_LAST_SYNC" }, (response) => {
        latestSyncSpan.textContent = "hasn't sync yet";
        if ( !response || response.minutesAgo === null) return;
        const languageSuffix = response.minutesAgo >= 2 ? 's' : ''
        if (response.minutesAgo < 1) latestSyncSpan.textContent = "Just synced";
        else latestSyncSpan.textContent = `synced: ${response.minutesAgo} minute${languageSuffix} ago`
    });
    const ManualSyncBtn = document.querySelector("#RSS-sync-Manual");
    ManualSyncBtn.addEventListener("click", () => {
        browserAPI.runtime.sendMessage({ type: "RELOAD_RSS_SYNC" });
    });
    chrome.runtime.onMessage.addListener((msg) => {
        if ( msg.type === "SYNC_COMPLETED") latestSyncSpan.textContent = "Just synced";
    });
}

function removeAllChildNodes(parent) {
    while (parent.firstChild) {
        parent.removeChild(parent.firstChild);
    }

}
async function makeSubscibeBtn() {
    const feedListGLobal = await loadSavedFeedsViaSavedFeeds();
    const subscribeBtn = document.querySelector("#subscribeBtn");
    const NotificationSection = document.querySelector("#RSS-Notification");
    const AllItemSection = document.querySelector("#All-RSS-entries");

    subscribeBtn.className = "Btn";
    subscribeBtn.textContent = "Subscribe to RSS Feed";
    subscribeBtn.disabled = true;
    subscribeBtn.title = "this site doesn't have a RSS link";
    subscribeBtn.ariaLabel = "this site doesn't have a RSS link";

    let feedItemTitle;
    const currentTitle = document.getElementById("title_HDRSS").value || HermidataV3.title;

    Object.values(feedListGLobal).forEach(feed => {
        feedItemTitle = trimTitle(feed?.items?.[0]?.title || feed.title)
        if (currentTitle == feedItemTitle) {
            subscribeBtn.disabled = false
            subscribeBtn.title = "subscribe to recieve notifications"
            subscribeBtn.ariaLabel = "subscribe to recieve notifications"
            console.log("current page is a feed page \n", currentTitle)
        }
    });
    subscribeBtn.onclick = () => {
        Object.values(feedListGLobal).forEach(feed => {
            feedItemTitle = trimTitle(feed?.items?.[0]?.title || feed.title)
            if (currentTitle == feedItemTitle) {
                const currentType = document.getElementById("Type_HDRSS").value || HermidataV3.type;
                linkRSSFeed(feedItemTitle, currentType, feed);
                reloadContent(NotificationSection, AllItemSection)
                console.log('linked RSS to extention')
            }
        });
    }
}
async function reloadContent(NotificationSection,AllItemSection) {
    removeAllChildNodes(NotificationSection) // clear front-end
    removeAllChildNodes(AllItemSection) // clear front-end
    makeFeedHeader(NotificationSection);
    const feedListLocalReload = await loadSavedFeeds();
    makefeedItem(NotificationSection, feedListLocalReload);
    makeItemHeader(AllItemSection);
    makefeedItem(AllItemSection, feedListLocalReload);
}
function makeSortSection(sortSection) {
    // makeSortHeader(sortSection);
    makeSortOptions(sortSection);
    sortOptionLogic(sortSection);
}

function setupSearchBar(e_, suggestionBox) {
    const searchInput = document.querySelector('.search-input');

    const items = suggestionBox.querySelectorAll('.autocomplete-item');
    if (!items.length) return;

    if (e_.key === 'ArrowDown') {
        e_.preventDefault();
        selectedIndex = (selectedIndex + 1) % items.length;
        updateHighlightedSuggestion(items, selectedIndex);
    } else if (e_.key === 'ArrowUp') {
        e_.preventDefault();
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        updateHighlightedSuggestion(items, selectedIndex);
    } else if (e_.key === 'Enter') {
        e_.preventDefault();
        if (selectedIndex >= 0 && items[selectedIndex]) {
            // use selected suggestion
            const chosen = items[selectedIndex].textContent;
            applySearchSelection(searchInput, suggestionBox, chosen);
        } else if (items.length > 0) {
            // autocomplete to first suggestion
            const chosen = items[0].textContent;
            applySearchSelection(searchInput, suggestionBox, chosen);
        }
    }

    // Hide autocomplete when clicking elsewhere
    document.addEventListener('click', (e) => {
        if (!suggestionBox.contains(e.target) && e.target !== searchInput) {
        suggestionBox.innerHTML = '';
        }
    });
}

function handleSearchInput(e, suggestionBox) {
    const query = e.target.value.trim().toLowerCase();
    suggestionBox.innerHTML = '';

    if (!query) {
        filterEntries('');
        return;
    }

    const filtered = Object.values(AllHermidata).filter(item =>
        [item.title, ...(item.meta?.altTitles || [])]
        .some(t => t.toLowerCase().includes(query))
    );

    filterEntries(query, filtered);

    // Autocomplete suggestions
    const suggestions = filtered
        .map(f => f.title)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .slice(0, 7);

    // Build suggestion elements
    suggestions.forEach((s, idx) => {
        const div = document.createElement('div');
        div.className = 'autocomplete-item';
        div.textContent = s;
        div.addEventListener('click', () => {
        applySearchSelection(e.target, suggestionBox, s);
        });
        suggestionBox.appendChild(div);
    });
}

function applySearchSelection(input, suggestionBox, value) {
    input.value = value;
    filterEntries(value);
    suggestionBox.innerHTML = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    suggestionBox.innerHTML = '';
    input.focus();
}

function updateHighlightedSuggestion(items, selectedIndex) {
    items.forEach((el, i) => {
        el.classList.toggle('highlighted', i === selectedIndex);
    });
}

function filterEntries(query, filtered = null) {
    const allItems = document.querySelectorAll('.RSS-entries-item');

    allItems.forEach(item => {
        const titleEl = item.querySelector('.RSS-entries-item-title');
        const titleText = titleEl?.textContent?.toLowerCase() || '';

        const match = ( filtered
        ? filtered.some(f => f.title.toLowerCase() === titleText)
        : !query ) || titleText.includes(query);

        item.style.display = match ? '' : 'none';
        if (match) item.classList.add('seachable')
        else item.classList.remove('seachable');
    });
}


async function sortOptionLogic(parent_section) {
    // state object for filters
    const lastSort = JSON.parse(localStorage.getItem("lastFilter"));
    const filters = lastSort || {
        include: {}, // { type: ['Manga'], status: ['Ongoing'] }
        exclude: {},
        sort: ''
    };

    // find all custom checkboxes
    const checkboxes = parent_section.querySelectorAll(".custom-checkbox");

    for (const cb of checkboxes) {
        cb.removeEventListener("click", null);
        cb.addEventListener("click", () => {
            let state = Number.parseInt(cb.dataset.state || "0");

            // cycle 0→1→2→0
            state = (state + 1 ) % 3;
            cb.dataset.state = state.toString();

            // find its label text (filter name)
            const label = cb.nextElementSibling?.textContent?.trim();
            // find which section it belongs to (Type, Status, etc.)
            const section = cb.closest(".filter-section")?.firstChild?.textContent?.trim();
            if (!label || !section) return;

            if (section === "Sort") {
                // Reset all sort checkboxes first
                filters.sort = ''
                const sortCheckboxes = cb.closest(".filter-section").querySelectorAll(".custom-checkbox");
                sortCheckboxes.forEach(otherCb => otherCb.dataset.state = "0");

                // Enable current one
                if (state === 1) {
                    cb.dataset.state = "1" 
                    filters.sort = label
                } else if (state === 2) {
                    cb.dataset.state = "2";
                    filters.sort = `Reverse-${label}`
                }

                // apply and persist
                if (filters.sort) {
                    applySortToEntries(filters.sort);
                    applySortToNotification();
                }
                return;
            }

            // init arrays if not exist
            if (!filters.include[section]) filters.include[section] = [];
            if (!filters.exclude[section]) filters.exclude[section] = [];

            // reset previous state
            filters.include[section] = filters.include[section].filter(v => v !== label);
            filters.exclude[section] = filters.exclude[section].filter(v => v !== label);

            // apply new state
            if (state === 1) filters.include[section].push(label);
            else if (state === 2) filters.exclude[section].push(label);
            // trigger filtering logic here
            applyFilterToEntries(filters);
            localStorage.setItem("lastFilter", JSON.stringify(filters));
        });
    };
    const makeActiveState = (cb) => {
        const label = cb.nextElementSibling?.textContent?.trim();
        const section = cb.closest(".filter-section")?.firstChild?.textContent?.trim();
        let state = 0;
        
        const includeSelection = filters?.include?.[section] || [];
        const excludeSelection = filters?.exclude?.[section] || [];
        if ( includeSelection.length === 0 && excludeSelection.length === 0 && filters?.sort === undefined) return state;
        
        if ( includeSelection.includes(label) ) state = 1;
        else if ( excludeSelection.includes(label) ) state = 2;
        else if ( filters?.sort === label ) state = 1;
        return state;
    }
    // apply filters from local storage Visually
    for (const cb of checkboxes) {
        cb.dataset.state = makeActiveState(cb);
    };
    const hasAnyFilters = (filters) => {
        return (
            Object.values(filters.include || {}).some(v => v.length > 0) ||
            Object.values(filters.exclude || {}).some(v => v.length > 0) ||
            !!filters.sort
        );
    }

    // apply filters from local storage Logically
    setTimeout(() => {
        if (hasAnyFilters(filters)) {
            applyFilterToEntries(filters);
            if (filters.sort) {
                applySortToEntries(filters.sort);
                applySortToNotification()
            }
        }
    }, 300);
}


function applySortToEntries(sortType) {
    const container = document.querySelector('#All-RSS-entries');
    if (!container) return;

    // Always sort all entries (even hidden), to keep global order consistent
    const entries = Array.from(container.querySelectorAll('.RSS-entries-item'));
    if (!entries.length) return;

    const getData = (entry) => {
        const hash = entry.className.split('TitleHash-')[1]?.replace(' seachable','');
        return AllHermidata[hash] || {};
    };

    const compareAlphabet = (a, b, reverse = false) => {
        const titleA = getData(a).title?.toLowerCase() || '';
        const titleB = getData(b).title?.toLowerCase() || '';
        return reverse ? titleB.localeCompare(titleA) : titleA.localeCompare(titleB);
    };

    const compareDate = (a, b, key, reverse = false) => {
        const dateA = new Date(getData(a).meta?.[key] || 0);
        const dateB = new Date(getData(b).meta?.[key] || 0);
        return reverse ? dateA - dateB : dateB - dateA;
    };

    // Normalize sort type
    const reverse = sortType.startsWith("Reverse-");
    const baseType = sortType.replace("Reverse-", "");

    switch (baseType) {
        case "Alphabet":
            entries.sort((a, b) => compareAlphabet(a, b, reverse));
            break;
        case "Recently-Added":
            entries.sort((a, b) => compareDate(a, b, "added", reverse));
            break;
        case "Latest-Updates":
            entries.sort((a, b) => compareDate(a, b, "updated", reverse));
            break;
        default:
            return;
    }

    // Force DOM reflow even if order is same
    const frag = document.createDocumentFragment();
    entries.forEach(entry => frag.appendChild(entry));
    container.appendChild(frag);

    console.log(`[Hermidata] Sorted by ${sortType}`);
}
function applySortToNotification(sortType = "Reverse-Latest-Updates") {
    const container = document.querySelector('#RSS-Notification');
    if (!container) return;
    // Always sort all entries (even hidden), to keep global order consistent
    const entries = Array.from(container.querySelectorAll('.RSS-Notification-item'));
    if (!entries.length) return;

    const getData = (entry) => {
        const hash = entry.className.split('TitleHash-')[1]?.replace(' seachable','');
        return AllHermidata[hash] || {};
    };

    const compareDate = (a, b, key, reverse = false) => {
        const dateA = new Date(getData(a).meta?.[key] || 0);
        const dateB = new Date(getData(b).meta?.[key] || 0);
        return reverse ? dateA - dateB : dateB - dateA;
    };

    // Normalize sort type
    const reverse = sortType.startsWith("Reverse-");
    const baseType = sortType.replace("Reverse-", "");

    if (baseType === "Latest-Updates") entries.sort((a, b) => compareDate(a, b, "updated", reverse));
    // Force DOM reflow even if order is same
    const frag = document.createDocumentFragment();
    entries.forEach(entry => frag.appendChild(entry));
    container.appendChild(frag);
    console.log(`[Hermidata] Notification Sorted by ${sortType}`);
}

function getYearNumber(dateInput){
    const isISOString = !!new Date(dateInput)?.getHours();
    const splitDatum = dateInput.split('/')[2]
    return isISOString ? dateInput.split('-')[0] : splitDatum || new Date()?.toISOString().split('-')[0]
}

function applyFilterToEntries(filters) {
    const entries = document.querySelectorAll(".RSS-entries-item");

    
    entries.forEach(entry => {
        const hashItem = entry.className.split('TitleHash-')[1].replace(' seachable','');
        const entryData = AllHermidata[hashItem];
        const type = entryData.type;
        const status = entryData.status;
        const source = entryData.source;
        const tags = entryData.meta.tags || "";
        const dateAdded = getYearNumber(entryData.meta.added);


        let visible = true;

        // Check all include filters — must match at least one in each group
        for (const [section, values] of Object.entries(filters.include)) {
            if (values.length === 0) continue;

            let val;
            switch (section) {
                case "Type":
                    val = type
                    break;
                case "Status":
                    val = status
                    break;
                case "Source":
                    val = source
                    break;
                case "Tag":
                    val = tags
                    break;
                case "Date":
                    val = dateAdded
                    break;
                default:
                    break;
            }
            const match = Array.isArray(val)
                ? val.some(v => values.includes(v))
                : values.includes(val);

            if (!match) {
                visible = false;
                break;
            }
        }

        // Check exclude filters — hide if matches any
        if (visible) {
            for (const [section, values] of Object.entries(filters.exclude)) {
                if (values.length === 0) continue;

                let val;
                switch (section) {
                    case "Type":
                        val = type
                        break;
                    case "Status":
                        val = status
                        break;
                    case "Source":
                        val = source
                        break;
                    case "Tag":
                        val = tags
                        break;
                    case "Date":
                        val = dateAdded
                        break;
                    default:
                        break;
                }
                const match = Array.isArray(val)
                    ? val.some(v => values.includes(v))
                    : values.includes(val);

                if (match) {
                    visible = false;
                    break;
                }
            }
        }

        entry.style.display = visible ? "" : "none";
        visible
            ? entry.classList.add('seachable')
            : entry.classList.remove('seachable');
    });
}


function makeSortOptions(parent_section) {
    if (document.querySelector('.mainContainerHeader')) return;

    const mainContainer = document.createElement('div');
    mainContainer.className = 'mainContainerHeader';

    // 0. Search bar
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search...';
    searchInput.className = 'search-input';
    
    const autocompleteContainer = document.createElement('div');
    autocompleteContainer.className = 'autocompleteContainer';

    searchInput.addEventListener('input', (e) => handleSearchInput(e, autocompleteContainer));
    searchInput.addEventListener('keydown', (e) => setupSearchBar(e, autocompleteContainer));

    searchContainer.appendChild(searchInput);
    searchContainer.appendChild(autocompleteContainer);
    mainContainer.appendChild(searchContainer);

    // Helper to create a filter section
    const createFilterSection = (title, items, className) => {
        const section = document.createElement('div');
        section.className = `filter-section ${className}`;
        section.style.width = 'fit-content';
        const headerContainer = document.createElement('div');
        headerContainer.className = 'filter-header-container';
        headerContainer.style.cursor = 'pointer';

        const headersymbol = document.createElement('div');
        headersymbol.className = 'filter-header-symbol';
        headersymbol.dataset.filterState = 'down';

        const header = document.createElement('h4');
        header.textContent = title;
        header.className = 'filter-header-text'
        
        
        
        const list = document.createElement('div');
        list.className = 'filter-list';
        
        headerContainer.addEventListener('click', () => {
            headersymbol.dataset.filterState = headersymbol.dataset.filterState === 'down' ? 'up' : 'down';
        });
        headerContainer.append(header,headersymbol);
        section.appendChild(headerContainer)

        items.forEach(itemText => {
            const itemContainer = document.createElement('div');
            itemContainer.className = 'filter-item-container';

            // Custom checkbox div
            const checkbox = document.createElement('div');
            checkbox.className = 'custom-checkbox';
            checkbox.dataset.state = '0'; // 0=neutral, 1=include, 2=exclude

            // Label
            const label = document.createElement('label');
            label.textContent = itemText;

            itemContainer.appendChild(checkbox);
            itemContainer.appendChild(label);
            list.appendChild(itemContainer);
        });

        section.appendChild(list);
        return section;
    };
    const filterSection = document.createElement('div');
    filterSection.className = 'filter-section-container';

    const filterSectionTitle = document.createElement('h4');
    filterSectionTitle.className = 'filterSectionTitle';
    filterSectionTitle.classList.add('Btn');
    filterSectionTitle.textContent = "filter";
    filterSectionTitle.dataset.filterDisplay = 'none';
    filterSectionTitle.addEventListener('click', () => {
        filterSectionTitle.dataset.filterDisplay = filterSectionTitle.dataset.filterDisplay === 'none' ? 'flex' : 'none';
    });
    searchContainer.appendChild(filterSectionTitle);
    mainContainer.appendChild(filterSection);

    // 1. Sort
    const Allsorts = (['Alphabet', 'Recently-Added', 'Latest-Updates'])
    const SortSection = createFilterSection('Sort', Allsorts, 'filter-sort');
    filterSection.appendChild(SortSection);
    // Add click listeners for sort options
    SortSection.querySelectorAll('.filter-item-container').forEach(container => {
        const label = container.querySelector('label');
        applySortToEntries(localStorage.getItem('lastSort') || 'Alphabet');
        label.addEventListener('click', () => {
            const sortType = label.textContent.trim();
            localStorage.setItem('lastSort', sortType);
            // Apply sorting immediately
            applySortToEntries(sortType);
            applySortToNotification();
        });
    });


    // 2. Type
    const typeSection = createFilterSection('Type', novelType, 'filter-type');
    filterSection.appendChild(typeSection);

    // 3. Status
    const statusSection = createFilterSection('Status', readStatus, 'filter-status');
    filterSection.appendChild(statusSection);

    // 3.5. novels Status filter
    const novelStatusSection = createFilterSection('Novel-Status', novelStatus, 'filter-novel-status');
    filterSection.appendChild(novelStatusSection);

    // 4. Source
    const allSources = Array.from(new Set(Object.values(AllHermidata || {}).map(item => item.source).filter(Boolean)));
    const sourceSection = createFilterSection('Source', allSources, 'filter-source');
    filterSection.appendChild(sourceSection);

    // 5. Tags
    const allTags = Array.from(new Set(Object.values(AllHermidata || {}).flatMap(item => item.meta?.tags || [])));
    const tagSection = createFilterSection('Tag', allTags, 'filter-tag');
    filterSection.appendChild(tagSection);

    // 6. Dates
    const allDates = generateDateFilterSection()
    const dateSection = createFilterSection('Date', allDates, 'filter-date');
    filterSection.appendChild(dateSection);

    parent_section.appendChild(mainContainer);
    const element = ['Type', 'Status', 'Novel-Status', 'Source', 'Tag', 'Date'];
    for (let index = 0; index < element.length; index++) {
        const elFilterClassName = ['filter-type', 'filter-status', 'filter-novel-status', 'filter-source', 'filter-tag', 'filter-date']
        const elFilter = mainContainer.querySelector(`.${elFilterClassName[index]}`)
        const calcWidth = elFilter?.clientWidth || '';
        if (calcWidth && elFilter) elFilter.style.minWidth = `${calcWidth}px`;
        else console.log('mimnimum width not added for: ',elFilter,'\n', 'calcWidth is: ',calcWidth)
    }
    document.querySelector('.autocompleteContainer').style.width = `${  document.querySelector('.search-input').offsetWidth}px`;
    const lastSort = localStorage.getItem("lastSort");
    if (lastSort) { 
        applySortToEntries(lastSort);
        applySortToNotification();
    }
}

/**
 * Converts a date (string, Date, or number) into a decade label bucket.
 * @param {string|Date|number} dateInput
 * @returns {string} decadeLabel
 */
function getYearBucket(dateInput) {
    if (!dateInput) return "Unknown";
    const year = getYearNumber(dateInput)
    if (Number.isNaN(year)) return "Unknown";

    switch (year) {
        case year >= 2016 && year <= 2020:
            return "2020s";
        case year >= 2011 && year <= 2015:
            return "2015s";
        case year >= 2000 && year <= 2010:
            return "2010s";
        case year >= 1990 && year <= 1999:
            return "90s";
        case year <= 1989:
            return "80s & older";
        default:
            return String(year)
    }
}

function generateDateFilterSection() {
    const allEntries = Object.values(AllHermidata || {});
    const yearBuckets = allEntries.map(entry => {
        const dateStr = entry.meta?.originalRelease || entry.meta?.added || entry.meta?.updated || null;
        return getYearBucket(dateStr);
    });

    const uniqueBuckets = Array.from(new Set(yearBuckets)).filter(Boolean);

    const thisYeay = new Date().getFullYear()
    const everySingleYear = thisYeay - 2020
    const sortOrderOldType = ["2020s", "2015s", "2010s", "90s", "80s & older"];
    const sortOrderEveryYearType = []
    for (let index = 0; index < everySingleYear; index++) {
        sortOrderEveryYearType.push(String(thisYeay - index))
    }
    const sortOrder = sortOrderEveryYearType.concat(sortOrderOldType)
    uniqueBuckets.sort((a, b) => sortOrder.indexOf(a) - sortOrder.indexOf(b));

    return uniqueBuckets;
}


function makeSortHeader(parent_section) {
    if (document.querySelector('.containerHeader-sort')) return
    const container = document.createElement('div');
    container.className = 'containerHeader-sort'
    const title = document.createElement('div');
    title.className = "titleHeader";
    title.textContent = 'Sort'
    container.appendChild(title);
    parent_section.appendChild(container)

}
function makeFeedHeader(parent_section) {
    if (document.querySelector('.containerHeader-feed')) return
    const container = document.createElement('div');
    container.className = 'containerHeader-feed'
    container.style.cursor = 'pointer';
    const title = document.createElement('div');
    title.className = "titleHeader";
    title.textContent = 'Notifications'
    container.appendChild(title);
    const feedHeadersymbol = document.createElement('div');
        feedHeadersymbol.className = 'feed-header-symbol';
        feedHeadersymbol.dataset.feedState = 'down';
    container.addEventListener('click', () => {
            feedHeadersymbol.dataset.feedState = feedHeadersymbol.dataset.feedState === 'down' ? 'up' : 'down';
        });
    title.appendChild(feedHeadersymbol);

    parent_section.appendChild(container)

}
function makeItemHeader(parent_section) {
    if (document.querySelector('.containerHeader-item')) return
    const container = document.createElement('div');
    container.className = 'containerHeader-item'
    const title = document.createElement('div');
    title.className = "titleHeader";
    title.textContent = 'All saved items'
    container.appendChild(title);
    parent_section.appendChild(container)

}
async function getLocalNotificationItem(key) {
    return new Promise((resolve, reject) => {
        browserAPI.storage.local.get("clearedNotification", (result) => {
            if (browserAPI.runtime.lastError) return reject(new Error(browserAPI.runtime.lastError));
            resolve(result?.clearedNotification?.[key] || false);
        });
    }).catch(error => {
        console.error('Extention error: Failed Premise getHermidata: ',error);
        console.log('Key',key,'\n');
        return {};
    })
}
async function setNotificationList(key, value = true) {
    return new Promise((resolve, reject) => {
        if (key === undefined) {
            reject(new Error("setNotificationList: key is required"));
            return;
        }
        browserAPI.storage.local.get("clearedNotification", (result) => {
        const conbined = {...result?.clearedNotification};
        conbined[key] = value;
        browserAPI.storage.local.set({clearedNotification: conbined}, () => {
            if (browserAPI.runtime.lastError) return reject(new Error(browserAPI.runtime.lastError));
        });
    });
    }).catch(error => {
        console.error('Extention error: Failed Premise getHermidata: ',error);
        return {};
    });
}
function getChapterFromTitleReturn(correctTitle, title, chapter, url) {
    const isNotPartOfTitle = title?.replace(correctTitle, '');
    const finalChapter = url ? getChapterFromTitle(isNotPartOfTitle, url) : chapter;
    return isNotPartOfTitle ? finalChapter : '';
}
async function makefeedItem(parent_section, feedListLocal, Preloading = false) {
    let tempContainer = document.createElement("div");
    for (const [key, value] of Object.entries(feedListLocal)) {
        const isRSSItem = parent_section.id == "All-RSS-entries";
        const title = findByTitleOrAltV2(value?.items?.[0]?.title || value.title, AllHermidata).title || value?.items?.[0]?.title || value.title;
        const url = value?.items?.[0]?.link || value.url;

        const useAutoDetectedChapter =  isRSSItem ? getChapterFromTitleReturn(value?.title, title, undefined, url) : '';
        const chapter = value?.chapter?.latest || useAutoDetectedChapter || value?.chapter?.current || '';

        const currentHermidata = AllHermidata?.[key]
        const currentChapter = currentHermidata?.chapter?.current
        const clearedNotification = await getLocalNotificationItem(key);
        const isRead = !isRSSItem && (currentChapter === chapter)

        const settings = await getSettings();
        // removed && ( seachable || (chapter !== currentChapter ))
        if ( parent_section && !document.querySelector(`#${parent_section.id} .TitleHash-${key}`) && !isRead && !clearedNotification) {
            const li = document.createElement("li");
            li.className = parent_section.id == "All-RSS-entries" ? "RSS-entries-item" : "RSS-Notification-item";
            li.classList.add("hasRSS", `TitleHash-${key}`, 'seachable');
            li.addEventListener('contextmenu', (e) => rightmouseclickonItem(e))

            const ElImage = document.createElement("img");
            ElImage.className = parent_section.id == "All-RSS-entries" ? "RSS-entries-item-image" : "RSS-Notification-item-image";
            ElImage.src = value?.rss?.image ||value?.image || value?.favicon || 'icons/icon48.png';
            ElImage.sizes = "48x48";
            ElImage.style.width = "48px";
            ElImage.style.height = "48px";
            ElImage.style.objectFit = "contain";
            ElImage.style.borderRadius = "8px";

            ElImage.alt = "Feed Image";
            const ElInfo = document.createElement("div");
            ElInfo.className =  parent_section.id == "All-RSS-entries" ? "RSS-entries-item-info" : "RSS-Notification-item-info";

            const ElTagContainer = document.createElement("div");
            ElTagContainer.className =  parent_section.id == "All-RSS-entries" ? "RSS-entries-item-tag-container" : "RSS-Notification-item-tag-container";
            if ( currentHermidata.meta?.tags.length > 0 ) {
                const allTags = typeof currentHermidata.meta?.tags == "object" ? currentHermidata.meta?.tags : currentHermidata.meta?.tags?.split(',');
                for (let index in allTags) {
                    const tagName = allTags[index]
                    const tagDiv = document.createElement('div');
                    tagDiv.classList = [`tag-div tag-div-${tagName}`];
                    tagDiv.textContent = `[${tagName}]`;
                    tagDiv.style.color = settings.tagColoring?.[tagName];
                    tagDiv.dataset.TagColor = settings.tagColoring?.[tagName];
                    ElTagContainer.append(tagDiv)
                }
            }

            const chapterText = chapter ? `latest Chapter: ${chapter}` : 'No chapter info';
            const AllItemChapterText = currentChapter == chapter ?  `up-to-date (${chapter})` : `read ${currentChapter} of ${chapter}`;
            const titleText = trimTitle(value?.items?.[0]?.title || value.title);
            const maxTitleCharLangth = 50;
            const titleTextTrunacted = titleText.length > maxTitleCharLangth ? titleText.slice(0, maxTitleCharLangth - 3) + '...' : titleText;
            
            const lastRead = AllHermidata[key]?.chapter?.current || null;
            const progress = lastRead ? ((Number.parseFloat(lastRead) / Number.parseFloat(chapter)) * 100 ).toPrecision(3) : '0';

            const ELTitle = document.createElement("div");
            const ELchapter = document.createElement("div");
            const ELprogress = document.createElement("div");
            
            ELTitle.className = parent_section.id == "All-RSS-entries" ? "RSS-entries-item-title" : "RSS-Notification-item-title";
            ELchapter.className = parent_section.id == "All-RSS-entries" ? "RSS-entries-item-chapter" : "RSS-Notification-item-chapter";
            ELprogress.className = parent_section.id == "All-RSS-entries" ? "RSS-entries-item-progress" : "RSS-Notification-item-progress";
            


            ELTitle.textContent = `${titleTextTrunacted}`;
            ELchapter.textContent = isRSSItem ? `${AllItemChapterText}` : `${chapterText}`;
            ELprogress.textContent = `${progress}%`;


            ElInfo.append(ElImage,ELTitle, ELchapter, ELprogress);


            const Elfooter = document.createElement("div");

            const status = '';
            if ( currentHermidata?.meta?.tags?.length > 0) {
                const tagDicContainer = document.createElement('div')
                tagDicContainer.className = "tag-div-container"
                for (const tag in currentHermidata?.meta?.tags) {
                    const tagDiv = document.createElement('div');
                    tagDiv.textContent = tag;
                    tagDiv.className = 'tag-div';
                    tagDicContainer.appendChild(tagDiv)
                }
                Elfooter.appendChild(tagDicContainer)
            }
            Elfooter.className =  parent_section.id == "All-RSS-entries" ? "RSS-entries-item-footer" :"RSS-Notification-item-footer";
            const domain = value?.domain || value.url.replace(/^https?:\/\/(www\.)?/,'').split('/')[0]
            Elfooter.textContent = `${domain}`;
            li.onclick = () => clickOnItem(value, isRSSItem);
            
            // const pubDate = document.createElement("p");
            // pubDate.textContent = `Published: ${feed?.items?.[0]?.pubDate ? new Date(feed.items[0].pubDate).toLocaleString() : 'N/A'}`;
            li.append(ElTagContainer)
            li.appendChild(ElInfo);
            li.appendChild(Elfooter);
            // li.appendChild(pubDate);
            if (Preloading) tempContainer.appendChild(li);
            else parent_section.appendChild(li);
        }
    }
    if (Preloading) return tempContainer

}
function clickOnItem(value, isRSSItem) {
    if (document.querySelector('.feed-header-symbol').dataset.feedState === 'up' && !isRSSItem) return;
    browser.tabs.create({ url: value?.rss?.latestItem?.link || value.url });
}
function rightmouseclickonItem(e) {
    e.preventDefault(); // stop the browser’s default context menu
    if (document.querySelector('.feed-header-symbol').dataset.feedState === 'up') return;

    // Remove any existing custom menu first
    document.querySelectorAll(".custom-context-menu").forEach(el => el.remove());

    // Create the menu container
    const menu = document.createElement("div");
    menu.className = "custom-context-menu";
    menu.style.top = `${e.clientY}px`;
    if (e.clientY > 400) {
        menu.style.bottom = `${15}px`;
        menu.style.top = `${e.clientY - 150}px`;
    }
    menu.style.left = `${e.clientX}px`;

    // Define your menu options
    const optionsNotification = [
        { label: "Copy title", action: () => copyTitle(e.target) },
        { label: "Open in page", action: () => openInPage(e.target) },
        { label: "Open in new window", action: () => openInNewWindow(e.target) },
        "separator",
        { label: "Clear notification", action: () => clearNotification(e.target) },
        "separator",
        { label: "Unsubscribe", action: () => unsubscribe(e.target) },
    ];
    const optionsAllItems = [
        { label: "Copy title", action: () => copyTitle(e.target) },
        { label: "Open in page", action: () => openInPage(e.target) },
        { label: "Open in new window", action: () => openInNewWindow(e.target) },
        "separator",
        { label: "add alt title", action: () => addAltTitle(e.target) },
        { label: "Rename", action: () => RenameItem(e.target) },
        "separator",
        { label: "delete", action: () => remove(e.target) },
    ];
    const itemLocation = getNotificationItem(e.target) ? 'notification' :  'entries'
    
    const options = itemLocation == 'notification' ? optionsNotification : optionsAllItems;
    // Build the menu content
    for (const opt of options) {
        if (opt === "separator") {
        const hr = document.createElement("hr");
        hr.className = "menu-separator";
        menu.appendChild(hr);
        continue;
        }
        const itemContainer = document.createElement('div');
        itemContainer.className = "context-menu-item-container";

        const item = document.createElement("div");
        item.className = "menu-item";
        item.textContent = opt.label;
        item.addEventListener("click", () => {
        opt.action();
        menu.remove();
        });
        itemContainer.appendChild(item);
        menu.appendChild(itemContainer);
    }

    document.body.appendChild(menu);

    // Remove when clicking elsewhere
    document.addEventListener("click", () => { menu.remove(); }, { once: true });
}
function copyTitle(target) {
    const item = getEntriesItem(target) || getNotificationItem(target);
    const nameClass = item.className.split(' ')[0] == 'RSS-entries-item' 
        ? 'RSS-entries-item-title'
        : 'RSS-Notification-item-title';
    // RSS-entries-item hasRSS TitleHash--1692575891 seachable
    console.log('seachable',item.className.split(' ')[item.className.split(' ').length -1])
    if (item.className.split(' ')[item.className.split(' ').length -1] == 'seachable') {
        const title0 = item.querySelector(`.${nameClass}`)
        const title1 = document.querySelector(`.RSS-Notification-item-title.${target.className}`);
        const title2 = document.querySelector(`.RSS-entries-item-title.${target.className}`);
        const title = title0 || ( title1 || title2 )
        navigator.clipboard.writeText(title.textContent.trim());
        console.log("Copied:", title.textContent.trim());
    }
}

function openInPage(target) {
    const url = target.dataset.url;
    if (url) window.open(url, "_self");
}

function openInNewWindow(target) {
    const url = target.dataset.url;
    if (url) window.open(url, "_blank");
}

function clearNotification(target) {
    console.log("Cleared notification for", target);
    // find id of list item
    const item = getNotificationItem(target);
    item.remove()
    const hashItem = item.className.split('TitleHash-')[1].replace(' seachable','');
    setNotificationList(hashItem)
    // remove from back-end
}
async function addAltTitle(target) {
    const item = getEntriesItem(target)
    if (!item) {
        console.log('isn\'t a entries item');
        return;
    }
    const hashItem = item.className.split('TitleHash-')[1].replace(' seachable','');
    const entry = AllHermidata[hashItem];
    if (!entry) {
        console.warn("Entry not found for hash:", hashItem);
        return;
    }
    const newTitle = await customPrompt("Add alternate title for this entry:", '');
    if (!newTitle) return;

    // Normalize and deduplicate
    const trimmed = trimTitle(newTitle);
    entry.meta = entry.meta || {};
    entry.meta.altTitles = Array.from(
        new Set([...(entry.meta.altTitles || []), trimmed])
    );

    // Save to storage
    await browserAPI.storage.sync.set({ [hashItem]: entry });

    console.log(`[Hermidata] Added alt title "${trimmed}" for ${entry.title}`);
}
async function appendAltTitle(newTitle, entry) {
    // Normalize and deduplicate
    const trimmed = trimTitle(newTitle);
    entry.meta = entry.meta || {};
    entry.meta.altTitles = Array.from(
        new Set([...(entry.meta.altTitles || []), trimmed])
    );

    const entryKey = entry.id || returnHashedTitle(entry.title, entry.type);

    await browserAPI.storage.sync.set({ [entryKey]: entry });
    console.log(`[Hermidata] Added alt title "${trimmed}" for ${entry.title}`);
}
async function RenameItem(target) {
    const item = getEntriesItem(target)
    if (!item) {
        console.log('isn\'t a entries item');
        return;
    }
    const oldKey = item.className.split('TitleHash-')[1].replace(' seachable','');
    const oldData = AllHermidata[oldKey]
    if (!oldData) {
        console.warn("No data found for this item");
        return;
    }
    const newTitle = await customPrompt(`Renaming "${oldData.title}" to:`, oldData.title);
    if (!newTitle || newTitle.trim() === oldData.title.trim()) {
        console.log("Rename canceled or unchanged");
        return;
    }
    // Generate new key and object
    const newKey = returnHashedTitle(newTitle, oldData.type);
    const newData = { ...oldData, title: trimTitle(newTitle), id: newKey };

    // Add the old title as an altTitle
    newData.meta = newData.meta || {};
    newData.meta.altTitles = Array.from(
        new Set([...(newData.meta.altTitles || []), oldData.title])
    );

    // Save and clean up
    await browserAPI.storage.sync.set({ [newKey]: newData });
    await browserAPI.storage.sync.remove(oldKey);

    //  update your in-memory list
    delete AllHermidata[oldKey];
    AllHermidata[newKey] = newData;

    // update UI
    item.querySelector(".RSS-entries-item-title").textContent = newTitle;
    item.className = item.className.replace(oldKey, newKey);

    console.log(`[Hermidata] Renamed "${oldData.title}" → "${newTitle}"`);
}

async function remove(target) {
    const item = getEntriesItem(target)
    if (!item) {
        console.log('isn\'t a entries item');
        return;
    }
    const hashItem = item.className.split('TitleHash-')[1].replace(' seachable','');
    const toBeRemovedItem = AllHermidata[hashItem]
    const confirmation = await customConfirm(`are you sure you want to remove ${toBeRemovedItem.title}`)
    if ( confirmation) {
        console.warn(`Removing item ${toBeRemovedItem}`)
        removeKeysFromSync(hashItem)
    }
}

async function unsubscribe(target) {
    console.log("Unsubscribed from", target);
    const item = getNotificationItem(target);
    if (!item) {
        console.log('isn\'t a notification item');
        return;
    }
    const hashItem = item.className.split('TitleHash-')[1].replace(' seachable','');
    
    const NotificationSection = document.querySelector("#RSS-Notification")
    const AllItemSection = document.querySelector("#All-RSS-entries")

    await unLinkRSSFeed({hash:hashItem });
    console.log('un-link RSS to extention')
    reloadContent(NotificationSection, AllItemSection)
    console.log('reloading notification')
}
function getEntriesItem(el) {
    if (!el) return undefined

    if (el.parentElement?.id === 'All-RSS-entries' &&  el.className?.split(' ')[0] === 'RSS-entries-item' ) return el

    return getEntriesItem(el.parentElement)
}
function getNotificationItem(el) {
    if (!el) return undefined

    if (el.parentElement?.id === 'RSS-Notification' &&  el.className?.split(' ')[0] === 'RSS-Notification-item' ) return el

    return getNotificationItem(el.parentElement)
}

async function makeItemSection(NotificationSection, AllItemSection, Preloading = false) {
    const feedFromHermidata = await loadSavedFeeds(); // actually subscribed
    if (Preloading) {
        makeFeedHeader(NotificationSection);
        makefeedItem(NotificationSection, feedFromHermidata);
        makeItemHeader(AllItemSection);
        return await makefeedItem(AllItemSection, AllHermidata, true);
    } else {
        makeFeedHeader(NotificationSection);
        makefeedItem(NotificationSection, feedFromHermidata);
        makeItemHeader(AllItemSection);
        makefeedItem(AllItemSection, AllHermidata, true);
    }
    // make the notification section
    // make the all items section
    // each item should have:
    // Title, last Read, Latest chapter, Tag(s), Status, progress %
    // buttons: open next chapter,
    // sortable by each field
    // filterable by Type, Status, Tags, Date
    // search bar to search by Title or Notes
    
}

async function loadSavedFeedsViaSavedFeeds() {
    const feedList = {};
    const { savedFeeds } = await browser.storage.local.get({ savedFeeds: [] });
    AllHermidata = AllHermidata || await getAllHermidata();
    

    for (const feed of savedFeeds) {
        if ( !feed.title || !feed.url ) continue;
        if ( feed.domain !=  Object.values(AllHermidata).find(novel => novel.url.includes(feed.domain))?.url.replace(/^https?:\/\/(www\.)?/,'').split('/')[0] ) continue;
        const type = Object.values(AllHermidata).find(novel => novel.title == trimTitle(feed?.items?.[0]?.title))?.type || novelType[0]
        const typeV2 = findByTitleOrAltV2(trimTitle(feed?.items?.[0]?.title || feed.title), AllHermidata)?.type || novelType[0]
        feedList[returnHashedTitle(feed?.items?.[0]?.title || feed.title || HermidataV3.title, (typeV2 || type ) || HermidataV3.type) ] = feed;
    }
    return feedList;
}
// isn't utilised
async function loadSavedFeeds() {
    const feedList = {};
    AllHermidata = await getAllHermidata();
    const AllFeeds = await loadSavedFeedsViaSavedFeeds();
    
    
    for (const [id, feed] of Object.entries(AllHermidata)) {
        if ( feed?.rss ) {
            const updatedFeed = await updateFeed(feed, AllFeeds);
            feedList[id] = updatedFeed;
        }
    }
    return feedList;
}
async function updateFeed(feed, allFeeds) {
    const rssInfo = feed.rss;
    if (!rssInfo?.url) return feed;
    const currentFeedTitle = findByTitleOrAltV2(rssInfo?.items?.[0]?.title || feed.title, AllHermidata);
    const matchFeed = Object.values(allFeeds).find(f => {
        const sameDomain = f.domain === rssInfo.domain;
        const sameTitle = findByTitleOrAltV2(f?.items?.[0]?.title || f.title, AllHermidata) === currentFeedTitle;
        return sameDomain && sameTitle;
    });
    if (!matchFeed) return feed; // no match

    const latestFetchedItem = matchFeed.items?.[0];
    const currentLatestItem = rssInfo.latestItem;
    const isNew = latestFetchedItem && (!currentLatestItem || latestFetchedItem.link !== currentLatestItem.link);

    // Update feed info
    feed.rss = {
        ...rssInfo,
        title: matchFeed.title || rssInfo.title,
        url: matchFeed.url || rssInfo.url,
        image: matchFeed.image || rssInfo.image,
        domain: matchFeed.domain || rssInfo.domain,
        lastFetched: new Date().toISOString(),
        latestItem: latestFetchedItem
    };
    // Optionally update latest chapter if we can parse it
    const latestChapter = getChapterFromTitle(latestFetchedItem.title, matchFeed.url);
    if (latestChapter) {
        feed.chapter.latest = latestChapter;
        feed.meta.updated = new Date().toISOString();
    }
    return feed;
}
/**
 * 
 * @param {string} title 
 * @param {string} url 
 * @param {string} type 
 * @returns {{
 *  id: string,
 *  title: string,
 *  type: string,
 *  url: string,
 *  source: string,
 *  status: string,
 *  chapter: {
 *   current: number,
 *   latest: number|null,
 *   history: number[],
 *   lastChecked: string
 *  },
 *  rss: object|null,
 *  import: object|null,
 *  meta: {
 *   tags: string[],
 *   notes: string,
 *   altTitles: string[],
 *   added: string,
 *   updated: string
 *  }
 * }}
 */
function makeHermidataV3(title, url, type = "Manga") {
    const Title = trimTitle(title);
    const hash = returnHashedTitle(title, type)
    const source = new URL(url).hostname.replace(/^www\./, "");

    return {
        id: hash,
        title: Title,
        type,
        url,
        source,
        status: "Viewing",
        chapter: {
            current: 0,
            latest: null,
            history: [],
            lastChecked: new Date().toISOString()
        },
        rss: null,
        import: null,
        meta: {
            tags: [],
            notes: "",
            altTitles: [Title],
            added: new Date().toISOString(),
            updated: new Date().toISOString(),
            originalRelease: null
        }
    };
}

async function saveHermidataV3(entry) {
    const key = entry.id || returnHashedTitle(entry.title, entry.type);
    entry.meta.updated = new Date().toISOString();
    await browser.storage.sync.set({ [key]: entry });
    console.log(`[HermidataV3] Saved ${entry.title}`);
}

async function updateChapterProgress(title, type, newChapterNumber) {
    let needsToMigrate = false
    const key = returnHashedTitle(title, type);
    const Hermidata = await getHermidata()
    const data = await browser.storage.sync.get(key);
    
    let entry = {};
    if (data[key]) entry = data[key]
    else if (Object.entries(Hermidata).length > 0) entry = Hermidata
    else entry = makeHermidataV3(title, HermidataV3.url, HermidataV3.type);

    if (!entry) {
        console.warn(`[HermidataV3] No entry found for ${title}`);
    }
    if ( entry.title !== title || entry.type !== type || key !== entry.id) needsToMigrate = true

    if (newChapterNumber >= entry.chapter.current) {
        entry.id = key;
        entry.chapter.history.push(entry.chapter.current);
        entry.chapter.current = newChapterNumber;
        entry.status = HermidataV3.status;
        entry.type = HermidataV3.type;
        const rawTags = HermidataV3.meta.tags;
        entry.meta.tags = Array.isArray(rawTags) ? rawTags : rawTags.split(',').map(tag => tag.trim()).filter(Boolean);
        entry.chapter.lastChecked = new Date().toISOString();
        entry.meta.updated = new Date().toISOString();
        await browser.storage.sync.set({ [key]: entry });
        console.log(`[HermidataV3] Updated ${title} to chapter ${newChapterNumber}`);
    }
    if (needsToMigrate) await getHermidata()
}
/**
 *  merge RSS feed data into existing Hermidata entry
 * @param {String} title - the RSS Feed title
 * @param {String} type - the RSS input type
 * @param {Object} rssData  - the RSS feed data
*/
async function linkRSSFeed(title, type, rssData) {
    // check if new entry is inside database
    const altCheck = await detectAltTitleNeeded(title, type, rssData.domain);
    
    const titleOrAlt = findByTitleOrAltV2(title, AllHermidata)?.title || title
    const key = returnHashedTitle( titleOrAlt, type);

    const KeysToFetch = [key];
    if (altCheck.relatedKey && altCheck.relatedKey !== key) KeysToFetch.push(altCheck.relatedKey)
    
    const stored = await browser.storage.sync.get(KeysToFetch);
    const entry = stored[key] || stored[altCheck.relatedKey];

    if (altCheck.needAltTitle && altCheck.relatedKey) {
        const relatedEntry = stored[altCheck.relatedKey];
        if (relatedEntry) {
            const confirmation = await customConfirm(
                `${altCheck.reason}\nAdd "${title}" as an alt title for "${relatedEntry.title}"?`
            );
            if (confirmation) await appendAltTitle(title, relatedEntry);
        }
    }

    if (!entry) makeHermidataV3(title, HermidataV3.url, type);

    entry.rss = {
        title: rssData.title,
        url: rssData.url,
        image: rssData.image,
        domain: rssData.domain,
        lastFetched: new Date().toISOString(),
        latestItem: rssData.items?.[0] ?? null
    };

    // Optionally update chapter.latest from feed title
    const latestChapter = getChapterFromTitle(rssData.items?.[0]?.title, entry.rss.url);
    if (latestChapter) entry.chapter.latest = latestChapter;

    await browser.storage.sync.set({ [key]: entry });
}

async function unLinkRSSFeed({hash, title = '', type = '', }) {
    const key = hash || returnHashedTitle(title, type);
    const stored = await browser.storage.sync.get(key);
    const entry = stored[key]
    if (!entry) return;

    entry.rss = null;

    await browser.storage.sync.set({ [key]: entry });
}

async function detectOldHashEntries() {
    const all = AllHermidata || await getAllHermidata();
    const results = [];

    for (const [key, obj] of Object.entries(all)) {
        const oldHash = getOldIDType(obj);
        const newHash = returnHashedTitle(obj.title, obj.type);

        if (obj.id === oldHash && oldHash !== newHash) {
            results.push({
                key,
                title: obj.title,
                type: obj.type,
                source: obj.source,
                oldHash,
                newHash
            });
        }
    }

    console.table(results);
    console.info(`Found ${results.length} entries using the old hash method.`);
    return results;
}

async function migrateOldHashes() {
    const oldEntries = await detectOldHashEntries();
    if (!oldEntries.length) {
        console.log("No old-hash entries found — everything is already up to date!");
        return;
    }

    const all = AllHermidata || await getAllHermidata();

    for (const entry of oldEntries) {
        const older = all[entry.oldHash];
        const newer = { ...older, id: entry.newHash };
        try {
            await migrateHermidataV5(newer, older, 'YES');
        } catch (err) {
            console.error(`Migration failed for ${entry.title}:`, err);
        }
    }

    console.log(`Finished migrating ${oldEntries.length} entries to new hash.`);
}

async function migrateAndCheckDuplicates() {
    await migrateOldHashes();
    console.log("Now scanning for duplicates...");
    const dups = await findPotentialDuplicates(0.9);

    if (dups.length === 0) {
        console.log("No duplicates found after migration.");
    } else {
        console.warn(`Found ${dups.length} potential duplicates.`);
        console.table(dups.map(d => ({
            TitleA: d.titleA,
            TitleB: d.titleB,
            Score: d.score.toFixed(2)
        })));
    }

    return dups;
}
/**
 * Entry to auto merge duplicates
 * @param {number} threshold - decimal number dictating the threshold of similarity to merge found entries
 * @returns - merged Keys, titles, sources and levenstein score
 */
async function migrateAndAutoMergeDuplicates(threshold = 0.9) {
    // Step 1: migrate all old hashes first
    await migrateOldHashes();

    // Step 2: scan for duplicates
    console.log("Scanning for duplicates after migration...");
    const dups = await findPotentialDuplicates(threshold);

    if (!dups.length) {
        console.log("No duplicates found after migration.");
        return [];
    }

    console.warn(`Found ${dups.length} potential duplicates.`);
    console.table(
        dups.map(d => ({
            TitleA: d.titleA,
            TitleB: d.titleB,
            Score: d.score.toFixed(2),
        }))
    );

    // Step 3: automatically merge them
    for (const dup of dups) {
        await autoMergeDuplicate(dup.keyA, dup.keyB);
    }

    console.log("All possible duplicates processed.");
    return dups;
}

/**
 * Automatically merges two entries by picking the one
 * with the highest chapter.latest (or the newest update).
 */
async function autoMergeDuplicate(idA, idB) {
    const data = AllHermidata || await getAllHermidata();
    const objA = data[idA];
    const objB = data[idB];

    if (!objA || !objB) {
        console.warn(`Skipping missing objects:`, idA, idB);
        return;
    }

    // Compare chapter.latest as "progress"
    const latestA = objA.chapter?.latest ?? 0;
    const latestB = objB.chapter?.latest ?? 0;

    // Pick which one is "newer"
    let newer = objA;
    let older = objB;
    if (latestB > latestA) [newer, older] = [objB, objA];

    const newerHashType = detectHashType(newer);
    const olderHashType = detectHashType(older);
    console.log(`Auto-merging "${older.title}" → "${newer.title}"`,
        `\n newer hash: ${newerHashType}`,
        `\n older hash: ${olderHashType}`
    );
    // check if Hash is the old way
    // Use your existing migrateHermidataV5 logic
    const merged = await migrateHermidataV5(newer, older,
        olderHashType === 'old' ? 'OLD' : 'DEFAULT',
        newerHashType === 'old' ? 'OLD' : 'DEFAULT'
    );

    // Save and remove the old entry key
    if (merged) {
        await browserAPI.storage.sync.set({ [merged.id]: merged });
        await browserAPI.storage.sync.remove(older.id);
        console.log(`Merged "${older.title}" into "${newer.title}"`);
    } else {
        console.error(`Merge failed for:`, older.title, newer.title);
    }
}


/**
 * Select 2 ID's wich the user wants to merge
 * @param {String} id1 
 * @param {String} id2 
 */
async function SelectDuplicates(id1, id2) {
    const data = AllHermidata || await getAllHermidata();
    const obj1 = data[id1];
    const obj2 = data[id2];
    const finalObj = await migrationSteps(obj1, obj2);
    console.log('finalObj is: ',finalObj)
}
/**
 * compare the similarity between both inputs
 * @param {String} id1 
 * @param {String} id2 
 * @returns {Premise<{
 * keyA: String
 * keyB: String
 * titleA: String
 * titleB: String
 * sourceA: String
 * sourceB: String
 * RSSA: object|null
 * RSSB: object|null
 * score: number
 * }>}
 */
async function findDuplicatescore(id1, id2) {
    const data = AllHermidata || await getAllHermidata();
    const score = CalcDiff(data[id1].title, data[id2].title);
    let output = []
    output.push({
        keyA: id1,
        keyB: id2,
        titleA: data[id1].title,
        titleB: data[id2].title,
        sourceA: data[id1].source,
        sourceB: data[id2].source,
        RSSA: data[id1]?.rss || null,
        RSSB: data[id2]?.rss || null,
        score: score
    })
    return output;
}


async function findPotentialDuplicates(threshold = 0.9) {
    const data = AllHermidata || await getAllHermidata();
    const entries = Object.entries(data);
    const duplicates = [];

    console.group("Duplicate Title Scan");

    for (let i = 0; i < entries.length; i++) {
        const [keyA, valA] = entries[i];
        for (let j = i + 1; j < entries.length; j++) {
            const [keyB, valB] = entries[j];

            // Skip if same source and title already identical
            if (valA.source === valB.source && valA.title === valB.title && valA.id === valB.id ) continue;

            const score = CalcDiff(valA.title, valB.title);
            if (score >= threshold) {
                duplicates.push({
                    keyA,
                    keyB,
                    titleA: valA.title,
                    titleB: valB.title,
                    sourceA: valA.source,
                    sourceB: valB.source,
                    score
                });

                console.warn(
                    `[DUPLICATE ${score.toFixed(2)}]`,
                    `(${valA.source}) "${valA.title}" ↔ (${valB.source}) "${valB.title}"`
                );
            }
        }
    }

    console.groupEnd();

    console.info(`Scan complete: found ${duplicates.length} potential duplicates.`);
    return duplicates;
}
/**
 * returns an Object with inside the argument of the input needs an alt name
 * @param {String} title - Input title
 * @param {String} type - Input type
 * @param {String} source - Input source - default HermidataV3.source
 * @param {Float} threshold  - float number of height to probality it is the same novel - default 0.85
 * @returns {Premise<{
 *  needAltTitle: boolean,
 *  reason: String,
 *  similarity: number|null,
 *  relatedKey: String|null,
 *  relatedTitle: String|null
 * }>}
 */
async function detectAltTitleNeeded(title, type, source = HermidataV3.source, threshold = 0.85) {
    const data = AllHermidata || await getAllHermidata();
    if (!data) return { needAltTitle: false, reason: "No data loaded" };

    const normalizedTitle = trimTitle(title);
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
        .filter(([key, entry]) => entry.source !== source && entry.type === type);

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
            relatedKey: bestMatch.key,
            relatedTitle: bestMatch.entry.title
        };
    }

    // 4. No similar title found
    return {
        needAltTitle: false,
        reason: "No close matches found"
    };
}

function CalcDiff(a, b) {
    if (!a || !b) return 0;

    // Create a stable key for caching
    const key = a < b ? `${a}__${b}` : `${b}__${a}`;
    if (CalcDiffCache.has(key)) return CalcDiffCache.get(key);

    // Normalize text
    const clean = str => str.toLowerCase().replace(/[^a-z0-9\s]/gi, '').trim();
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

function levenshteinDistance(a, b) {
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