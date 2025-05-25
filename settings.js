const browserAPI = typeof browser !== "undefined" ? browser : chrome;
let TYPE_OPTIONS = ["Manga", "Novel", "Anime", "TV-series"];
let STATUS_OPTIONS = ["Finished", "Viewing", "Dropped", "Planned"];

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
    // load & save theme
    setTheme() 
    // load settings
    ensureSettingsUpToDate((settings) => {
        buildFolderMappingForm(settings);
        document.getElementById("AllowContextMenu").checked = !!settings.AllowContextMenu;
    });
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
        FolderMapping: {
            Manga: {
                Finished: {
                    root: "menu________",
                    path: "Manga - Anime - Novels - TV-Series/Manga/Finished"
                    },
                Viewing: {
                    root: "menu________",
                    path: "Manga - Anime - Novels - TV-Series/Manga/Currently - Reading/Reading"
                    },
                Dropped: {
                    root: "menu________",
                    path: "Manga - Anime - Novels - TV-Series/Manga/Abandond"
                    },
                Planned: {
                    root: "menu________",
                    path: "Manga - Anime - Novels - TV-Series/Manga/Currently - Reading/future watch"
                    }
                },
            Novels: {
                Finished: {
                    root: "menu________",
                    path: "Manga - Anime - Novels - TV-Series/Novels/Finished"
                    },
                Viewing: {
                    root: "menu________",
                    path: "Manga - Anime - Novels - TV-Series/Novels/Currently - Reading"
                    },
                Dropped: {
                    root: "menu________",
                    path: "Manga - Anime - Novels - TV-Series/Novels/Abandond"
                    },
                Planned: {
                    root: "menu________",
                    path: "Manga - Anime - Novels - TV-Series/Novels/Planned"
                    },
                },
            Anime: {
                Finished: {
                    root: "menu________",
                    path: "Manga - Anime - Novels - TV-Series/Anime/Finished"
                },
                Viewing: {
                    root: "menu________",
                    path: "Manga - Anime - Novels - TV-Series/Anime/Currently - Reading"
                    },
                Dropped: {
                    root: "menu________",
                    path: "Manga - Anime - Novels - TV-Series/Anime/Abandond"
                    },
                Planned: {
                    root: "menu________",
                    path: "Manga - Anime - Novels - TV-Series/Anime/Planned"
                    },
                },
            'TV-Series': {
                Finished: {
                    root: "menu________",
                    path: "Manga - Anime - Novels - TV-Series/TV-Series/Finished"
                    },
                Viewing: {
                    root: "menu________",
                    path: "Manga - Anime - Novels - TV-Series/TV-Series/Currently - Reading"
                    },
                Dropped: {
                    root: "menu________",
                    path: "Manga - Anime - Novels - TV-Series/TV-Series/Abandond"
                    },
                Planned: {
                    root: "menu________",
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
function setTheme() {
    browserAPI.storage.sync.get(['theme'], (result) => {
        let theme = result.theme;
        if (!theme) {
            theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', theme);
            browserAPI.storage.sync.set({ theme });
        }
        document.documentElement.setAttribute('data-theme', theme);
        document.getElementById('theme-toggle').addEventListener('click', () => {
            theme = theme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', theme);
            browserAPI.storage.sync.set({ theme });
        })
    });
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
        a.download = "bookmark_plus_export.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
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

            // preserve root if already exists or set default if needed
            if (!settings.FolderMapping[type][status].root) {
                settings.FolderMapping[type][status].root = "menu________";
            }

            settings.FolderMapping[type][status].path = newPath;
        });

        chrome.storage.sync.set({ Settings: settings }, () => {
        alert("Folder mapping saved!");
        });
    });
}