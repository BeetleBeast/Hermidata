import { ext } from "../shared/BrowserCompat";
import { getSettings } from "../shared/db/Storage";
import type { Settings } from "../shared/types/index";
import { getElement } from "../utils/Selection";



export class FolderMapping {

    private readonly FinishedMappingContainer = getElement('#folderMappingContainer');
    private readonly Container = getElement('#newFolderMappingContainer');
    private readonly Select = getElement<HTMLSelectElement>('#newFolderMappingSelect');
    private readonly PathInput = getElement<HTMLInputElement>('#newFolderMappingPath');
    private readonly SaveBtn = getElement<HTMLButtonElement>('#addFolderMapping');

    constructor() {
        
        this.SaveBtn?.addEventListener('click', () => this.saveFolderMapping());
    }

    async init() {
        // get current OR a default settings
        const settings = await getSettings();

        // build front-end
        this.buildFolderMappingForm(settings);
    }

    private buildFolderMappingForm(settings: Settings) {
        // build front-end

        // build select
        const novelTypes = settings.NOVEL_TYPE_OPTIONS_V3;
        const readStatus = settings.READ_STATUS_OPTIONS_V2;
        const novelStatus = settings.NOVEL_STATUS_OPTIONS_V2;
        const selectList = [...novelTypes, ...readStatus, ...novelStatus];
        this.populateSelect(this.Select, selectList);
    }



    private populateSelect(selectEl: HTMLSelectElement | null, options: string[]) {
        if (!selectEl) throw new Error("Element not found");
        selectEl.innerHTML = "";
        selectEl.appendChild(this.createEmptyOption());
        options.forEach(value => {
            const opt = document.createElement("option");
            opt.value = value;
            opt.textContent = value;
            selectEl.appendChild(opt);
        });
    }
    private createEmptyOption() {
        const opt = document.createElement("option");
        opt.value = '';
        opt.textContent = '---';
        return opt;
    }

    private saveFolderMapping() {
        // save folder mapping
        
        // create container
        const container = this.Container?.cloneNode(true);
        if (!container || !this.Select || !this.PathInput) return;

        // add it to folderMappingContainer
        this.FinishedMappingContainer?.appendChild(container);
        // add it to settings
        this.saveToSettings(this.Select.selectedIndex, this.PathInput);

        // reset form
        this.Select.options[0].selected = true;
        this.PathInput.value = '';
    }
    private saveToSettings(selectedIndex: number, input: HTMLInputElement) { //NOTE! 0 is empty it starts at 1
        if ((selectedIndex === 0 || selectedIndex === -1) || input.value === '') return;
        // save to settings

    }

    private saveSettings(sectionKey: string, values: any, statusElement: HTMLElement | null = null) {
        ext.storage.sync.get(["Settings"], (result: { Settings: Settings }) => {
            const updatedSettings: Settings = {
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
}