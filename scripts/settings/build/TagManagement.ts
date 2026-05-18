import { ext } from "../../shared/BrowserCompat";
import { defaultSettings, type Hermidata, type Settings } from "../../shared/types";
import { getElement } from "../../utils/Selection";
import { Build } from "../build";

export class TagManagement extends Build {

    private allTagsUsed: Map<number, string> = new Map();
    
    private readonly tagColoring: Record<string, string> = {}; // { tag: color }


    private readonly addTag = getElement<HTMLButtonElement>("#addTag");
    private readonly addTagBtn = getElement<HTMLInputElement>("#addTagBtn");
    
    private readonly tagEditContainer = getElement<HTMLDivElement>("#tagEditContainer");

    private readonly colorTagsBtn = getElement<HTMLInputElement>("#saveTagColoringBtn");

    private readonly tagMergeSelect1 = getElement<HTMLSelectElement>("#tagMergeSelect1");
    private readonly tagMergeSelect2 = getElement<HTMLSelectElement>("#tagMergeSelect2");
    private readonly mergeTagsBtn = getElement<HTMLInputElement>("#mergeTags");


    private maxSetColorCount = 0;

    public async init() {
        this.allTagsUsed = await this.getAllTagsUsed();

        // color tags
        await this.loadTagColoring();
        // update/remove tag
        this.populateUpdateRemoveTagForm();
        // merge tags
        this.populateTagMergeSelect();

        this.bindEvents();
    }
    private async ReloadForms() {
        await this.init();
    }
    public async resetValues() {
        // reset settings in IndexedDB
        const settings = await this.getSettings();
        settings.TagManagement = defaultSettings.TagManagement;
        await this.setSettings(settings);
        await this.ReloadForms();
    }
    public async cancelValues() {
        // reset page values to current settings
        await this.ReloadForms();
    }
    public async saveValues() {
        // TODO: implement if needed, currently values are saved immediately on change
        // no page values to save, since all actions are tag-based
    }

    private populateUpdateRemoveTagForm() {
        if (!this.tagEditContainer) return;
        this.tagEditContainer.innerHTML = "";
        const allTagsUsed = Array.from(this.allTagsUsed.values());
        for ( const tag of allTagsUsed ) this.CreateEditAndRemoveDiv(this.tagEditContainer, tag);

    }
    private CreateEditAndRemoveDiv(container: HTMLDivElement, input: string ): HTMLDivElement {
        if (!container) return container;

        const item = document.createElement("div");
        item.classList = "EditORemoveItem";

        const inputElement = document.createElement("input");
        inputElement.type = "text";
        inputElement.classList = "EditORemoveItem-input";
        inputElement.id = `editTagInput-${input}`;
        inputElement.value = input;
        inputElement.dataset.tag = input;

        const updateBtn = document.createElement("button");
        updateBtn.type = "button";
        updateBtn.classList = "EditORemoveItem-updateBtn";
        updateBtn.textContent = "Update";
        updateBtn.addEventListener("click", () => {
            const editTagInput = getElement<HTMLInputElement>(`#editTagInput-${input}`);
            if (!editTagInput) return;
            const oldValue = editTagInput.dataset.tag;
            const value = editTagInput.value;
            if (value === oldValue || !value || !oldValue) return;
            this.updateTag(oldValue, value);
            this.updateTagColor(this.tagColoring);
        });
        const tagColoringInput = this.buildTagColoringForm(input);

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.classList = "EditORemoveItem-removeBtn";
        removeBtn.textContent = "Remove";
        removeBtn.addEventListener("click", () => {
            item.remove(); // remove front-end
            this.deleteTag(input); // remove back-end
        });

        item.append(inputElement, tagColoringInput, updateBtn, removeBtn);
        container.appendChild(item);
        return container;
    }
    private populateTagMergeSelect() {
        for (const tag of this.allTagsUsed.values()) {
            const option = document.createElement("option");
            option.classList = "tag-merge-select-option_1";
            option.value = tag;
            option.text = tag;
            this.tagMergeSelect1?.add(option);
        }
        for (const tag of this.allTagsUsed.values()) {
            const option = document.createElement("option");
            option.classList = "tag-merge-select-option_2";
            option.value = tag;
            option.text = tag;
            this.tagMergeSelect2?.add(option);
        }
    }

    private bindEvents() {
        this.addTagBtn?.addEventListener("click", async () => {
            await this.addNewTag();
            await this.ReloadForms();
        });
        this.mergeTagsBtn?.addEventListener("click", async () => {
            const toBeRemoved = this.tagMergeSelect1
            const toSurvive = this.tagMergeSelect2
            if (!toBeRemoved || !toSurvive) return;
            const toBeRemovedValue = toBeRemoved.value;
            const toSurviveValue = toSurvive.value;
            if (!toBeRemovedValue || !toSurviveValue || toBeRemovedValue === toSurviveValue) return;
            await this.mergeTags(toBeRemovedValue, toSurviveValue);
            await this.ReloadForms();
        });
        this.colorTagsBtn?.addEventListener("click", async () => {
            await this.saveAllTagColoring();
            await this.ReloadForms();
        })
    }
    private async addNewTag() {
        const settings = await this.getSettings();
        const newTag = this.addTag?.value;
        if (newTag) {
            settings.TagManagement.tagColoring[newTag] = this.setNewColor();
            await this.setSettings(settings);
        }
    }
    private setNewColor() {
        // get all colors used
        const allColors = Object.values(this.tagColoring);
        // put all colors in an set
        const allColorsSet = new Set(allColors);
        // get a random color that is not in the set
        const randomColor = this.getRandomColor(allColorsSet);
        return randomColor;
    }
    private getRandomColor(usedColorSet: Set<string>): string {
        // generate a random string of numbers length 6
        const randomString = Math.floor(Math.random() * 16777215).toString(16);
        // convert the string to a hex color
        const randomColor = `#${randomString}`;
        // check if the color is in the set
        if (usedColorSet.has(randomColor) && this.maxSetColorCount < 20) {
            // if it is, call the function again
            this.maxSetColorCount++;
            return this.getRandomColor(usedColorSet);
        }
        // if it is not, return the color
        this.maxSetColorCount = 0;
        return randomColor;
    }

