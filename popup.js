const browserAPI = typeof browser !== "undefined" ? browser : chrome;

let currentTab;
let GoogleSheetURL;
let tagList = [];
let Type = ["Manga", "Novel", "Anime", "TV-series"];
let statusList = ["Finished", "Viewing", "Dropped", "Planned"];
const Tetsting = true;

// On popup load
document.addEventListener("DOMContentLoaded", async () => {
    currentTab = await getCurrentTab();
    GoogleSheetURL = await getGoogleSheetURL();
    populateType()
    populateStatus()
    document.getElementById("Pagetitle").textContent = currentTab.title || "Untitled Page";
    document.getElementById("title").value = trimTitle(currentTab.title) || "";
    document.getElementById("Type").value = Type[0] || "";
    document.getElementById("chapter").value = currentTab.Chapter || "";
    document.getElementById("url").value = currentTab.url || "NO URL";
    document.getElementById("status").value = statusList[1] || "";
    document.getElementById("date").value = getCurrentDate() || "";
    document.getElementById("tags").value = "";
    document.getElementById("notes").value = "";
    
    document.getElementById("save").addEventListener("click", () => saveSheet());
    document.getElementById("openSettings").addEventListener("click", () => {
        chrome.runtime.openOptionsPage();
    });
    document.getElementById("openFullPage").addEventListener("click", () => {
        browserAPI.tabs.create({ url: GoogleSheetURL });
    });
    browserAPI.storage.sync.get(['theme'], (result) => {
        let theme = result.theme;
        if (!theme) {
            theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            browserAPI.storage.sync.set({ theme });
        }
        document.documentElement.setAttribute('data-theme', theme);
        document.getElementById('Settings_IMG').src = theme === 'dark' ?  'assets/settings_24.png' : 'assets/settings_24Dark.png';
    });


});

// Get active tab info
function getCurrentTab() {
    return new Promise((resolve) => {
        browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            const parts = tab?.url?.split("/") || [];
            tab.Chapter = parts.at(-1).match(/[\d.]+/)?.[0] || "";
            resolve(tab);
        });
        
    });
}
// Get GoogleSheet URL
function getGoogleSheetURL() {
    return new Promise((resolve) => {
        // Load saved value
        chrome.storage.sync.get(["spreadsheetUrl"], (result) => {
            if (result.spreadsheetUrl) {
                resolve(result.spreadsheetUrl);
            } else {
                alert("No speadsheet saved inside settings");
                const url = prompt("Put Here the URL of Chosen Spreadsheet").trim();
                chrome.storage.sync.set({ spreadsheetUrl: url });
                resolve(url);
            }
        });
    })
}
function trimTitle(title) {
    return title.replace(/chapter.*$/i, "").replace(/[-–—|:]?\s*$/, "").trim();
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


    browserAPI.runtime.sendMessage({
        type: "SAVE_NOVEL",
        data: [title, Type, Chapter, url, status, date, tags, notes],
        arguments: {
            
        }
    });

    if(!Tetsting) window.close()
}