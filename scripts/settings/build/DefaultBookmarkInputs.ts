import { DEFAULT_NOVEL_STATUSES, DEFAULT_NOVEL_TYPES, DEFAULT_READ_STATUSES, defaultSettings } from "../../shared/constants";
import { type AnyNovelStatus, type AnyNovelType, type AnyReadStatus, type DefaultChoice, type elementsInputAndMenu, type ElementsWithInputAndMenu, type Settings } from "../../shared/types";
import { getElement } from "../../shared/utils/Selection";
import { Build } from "../build";
import { TagAutocomplete } from "../../popup/core/Tags";


const setDefaultSettingsElements = () => {
    const elements: ElementsWithInputAndMenu = {
        input: {
            Type: getElement<HTMLSelectElement>("#Type"),
            NovelStatus: getElement<HTMLSelectElement>("#NovelStatus"),
            ReadStatus: getElement<HTMLSelectElement>("#ReadStatus"),
            tags: getElement<HTMLInputElement>("#tags"),
            notes: getElement<HTMLTextAreaElement>("#notes"),
            saveButton: getElement<HTMLButtonElement>("#saveDefaultInput")
        },
        menu: {
            Type: getElement<HTMLSelectElement>("#TypeTextMenu"),
            ReadStatus: getElement<HTMLSelectElement>("#ReadStatusTextMenu"),
            NovelStatus: getElement<HTMLSelectElement>("#NovelStatusTextMenu"),
            tags: getElement<HTMLInputElement>("#tagsTextMenu"),
            notes: getElement<HTMLTextAreaElement>("#notesTextMenu"),
            saveButton: getElement<HTMLButtonElement>("#saveDefaultInputTextMenu")
        }
    };
    return elements;
}


export class DefaultBookmarkInputs extends Build {

    private readonly status_Input = getElement<HTMLParagraphElement>('#statusSaveDefaultInput');
    private readonly statusTextMenu = getElement<HTMLParagraphElement>('#statusSaveDefaultInputInputTextMenu');
    private readonly elements: ElementsWithInputAndMenu = setDefaultSettingsElements();
    private tagAutocomplete: TagAutocomplete | null = null;

    public async init() {

        const settings = await this.ensureSettingsUpToDate();

        // set values to inputs based on settings
        await this.LoadAndPopulate(settings);

        // Load & populate page inputs and tables
        await this.loadTableInput(settings);

        this.tagAutocomplete = new TagAutocomplete(await this.getAllHermidata());
        this.bindTagAutocomplete();
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
    private bindTagAutocomplete() {
        const fields = [
            [this.elements.input.tags, getElement<HTMLSpanElement>("#tagsDefaultGhost")],
            [this.elements.menu.tags, getElement<HTMLSpanElement>("#tagsTextMenuGhost")]
        ] as const;

        fields.forEach(([input, ghost]) => {
            if (!input || !ghost) return;
            input.addEventListener("input", () => this.updateTagSuggestion(input, ghost));
            input.addEventListener("blur", () => {
                ghost.textContent = "";
                delete ghost.dataset.suggestion;
            });
            input.addEventListener("keydown", event => {
                const suggestion = ghost.dataset.suggestion;
                if (event.key === "Escape") {
                    ghost.textContent = "";
                    delete ghost.dataset.suggestion;
                    return;
                }
                if (!suggestion || !["Tab", "Enter", "ArrowRight"].includes(event.key)) return;
                if (event.key === "ArrowRight" && input.selectionStart !== input.value.length) return;
                event.preventDefault();

                const commaIndex = input.value.lastIndexOf(",");
                const existingTags = input.value.slice(0, commaIndex < 0 ? 0 : commaIndex)
                    .split(",").map(tag => tag.trim().toLowerCase());
                if (existingTags.includes(suggestion.toLowerCase())) return;

                const previousTags = commaIndex < 0 ? "" : `${input.value.slice(0, commaIndex + 1).trimEnd()} `;
                input.value = `${previousTags}${suggestion}, `;
                ghost.textContent = "";
                delete ghost.dataset.suggestion;
                input.dispatchEvent(new Event("input", { bubbles: true }));
            });
        });
    }
    private updateTagSuggestion(input: HTMLInputElement, ghost: HTMLSpanElement) {
        ghost.textContent = "";
        delete ghost.dataset.suggestion;
        if (!this.tagAutocomplete) return;

        const value = input.value;
        const currentTag = value.slice(value.lastIndexOf(",") + 1).trimStart();
        if (!currentTag) return;
        const suggestion = this.tagAutocomplete.getSuggestions(currentTag, 1)[0];
        if (!suggestion || !suggestion.toLowerCase().startsWith(currentTag.toLowerCase()) || suggestion.length === currentTag.length) return;

        const context = document.createElement("canvas").getContext("2d");
        if (!context) return;
        context.font = getComputedStyle(input).font;
        const padding = Number.parseFloat(getComputedStyle(input).paddingLeft) || 0;
        ghost.style.left = `${padding + context.measureText(value).width}px`;
        ghost.textContent = suggestion.slice(currentTag.length);
        ghost.dataset.suggestion = suggestion;
    }
    public async resetValues() {
        // remove all values from inputs
        this.setValuesToElements(this.elements.input, defaultSettings.DefaultBookmarkSettings.DefaultChoice);
        this.setValuesToElements(this.elements.menu, defaultSettings.DefaultBookmarkSettings.DefaultChoiceText_Menu);
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