    private async getAllTagsUsed(): Promise<Map<number, string>> {
        const allHermidataRecord = await this.getAllHermidata();
        const allHermidata = Object.values(allHermidataRecord);
        const allTagsUsed = allHermidata.flatMap(item => item.meta?.tags || []);
        const tagsSet = new Set(allTagsUsed);
        const allUniqueTags = Array.from(tagsSet).filter(tag => tag !== '');
        return new Map(allUniqueTags.entries());
    }

    private buildTagColoringForm(tag: string) {
        const input = document.createElement("input");
        input.classList.add("tagColoringInput");
        input.type = "color";
        input.value = this.tagColoring[tag];
        input.dataset.tag = tag;
        input.dataset.color = this.tagColoring[tag];

        input.addEventListener("input", async () => {
            this.tagColoring[tag] = input.value;
            await this.saveTagColoring(this.tagColoring);
        });
        return input;
    }
    private async saveAllTagColoring() {
        await this.saveTagColoring(this.tagColoring);
        console.log("Tag colors saved.");
    }
    private async saveTagColoring(tagColoringInput: { [tag: string]: string }) {
        const settings = await this.getSettings();
        await this.setSettings({ ...settings, TagManagement: { ...settings.TagManagement, tagColoring: tagColoringInput } });
        console.log("Tag colors saved.");
    }


    private async loadTagColoring() {
        const Settings = await this.getSettings();
        const defaultTagColoring = await this.createDefaultTagColor();
        const storedTagColoring = Object.keys(Settings.TagManagement.tagColoring).length > 0 ? Settings.TagManagement.tagColoring : defaultTagColoring;
        Object.assign(this.tagColoring, storedTagColoring);
        await this.updateTagColor(storedTagColoring);
    }
    private async createDefaultTagColor(): Promise<{ [tag: string]: string }> {
        const defaultColor = 'white';
        const defaultTagColor: { [tag: string]: string } = {};
        this.allTagsUsed.forEach(tag => defaultTagColor[tag] = defaultColor );
        return defaultTagColor
    }
    private async updateTagColor(alreadyExist: { [tag: string]: string }) {
        this.allTagsUsed.forEach(f => { if (!alreadyExist[f]) this.tagColoring[f] = 'white' })
    }
    private async updateTag(oldTag: string, newTag: string) {
        const Settings = await this.getSettings();

        // update color of new tag
        this.tagColoring[newTag] = this.tagColoring[oldTag];
        delete this.tagColoring[oldTag];
        await this.setSettings({ ...Settings, TagManagement: { ...Settings.TagManagement, tagColoring: this.tagColoring } });

        // update all hermidata
        const allHermidata = await this.getAllHermidata();
        for (const hermidata of Object.values(allHermidata)) {
            if (hermidata.meta?.tags && hermidata.meta.tags.includes(oldTag)) {
                hermidata.meta.tags = hermidata.meta.tags.map(t => t === oldTag ? newTag : t);
                await this.setHermidata(hermidata);
            }
        }
        await this.ResetLocalFilters();
    }
    private async deleteTag(tag: string) {
        // remove tag color
        delete this.tagColoring[tag];
        await this.saveAllTagColoring();

        // remove all instance of tag
        const allHermidata = await this.getAllHermidata();
        for (const hermidata of Object.values(allHermidata)) {
            if (hermidata.meta?.tags && hermidata.meta.tags.includes(tag)) {
                hermidata.meta.tags = hermidata.meta.tags.filter(t => t !== tag);
                await this.setHermidata(hermidata);
            }
        }
        await this.ResetLocalFilters();
    }
    private async mergeTags(toBeRemovedTag: string, trueTag: string) {
        const allHermidata = await this.getAllHermidata();
        for (const hermidata of Object.values(allHermidata)) {
            if (hermidata.meta?.tags && hermidata.meta.tags.includes(toBeRemovedTag)) {
                hermidata.meta.tags = hermidata.meta.tags.map(t => t === toBeRemovedTag ? trueTag : t);
                await this.setHermidata(hermidata);
            }
        }
        await this.ResetLocalFilters();
    }

    private async getAllHermidata(): Promise<Record<string, Hermidata>> {
        const getAllHermidataList = await this.dbRequest<Hermidata[]>('hermidata', 'getAll');
        return Object.fromEntries(getAllHermidataList.map(h => [h.id, h]));
    }
}