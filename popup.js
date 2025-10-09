const browserAPI = typeof browser !== "undefined" ? browser : chrome;

const HARDCAP_RUNAWAYGROWTH = 300;

let Type = ["Manga", "Novel", "Anime", "TV-series"];
let statusList = ["Finished", "Viewing", "Dropped", "Planned"];
let Hermidata = {
    Page_Title: '',
    Title: '',
    Type: Type[0],
    Chapter: 0,
    Url: '',
    Status: statusList[1],
    Date: '',
    Tag: '',
    Notes: '',
    GoogleSheetURL: '',
    Past: {},
    Hash: ''
}
let HermidataNeededKeys = {
    Page_Title: '',
    GoogleSheetURL: '',
    Past: {},
}
const novelType = ['manga', 'manhwa', 'manhua', 'novel', 'webnovel']
const novelStatus = ['ongoing', 'completed', 'hiatus', 'canceled']
const readStatus = ['viewing', 'Finished', 'On-hold', 'Dropped', 'Planned']
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
        updated: new Date().toISOString()
    }
}
const Testing = false;

let AllHermidata;


// On popup load
document.addEventListener("DOMContentLoaded", async () => {
    HermidataV3 = await getCurrentTab();
    HermidataV3.title = trimTitle(HermidataNeededKeys.Page_Title);
    HermidataNeededKeys.GoogleSheetURL = await getGoogleSheetURL();
    populateType()
    populateStatus()
    // migrateHermidataV2toV3(); // TEMP
    await migrateHermidata();
    HermidataNeededKeys.Past = await getHermidata();
    document.getElementById("Pagetitle").textContent = HermidataNeededKeys.Page_Title;
    document.getElementById("title").value =  HermidataNeededKeys.Past?.title || HermidataV3.title;
    document.getElementById("Type").value = HermidataNeededKeys.Past?.type || HermidataV3.type;
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
function getChapterFromTitle(title, url) {
    // Regex to find the first number (optionally after "chapter", "chap", "ch")
    const chapterNumberRegex = /(?:Episode|chapter|chap|ch)[-.\s]*?(\d+[A-Z]*)|(\d+[A-Z]*)/i;

    // create chapter based on URL
    const parts = url?.split("/") || [];
    const chapterPartV1 = parts.at(-1).match(/[\d.]+/)?.[0]
    // create chapter based on title
    const titleParts = title?.split(/[-–—|:]/).map(p => p.trim());
    const chapterPartV2 = titleParts.find(p => /^\d+(\.\d+)?$/.test(p));
    // create chapter based on title regex
    const chapterPartV3 = (titleParts
    .find(p => chapterNumberRegex.test(p)) || ""
    ).replace(/([A-Z])/gi, '').replace(/[^\d.]/g, '').trim();
    // If no chapter found, use empty string
    return chapterPartV2 || chapterPartV3 || chapterPartV1  || "";
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
async function setHermidata() {
    const key = makeHermidataKey();

    // Check if old format exists
    const oldData = await new Promise((resolve, reject) => {
        browserAPI.storage.sync.get(["Hermidata"], (result) => {
            if (browserAPI.runtime.lastError) reject(new Error(browserAPI.runtime.lastError));
            else resolve(result?.Hermidata || null);
        });
    });

    // If old format exists (V1), migrate each entry to top-level keys (V2)
    if (oldData && typeof oldData === "object" && Object.keys(oldData).length > 0) {
        let migrate = {};
        for (const oldKey in oldData) {
            migrate[oldKey] = oldData[oldKey];
        }
        // Remove the old Hermidata object (V1)
        await new Promise((resolve, reject) => {
            browserAPI.storage.sync.remove("Hermidata", () => {
                if (browserAPI.runtime.lastError) reject(new Error(browserAPI.runtime.lastError));
                else resolve();
            });
        });
        // Save migrated entries as top-level keys (V2)
        await new Promise((resolve, reject) => {
            browserAPI.storage.sync.set(migrate, () => {
                if (browserAPI.runtime.lastError) reject(new Error(browserAPI.runtime.lastError));
                else resolve();
            });
        });
    }

    // Save back (V2)
    await new Promise((resolve, reject) => {
        browserAPI.storage.sync.set({ [key]: Hermidata }, () => {
        if (browserAPI.runtime.lastError) reject(new Error(browserAPI.runtime.lastError));
        else resolve();
        });
    });
}

async function getHermidata() {
    const key = makeHermidataKey();
    return new Promise((resolve, reject) => {
        browserAPI.storage.sync.get([key], (result) => {
            if (browserAPI.runtime.lastError) return reject(new Error(browserAPI.runtime.lastError));
            resolve(result?.[key] || {});
        });
    }).catch(error => {
        console.error('Extention error: Failed Premise getHermidata: ',error);
        console.log('Key',key,'\n','Hermidata',Hermidata, '\n','HermidataV3', HermidataV3);
        return {};
    })
}

function makeHermidataKey() {
    let TitleSlug = HermidataV3.title.trim().toLowerCase();
    // Extract domain name from url
    const siteMatch = RegExp(/:\/\/(?:www\.)?([^./]+)/i).exec(HermidataV3.url);
    const siteName = siteMatch ? siteMatch[1] : "";

    let DomainSlug = siteName.trim().toLowerCase();
    
    HermidataV3.id = simpleHash(TitleSlug);
    
    return HermidataV3.id || simpleHash(TitleSlug);
}

function simpleHash(str) {
    let hash = 0, i, chr;
    if (str.length === 0) return hash.toString();
    for (i = 0; i < str.length; i++) {
        chr = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
    }
    return hash.toString();
}

async function migrateHermidataV2toV3() {
    console.log("Starting V2 → V3 migration...");

    const allData = await new Promise((resolve, reject) => {
        browserAPI.storage.sync.get(null, (result) => {
            if (browserAPI.runtime.lastError) reject(new Error(browserAPI.runtime.lastError));
            else resolve(result || {});
        });
    });

    const hashKeyPattern = /^-?\d+$/; // matches simpleHash integer strings
    let migrated = {};
    let removeKeys = [];
    let migratedCount = 0;

    for (const [key, value] of Object.entries(allData)) {
        // Only migrate keys that look like V2 hashes
        if (!hashKeyPattern.test(key)) continue;

        // Ensure the value is a valid Hermidata entry
        if (!value || typeof value !== "object" || !value.title || typeof value.title !== "string") continue;

        const titleSlug = value.Title.trim().toLowerCase();
        const newKey = simpleHash(titleSlug);

        // Skip if already exists (don’t overwrite newer data)
        if (allData[newKey]) continue;

        migrated[newKey] = value;
        removeKeys.push(key);
        migratedCount++;
    }

    // Nothing to do
    if (migratedCount === 0) {
        console.log("No V2 entries detected for migration.");
        return;
    }

    // Save migrated entries under new keys (V3)
    await new Promise((resolve, reject) => {
        browserAPI.storage.sync.set(migrated, () => {
            if (browserAPI.runtime.lastError) reject(new Error(browserAPI.runtime.lastError));
            else resolve();
        });
    });

    // Optional: cleanup old V2 keys (uncomment to enable)
    await new Promise((resolve, reject) => {
        browserAPI.storage.sync.remove(removeKeys, () => {
            if (browserAPI.runtime.lastError) reject(new Error(browserAPI.runtime.lastError));
            else resolve();
        });
    });

    console.log(`V2 → V3 migration complete. Migrated ${migratedCount} entries.`);
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
    const siteMatch = RegExp(/:\/\/(?:www\.)?([^./]+)/i).exec(HermidataV3.url);
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
    const mangaRegex = /\b\w*manga\w*\b|\bnovel\b|\banime\b|\btv-series\b/i;
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
        .map(p => p.replace(mangaRegex, '').trim())
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
    let Url_filter = Url_filter_parts[Url_filter_parts.length -1].replace(/-/g,' ').toLowerCase().trim();
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
    novelType.forEach(element => {
        const option = document.createElement("option");
        option.value = element;
        option.textContent = element;
        folderSelect.appendChild(option);
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
    const sheetListVariable = ['title', 'type', 'chapter', 'url', 'status', 'date', 'tags', 'notes']
    const tempHermi = {}
    let i = 0
    sheetList.forEach((key) => {
        tempHermi[sheetListVariable[i]] = key || '';
        i++
    });
    await updateChapterProgress(title, Chapter);
    HermidataNeededKeys.Past = {};
    // await setHermidata();
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
            const parentPadding = parseFloat(parentStyle.paddingLeft) + parseFloat(parentStyle.paddingRight);
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
function openClassic(e) {
    const changePageToClassic = (e) => {
        e.target.classList = "active Btn";
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
    changePageToClassic(e);
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
    }
    changePageToRSS(e);
    makeRSSPage();
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
    let MigrateDataV2toV3Needed = false
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
function makeRSSPage() {

    // TEMP
    // subscribe section
    makeSubscibeBtn();
    // sort section
    const sortSection = document.querySelector("#sort-RSS-entries")
    makeSortSection(sortSection);
    // item & notification section
    const NotificationSection = document.querySelector("#RSS-Notification")
    const AllItemSection = document.querySelector("#All-RSS-entries")
    makeItemSection(NotificationSection, AllItemSection);
    // footer
    document.querySelector("#version").innerHTML = chrome.runtime.getManifest().version;
    const clearNotification = document.querySelector("#clear-notifications")

    const openSettings = document.querySelector("#openSettings")

    const openFullPageRSS = document.querySelector("#openFullPageRSS")
    const RSSFullpage = document.querySelector(".fullpage-RSS-btn")

    const latestRSSSync = document.querySelector("#RSS-latest-sync-div")
    const latestSyncSpan = document.querySelector("#lastSync")

    const ManualSyncBtn = document.querySelector("#RSS-sync-Manual")
    
}

function removeAllChildNodes(parent) {
    while (parent.firstChild) {
        parent.removeChild(parent.firstChild);
    }

}
async function makeSubscibeBtn() {
    const feedListLocal = await loadSavedFeedsViaSavedFeeds();
    const subscribeBtn = document.querySelector("#subscribeBtn")
    const AllItemSection = document.querySelector("#All-RSS-entries")
    subscribeBtn.className = "Btn";
    subscribeBtn.textContent = "Subscribe to RSS Feed";
    subscribeBtn.disabled = true
    subscribeBtn.ariaLabel = "this site doesn't have a RSS link"
    // TODO:  find the correct arai for label
    
    const currentTitle = HermidataV3.title;
    let feedItemTitle;
    Object.values(feedListLocal).forEach(feed => {
        feedItemTitle = trimTitle(feed?.items?.[0]?.title || feed.title)
            if (currentTitle == feedItemTitle) {
                subscribeBtn.disabled = false
                subscribeBtn.ariaLabel = ""
                console.log("current page is a feed page \n", currentTitle)
            }
    });
    subscribeBtn.onclick = () => {
        Object.values(feedListLocal).forEach(feed => {
            feedItemTitle = trimTitle(feed?.items?.[0]?.title || feed.title)
            if (currentTitle == feedItemTitle) {
                linkRSSFeed(feedItemTitle, feed);
                makefeedItem(AllItemSection, feedListLocal, false);
                console.log('linked RSS to extention')
            }
        });
    }
}
function makeSortSection(sortSection) {
    // sheck if exists
    // make the sort section:
    // search bar with auto complete
    // under it, a list of checkboxes for each Type
    // under it, a list of checkboxes for each Status
    // under it, a list of checkboxes for each Source (extracted from all entries)
    // under it, a list of checkboxes for each Tag (extracted from all entries)
    // under it, a list of checkboxes for each Date (extracted from all entries)
    
    // checkboxes should be compact, max 4 rows, ckick for more
}

async function makefeedItem(parent_section, feedListLocal, seachable = false) {
    Object.entries(feedListLocal).forEach(async key => {
        const chapter = getChapterFromTitle(key[1]?.items?.[0]?.title || key[1].title, key[1]?.items?.[0]?.link || key[1].url);
        const currentHermidata = AllHermidata?.[key[0]]
        const currentChapter = currentHermidata?.chapter?.current
        if ( parent_section && !document.querySelector(`${parent_section.id } .TitleHash-${key[0]}`) && ( chapter !== currentChapter )) {
            const li = document.createElement("li");
            li.className = parent_section.id == "#All-RSS-entries" ? "RSS-entries-item" : "RSS-Notification-item";
            
            li.classList.add("hasRSS", `TitleHash-${key[0]}`);
            const ElImage = document.createElement("img");
            ElImage.className = parent_section.id == "#All-RSS-entries" ? "RSS-entries-item-image" : "RSS-Notification-item-image";
            ElImage.src = key[1]?.image || key[1]?.favicon || 'icons/icon48.png';
            ElImage.sizes = "48x48";
            ElImage.style.width = "48px";
            ElImage.style.height = "48px";
            ElImage.style.objectFit = "contain";
            ElImage.style.borderRadius = "8px";

            ElImage.alt = "Feed Image";
            const ElInfo = document.createElement("div");
            ElInfo.className = "RSS-Notification-item-info";

            
            const chapterText = chapter ? `latest Chapter: ${chapter}` : 'No chapter info';
            const currentChapterText = seachable ? `current Chapter: ${currentChapter}` : '';
            const titleText = trimTitle(key[1]?.items?.[0]?.title || key[1].title);
            const maxTitleCharLangth = 60;
            const titleTextTrunacted = titleText.length > maxTitleCharLangth ? titleText.slice(0, maxTitleCharLangth - 3) + '...' : titleText;
            
            const lastRead = AllHermidata[key[0]]?.chapter?.current || '0';        
            const progress = lastRead != '0' ? ((parseFloat(lastRead) / parseFloat(chapter)) * 100 ).toPrecision(3): '0';

            const ELTitle = document.createElement("div");
            const ELchapter = document.createElement("div");
            const ELprogress = document.createElement("div");
            
            ELTitle.className = parent_section.id == "#All-RSS-entries" ? "RSS-entries-item-title" : "RSS-Notification-item-title";
            ELchapter.className = parent_section.id == "#All-RSS-entries" ? "RSS-entries-item-chapter" : "RSS-Notification-item-chapter";
            ELprogress.className = parent_section.id == "#All-RSS-entries" ? "RSS-entries-item-progress" : "RSS-Notification-item-progress";
            


            ELTitle.textContent = `${titleTextTrunacted}`;
            ELchapter.textContent = seachable ? `${currentChapterText} - ${chapterText}` : `${chapterText}`;
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
            Elfooter.className = "RSS-Notification-item-footer";
            const domain = key[1]?.domain || key[1].url.replace(/^https?:\/\/(www\.)?/,'').split('/')[0]
            Elfooter.textContent = `${domain}`;
            
            li.onclick = () => browser.tabs.create({ url: key[1]?.items?.[0]?.link || key[1].url });
            
            // const pubDate = document.createElement("p");
            // pubDate.textContent = `Published: ${feed?.items?.[0]?.pubDate ? new Date(feed.items[0].pubDate).toLocaleString() : 'N/A'}`;
            li.appendChild(ElInfo);
            li.appendChild(Elfooter);
            // li.appendChild(pubDate);
            parent_section.appendChild(li);
        }
    });
}


async function makeItemSection(NotificationSection, AllItemSection) {
    const feedListLocal = await loadSavedFeedsViaSavedFeeds();
    // if ( feedItem)
    makefeedItem(NotificationSection, feedListLocal);
    makefeedItem(AllItemSection, feedListLocal, true);
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
    AllHermidata = await getAllHermidata();
    
    
    for (const feed of savedFeeds) {
        if ( !feed.title || !feed.url ) continue;
        if ( feed.domain !=  Object.values(AllHermidata).find(novel => novel.url.includes(feed.domain))?.url.replace(/^https?:\/\/(www\.)?/,'').split('/')[0] ) continue;
        const feedItemTitle = trimTitle(feed?.items?.[0]?.title || feed.title)
        feedList[simpleHash(feedItemTitle)] = feed;
    }
    return feedList;
}
// isn't utilised
async function loadSavedFeeds() {
    const feedList = {};
    AllHermidata = await getAllHermidata();
    
    
    for (const [id, feed] of Object.entries(AllHermidata)) {
        if ( feed?.rss ) {
            const feedItemTitle = trimTitle(feed?.rss?.latestItem.title || feed.title)
            feedList[simpleHash(feedItemTitle)] = feed;
        }
    }
    return feedList;
}

function makeHermidataV3(title, url, type = "manga") {
    const hash = simpleHash(title);
    const source = new URL(url).hostname.replace(/^www\./, "");

    return {
        id: hash,
        title: title.trim(),
        type,
        url,
        source,
        status: "viewing",
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
            updated: new Date().toISOString()
        }
    };
}

async function saveHermidataV3(entry) {
    const key = entry.id || simpleHash(entry.title);
    entry.meta.updated = new Date().toISOString();
    await browser.storage.sync.set({ [key]: entry });
    console.log(`[HermidataV3] Saved ${entry.title}`);
}

async function updateChapterProgress(title, newChapterNumber) {
    const key = simpleHash(title);

    const data = await browser.storage.sync.get(key);
    const entry = data[key] ? data[key] : makeHermidataV3(title, HermidataV3.url, HermidataV3.type.toLowerCase());
    if (!entry) {
        console.warn(`[HermidataV3] No entry found for ${title}`);
    }

    if (newChapterNumber > entry.chapter.current) {
        entry.chapter.history.push(entry.chapter.current);
        entry.chapter.current = newChapterNumber;
        entry.chapter.lastChecked = new Date().toISOString();
        entry.meta.updated = new Date().toISOString();
        await browser.storage.sync.set({ [key]: entry });
        console.log(`[HermidataV3] Updated ${title} to chapter ${newChapterNumber}`);
    }
}
/**
 *  merge RSS feed data into existing Hermidata entry
*/
async function linkRSSFeed(title, rssData) {
    const key = simpleHash(title);
    const stored = await browser.storage.sync.get(key);
    const entry = stored[key] ? stored[key] : makeHermidataV3(title, HermidataV3.url, HermidataV3.type.toLowerCase());
    if (!entry) return;

    entry.rss = {
        title: rssData.title,
        url: rssData.url,
        domain: rssData.domain,
        lastFetched: new Date().toISOString(),
        latestItem: rssData.items?.[0] ?? null
    };

    // Optionally update chapter.latest from feed title
    const latestChapter = getChapterFromTitle(rssData.items?.[0]?.title, entry.rss.url);
    if (latestChapter) entry.chapter.latest = latestChapter;

    await browser.storage.sync.set({ [key]: entry });
}

async function migrateHermidata() {
    const allHermidata = await getAllHermidata();
    if (!Object.keys(allHermidata).length) return;
    // check 

    const unified = {};
    for (const [id, data] of Object.entries(allHermidata)) {
        if (!data?.Title) continue; // skip invalid entries
        unified[id] = {
        id,
        title: data.Title,
        type: data.Type.toLowerCase(),
        url: data.Url,
        source: new URL(data.Url).hostname.replace(/^www\./, ""),
        status: data.Status.toLowerCase(),
        chapter: { current: Number(data.Chapter), latest: null, history: [], lastChecked: data.Date },
        rss: null,
        import: null,
        meta: {
            tags: data.Tag ? data.Tag.split(",").map(t => t.trim()) : [],
            notes: data.Notes,
            added: data.Date,
            updated: new Date().toISOString()
        }
        };
    }

    await browser.storage.sync.set( unified );
    console.log("[Hermidata] Migration completed", unified);
    return unified
}