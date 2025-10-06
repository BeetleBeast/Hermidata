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

const Testing = false;

// On popup load
document.addEventListener("DOMContentLoaded", async () => {
    Hermidata = await getCurrentTab();
    Hermidata.Title = trimTitle(Hermidata.Page_Title);
    Hermidata.GoogleSheetURL = await getGoogleSheetURL();
    Hermidata.Date = getCurrentDate();
    populateType()
    populateStatus()
    // migrateHermidataV2toV3(); // TEMP
    Hermidata.Past = await getHermidata();
    document.getElementById("Pagetitle").textContent = Hermidata.Page_Title;
    document.getElementById("title").value =  Hermidata.Past.Title || Hermidata.Title;
    document.getElementById("Type").value = Hermidata.Past.Type || Hermidata.Type;
    document.getElementById("chapter").value = Hermidata.Chapter;
    document.getElementById("url").value = Hermidata.Url;
    document.getElementById("status").value =  Hermidata.Past.Status || Hermidata.Status;
    document.getElementById("date").value = Hermidata.Date || "";
    document.getElementById("tags").value =  Hermidata.Past.Tag || Hermidata.Tag;
    document.getElementById("notes").value = Hermidata.Notes;
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
            browserAPI.tabs.create({ url: Hermidata.GoogleSheetURL });
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
    
                // Regex to find the first number (optionally after "chapter", "chap", "ch")
                const chapterNumberRegex = /(?:Episode|chapter|chap|ch)[-.\s]*?(\d+[A-Z]*)|(\d+[A-Z]*)/i;
    
                // create chapter based on URL
                const parts = tab?.url?.split("/") || [];
                const chapterPartV1 = parts.at(-1).match(/[\d.]+/)?.[0]
                // create chapter based on title
                const titleParts = tab?.title?.split(/[-–—|:]/).map(p => p.trim());
                const chapterPartV2 = titleParts.find(p => /^\d+(\.\d+)?$/.test(p));
                // create chapter based on title regex
                const chapterPartV3 = (titleParts
                .find(p => chapterNumberRegex.test(p)) || ""
                ).replace(/([A-Z])/gi, '').trim();
                // If no chapter found, use empty string
                Hermidata.Chapter = chapterPartV2 || chapterPartV3 || chapterPartV1  || "";
                Hermidata.Page_Title = tab.title || "Untitled Page";
                Hermidata.Url = tab.url || "NO URL";
                resolve(Hermidata);
            });
        } catch (error) {
            console.error('Extention error inside getCurrentTab: ',error)
        }
    });
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
        console.log('Key',key,'\n','Hermidata',Hermidata);
        return {};
    })
}

