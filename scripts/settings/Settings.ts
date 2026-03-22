import { ext } from "../shared/BrowserCompat";
import { defaultSettings, type SettingsInput } from "../shared/types/settings";
import { getAllHermidata, getSettings, getSpreadsheetUrl } from "../shared/Storage";
import { novelTypes, readStatus, type Hermidata } from "../shared/types/popupType";
import { getElement, setElement } from "../utils/Selection";



document.addEventListener("DOMContentLoaded", () => {

    const settings = new Settings();
    settings.init();
});

type elementInput = {
    Type: HTMLSelectElement;
    Status: HTMLSelectElement;
    tags: HTMLInputElement;
    notes: HTMLInputElement;
    saveButton: HTMLButtonElement;
}
type elementMenu = {
    Type: HTMLSelectElement;
    Status: HTMLSelectElement;
    tags: HTMLInputElement;
    notes: HTMLInputElement;
    saveButton: HTMLButtonElement;
}

type elementsInputAndMenu = elementInput |  elementMenu;

interface ElmentsWithInputAndMenu {
    input: {
        Type: HTMLSelectElement,
        Status: HTMLSelectElement,
        tags: HTMLInputElement,
        notes: HTMLInputElement,
        saveButton: HTMLButtonElement
    },
    menu: {
        Type: HTMLSelectElement,
        Status: HTMLSelectElement,
        tags: HTMLInputElement,
        notes: HTMLInputElement,
        saveButton: HTMLButtonElement
    }
}


class Settings {

    // is a list of tags and their corresponding color
    private readonly tagColoring: Record<string, string> = {};

    private readonly TYPE_OPTIONS = novelTypes;
    private readonly STATUS_OPTIONS = readStatus;


    private readonly input = getElement<HTMLInputElement>("#spreadsheetUrl")?.value.trim();
    private readonly status = getElement("#statusSheetURL");
    private readonly status_Input = getElement('#statusSaveDefaultInput');
    private readonly statusTextMenu = getElement('#statusSaveDefaultInputInputTextMenu');
    private readonly elements: ElmentsWithInputAndMenu = {
        input: {
            Type: getElement("#Type") as HTMLSelectElement,
            Status: getElement("#Status") as HTMLSelectElement,
            tags: getElement("#tags") as HTMLInputElement,
            notes: getElement("#notes") as HTMLInputElement,
            saveButton: getElement("#saveDefaultInput") as HTMLButtonElement
        },
        menu: {
            Type: getElement("#TypeTextMenu") as HTMLSelectElement,
            Status: getElement("#StatusTextMenu") as HTMLSelectElement,
            tags: getElement("#tagsTextMenu") as HTMLInputElement,
            notes: getElement("#notesTextMenu") as HTMLInputElement,
            saveButton: getElement("#saveDefaultInputTextMenu") as HTMLButtonElement
        }
    };

    public init() {
        // Load & populate page inputs and tables
        this.LoadAndPopulate();
        // load settings
        this.loadSettings();
        


        this.addEventListener();
    }

    private loadSettings() {
        this.ensureSettingsUpToDate((settings) => {
            this.buildFolderMappingForm(settings);
            setElement<HTMLInputElement>("#AllowContextMenu", el => el.checked = !!settings.AllowContextMenu);
        });
        this.loadTagColoring();
    }

    private addEventListener() {
        getElement("#save")?.addEventListener("click", () => {
            ext.storage.sync.set({ spreadsheetUrl: this.input }, () => {
                if (!this.status) return;
                this.status.textContent = "Saved!";
                setTimeout(() => setElement('#statusSheetURL', el => el.textContent = ""), 2000);
            });
        });
        // Save table Input
        this.elements.input.saveButton.addEventListener("click", () => {
            const values = this.getValuesFromElements(this.elements.input);
            this.saveSettings("DefaultChoice", values, this.status_Input);
        });
        // Save table Menu
        this.elements.menu.saveButton.addEventListener("click", () => {
            const values = this.getValuesFromElements(this.elements.menu);
            this.saveSettings("DefaultChoiceText_Menu", values, this.statusTextMenu);
        });
        getElement("#ResetAuth")?.addEventListener("click", this.ResetLoginAuth);
        
        getElement("#exportBtn")?.addEventListener("click", this.exportSettings);
        getElement("#importBtn")?.addEventListener("change", this.importSettings);
        
        getElement("#exportDataBtn")?.addEventListener("click", this.exportHermidata );
        getElement("#importDataBtn")?.addEventListener("change", this.importHermidata );

        getElement("#exportRSSBtn")?.addEventListener("click", this.exportRSSBtn );
        getElement("#importRSSBtn")?.addEventListener("change", this.importRSSBtn );

        getElement("#AllowContextMenu")?.addEventListener("change", this.AllowContextMenu);
        getElement("#saveFolderMapping")?.addEventListener("click", this.saveSettingsFolderPath);
    }


