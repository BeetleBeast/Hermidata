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
    Past : {} 
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
    await getHermidata();
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
    
    document.getElementById("save").addEventListener("click", () => saveSheet());
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
                const chapterNumberRegex = /(?:chapter|chap|ch)[-.\s]*?(\d+[A-Z]*)|(\d+[A-Z]*)/i;
    
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
                Hermidata.Chapter = chapterPartV2 || chapterPartV1 || chapterPartV3 || "";
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
    try {
        browserAPI.storage.sync.set({ Hermidata }, () => {
            console.log("Hermidata saved:", Hermidata);
        });
    } catch (error) {
        console.error('Extention error  inside setHermidata: ',error)
    }
}
async function getHermidata() {
    try {
        browserAPI.storage.sync.get(["Hermidata"], (result) => {
            if (result?.Hermidata) Hermidata.Past = result.Hermidata || {};
            return Hermidata;
        });
    } catch (error) {
        console.error('Extention error inside getHermidata: ',error)
    }

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

    // Regex patterns
    const OLDREGEX1 = /chapter.*$/i;
    const OLDREGEX2 = /[-–—|:]?\s*$/; 
    const chapterRemoveRegex = /(\b\d{1,4}[A-Z]*\b\s*)?(\b(?:chapter|chap|ch)\b\.?\s*)(\b\d{1,4}[A-Z]*\b)?/gi;
    const chapterRegex = /\b(?:chapter|chap|ch)\.?\s*\d+[A-Z]*/gi;
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
    let filtered;
    filtered = parts
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
        // if first el is chapter info place it at the end
        if (filtered[0]?.replace(/\s*([–—-]|:|#|\|)\s*/g,' ').toLowerCase() === Url_filter) {// fip the first to last
            filter[filter.length] = filter[0];
            filter.shift();
        }

        mainTitle = filter[0]
        .replace(chapterRemoveRegex, '').trim() // remove 'chapter' and any variation
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
function saveSheet() {
    const title = document.getElementById("title").value;
    const Type = document.getElementById("Type").value;
    const Chapter = document.getElementById("chapter").value;
    const url = document.getElementById("url").value;
    const status = document.getElementById("status").value;
    const date = document.getElementById("date").value;
    const tags = document.getElementById("tags").value || "";
    const notes = document.getElementById("notes").value || "";
    const args = '';

    Object.keys(Hermidata).forEach((key) => {
        switch (key) {
            case 'Page_Title':
            case 'Past':
            case 'GoogleSheetURL':
                break;
            default:
                Hermidata[key] = document.querySelector(`[name="${key}"]`).value || '';
            break;
        }
    });
    Hermidata.Past = {};
    setHermidata();
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