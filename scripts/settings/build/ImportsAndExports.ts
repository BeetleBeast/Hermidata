import { ext } from "../../shared/utils/BrowserCompat";
import type { AnyNovelType, Hermidata, RawFeed } from "../../shared/types";
import type { quickBackup, Settings } from "../../shared/types/settings"
import { getElement } from "../../shared/utils/Selection";

import { Build } from "../build";
import { AutoSetAllHermidata } from "../../shared/utils/AutoSetAllHermidata";
import { levenshteinDistance } from "../../popup/core/Past";

declare const browser: typeof chrome | undefined;

export class ImportsAndExports extends Build {

    private readonly devMode: boolean;

    private finalAllHermidatas: Record<string, Hermidata> = {};

    private massImportFromBookmarkFolderSuggestion: string | null = null;
    private allAbsPath: string[] = [];

    private readonly massImportFromBookmarkFolderBtn = getElement<HTMLButtonElement>("#massImportFromBookmarkFolderBtn");
    private readonly massImportFromBookmarkFolderCheckContainer = getElement<HTMLDivElement>("#massImportFromBookmarkFolderCheckContainer");
    private readonly massImportFromBookmarkFolder = getElement<HTMLInputElement>("#bookmarkFolder");
    private readonly massImportFromBookmarkFolderSaveAllBtn = getElement<HTMLButtonElement>("#massImportFromBookmarkFolder-saveAllBtn");
    private readonly massImportFromBookmarkFolderGhostText = getElement<HTMLParagraphElement>("#massImportFromBookmarkFolderGhostText");
    private readonly massImportFromBookmarkFolderStatus = getElement<HTMLDivElement>("#massImportFromBookmarkFolderStatus");

    constructor(devMode = false) {
        super();
        this.devMode = devMode;
    }

    public async init() {

        if (this.devMode) {
            getElement("#exportRSSBtn")!.dataset.active = "true";
            getElement("#importRSSBtn")!.dataset.active = "true";

            getElement("#exportSyncDataBtn")!.dataset.active = "true";
            getElement("#importSyncDataBtn")!.dataset.active = "true";
            getElement("#deleteSyncDataBtn")!.dataset.active = "true";
        }

        this.bindEvents();
    }
    
    private bindEvents() {
        getElement("#exportBtn")?.addEventListener("click", () => this.exportSettings());
        getElement("#importBtn")?.addEventListener("change", (e) => this.importSettings(e));
        
        getElement("#exportDataBtn")?.addEventListener("click", () => this.exportHermidata() );
        getElement("#importDataBtn")?.addEventListener("change", (e) => this.importHermidata(e) );
        
        getElement("#exportFolderMappingBtn")?.addEventListener("click", () => this.exportFolderMapping());
        getElement("#importFolderMappingBtn")?.addEventListener("change", (e) => this.importFolderMapping(e));

        getElement("#quickBackup")?.addEventListener("click", () => this.quickBackup());

        this.massImportFromBookmarkFolderBtn?.addEventListener("click", () => this.massImportFromBookmarkFolderBtnClick());
        this.massImportFromBookmarkFolderSaveAllBtn?.addEventListener("click", () => this.massImportFromBookmarkFolderSaveAllBtnClick());

        // add ghost text on change
        this.massImportFromBookmarkFolder?.addEventListener('input', async () => {
            const rule = this.massImportFromBookmarkFolder?.value.trim();
            const ghostText = this.massImportFromBookmarkFolderGhostText;
            if (!rule || !ghostText) return;
            const completeSuggestions = await this.getSuggestions(rule);
            const fullSuggestion = completeSuggestions.length > 0 ? completeSuggestions[0] : null;
            if (fullSuggestion) {
                const suggestion = this.cutSuggestion(fullSuggestion, rule);
                this.massImportFromBookmarkFolderSuggestion = suggestion;
                this.massImportFromBookmarkFolderGhostText.textContent = suggestion;
            }
        });
        // pressing tab on custom rule input autocompletes the ghost text
        this.massImportFromBookmarkFolder?.addEventListener('keydown', async (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                this.setGhostTextForCustomRule();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                this.setGhostTextForCustomRule();
            } else if (e.key === 'Escape') {
                this.massImportFromBookmarkFolderSuggestion = null;
                this.massImportFromBookmarkFolderGhostText!.textContent = '';
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                this.setGhostTextForCustomRule();
            }
        });