    private getDefaultSettings() {
        const settings: SettingsInput = defaultSettings;
        return settings;
    }
    private async ensureSettingsUpToDate(callback: (settings: SettingsInput) => void) {
        const storedSettings = await getSettings();
        const defaultSettings = this.getDefaultSettings();

        let updated = false;

        // FIXME: this is a hack

        /*
        function deepMerge(target: SettingsInput, source: SettingsInput) {
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
        */

        // deepMerge(storedSettings, defaultSettings);

        if (updated) {
            chrome.storage.sync.set({ Settings: storedSettings }, () => {
                console.log("Settings updated with missing defaults.");
                callback(storedSettings);
            });
        } else {
            callback(storedSettings);
        }
    }

    private async LoadAndPopulate() {
        // Populate dropdowns
        this.populateSelect(this.elements.input.Status, this.STATUS_OPTIONS);
        this.populateSelect(this.elements.menu.Status, this.STATUS_OPTIONS );
        this.populateSelect(this.elements.input.Type, this.TYPE_OPTIONS);
        this.populateSelect(this.elements.menu.Type, this.TYPE_OPTIONS);

        // Load spreadsheetUrl value
        const result = await getSpreadsheetUrl();
        setElement<HTMLInputElement>("#spreadsheetUrl", el => el.value = result);
        // load table input
        const localSettings = await getSettings()
        this.ensureSettingsUpToDate((Settings) => {
            this.setValuesToElements(this.elements.input, Settings.DefaultChoice);
            this.setValuesToElements(this.elements.menu, Settings.DefaultChoiceText_Menu);
        });
        this.setValuesToElements(this.elements.input, localSettings.DefaultChoice);
        this.setValuesToElements(this.elements.menu, localSettings.DefaultChoiceText_Menu);
    }

    private buildTagColoringForm() {
        const container = getElement("#tagColoringContainer");
        if (container) container.innerHTML = "";

        Object.keys(this.tagColoring).forEach(tag => {
            const label = document.createElement("label");
            label.textContent = `Color for ${tag}: `;

            const input = document.createElement("input");
            input.type = "color";
            input.value = this.tagColoring[tag];
            input.dataset.tag = tag;
            if (!container) return;
            container.appendChild(label);
            container.appendChild(input);
            container.appendChild(document.createElement("br"));

            input.addEventListener("input", () => {
                this.tagColoring[tag] = input.value;
                this.saveTagColoring(this.tagColoring);
            });
        });
    }

    private async saveTagColoring(tagColoringInput: { [tag: string]: string }) {
        const settings = await getSettings();
        settings.tagColoring = tagColoringInput;
        chrome.storage.sync.set({ Settings: settings }, () => {
            console.log("Tag colors saved.");
        });
    }
    private async loadTagColoring() {
        const Settings = await getSettings();
        Object.assign(this.tagColoring, Settings.tagColoring || await this.createDefaultTagColor());
        await this.updateTagColor(Settings.tagColoring);
        this.buildTagColoringForm();
    }
    private async createDefaultTagColor(): Promise<{ [tag: string]: string }> {
        const allTags = Array.from(new Set(Object.values(await getAllHermidata()).flatMap(item => item.meta?.tags || [])));
        const defaultColor = 'white';
        let defaultTagColor: { [tag: string]: string } = {};
        allTags.forEach(f => {
            defaultTagColor[f] = defaultColor
        })
        return defaultTagColor
    }
    private async updateTagColor(alreadyExist: { [tag: string]: string }) {
        const allTags = Array.from(new Set(Object.values(await getAllHermidata()).flatMap(item => item.meta?.tags || [])));
        allTags.forEach(f => { if (!alreadyExist[f]) this.tagColoring[f] = 'white' })
    }
    // Helper to populate a <select> with options
    private populateSelect(selectEl: HTMLSelectElement, options: string[]) {
        selectEl.innerHTML = "";
        options.forEach(value => {
            const opt = document.createElement("option");
            opt.value = value;
            opt.textContent = value;
            selectEl.appendChild(opt);
        });
    }
    // Read input values from current UI
    private getValuesFromElements(group: elementsInputAndMenu, data: SettingsInput["DefaultChoice"] | SettingsInput["DefaultChoiceText_Menu"] | null = null)  {
        return {
            Type: data ? data?.Type : group.Type?.value,
            chapter: data ? data?.chapter : 0,
            status: data ? data?.status : group.Status?.value,
            tags: data ? data?.tags : (group.tags?.value || ""),
            notes: data ? data?.notes : (group.notes?.value || "")
        };
    }
    // Helper: write settings to inputs
    private setValuesToElements(group: elementsInputAndMenu, data: SettingsInput["DefaultChoice"] | SettingsInput["DefaultChoiceText_Menu"]) {
        if (!group || !data) return;
        if (group.Type) group.Type.value = data.Type;
        // if (group.chapter) group.chapter.value = data.chapter;
        if (group.Status) group.Status.value = data.status;
        if (group.tags) group.tags.value = data.tags.join(",");
        if (group.notes) group.notes.value = data.notes;
    }

