import { ext } from "../shared/BrowserCompat";
import { getElement, setElement } from "../utils/Selection";
import { ContextMenu } from "./build/ContextMenu";
import { FolderMapping } from "./build/FolderMapping"
import { ImportsAndExports } from "./build/ImportsAndExports";
import { TagColoring } from "./build/tagColoring";
import { DEFAULT_NOVEL_TYPES, DEFAULT_READ_STATUSES, type AnyNovelStatus, type AnyNovelType, type elementsInputAndMenu, type ElmentsWithInputAndMenu, type Settings } from "../shared/types";










const setDefaultSettingsElements = () => {
    const elements: ElmentsWithInputAndMenu = {
        input: {
            Type: getElement<HTMLSelectElement>("#Type"),
            Status: getElement<HTMLSelectElement>("#Status"),
            tags: getElement<HTMLInputElement>("#tags"),
            notes: getElement<HTMLInputElement>("#notes"),
            saveButton: getElement<HTMLButtonElement>("#saveDefaultInput")
        },
        menu: {
            Type: getElement<HTMLSelectElement>("#TypeTextMenu"),
            Status: getElement<HTMLSelectElement>("#StatusTextMenu"),
            tags: getElement<HTMLInputElement>("#tagsTextMenu"),
            notes: getElement<HTMLInputElement>("#notesTextMenu"),
            saveButton: getElement<HTMLButtonElement>("#saveDefaultInputTextMenu")
        }
    };
    return elements;
}



export class BuildController {

    private readonly folderMapping: FolderMapping = new FolderMapping();

    private readonly tagColoring: TagColoring = new TagColoring();

    private readonly importAndExport: ImportsAndExports = new ImportsAndExports();

    private readonly contextMenu: ContextMenu = new ContextMenu();

    private readonly input = getElement<HTMLInputElement>("#spreadsheetUrl")?.value.trim();
    private readonly status = getElement("#statusSheetURL");
    private readonly status_Input = getElement('#statusSaveDefaultInput');
    private readonly statusTextMenu = getElement('#statusSaveDefaultInputInputTextMenu');
    private readonly elements: ElmentsWithInputAndMenu = setDefaultSettingsElements();

    constructor() {

        this.LoadAndPopulate();
        this.addEventListener();
    }

    public async init() {
        
        this.folderMapping.init();

        this.tagColoring.init();

        await this.loadSheetUrl();
        await this.loadTableInput();

    }
    private async loadSheetUrl() {

        // Load spreadsheetUrl value
        
        const result = await this.importAndExport.getSpreadsheetUrl();

        setElement<HTMLInputElement>("#spreadsheetUrl", el => el.value = result);
    }
    private async loadTableInput() {
        // load table input
        const localSettings = await this.importAndExport.getSettings()
        this.setValuesToElements(this.elements.input, localSettings.DefaultChoice);
        this.setValuesToElements(this.elements.menu, localSettings.DefaultChoiceText_Menu);

        setElement<HTMLInputElement>("#AllowContextMenu", el => el.checked = !!localSettings.AllowContextMenu);
    }

