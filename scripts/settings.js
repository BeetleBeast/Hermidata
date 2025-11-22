const browserAPI = typeof browser !== "undefined" ? browser : chrome;
let TYPE_OPTIONS = ["Manga", "Novel", "Anime", "TV-series"];
let STATUS_OPTIONS = ["Finished", "Viewing", "Dropped", "Planned"];
const tagColoring = {};
document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("spreadsheetUrl").value.trim();
    const status = document.getElementById("statusSheetURL");
    const status_Input = document.getElementById('statusSaveDefaultInput');
    const statusTextMenu = document.getElementById('statusSaveDefaultInputInputTextMenu');
    const elements = {
        input: {
            Type: document.getElementById("Type"),
            Status: document.getElementById("Status"),
            tags: document.getElementById("tags"),
            notes: document.getElementById("notes"),
            saveButton: document.getElementById("saveDefaultInput")
        },
        menu: {
            Type: document.getElementById("TypeTextMenu"),
            Status: document.getElementById("StatusTextMenu"),
            tags: document.getElementById("tagsTextMenu"),
            notes: document.getElementById("notesTextMenu"),
            saveButton: document.getElementById("saveDefaultInputTextMenu")
        }
    };
    // Load & populate page inputs and tables
    LoadAndPopulate(elements);
    // load settings
    ensureSettingsUpToDate((settings) => {
        buildFolderMappingForm(settings);
        document.getElementById("AllowContextMenu").checked = !!settings.AllowContextMenu;
    });
    loadTagColoring();
    // Save spreadsheetUrl value
    document.getElementById("save").addEventListener("click", () => {
        chrome.storage.sync.set({ spreadsheetUrl: input }, () => {
            status.textContent = "Saved!";
            setTimeout(() => status.textContent = "", 2000);
        });
    });
    // Save table Input
    elements.input.saveButton.addEventListener("click", () => {
        const values = getValuesFromElements(elements.input);
        saveSettings("DefaultChoice", values, status_Input);
    });
    // Save table Menu
    elements.menu.saveButton.addEventListener("click", () => {
        const values = getValuesFromElements(elements.menu);
        saveSettings("DefaultChoiceText_Menu", values, statusTextMenu);
    });
    document.getElementById("ResetAuth").addEventListener("click", ResetLoginAuth);
    
    document.getElementById("exportBtn").addEventListener("click", exportSettings);
    document.getElementById("importBtn").addEventListener("change", importSettings);
    
    document.getElementById("exportDataBtn").addEventListener("click", exportHermidata );
    document.getElementById("importDataBtn").addEventListener("change", importHermidata );

    document.getElementById("exportRSSBtn").addEventListener("click", exportRSSBtn );
    document.getElementById("importRSSBtn").addEventListener("change", importRSSBtn );

    document.getElementById("AllowContextMenu").addEventListener("change", AllowContextMenu);
    document.getElementById("saveFolderMapping").addEventListener("click", saveSettingsFolderPath);
});
function getDefaultSettings() {
    return {
        DefaultChoice : {
            Type : 'Manga',
            chapter : '0',
            status : 'Viewing',
            tags : '',
            notes : ''
        },
        DefaultChoiceText_Menu : {
            Type : 'Manga',
            chapter : '0',
            status : 'Planned',
            tags : '',
            notes : ''
        },
        TYPE_OPTIONS : ["Manga", "Novel", "Anime", "TV-series"],
        STATUS_OPTIONS : ["Finished", "Viewing", "Dropped", "Planned"],

        NOVEL_TYPE_OPTIONS_V3: ['Manga', 'Manhwa', 'Manhua', 'Novel', 'Webnovel', 'Anime', "TV-Series"],
        NOVEL_TYPE_OPTIONS_V2: ['Manga', 'Manhwa', 'Manhua', 'Novel', 'Webnovel'],
        NOVEL_STATUS_OPTIONS_V2: ['Ongoing', 'Completed', 'Hiatus', 'Canceled'],
        READ_STATUS_OPTIONS_V2: ['Viewing', 'Finished', 'On-hold', 'Dropped', 'Planned'],
        tagColoring: {},
        FolderMapping: {
            Manga: {
                Finished: {
                    path: "Manga - Anime - Novels - TV-Series/Manga/Finished"
                    },
                Viewing: {
                    path: "Manga - Anime - Novels - TV-Series/Manga/Currently - Reading/Reading"
                    },
                Dropped: {
                    path: "Manga - Anime - Novels - TV-Series/Manga/Abandond"
                    },
                Planned: {
                    path: "Manga - Anime - Novels - TV-Series/Manga/Currently - Reading/future watch"
                    }
                },
            Novel: {
                Finished: {
                    path: "Manga - Anime - Novels - TV-Series/Novels/Finished"
                    },
                Viewing: {
                    path: "Manga - Anime - Novels - TV-Series/Novels/Currently - Reading"
                    },
                Dropped: {
                    path: "Manga - Anime - Novels - TV-Series/Novels/Abandond"
                    },
                Planned: {
                    path: "Manga - Anime - Novels - TV-Series/Novels/Planned"
                    },
                },
            Anime: {
                Finished: {
                    path: "Manga - Anime - Novels - TV-Series/Anime/Finished"
                },
                Viewing: {
                    path: "Manga - Anime - Novels - TV-Series/Anime/Currently - Reading"
                    },
                Dropped: {
                    path: "Manga - Anime - Novels - TV-Series/Anime/Abandond"
                    },
                Planned: {
                    path: "Manga - Anime - Novels - TV-Series/Anime/Planned"
                    },
                },
            'TV-Series': {
                Finished: {
                    path: "Manga - Anime - Novels - TV-Series/TV-Series/Finished"
                    },
                Viewing: {
                    path: "Manga - Anime - Novels - TV-Series/TV-Series/Currently - Reading"
                    },
                Dropped: {
                    path: "Manga - Anime - Novels - TV-Series/TV-Series/Abandond"
                    },
                Planned: {
                    path: "Manga - Anime - Novels - TV-Series/TV-Series/Planned"
                },
            },
        },
        AllowContextMenu : true,
    };
}
function LoadAndPopulate(elements) {
    // Populate dropdowns
    populateSelect(elements.input.Status, STATUS_OPTIONS);
    populateSelect(elements.menu.Status, STATUS_OPTIONS );
    populateSelect(elements.input.Type, TYPE_OPTIONS);
    populateSelect(elements.menu.Type, TYPE_OPTIONS);

    // Load spreadsheetUrl value
    chrome.storage.sync.get(["spreadsheetUrl"], (result) => {
        if (result.spreadsheetUrl) {
        document.getElementById("spreadsheetUrl").value = result.spreadsheetUrl;
        }
    });
    // load table input
    chrome.storage.sync.get([ "Settings" ], (result) => {
        ensureSettingsUpToDate((Settings) => {
            setValuesToElements(elements.input, Settings.DefaultChoice);
            setValuesToElements(elements.menu, Settings.DefaultChoiceText_Menu);
        });
        setValuesToElements(elements.input, result.Settings.DefaultChoice);
        setValuesToElements(elements.menu, result.Settings.DefaultChoiceText_Menu);
        
    })
}