        if (this.devMode) {
            getElement("#exportRSSBtn")?.addEventListener("click", () => this.exportRSSBtn() );
            getElement("#importRSSBtn")?.addEventListener("change", (e) => this.importRSSBtn(e) );

            getElement("#exportSyncDataBtn")?.addEventListener("click", () => this.exportSyncData());
            getElement("#importSyncDataBtn")?.addEventListener("change", (e) => this.importSyncData(e));
            getElement("#deleteSyncDataBtn")?.addEventListener("click", () => this.deleteSyncData());
        }
    }
    private async getAllPossiblePathsFromBackground(rootPath: string | null): Promise<string[] | null> {
        const result = new Promise<string[] | null>((resolve, reject) => {
            ext.runtime.sendMessage({ type: 'GET_ALL_POSSIBLE_PATHS', data: rootPath }, (response: { data: string[] }) => {
                if (ext.runtime.lastError) reject(new Error(ext.runtime.lastError.message));
                else resolve(response.data ?? null);
            });
        });
        return result;
    }
    private async getAllPossiblePaths(): Promise<string[] | null> {
        // Implementation for getting all possible paths
        const rootPath = this.getBrowserRoot();
        // send request to background
        return await this.getAllPossiblePathsFromBackground(rootPath);
    }
    // Remake suggestions
    private async getSuggestions(input: string, limit = 1): Promise<string[]> {
        if (!input.trim()) return [];
        
        if (this.allAbsPath.length === 0) {
            // Populate allAbsPath with all possible folder names from typeAliases and statusFolders
            const allPossiblePaths = await this.getAllPossiblePaths();
            if (allPossiblePaths) this.allAbsPath = allPossiblePaths;
            else return [];
        }

        const normalized = input.toLowerCase().trim();

        const allPathValues = Array.from(this.allAbsPath)
        
        // Exact match first
        const exact = allPathValues.filter(tag => 
            tag.toLowerCase() === normalized
        );
        
        // Starts with
        const startsWith = allPathValues.filter(tag => 
            tag.toLowerCase().startsWith(normalized) &&
            !exact.includes(tag)
        );
        
        // Contains
        const contains = allPathValues.filter(tag => 
            tag.toLowerCase().includes(normalized) && 
            !exact.includes(tag) && 
            !startsWith.includes(tag)
        );
        
        // Fuzzy match (Levenshtein distance)
        const fuzzy = allPathValues
            .filter(path => !exact.includes(path) && !startsWith.includes(path) && !contains.includes(path))
            .map(path => ({
                path,
                distance: levenshteinDistance(normalized, path.toLowerCase())
            }))
            .filter(({ distance }) => distance <= 3) // Max 3 character difference
            .sort((a, b) => a.distance - b.distance)
            .map(({ path }) => path);
        
        return [...exact, ...startsWith, ...contains, ...fuzzy].slice(0, limit);
    }
    private cutSuggestion(suggestion: string, rule: string): string {
        // example suggestion: /home/user/novel/onepiece/onepiece-1/onepiece-1
        // example rule: /home/user/
        // result: /home/user/novel/
        
        // Normalize rule to ensure it doesn't end with /
        const normalizedRule = rule.endsWith('/') ? rule.slice(0, -1) : rule;
        
        // Check if suggestion starts with the rule
        if (!suggestion.startsWith(normalizedRule)) return suggestion;
        
        // Get the part after the rule
        const afterRule = suggestion.slice(normalizedRule.length);
        
        // Split and get first segment after rule
        const segments = afterRule.split('/').filter(s => s.length > 0);
        
        if (segments.length === 0) return normalizedRule + '/';

        // if normalizedRule is only a section of the suggestion, don't add a trailing slash
        const firstsegment = suggestion.at(normalizedRule.length) === '/' ? '/' + segments[0] : segments[0];
        
        // Return rule + first directory after it
        return normalizedRule + firstsegment + '/';
    }
    private setGhostTextForCustomRule() {
        if (!this.massImportFromBookmarkFolderSuggestion) return;
        const rule = this.massImportFromBookmarkFolder?.value.trim();
        const ghostText = this.massImportFromBookmarkFolderGhostText;
        if (!rule || !ghostText) return;
        this.massImportFromBookmarkFolderGhostText.textContent = "";
        this.massImportFromBookmarkFolder!.value = this.massImportFromBookmarkFolderSuggestion;
        this.massImportFromBookmarkFolderSuggestion = null;
    }
    public async resetValues() {
        // no page values to reset, since all actions are file-based
    }
    public async cancelValues() {
        // no page values to reset, since all actions are file-based
    }
    public async saveValues() {
        // no page values to save, since all actions are file-based
    }

    // Export Settings as JSON
    private async exportSettings() {
        // Ensure settings are up to date
        const updatedSettings = await this.ensureSettingsUpToDate();

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
    }
    private async importSettings(event: Event) {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file) return
        try {
            const importedData = await new Blob([file]).text();
            
            const existingData = await this.dbRequest<Settings>('settings', 'get', { id: 'Settings', data: null });
            const mergedData: Settings = { ...existingData, ...JSON.parse(importedData) };
            await this.dbRequest<Settings>('settings', 'put', { id: 'Settings', data: mergedData});

            alert("Settings imported successfully!");
        } catch (err) {
            console.error("Failed to parse JSON:", err);
            alert("Invalid JSON format.");
        }
    };

    private async exportHermidata() {
        try {
            const DataList = await this.dbRequest<Hermidata[]>('hermidata', 'getAll');
            const Data = Object.fromEntries(DataList.map(h => [h.id, h]));
            
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

    private async importHermidata(event: Event) {
        const target = event.target as HTMLInputElement;
        const file = target?.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const target = e.target ?? null;
                const importedData: Record<string, Hermidata> = JSON.parse(target?.result as string);

                // Get existing storage
                const existingDataList =  await this.dbRequest<Hermidata[]>('hermidata', 'getAll');
                const existingData = Object.fromEntries(existingDataList.map(h => [h.id, h]));

                // Merge
                const mergedDataRecord = { ...existingData, ...importedData };

                // Save merged result
                await this.dbRequest<void>('hermidata', 'putAll', { id: 'hermidata', data: mergedDataRecord });

                console.log("Hermidata import + merge complete!");
            } catch (error) {
                console.error("Extension error: Failed importHermidata:", error);
            }
        };
        reader.readAsText(file);
    }

    private async importRSSBtn(event: Event) {
        const target = event.target as HTMLInputElement;
        const file = target?.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const target = e.target ?? null;
                const importedData: RawFeed[] = JSON.parse(target?.result as string);

                // Get existing storage
                const existingData = await this.dbRequest<RawFeed[]>('feeds', 'getAll');

                // Merge
                const mergedData: RawFeed[] = { ...existingData, ...importedData };

                // Save merged result
                await this.dbRequest<void>('feeds', 'putAll', { id: 'feeds', data: mergedData });

                console.log("Hermidata import + merge complete!");
            } catch (error) {
                console.error("Extension error: Failed importHermidata:", error);
            }
        };
        reader.readAsText(file);
    }

    private async exportRSSBtn() { // possible rss
        try {
            const DataList = await this.dbRequest<RawFeed[]>('feeds', 'getAll');;
            const Data = Object.fromEntries(DataList.map(h => [h.url, h]));
            
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

    private async exportFolderMapping() {
        try {
            const settings = await this.getSettings();
            const folderMapping = settings.FolderMapping;
            
            const jsonSTR = JSON.stringify(folderMapping, null, 2);
            const blob = new Blob([jsonSTR], { type: "application/json" });
            const url = URL.createObjectURL(blob);
        
            const a = document.createElement("a");
            a.href = url;
            a.download = "folderMapping.json";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Extension error: Failed exportFolderMapping: ", error)
        }
    }

    private async importFolderMapping(event: Event) {
        const target = event.target as HTMLInputElement;
        const file = target?.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const target = e.target ?? null;
                const importedData: Settings['FolderMapping'] = JSON.parse(target?.result as string);

                // Get existing storage
                const settings = await this.getSettings();
                const existingData = (await this.getSettings()).FolderMapping;

                // Merge folderMapping
                const mergedDataObject = { ...existingData, ...importedData };
                // Merge Settings
                const mergedSettings = { ...settings, FolderMapping: mergedDataObject };
                // Save merged result
                await this.setSettings( mergedSettings );

                console.log("FolderMapping import + merge complete!");
            } catch (error) {
                console.error("Extension error: Failed FolderMapping import:", error);
            }
        };
        reader.readAsText(file);
    }
    

    // backup sync
    private async exportSyncData() {
        try {
            // get SyncData
            const data = await ext.storage.sync.get(null);
            
            const jsonSTR = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonSTR], { type: "application/json" });
            const url = URL.createObjectURL(blob);
        
            const a = document.createElement("a");
            a.href = url;
            a.download = "syncData_backup.json";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Extension error: Failed exportSyncData: ", error)
        }
    }
    // delete sync
    private async deleteSyncData() {
        try {
            await ext.storage.sync.clear();
            console.log("SyncData deleted!");
        } catch (error) {
            console.error("Extension error: Failed deleteSyncData: ", error)
        }
    }
    // import sync
    private async importSyncData(event: Event) {
        const target = event.target as HTMLInputElement;
        const file = target?.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const target = e.target ?? null;
                const importedData: { [key: string]: unknown } = JSON.parse(target?.result as string);

                // Get existing storage
                const existingData = (await ext.storage.sync.get(null));

                // Merge folderMapping
                const mergedDataObject = { ...existingData, ...importedData };
                // Merge Settings
                // Save merged result
                await ext.storage.sync.set(mergedDataObject);

                console.log("FolderMapping import + merge complete!");
            } catch (error) {
                console.error("Extension error: Failed FolderMapping import:", error);
            }
        };
        reader.readAsText(file);
    }
    private async quickBackup() {
        try {
            // get Settings, Hermidata, RSSData, SyncData
            const [updatedSettings, hermidataList, RSSDataList, SyncData ] = await Promise.all([
                this.ensureSettingsUpToDate(),
                this.dbRequest<Hermidata[]>('hermidata', 'getAll'),
                this.dbRequest<RawFeed[]>('feeds', 'getAll'),
                ext.storage.sync.get(null)
            ])
            const hermidata = Object.fromEntries(hermidataList.map(h => [h.id, h]));
            const RSSData = Object.fromEntries(RSSDataList.map(h => [h.url, h]));

            const BackupData: quickBackup = {
                Settings: updatedSettings,
                Hermidata: hermidata,
                RSSData: this.devMode ? RSSData : undefined,
                SyncData: this.devMode ? SyncData : undefined
            }

            
            const jsonSTR = JSON.stringify(BackupData, null, 2);
            const blob = new Blob([jsonSTR], { type: "application/json" });
            const url = URL.createObjectURL(blob);
        
            const a = document.createElement("a");
            a.href = url;
            a.download = "QuickBackup.json";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Extension error: Failed quickBackup: ", error)
        }
    }

    private async massImportFromBookmarkFolderBtnClick() {
        // get all Hermidata
        const DataList = await this.dbRequest<Hermidata[]>('hermidata', 'getAll');
        const allHermidata: Record<string, Hermidata>  = Object.fromEntries(DataList.map(h => [h.id, h]));
        const settings = await this.getSettings();
        const allNovelTypes = settings.ContentTypesAndStatuses.TYPE_OPTIONS;
        
        // get folder path
        const folderPath = this.massImportFromBookmarkFolder?.value.trim() ?? null;
        if (!folderPath) return;
        // get all potential hermidata
        const importFromBookmarkFolder = new AutoSetAllHermidata(allHermidata, allNovelTypes);
        const newHermidatas = await importFromBookmarkFolder.getAllPotentialHermidata(folderPath, this.getBrowserRoot());
        if (!newHermidatas?.length) return;
        // set all values in settings to be reviewed
        const Hermidatas: Record<string, Hermidata> = newHermidatas.reduce((acc, hermidata) => ({ ...acc, [hermidata.id]: hermidata }), {});
        this.reviewAllHermidatas(Hermidatas, allNovelTypes);

    }
    private reviewAllHermidatas(hermidatas: Record<string, Hermidata>, allNovelTypes: AnyNovelType[] = []) {
        if (!this.massImportFromBookmarkFolderCheckContainer) return;

        this.massImportFromBookmarkFolderCheckContainer.innerHTML = '';

        this.finalAllHermidatas = {...hermidatas};

        for (const hermidata of Object.values(hermidatas)) {
            const item = this.createHermidataReviewItem(hermidata, allNovelTypes);
            
            this.massImportFromBookmarkFolderCheckContainer.appendChild(item);
        }
    }
    private createHermidataReviewItem(hermidata: Hermidata, allNovelTypes: AnyNovelType[]): HTMLTableRowElement {
        const item = document.createElement('tr');
        item.className = 'massImportFromBookmarkFolder-item';
        item.id = hermidata.id;

        // create label
        const label = document.createElement('td');
        label.classList.add('massImportFromBookmarkFolder-label', 'tableCell-MIfBF');
        label.textContent = hermidata.title;
        // create link to page
        const linkCell = document.createElement('td');
        linkCell.classList.add('tableCell-MIfBF');
        const link = document.createElement('a');
        link.className = 'massImportFromBookmarkFolder-link';
        link.href = hermidata.url;
        link.textContent = hermidata.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        linkCell.appendChild(link);
        // create Novel Type changer input
        const NovelTypeCell = document.createElement('td');
        NovelTypeCell.classList.add('tableCell-MIfBF');
        const NovelTypeChanger = document.createElement('select');
        NovelTypeChanger.className = 'massImportFromBookmarkFolder-NovelTypeChanger';

        for (const novelType of Object.values(allNovelTypes)) {
            const option = document.createElement('option');
            option.value = novelType;
            option.textContent = novelType;
            NovelTypeChanger.appendChild(option);
        }
        NovelTypeChanger.value = hermidata.novelType ?? allNovelTypes[0]; // default
        NovelTypeChanger.addEventListener('change', () => {
            this.finalAllHermidatas[hermidata.id].novelType = NovelTypeChanger.value as AnyNovelType;
        });
        NovelTypeCell.appendChild(NovelTypeChanger);
        // create buttons
        // create remove button
        const removeBtnCell = document.createElement('td');
        removeBtnCell.classList.add('tableCell-MIfBF');
        const removeBtn = document.createElement('button');
        removeBtn.className = 'massImportFromBookmarkFolder-removeBtn';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => {
            this.massImportFromBookmarkFolderCheckContainer!.removeChild(item);
            delete this.finalAllHermidatas[hermidata.id];
        });
        removeBtnCell.appendChild(removeBtn);
        // create add button
        const addBtnCell = document.createElement('td');
        addBtnCell.classList.add('tableCell-MIfBF');
        const addBtn = document.createElement('button');
        addBtn.className = 'massImportFromBookmarkFolder-addBtn';
        addBtn.textContent = 'Save';
        addBtn.addEventListener('click', async () => {
            this.finalAllHermidatas[hermidata.id].novelType = NovelTypeChanger.value as AnyNovelType;
            const value: [AnyNovelType, Hermidata] = [(NovelTypeChanger.value as AnyNovelType), this.finalAllHermidatas[hermidata.id]];
            // save immediately and remove from list to review
            const newHermidataList = await AutoSetAllHermidata.setHermidataType(value);
            await this.setHermidata(newHermidataList);

            // remove from list to review
            this.massImportFromBookmarkFolderCheckContainer!.removeChild(item);
            delete this.finalAllHermidatas[hermidata.id];
        });
        addBtnCell.appendChild(addBtn);


        item.append(label, linkCell, NovelTypeCell, removeBtnCell, addBtnCell);

        return item;
    }
    private async massImportFromBookmarkFolderSaveAllBtnClick() {

        await this.finalizeAllHermidatas(this.finalAllHermidatas);
        this.massImportFromBookmarkFolderCheckContainer!.innerHTML = '';
        this.temporaryStatus('Done', this.massImportFromBookmarkFolderStatus);
    }
    private async finalizeAllHermidatas(data: Record<string, Hermidata>) {
        const newArray = new Array<[AnyNovelType, Hermidata]>();
        for (const hermidata of Object.values(data)) {
            newArray.push([hermidata.novelType, hermidata]);
        }

        const newHermidataList = await AutoSetAllHermidata.setHermidataType(newArray);
        // set it on record
        const hermidatas: Record<string, Hermidata> = newHermidataList.reduce((acc, hermidata) => ({ ...acc, [hermidata.id]: hermidata }), {});
        // save
        await this.saveAllHermidatas(hermidatas);
    }
    private getBrowserRoot() {
        const Browserroot = browser !== undefined && navigator.userAgent.includes("Firefox") ? "Bookmarks Menu" : "Bookmarks";
        return Browserroot;
    }


    private async saveAllHermidatas(hermidata: Record<string, Hermidata>) {
        // Get existing storage
        const DataList = await this.dbRequest<Hermidata[]>('hermidata', 'getAll');
        const existingData: Record<string, Hermidata>  = Object.fromEntries(DataList.map(h => [h.id, h]));
        // Merge
        const mergedDataRecord: Record<string, Hermidata> = { ...existingData, ...hermidata };
        // Save
        await this.dbRequest<void>('hermidata', 'putAll', { id: 'hermidata', data: mergedDataRecord });
    }
}