function makeHermidataKey() {
    let TitleSlug = Hermidata.Title.trim().toLowerCase();
    // Extract domain name from url
    const siteMatch = RegExp(/:\/\/(?:www\.)?([^./]+)/i).exec(Hermidata.Url);
    const siteName = siteMatch ? siteMatch[1] : "";

    let DomainSlug = siteName.trim().toLowerCase();
    
    Hermidata.Hash = simpleHash(TitleSlug);
    
    return Hermidata.Hash || simpleHash(TitleSlug);
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
        if (!value || typeof value !== "object" || !value.Title || typeof value.Title !== "string") continue;

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
    const siteMatch = RegExp(/:\/\/(?:www\.)?([^./]+)/i).exec(Hermidata.Url);
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
    let Url_filter_parts = Hermidata.Url.split('/')
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
        Hermidata.Notes = `Chapter Title: ${Chapter_Title}`;
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
    Type.forEach(element => {
        const option = document.createElement("option");
        option.value = element;
        option.textContent = element;
        folderSelect.appendChild(option);
    });
}
function populateStatus() {
    const folderSelect = document.getElementById("status");
    statusList.forEach(element => {
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

    let temp;
    Object.keys(Hermidata).forEach((key) => {
        switch (key) {
            case 'Page_Title':
            case 'GoogleSheetURL':
            case 'Past':
            case 'Hash':
                break;
            default:
                temp = document.querySelector(`[data-name="${key}"]`);
                if (temp) Hermidata[key] = temp.value || '';
            break;
        }
    });
    Hermidata.Past = {};
    await setHermidata();
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
    }
    changePageToClassic(e);
}

async function openRSS(e) {
    const changePageToRSS = (e) => {
        e.target.classList = "active Btn";
        document.querySelector("#HDClassicBtn").classList = "Btn";
        document.querySelector(".HDClassic").style.opacity = 0;
        document.querySelector(".HDRSS").style.opacity = 1;
    }
    changePageToRSS(e);
    document.querySelector("#version").innerHTML = chrome.runtime.getManifest().version;

    makeRSSPage();

    
    // loadRSSData();
    const allHermidata = await getAllHermidata();

    loadSavedFeeds(allHermidata);
    // const getRSS = await getCustomRSS(index);
    // 'RSS',or 'custom' OR something different

    /*
    let lastSync = new Date().toLocaleString();
    let domain = '';
    let latestChapter = ''
    let nextChapterLink = ''
    let Status = ''
    let Tags = ''
    let index = Hermidata.Hash || simpleHash(Hermidata.Title);

    const RSSData = { // TEMP
        lastSync,
        entries: {
            [index]: {
                domain: domain,
                latestChapter,
                nextChapterLink,
                Status,
                Tags,
            },
        },
        version: chrome.runtime.getManifest().version,

    }
    saveRSSData(RSSData);

    console.log(RSSData);

    const hasDataIn_Hermidata = Object.keys(allHermidata).find(key => { return key == index; }) || false;
    const hasDataInRSS = Object.keys(RSSData.entries).find(key => { return key == index; }) || false;

    const hasDataIn_HermidataAndRSS = hasDataIn_Hermidata && hasDataInRSS;
    let RSSType = '';
    Object.values(allHermidata).forEach(element => {
        if ( !element.RSS ) {
            element.RSS = {
                hasRSS: hasDataIn_HermidataAndRSS,
                type: RSSType || '',
            }
        }
    });
    console.log(allHermidata)
    if ( allHermidata) {
        for (const novel of Object.values(allHermidata)) {
            const feed = GlobalFeeds.find(f => f.domain === new URL(novel.Url).hostname.replace(/^www\./, ''));
            if (feed) {
                console.log(`Found feed for ${novel.Title} at ${feed.url}`);
                novel.latestChapter = feed.items[0]?.title || novel.latestChapter;
                console.log(`Latest chapter for ${novel.Title}: ${novel.latestChapter}`);
                console.log(feed);
            }
        }
    }
    */
    /*
    browserAPI.runtime.sendMessage({
        type: "LOAD_RSS",
        data: [],
        args
    });
    */
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
        if (!value || typeof value !== "object" || !value.Title || typeof value.Title !== "string") continue;

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
    // sections to load
    
    const sortSection = document.querySelector(".sort-RSS-entries")
    makeSortSection(sortSection);
    const NotificationSection = document.querySelector(".RSS-Notification")
    const AllItemSection = document.querySelector(".All-RSS-entries")
    makeItemSection(NotificationSection, AllItemSection);
    // footer

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
function makeItemSection(NotificationSection, AllItemSection) {
    // make the notification section
    // make the all items section
    // each item should have:
    // Title, last Read, Latest chapter, Tag(s), Status, progress %
    // buttons: open next chapter,
    // sortable by each field
    // filterable by Type, Status, Tags, Date
    // search bar to search by Title or Notes
    
}

async function getCustomRSS(index) {
    // get RSS from background.js
    return CustomRSS[index]
}

async function loadSavedFeeds(allHermidata={}) {
    // what to get?
    // latest chapter
    // next chapter link
    // Status ( bv. ongoing, finished, dropped etc)
    // Tags ( website tags, (user tags stored in hermidata))
    const FomatedFeeds = {
        title: "",
        chapterLink: "",
        pubDate: "",
    }
    const SortedSavedFeeds = {};

    const { savedFeeds } = await browser.storage.local.get({ savedFeeds: [] });
    
    const list = document.querySelector("#All-RSS-entries");
    if (list) {
        list.innerHTML = "";
        for (const feed of savedFeeds) {
            if ( !feed.title || !feed.url ) continue;
            if ( feed.domain !=  Object.values(allHermidata).find(novel => novel.Url.includes(feed.domain))?.Url.replace(/^https?:\/\/(www\.)?/,'').split('/')[0] ) continue;
            SortedSavedFeeds[feed?.items?.[0]?.title || feed.title] = feed;
            const li = document.createElement("li");
            li.textContent = `${feed?.items?.[0]?.title || feed.title} — ${feed.domain}`;
            li.onclick = () => browser.tabs.create({ url: feed?.items?.[0]?.link || feed.url });
            list.appendChild(li);
        }
        console.log('[Hermidata] Loaded saved & sorted feeds:', SortedSavedFeeds);
    }
}




async function loadRSSData() {
    // load RSS data from storage
    return new Promise((resolve, reject) => {
        browserAPI.storage.sync.get(["customRSS"], (result) => {
            if (browserAPI.runtime.lastError) return reject(new Error(browserAPI.runtime.lastError));
            resolve(result?.customRSS || {});
        });
    }).catch(error => {
        console.error('Extention error: Failed Premise loadRSSData: ',error);
        return {};
    })
}

async function saveRSSData(data) {
    return new Promise((resolve, reject) => {
        browserAPI.storage.sync.set({ customRSS: data }, () => {
            if (browserAPI.runtime.lastError) return reject(new Error(browserAPI.runtime.lastError));
            resolve();
        });
    }).catch(error => {
        console.error('Extention error: Failed Premise saveRSSData: ',error);
    })
}
/* 
RSS_DataBase_[hashed domain]_.json // random RSS get variable from site [domain hashed]
goes to customRSS.json // handmade RSS file with index same as hermidata hash

*/