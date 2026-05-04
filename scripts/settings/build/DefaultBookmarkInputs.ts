import { DEFAULT_NOVEL_STATUSES, DEFAULT_NOVEL_TYPES, DEFAULT_READ_STATUSES, defaultSettings, type AnyNovelStatus, type AnyNovelType, type AnyReadStatus, type DefaultChoice, type elementsInputAndMenu, type ElmentsWithInputAndMenu, type Settings } from "../../shared/types";
import { getElement, setElement } from "../../utils/Selection";
import { Build } from "../build";


const setDefaultSettingsElements = () => {
    const elements: ElmentsWithInputAndMenu = {
        input: {
            Type: getElement<HTMLSelectElement>("#Type"),
            NovelStatus: getElement<HTMLSelectElement>("#NovelStatus"),
            ReadStatus: getElement<HTMLSelectElement>("#ReadStatus"),
            tags: getElement<HTMLInputElement>("#tags"),
            notes: getElement<HTMLInputElement>("#notes"),
            saveButton: getElement<HTMLButtonElement>("#saveDefaultInput")
        },
        menu: {
            Type: getElement<HTMLSelectElement>("#TypeTextMenu"),
            ReadStatus: getElement<HTMLSelectElement>("#ReadStatusTextMenu"),
            NovelStatus: getElement<HTMLSelectElement>("#NovelStatusTextMenu"),
            tags: getElement<HTMLInputElement>("#tagsTextMenu"),
            notes: getElement<HTMLInputElement>("#notesTextMenu"),
            saveButton: getElement<HTMLButtonElement>("#saveDefaultInputTextMenu")
        }
    };
    return elements;
}


export class DefaultBookmarkInputs extends Build {

    private readonly status_Input = getElement<HTMLParagraphElement>('#statusSaveDefaultInput');
    private readonly statusTextMenu = getElement<HTMLParagraphElement>('#statusSaveDefaultInputInputTextMenu');
    private readonly elements: ElmentsWithInputAndMenu = setDefaultSettingsElements();

    public async init() {

        const settings = await this.getSettings();

        // set values to inputs based on settings
        await this.LoadAndPopulate(settings);

        // Load & populate page inputs and tables
        await this.loadTableInput(settings);

        this.bindEvents();
    }

    private bindEvents() {
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
    }
    public async resetValues() {
        // remove all values from inputs
        this.setValuesToElements(this.elements.input, defaultSettings.DefaultBookmarkSettings.DefaultChoice);
        this.setValuesToElements(this.elements.menu, defaultSettings.DefaultBookmarkSettings.DefaultChoiceText_Menu);
    }
    public async cancelValues() {
        // reset page values to current settings
        const settings = await this.getSettings();
        await this.LoadAndPopulate(settings);
    }
    public async saveValues() {
        const valuesInput = this.getValuesFromElements(this.elements.input);
        this.updateSettings("DefaultChoice", valuesInput, this.status_Input);
        // Save table Menu
        const valuesMenu = this.getValuesFromElements(this.elements.menu);
        this.updateSettings("DefaultChoiceText_Menu", valuesMenu, this.statusTextMenu);
    }
    private async updateSettings(sectionKey: "DefaultChoice" | "DefaultChoiceText_Menu", values: DefaultChoice, statusElement: HTMLElement | null = null) {
        const settings = await this.getSettings();
        
        const updatedSettings: Settings = { 
            ...settings, DefaultBookmarkSettings: { 
                ...settings.DefaultBookmarkSettings, [sectionKey]: values 
            } 
        };

        await this.setSettings(updatedSettings);

        this.temporaryStatus("Saved!", statusElement);
    }


    private async loadTableInput(settings: Settings) {
        // load table input
        this.setValuesToElements(this.elements.input, settings.DefaultBookmarkSettings.DefaultChoice);
        this.setValuesToElements(this.elements.menu, settings.DefaultBookmarkSettings.DefaultChoiceText_Menu);
    }

    private async LoadAndPopulate(settings: Settings) {
        // Populate dropdowns
        this.populateSelect(this.elements.input.ReadStatus, settings.ContentTypesAndStatuses.STATUS_OPTIONS ?? DEFAULT_READ_STATUSES);
        this.populateSelect(this.elements.input.NovelStatus, settings.ContentTypesAndStatuses.NOVEL_STATUS_OPTIONS ?? DEFAULT_NOVEL_STATUSES);
        this.populateSelect(this.elements.input.Type, settings.ContentTypesAndStatuses.TYPE_OPTIONS ?? DEFAULT_NOVEL_TYPES);
        
        this.populateSelect(this.elements.menu.ReadStatus, settings.ContentTypesAndStatuses.STATUS_OPTIONS ?? DEFAULT_READ_STATUSES);
        this.populateSelect(this.elements.menu.NovelStatus, settings.ContentTypesAndStatuses.NOVEL_STATUS_OPTIONS ?? DEFAULT_NOVEL_STATUSES);
        this.populateSelect(this.elements.menu.Type, settings.ContentTypesAndStatuses.TYPE_OPTIONS ?? DEFAULT_NOVEL_TYPES);
    }

    private getValuesFromElements(group: elementsInputAndMenu, data: DefaultChoice | null = null): DefaultChoice {
        const tags = data ? 
            Array.isArray( data.tags as (string | string[])) ? 
                data.tags : 
                    data.tags.map(tag => tag.trim()) : 
                (group.tags?.value || "").split(",").map(tag => tag.trim());
        return {
            novelType: (data ? data?.novelType : group.Type?.value) as AnyNovelType,
            novelStatus: (data ? data?.novelStatus : group.NovelStatus?.value) as AnyNovelStatus,
            readStatus: (data ? data?.readStatus : group.ReadStatus?.value) as AnyReadStatus,
            tags: tags,
            notes: data ? data?.notes : (group.notes?.value || "")
        };
    }
    // Helper: write settings to inputs
    private setValuesToElements(group: elementsInputAndMenu, data: DefaultChoice ): void {
        if (!group || !data) return;
        if (group.Type) group.Type.value = data.novelType ?? group.Type.value;
        if (group.ReadStatus) group.ReadStatus.value = data.readStatus ?? group.ReadStatus.value;
        if (group.NovelStatus) group.NovelStatus.value = data.novelStatus ?? group.NovelStatus.value;
        const tags = (Array.isArray( data.tags) ? data.tags.join(", ") : data.tags)
        if (group.tags) group.tags.value = tags ?? group.tags.value;
        if (group.notes) group.notes.value = data.notes ?? group.notes.value;
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
}