    private LoadAndPopulate() {
        // Populate dropdowns
        this.populateSelect(this.elements.input.Status, DEFAULT_READ_STATUSES);
        this.populateSelect(this.elements.menu.Status, DEFAULT_READ_STATUSES);
        this.populateSelect(this.elements.input.Type, DEFAULT_NOVEL_TYPES);
        this.populateSelect(this.elements.menu.Type, DEFAULT_NOVEL_TYPES);
    }
    private addEventListener() {
        getElement("#save")?.addEventListener("click", () => {
            if ( this.input) this.importAndExport.setSpreadsheetUrl(this.input);
            if (!this.status) return;
            this.status.textContent = "Saved!";
            setTimeout(() => setElement('#statusSheetURL', el => el.textContent = ""), 2000);
        });
        // Save table Input
        this.elements.input.saveButton?.addEventListener("click", () => {
            const values = this.getValuesFromElements(this.elements.input);
            this.updateSettings("DefaultChoice", values, this.status_Input);
        });
        // Save table Menu
        this.elements.menu.saveButton?.addEventListener("click", () => {
            const values = this.getValuesFromElements(this.elements.menu);
            this.updateSettings("DefaultChoiceText_Menu", values, this.statusTextMenu);
        });
        getElement("#ResetAuth")?.addEventListener("click", () => this.ResetLoginAuth());
        
        getElement("#exportBtn")?.addEventListener("click", () => this.exportSettings());
        getElement("#importBtn")?.addEventListener("change", (e) => this.importSettings(e));
        
        getElement("#exportDataBtn")?.addEventListener("click", () => this.exportHermidata() );
        getElement("#importDataBtn")?.addEventListener("change", (e) => this.importHermidata(e) );

        getElement("#exportRSSBtn")?.addEventListener("click", () => this.exportRSSBtn() );
        getElement("#importRSSBtn")?.addEventListener("change", (e) => this.importRSSBtn(e) );

        getElement("#AllowContextMenu")?.addEventListener("change", (e) => this.contextMenu.AllowContextMenu(e));
    }

    private async updateSettings(sectionKey: "DefaultChoice" | "DefaultChoiceText_Menu", values: Settings["DefaultChoice" | "DefaultChoiceText_Menu"], statusElement: HTMLElement | null = null) {
        const settings = await this.importAndExport.getSettings();
        
        const updatedSettings: Settings = {
            ...settings,
            [sectionKey]: values
        };
        await this.importAndExport.setSettings(updatedSettings);

        if (statusElement) {
            statusElement.textContent = "Saved!";
            setTimeout(() => statusElement.textContent = "", 2000);
        }
    }
    
    private getValuesFromElements(group: elementsInputAndMenu, data: Settings["DefaultChoice"] | Settings["DefaultChoiceText_Menu"] | null = null)  {
        const tags = data ? 
            Array.isArray( data.tags as (string | string[])) ? 
                data.tags : 
                    data.tags.map(tag => tag.trim()) : 
                (group.tags?.value || "").split(",").map(tag => tag.trim());
        return {
            Type: (data ? data?.Type : group.Type?.value) as AnyNovelType,
            status: (data ? data?.status : group.Status?.value) as AnyNovelStatus,
            tags: tags,
            notes: data ? data?.notes : (group.notes?.value || "")
        };
    }
    // Helper: write settings to inputs
    private setValuesToElements(group: elementsInputAndMenu, data: Settings["DefaultChoice"] | Settings["DefaultChoiceText_Menu"]) {
        if (!group || !data) return;
        if (group.Type) group.Type.value = data.Type;
        // if (group.chapter) group.chapter.value = data.chapter;
        if (group.Status) group.Status.value = data.status;
        const tags = (Array.isArray( data.tags) ? data.tags.join(", ") : data.tags)
        if (group.tags) group.tags.value = tags;
        if (group.notes) group.notes.value = data.notes;
    }

    private async ResetLoginAuth() {
        
        ext.storage.local.remove(["googleAccessToken", "googleTokenExpiry", "userEmail"], () => {
            console.log("OAuth credentials cleared");
        });
    }
    private populateSelect(selectEl: HTMLSelectElement | null, options: string[]) {
        if (!selectEl) throw new Error("Element not found");
        selectEl.innerHTML = "";
        options.forEach(value => {
            const opt = document.createElement("option");
            opt.value = value;
            opt.textContent = value;
            selectEl.appendChild(opt);
        });
    }

    // ---- Imports and Exports ----
    // -- Settings
    private async exportSettings() {
        await this.importAndExport.exportSettings();
    }
    private async importSettings(event: Event) {
        await this.importAndExport.importSettings(event);
    }
    // -- Hermidata
    private async exportHermidata() {
        await this.importAndExport.exportHermidata();
    }
    private async importHermidata(event: Event) {
        await this.importAndExport.importHermidata(event);
    }
    // -- RSS
    private async exportRSSBtn() {
        await this.importAndExport.exportRSSBtn();
    }
    private async importRSSBtn(event: Event) {
        await this.importAndExport.importRSSBtn(event);
    }

}