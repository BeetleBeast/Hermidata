import { getAllHermidata, getSettings, saveSettings } from "../../shared/db/Storage";
import { getElement } from "../../utils/Selection";
import { Build } from "../build";


export class TagColoring extends Build {

    private readonly tagColoring: Record<string, string> = {}; // { tag: color }

    constructor() {
        super();
    }

    public async init() {
        this.loadTagColoring();
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
    
                input.addEventListener("input", async () => {
                    this.tagColoring[tag] = input.value;
                    await this.saveTagColoring(this.tagColoring);
                });
            });
        }
    
        private async saveTagColoring(tagColoringInput: { [tag: string]: string }) {
            const settings = await getSettings();
            saveSettings({ ...settings, tagColoring: tagColoringInput });
            console.log("Tag colors saved.");
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
}