function buildTagColoringForm() {
    const container = document.getElementById("tagColoringContainer");
    if (container) container.innerHTML = "";

    Object.keys(tagColoring).forEach(tag => {
        const label = document.createElement("label");
        label.textContent = `Color for ${tag}: `;

        const input = document.createElement("input");
        input.type = "color";
        input.value = tagColoring[tag];
        input.dataset.tag = tag;

        container.appendChild(label);
        container.appendChild(input);
        container.appendChild(document.createElement("br"));

        input.addEventListener("input", () => {
            tagColoring[tag] = input.value;
            saveTagColoring(tagColoring);
        });
    });
}

async function saveTagColoring(tagColoringInput) {
    const settings = await new Promise((resolve, reject) => {
        browserAPI.storage.sync.get("Settings", (result) => {
            if (browserAPI.runtime.lastError) reject(new Error(browserAPI.runtime.lastError));
            else resolve(result.Settings || {});
        });
    });
    settings.tagColoring = tagColoringInput;
    chrome.storage.sync.set({ Settings: settings }, () => {
        console.log("Tag colors saved.");
    });
}

// Call this function to load existing tag colors
async function loadTagColoring() {
    chrome.storage.sync.get(["Settings"], async (result) => {
        Object.assign(tagColoring, result.Settings.tagColoring || await createDefaultTagColor());
        await updateTagColor(result.Settings.tagColoring);
        buildTagColoringForm();
    });
}
async function createDefaultTagColor() {
    const allTags = Array.from(new Set(Object.values(await getAllHermidata()).flatMap(item => item.meta?.tags || [])));
    const defaultColor = 'white';
    let defaultTagColor = {};
    allTags.forEach(f => {
        defaultTagColor[f] = defaultColor
    })
    return defaultTagColor
}
async function updateTagColor(alreadyExist) {
    const allTags = Array.from(new Set(Object.values(await getAllHermidata()).flatMap(item => item.meta?.tags || [])));
    allTags.forEach(f => {
        if (!alreadyExist[f]) {
            tagColoring[f] = 'white'
        }
    })
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
function ensureSettingsUpToDate(callback) {
    chrome.storage.sync.get(["Settings"], (result) => {
        const storedSettings = result.Settings || {};
        const defaultSettings = getDefaultSettings();

        let updated = false;

        function deepMerge(target, source) {
            for (const key in source) {
                if (!(key in target)) {
                    target[key] = source[key];
                    updated = true;
                } else if (
                    typeof target[key] === "object" &&
                    typeof source[key] === "object"
                ) {
                    deepMerge(target[key], source[key]);
                }
            }
        }

        deepMerge(storedSettings, defaultSettings);

        if (updated) {
            chrome.storage.sync.set({ Settings: storedSettings }, () => {
                console.log("Settings updated with missing defaults.");
                callback(storedSettings);
            });
        } else {
            callback(storedSettings);
        }
    });
}

// Helper to populate a <select> with options
function populateSelect(selectEl, options) {
    selectEl.innerHTML = "";
    options.forEach(value => {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = value;
        selectEl.appendChild(opt);
    });
}
// Read input values from current UI
function getValuesFromElements(group, data = null) {
    return {
        Type: data ? data?.Type : group.Type?.value,
        chapter: data ? data?.chapter : "0",
        status: data ? data?.status : group.Status?.value,
        tags: data ? data?.tags : (group.tags?.value || ""),
        notes: data ? data?.notes : (group.notes?.value || "")
    };
}
// Helper: write settings to inputs
function setValuesToElements(group, data) {
    if (!group || !data) return;
    if (group.Type) group.Type.value = data.Type;
    if (group.chapter) group.chapter.value = data.chapter;
    if (group.Status) group.Status.value = data.status;
    if (group.tags) group.tags.value = data.tags;
    if (group.notes) group.notes.value = data.notes;
}
function saveSettings(sectionKey, values, statusElement = null) {
chrome.storage.sync.get(["Settings"], (result) => {
    const updatedSettings = {
        ...result.Settings,
        [sectionKey]: values
    };
    chrome.storage.sync.set({ Settings: updatedSettings }, () => {
        if (statusElement) {
            statusElement.textContent = "Saved!";
            setTimeout(() => statusElement.textContent = "", 2000);
        }
    });
});
}
function ResetLoginAuth() {
    chrome.storage.local.remove(["googleAccessToken", "googleTokenExpiry", "userEmail"], () => {
        console.log("OAuth credentials cleared");
    });
}
// Export Settings as JSON
function exportSettings() {
    // Ensure settings are up to date
    ensureSettingsUpToDate((updatedSettings) => {
        const json = JSON.stringify(updatedSettings, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        
        a.href = url;
        a.download = "Hermidata_Settings_export.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    });
}
function importSettings(event) {
    const file = event.target.files[0];
    if (!file) return
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const importedData = JSON.parse(e.target.result);

            // Optional validation
            if (!importedData.FolderMapping || !importedData.DefaultChoiceText_Menu) return

            chrome.storage.sync.set({ Settings: importedData }, () => {
                alert("Settings imported successfully!");
            });
        } catch (err) {
            console.error("Failed to parse JSON:", err);
            alert("Invalid JSON format.");
        }
    };
    reader.readAsText(file);
}    
async function exportHermidata() {
    try {
        const Data = await new Promise((resolve, reject) => {
            browserAPI.storage.sync.get(null, (result) => {
                if (browserAPI.runtime.lastError) return reject(new Error(browserAPI.runtime.lastError));
                resolve(result || {});
            });
        });
        
        const jsonSTR = JSON.stringify(Data, null, 2);
        const blob = new Blob([jsonSTR], { type: "application/json" });
        const url = URL.createObjectURL(blob);
    
        const a = document.createElement("a");
        a.href = url;
        a.download = "Hermidata_export.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Extension error: Failed exportHermidata: ", error)
    }
}
function importHermidata(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const importedData = JSON.parse(e.target.result);

            // Get existing storage
            const existingData = await new Promise((resolve, reject) => {
                browserAPI.storage.sync.get(null, (result) => {
                    if (browserAPI.runtime.lastError) 
                        return reject(new Error(browserAPI.runtime.lastError));
                    resolve(result || {});
                });
            });

            // Merge
            const mergedData = { ...existingData, ...importedData };

            // Save merged result
            await new Promise((resolve, reject) => {
                browserAPI.storage.sync.set(mergedData, () => {
                    if (browserAPI.runtime.lastError) 
                        return reject(new Error(browserAPI.runtime.lastError));
                    resolve();
                });
            });

            console.log("Hermidata import + merge complete!");
        } catch (error) {
            console.error("Extension error: Failed importHermidata:", error);
        }
    };
    reader.readAsText(file);
}
function importRSSBtn(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const importedData = JSON.parse(e.target.result);

            // Get existing storage
            const existingData = await new Promise((resolve, reject) => {
                browserAPI.storage.local.get(null, (result) => {
                    if (browserAPI.runtime.lastError) 
                        return reject(new Error(browserAPI.runtime.lastError));
                    resolve(result || {});
                });
            });

            // Merge
            const mergedData = { ...existingData, ...importedData };

            // Save merged result
            await new Promise((resolve, reject) => {
                browserAPI.storage.sync.set(mergedData, () => {
                    if (browserAPI.runtime.lastError) 
                        return reject(new Error(browserAPI.runtime.lastError));
                    resolve();
                });
            });

            console.log("Hermidata import + merge complete!");
        } catch (error) {
            console.error("Extension error: Failed importHermidata:", error);
        }
    };
    reader.readAsText(file);
}
async function exportRSSBtn() { // possible rss
    try {
        const Data = await new Promise((resolve, reject) => {
            browserAPI.storage.local.get(null, (result) => {
                if (browserAPI.runtime.lastError) return reject(new Error(browserAPI.runtime.lastError));
                resolve(result || {});
            });
        });
        
        const jsonSTR = JSON.stringify(Data, null, 2);
        const blob = new Blob([jsonSTR], { type: "application/json" });
        const url = URL.createObjectURL(blob);
    
        const a = document.createElement("a");
        a.href = url;
        a.download = "RSS_export.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Extension error: Failed exportHermidata: ", error)
    }
}

