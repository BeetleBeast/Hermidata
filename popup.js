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
const Testing = false;

const CalcDiffCache = new Map();

let AllHermidata;
let selectedIndex = -1;

// On popup load
document.addEventListener("DOMContentLoaded", async () => {
    console.log('Start of new Hermidata');
    const dups = await findPotentialDuplicates(0.9);
    if ( dups.length > 0) console.table(dups , 'potential duplicates table');
    // await migrateHermidataV3toV3hash();
    AllHermidata = await getAllHermidata();
    HermidataV3 = await getCurrentTab();
    HermidataV3.title = trimTitle(HermidataNeededKeys.Page_Title);
    HermidataNeededKeys.GoogleSheetURL = await getGoogleSheetURL();
    populateType()
    populateStatus()
    // migrateHermidataV2toV3();
    // await migrateHermidata();
    HermidataNeededKeys.Past = await getHermidata();

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
    changePageToClassic();
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
/**
 * Title
 * Type
 * needs both 
 * @returns the hermidata json object
 */
async function getHermidata() {
try {
    // get all Hermidata and return latest with same title
    const allHermidata = await getAllHermidata();
    const found = await findLatestByTitle(HermidataV3.title, allHermidata);
    // if ( found) return found


    let absoluteKey = ''
    let absoluteObj = {}

    // find title from alt
    const TrueTitle = findByTitleOrAltV2(HermidataV3.title, allHermidata)?.title;
    // find title from fuzzy seach
    const AltKeyNeeded = await detectAltTitleNeeded(HermidataV3.title, HermidataV3.type);
    const fuzzyKey = AltKeyNeeded?.relatedKey;
    // Generate all possible keys
    const possibleKeys = novelType.map(type => returnHashedTitle(TrueTitle, type));
    if (fuzzyKey && !possibleKeys.includes(fuzzyKey)) possibleKeys.push(fuzzyKey)
    const possibleObj = {}
    for (const key of possibleKeys) {
        const obj = await getHermidataViaKey(key);
        if ( obj && Object.keys(obj).length) possibleObj[key] = obj;
    }
    console.log('posible Objects', possibleObj)

    // add alt title to Object
    if (AltKeyNeeded?.needAltTitle && fuzzyKey) {
        const relatedEntry = possibleObj[fuzzyKey];
        if (relatedEntry) {
            const confirmation = await customConfirm(
                `${AltKeyNeeded.reason}\nAdd "${HermidataV3.title}" as an alt title for "${relatedEntry.title}"?`
            );
            if (confirmation) await appendAltTitle(HermidataV3.title, relatedEntry);
        }
    }

    if ( Object.keys(possibleObj).length == 1 ) {
        absoluteKey = Object.keys(possibleObj)[0]
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
    const key = absoluteKey || makeHermidataKey();
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
        const migrated = await migrateHermidataV4(newer, older);
        return migrated; // Stop after successful merge
    } else {
        console.log("User canceled migration; switching it up");
        // Confirm with clear indication which is which
        let New_older = newer;
        let New_newer = older
        const confirm_NewMerge = await confirmMigrationPrompt(New_newer, New_older, options );

        if (confirm_NewMerge) {
            const migrated = await migrateHermidataV4(New_newer, New_older);
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
function confirmMigrationPrompt(newer, older, options = {}) {
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
        return customConfirm(msg);
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
    document.querySelector(".HDRSS").style.opacity = 0.2;
    document.querySelector(".HDClassic").style.opacity = 0;
}
function activateother() {
    // deactivate links in classic
    document.querySelectorAll(".HDClassic").forEach(a => {
        a.style.pointerEvents = 'none';
    });
    // deactivate links in HDRSS
    document.querySelectorAll(".HDRSS").forEach(a => {
        a.style.pointerEvents = 'auto';
    });
    document.querySelector(".HDRSS").style.opacity = 1;
    document.querySelector(".HDClassic").style.opacity = 0;
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
 *  Merge two Hermidata entries intelligently
 */
function mergeHermidata(oldData, newData) {
    const merged = structuredClone(oldData); // safe deep copy

    // Prefer newer or non-empty fields
    merged.type = newData.type || oldData.type;
    merged.id = returnHashedTitle(merged.title, merged.type);
    merged.url = newData.url || oldData.url;
    merged.lastUpdated = Date.now();

    merged.chapter = {
        current: newData.chapter?.current || oldData.chapter?.current || "0",
        total: newData.chapter?.total || oldData.chapter?.total || "",
    };

    merged.status = newData.status || oldData.status || "Planned";

    merged.meta = {
        ...oldData.meta,
        ...newData.meta,
        tags: [...new Set([
            ...(oldData.meta?.tags?.split(",") || []),
            ...(newData.meta?.tags?.split(",") || []),
        ])].filter(Boolean).join(", "),
        notes: newData.meta?.notes || oldData.meta?.notes || "",
    };

    return merged;
}

/**
 *  Migrate an old entry to a new key and remove the old one
 */
async function migrateHermidataV4(newer, older) {
    const merged = {
        ...older,
        ...newer, // newer values take priority
        type: newer.type,
        title: newer.title,
        lastUpdated: new Date().toISOString(),
    };

    const newKey = returnHashedTitle(merged.title, merged.type);
    const oldKey = returnHashedTitle(older.title, older.type);

    await browserAPI.storage.sync.set({ [newKey]: merged });
    await browserAPI.storage.sync.remove(oldKey);

    console.log(`Migrated from ${oldKey} → ${newKey}`);
    return merged;
}



async function migrateKey(oldData, newType) {
    const newKey = returnHashedTitle(oldData.title, newType);
    const oldKey = returnHashedTitle(oldData.title, oldData.type);

    const newData = { ...oldData, type: newType, id: newKey, lastUpdated: Date.now() };

    // Write new entry
    await browserAPI.storage.sync.set({ [newKey]: newData });

    // Remove old entry
    await browserAPI.storage.sync.remove(oldKey);

    console.log(`Migrated from ${oldKey} → ${newKey}`);
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

        const newKey = returnHashedTitle(value.Title, value.type);

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
    // await setHermidata();

    // save to google sheet & bookmark/replace bookmark
    browserAPI.runtime.sendMessage({
        type: "SAVE_NOVEL",
        data: [title, Type, Chapter, url, status, date, tags, notes],
        args
    });

    if(!Testing) setTimeout( () => window.close(), 400);
}

async function findLatestByTitle(title, allData) {
    if (!title) return null;

    // Normalize title for comparison
    const cleanTitle = trimTitle(title);

    // Step 1: Find all entries that match this title
    const matches = Object.values(allData).filter(item => {
        if (!item || typeof item !== "object") return false;
        const storedTitle = trimTitle(item.title || item.Title || "");
        return storedTitle === cleanTitle;
    });

    // Step 2: If nothing found, return null
    if (matches.length === 0) return null;

    // Step 3: Sort by "lastUpdated" or "date" (newest first)
    const sorted = matches.toSorted((a, b) => {
        const timeA = new Date(a.lastUpdated || a.date || 0).getTime();
        const timeB = new Date(b.lastUpdated || b.date || 0).getTime();
        return timeB - timeA;
    });

    // Step 4: Return the latest entry
    return sorted[0];
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
async function migrateHermidataV3toV3hash() {
    const allHermidata = await getAllHermidata();
    const allKeys = Object.keys(allHermidata);

    if (!allKeys.length) {
        console.warn("No Hermidata entries found.");
        return;
    }

    const newEntries = {};
    const keysToRemove = [];
    let migratedCount = 0;

    for (const [oldKey, data] of Object.entries(allHermidata)) {
        try {
            const title = data.title || data.Title || data?.HermidataV3?.title || "";
            if (!title) continue;
            if (!data.type || typeof data.type !== "string") continue;

            const capitalizedType = data.type.charAt(0).toUpperCase() + data.type.slice(1);

            // Compute new canonical hash
            const newHash = returnHashedTitle(title, capitalizedType);
            if ( oldKey === newHash && data.id === newHash) continue;

            // update data with new id
            const updatedData = {...data, id: newHash, type: capitalizedType }
            // add new entry with new Hash
            newEntries[newHash] = updatedData;
            keysToRemove.push(oldKey);

            migratedCount++;
        } catch (err) {
            console.error("Migration error for entry:", oldKey, err);
        }
    }

    if (migratedCount === 0) {
        console.log("No entries needed updates.");
        return;
    }

    await new Promise((resolve, reject) => {
        browserAPI.storage.sync.set(newEntries, () => {
            if (browserAPI.runtime.lastError)
                reject(new Error(browserAPI.runtime.lastError));
            else resolve();
        });
    });
    await new Promise((resolve, reject) => {
        browserAPI.storage.sync.remove(keysToRemove, () => {
            if (browserAPI.runtime.lastError)
                reject(new Error(browserAPI.runtime.lastError));
            else resolve();
        });
    });
    console.log(`Migration complete — ${migratedCount} entries migrated.`);
    console.log("Removed old keys:", keysToRemove);
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
    makeFooterSection();
}

function makeFooterSection() {
    
    // clear notification
    const clearNotification = document.querySelector("#clear-notifications");
    clearNotification.addEventListener('click', () => {
        removeAllChildNodes(document.querySelector("#RSS-Notification")) // clear front-end
        // TODO // clear back-end
    });
    // open RSS full page
    const FullpageRSSButton = document.querySelector(".fullpage-RSS-btn");
    FullpageRSSButton.addEventListener('click', () => openFullpageRSS()) // TODO openFullpageRSS()
    
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
    makefeedItem(AllItemSection, feedListLocalReload, true);
}
function makeSortSection(sortSection) {
    // makeSortHeader(sortSection);
    makeSortOptions(sortSection);
    sortOptionLogic(sortSection);
}



function filterEntries(query, filtered = null) {
    const allItems = document.querySelectorAll('.RSS-entries-item');
    
    allItems.forEach(item => {
        const titleEl = item.querySelector('.RSS-entries-item-title');
        const titleText = titleEl?.textContent?.toLowerCase() || '';

        const match = filtered
        ? filtered.some(f => f.title.toLowerCase() === titleText)
        : !query || titleText.includes(query);

        item.style.display = match ? '' : 'none';
    });
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
        match 
        ? item.classList.add('seachable')
        : item.classList.remove('seachable') || '';
    });
}


function sortOptionLogic(parent_section) {
    // state object for filters
    const filters = {
        include: {}, // { type: ['Manga'], status: ['Ongoing'] }
        exclude: {},
        sort: ''
    };

    // find all custom checkboxes
    const checkboxes = parent_section.querySelectorAll(".custom-checkbox");

    checkboxes.forEach(cb => {
        cb.addEventListener("click", () => {
            let state = parseInt(cb.dataset.state || "0");

            // cycle 0→1→2→0
            state = (state + 1 ) % 3;
            cb.dataset.state = state;

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
                    localStorage.setItem("lastSort", filters.sort);
                } else {
                    localStorage.removeItem("lastSort");
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
        });
    });
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


function applyFilterToEntries(filters) {
    const entries = document.querySelectorAll(".RSS-entries-item");

    
    entries.forEach(entry => {
        const hashItem = entry.className.split('TitleHash-')[1].replace(' seachable','');
        const entryData = AllHermidata[hashItem];
        const type = entryData.type;
        const status = entryData.status;
        const source = entryData.source;
        const tags = entryData.meta.tags || "";

        

        const isISOString =  new Date(entryData.meta.added)?.getHours() ? true : false;
        const splitDatum =  entryData.meta?.added.split('/')[2]
        const dateAdded = isISOString ? entryData.meta.added.split('-')[0] : splitDatum || new Date()?.toISOString().split('-')[0]

        let visible = true;

        // Check all include filters — must match at least one in each group
        for (const [section, values] of Object.entries(filters.include)) {
            if (values.length === 0) continue;

            const val = section === "Type" ? type
                : section === "Status" ? status
                : section === "Source" ? source
                : section === "Tag" ? tags
                : section === "Date" ? dateAdded
                : "";

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

                const val = section === "Type" ? type
                    : section === "Status" ? status
                    : section === "Source" ? source
                    : section === "Tags" ? tags
                    : section === "Date" ? dateAdded
                    : "";
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
            : entry.classList.remove('seachable') || '';
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

            // Toggle on click
            checkbox.addEventListener('click', () => {
                let state = Number(checkbox.dataset.state);
                state = state % 3; // cycle 0->1->2->0
                checkbox.dataset.state = state.toString();
            });

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
    const allTags = Array.from(new Set([].concat(...Object.values(AllHermidata || {}).map(item => item.meta?.tags || []))));
    const tagSection = createFilterSection('Tag', allTags, 'filter-tag');
    filterSection.appendChild(tagSection);

    // 6. Dates
    // Object.values(AllHermidata || {}).map(item => item.meta?.added?.slice(0,10)).filter(Boolean)
    const allDates = (['2026', '2025', '2024'])
        .sort((a, b) => new Date(b) - new Date(a));
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
    if (lastSort) applySortToEntries(lastSort);
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
    const title = document.createElement('div');
    title.className = "titleHeader";
    title.textContent = 'Notifications'
    container.appendChild(title);
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
async function makefeedItem(parent_section, feedListLocal, seachable = false) {
    Object.entries(feedListLocal).forEach(async key => {
        const title = findByTitleOrAltV2(key[1]?.items?.[0]?.title || key[1].title, AllHermidata).title || key[1]?.items?.[0]?.title || key[1].title;
        const url = key[1]?.items?.[0]?.link || key[1].url
        const chapter = key[1]?.chapter?.latest || ( getChapterFromTitle(title, url) == '01'? '': getChapterFromTitle(title, url) )|| key[1]?.chapter?.current || '';
        const currentHermidata = AllHermidata?.[key[0]]
        const currentChapter = currentHermidata?.chapter?.current
        // removed && ( seachable || (chapter !== currentChapter ))
        if ( parent_section && !document.querySelector(`#${parent_section.id} .TitleHash-${key[0]}`)) {
            const li = document.createElement("li");
            li.className = parent_section.id == "All-RSS-entries" ? "RSS-entries-item" : "RSS-Notification-item";
            li.classList.add("hasRSS", `TitleHash-${key[0]}`, 'seachable');
            li.addEventListener('contextmenu', (e) => rightmouseclickonItem(e))

            const ElImage = document.createElement("img");
            ElImage.className = parent_section.id == "All-RSS-entries" ? "RSS-entries-item-image" : "RSS-Notification-item-image";
            ElImage.src = key[1]?.rss?.image ||key[1]?.image || key[1]?.favicon || 'icons/icon48.png';
            ElImage.sizes = "48x48";
            ElImage.style.width = "48px";
            ElImage.style.height = "48px";
            ElImage.style.objectFit = "contain";
            ElImage.style.borderRadius = "8px";

            ElImage.alt = "Feed Image";
            const ElInfo = document.createElement("div");
            ElInfo.className =  parent_section.id == "All-RSS-entries" ? "RSS-entries-item-info" : "RSS-Notification-item-info";

            
            const chapterText = chapter ? `latest Chapter: ${chapter}` : 'No chapter info';
            const AllItemChapterText = currentChapter != chapter ? `read ${currentChapter} of ${chapter}` : `up-to-date (${chapter})`;
            const titleText = trimTitle(key[1]?.items?.[0]?.title || key[1].title);
            const maxTitleCharLangth = 50;
            const titleTextTrunacted = titleText.length > maxTitleCharLangth ? titleText.slice(0, maxTitleCharLangth - 3) + '...' : titleText;
            
            const lastRead = AllHermidata[key[0]]?.chapter?.current || '0';
            const progress = lastRead != '0' ? ((parseFloat(lastRead) / parseFloat(chapter)) * 100 ).toPrecision(3) : '0';

            const ELTitle = document.createElement("div");
            const ELchapter = document.createElement("div");
            const ELprogress = document.createElement("div");
            
            ELTitle.className = parent_section.id == "All-RSS-entries" ? "RSS-entries-item-title" : "RSS-Notification-item-title";
            ELchapter.className = parent_section.id == "All-RSS-entries" ? "RSS-entries-item-chapter" : "RSS-Notification-item-chapter";
            ELprogress.className = parent_section.id == "All-RSS-entries" ? "RSS-entries-item-progress" : "RSS-Notification-item-progress";
            


            ELTitle.textContent = `${titleTextTrunacted}`;
            ELchapter.textContent = seachable ? `${AllItemChapterText}` : `${chapterText}`;
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
            const domain = key[1]?.domain || key[1].url.replace(/^https?:\/\/(www\.)?/,'').split('/')[0]
            Elfooter.textContent = `${domain}`;
            
            li.onclick = () => browser.tabs.create({ url: key[1]?.items?.[0]?.link || key[1].url || key[1]?.rss.latestItem?.link });
            
            // const pubDate = document.createElement("p");
            // pubDate.textContent = `Published: ${feed?.items?.[0]?.pubDate ? new Date(feed.items[0].pubDate).toLocaleString() : 'N/A'}`;
            li.appendChild(ElInfo);
            li.appendChild(Elfooter);
            // li.appendChild(pubDate);
            parent_section.appendChild(li);
        }
    });
}
function rightmouseclickonItem(e) {
    e.preventDefault(); // stop the browser’s default context menu

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
    const newTitle = await customPrompt("Add alternate title for this entry:");
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

function remove(target) {
    const item = getEntriesItem(target)
    if (!item) {
        console.log('isn\'t a entries item');
        return;
    }
    const hashItem = item.className.split('TitleHash-')[1].replace(' seachable','');
    const toBeRemovedItem = AllHermidata[hashItem]
    const confirmation = customConfirm(`are you sure you want to remove ${toBeRemovedItem.title}`)
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
    const feedFromHermidata = await loadSavedFeeds();

    await unLinkRSSFeed({hash:hashItem });
    console.log('un-link RSS to extention')
    reloadContent(NotificationSection, AllItemSection, feedFromHermidata)
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

async function makeItemSection(NotificationSection, AllItemSection) {
    const feedFromHermidata = await loadSavedFeeds(); // actually subscribed

    makeFeedHeader(NotificationSection);
    makefeedItem(NotificationSection, feedFromHermidata);
    makeItemHeader(AllItemSection);
    makefeedItem(AllItemSection, AllHermidata, true);
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
    
    
    for (const [id, feed] of Object.entries(AllHermidata)) {
        if ( feed?.rss ) {
            feedList[id] = feed;
        }
    }
    return feedList;
}

function makeHermidataV3(title, url, type = "Manga") {
    const hash = returnHashedTitle(title, type)
    const source = new URL(url).hostname.replace(/^www\./, "");

    return {
        id: hash,
        title: title,
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
            altTitles: [title],
            added: new Date().toISOString(),
            updated: new Date().toISOString()
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
        entry.meta.tags = HermidataV3.meta.tags;
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
            if (valA.source === valB.source && valA.title === valB.title) continue;

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


async function migrateHermidata() {
    const allHermidata = await getAllHermidata();
    if (!Object.keys(allHermidata).length) return;

    const unified = {};
    let updatedCount = 0;

    for (const [id, data] of Object.entries(allHermidata)) {
        if (!data?.title) continue; // skip invalid entries

        // Defensive fallback helpers
        const meta = data.meta || {};
        const chapter = data.chapter || {};
        const altTitles = Array.isArray(meta.altTitles) ? meta.altTitles : [];

        // Create unique set of alt titles, always ensuring main title is first
        const altSet = new Set([ trimTitle(data.title), ...altTitles.map(trimTitle) ]);
        const altTitlesFinal = Array.from(altSet);

        // Handle URL parsing safely
        let source = data.source || "";
        try {
            if (!source && (data.url || data.Url)) {
                source = new URL(data.url || data.Url).hostname.replace(/^www\./, "");
            }
        } catch {
            source = "unknown";
        }

        unified[id] = {
            id,
            title: data.title,
            type: data.type,
            url: data.url || data.Url || "",
            source,
            status: data.status || "Unknown",
            chapter: {
                current: chapter.current || Number(data.Chapter) || 0,
                latest: chapter.latest || null,
                history: chapter.history || [],
                lastChecked: chapter.lastChecked || data.Date || null
            },
            rss: data.rss || null,
            import: data.import || null,
            meta: {
                tags: Array.isArray(meta.tags) ? meta.tags : [],
                notes: meta.notes || "",
                added: meta.added || data.Date || new Date().toISOString(),
                updated: meta.updated || new Date().toISOString(),
                altTitles: altTitlesFinal
            }
        };

        updatedCount++;
    }

    // Save everything safely
    await new Promise((resolve, reject) => {
        browserAPI.storage.sync.set(unified, () => {
            if (browserAPI.runtime.lastError)
                reject(new Error(browserAPI.runtime.lastError));
            else resolve();
        });
    });

    console.log(`[Hermidata] Migration completed. ${updatedCount} entries updated.`);
    return unified;
}