    private saveSettings(sectionKey: string, values: any, statusElement: HTMLElement | null = null) {
        ext.storage.sync.get(["Settings"], (result: { Settings: SettingsInput }) => {
            const updatedSettings: SettingsInput = {
                ...result.Settings,
                [sectionKey]: values
            };
            ext.storage.sync.set({ Settings: updatedSettings }, () => {
                if (statusElement) {
                    statusElement.textContent = "Saved!";
                    setTimeout(() => statusElement.textContent = "", 2000);
                }
            });
        });
    }
    private async ResetLoginAuth() {
        ext.storage.local.remove(["googleAccessToken", "googleTokenExpiry", "userEmail"], () => {
            console.log("OAuth credentials cleared");
        });
    }
    // Export Settings as JSON
    private exportSettings() {
        // Ensure settings are up to date
        this.ensureSettingsUpToDate((updatedSettings) => {
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
    private async importSettings(event: Event) {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file) return
        try {
            const importedData = await new Blob([file]).text();
            
            ext.storage.sync.set({ Settings: importedData }, () => {
                alert("Settings imported successfully!");
            });
        } catch (err) {
            console.error("Failed to parse JSON:", err);
            alert("Invalid JSON format.");
        }
    };

    private async exportHermidata() {
        try {
            const Data = await new Promise((resolve, reject) => {
                ext.storage.sync.get(null, (result) => {
                    if (ext.runtime.lastError) return reject(new Error(ext.runtime.lastError?.message));
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

    private importHermidata(event: Event) {
        const target = event.target as HTMLInputElement;
        const file = target?.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const target = e.target ?? null;
                const importedData = JSON.parse(target?.result as string);

                // Get existing storage
                const existingData = await new Promise<Record<string, Hermidata>>((resolve, reject) => {
                    ext.storage.sync.get(null, (result: Record<string, Hermidata>) => {
                        if (ext.runtime.lastError) 
                            return reject(new Error(ext.runtime.lastError?.message));
                        resolve(result || {});
                    });
                });

                // Merge
                const mergedData = { ...existingData, ...importedData };

                // Save merged result
                await new Promise((reject) => {
                    ext.storage.sync.set(mergedData, () => {
                        if (ext.runtime.lastError) return reject(new Error(ext.runtime.lastError?.message));
                    });
                });

                console.log("Hermidata import + merge complete!");
            } catch (error) {
                console.error("Extension error: Failed importHermidata:", error);
            }
        };
        reader.readAsText(file);
    }

    private importRSSBtn(event: Event) {
        const target = event.target as HTMLInputElement;
        const file = target?.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const target = e.target ?? null;
                const importedData = JSON.parse(target?.result as string);

                // Get existing storage
                const existingData = await new Promise<Record<string, Hermidata>>((resolve, reject) => {
                    ext.storage.local.get(null, (result: Record<string, Hermidata>) => {
                        if (ext.runtime.lastError) 
                            return reject(new Error(ext.runtime.lastError?.message));
                        resolve(result || {});
                    });
                });

                // Merge
                const mergedData = { ...existingData, ...importedData };

                // Save merged result
                await new Promise((reject) => {
                    ext.storage.sync.set(mergedData, () => {
                        if (ext.runtime.lastError) return reject(new Error(ext.runtime.lastError?.message));
                    });
                });

                console.log("Hermidata import + merge complete!");
            } catch (error) {
                console.error("Extension error: Failed importHermidata:", error);
            }
        };
        reader.readAsText(file);
    }

    private async exportRSSBtn() { // possible rss
        try {
            const Data = await new Promise((resolve, reject) => {
                ext.storage.local.get(null, (result) => {
                    if (ext.runtime.lastError) return reject(new Error(ext.runtime.lastError?.message));
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

    private AllowContextMenu(e: Event) {
        const event = e.target as HTMLInputElement;
        const isChecked = event.checked;
        this.ensureSettingsUpToDate((updatedSettings) => {
            updatedSettings.AllowContextMenu = isChecked;

            chrome.storage.sync.set({ Settings: updatedSettings }, () => {
                console.log("AllowContextMenu updated to", isChecked);
            });
        });
    }

    private buildFolderMappingForm(settings: SettingsInput) {
        const container = getElement("#folderMappingContainer");
        if (!container) return;
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

    private saveSettingsFolderPath() {
        this.ensureSettingsUpToDate((settings) => {
            const container = getElement("#folderMappingContainer");
            if (!container) return;
            const inputs = container.querySelectorAll("input");

            inputs.forEach(input => {
                const type = input.dataset.type;
                const status = input.dataset.status;
                const newPath = input.value.trim();

                if (!type || !status) return;

                if (!settings.FolderMapping[type]) settings.FolderMapping[type] = {};
                if (!settings.FolderMapping[type][status]) settings.FolderMapping[type][status] = { path: "" };

                

                settings.FolderMapping[type][status].path = newPath;
            });

            chrome.storage.sync.set({ Settings: settings }, () => {
            alert("Folder mapping saved!");
            });
        });
    }

}