function AllowContextMenu(event) {
    const isChecked = event.target.checked;
    ensureSettingsUpToDate((updatedSettings) => {
        updatedSettings.AllowContextMenu = isChecked;

        chrome.storage.sync.set({ Settings: updatedSettings }, () => {
            console.log("AllowContextMenu updated to", isChecked);
        });
    });
}

function buildFolderMappingForm(settings) {
    const container = document.getElementById("folderMappingContainer");
    container.innerHTML = "";

    const mapping = settings.FolderMapping;
    for (const type in mapping) {
        for (const status in mapping[type]) {
        const path = mapping[type][status].path;

        const label = document.createElement("label");
        label.textContent = `${type} - ${status}: `;

        const input = document.createElement("input");
        input.type = "text";
        input.value = path;
        input.dataset.type = type;
        input.dataset.status = status;

        container.appendChild(label);
        container.appendChild(input);
        container.appendChild(document.createElement("br"));
        }
    }
}
function saveSettingsFolderPath() {
    ensureSettingsUpToDate((settings) => {
        const container = document.getElementById("folderMappingContainer");
        const inputs = container.querySelectorAll("input");

        inputs.forEach(input => {
            const type = input.dataset.type;
            const status = input.dataset.status;
            const newPath = input.value.trim();

            if (!type || !status) return;

            if (!settings.FolderMapping[type]) settings.FolderMapping[type] = {};
            if (!settings.FolderMapping[type][status]) settings.FolderMapping[type][status] = {};

            

            settings.FolderMapping[type][status].path = newPath;
        });

        chrome.storage.sync.set({ Settings: settings }, () => {
        alert("Folder mapping saved!");
        });
    });
}