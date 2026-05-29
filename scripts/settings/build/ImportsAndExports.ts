import { ext } from "../../shared/utils/BrowserCompat";
import type { Hermidata, RawFeed } from "../../shared/types";
import type { quickBackup, Settings } from "../../shared/types/settings"
import { getElement } from "../../shared/utils/Selection";

import { Build } from "../build";

export class ImportsAndExports extends Build {

    private readonly devMode: boolean;

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

        if (this.devMode) {
            getElement("#exportRSSBtn")?.addEventListener("click", () => this.exportRSSBtn() );
            getElement("#importRSSBtn")?.addEventListener("change", (e) => this.importRSSBtn(e) );

            getElement("#exportSyncDataBtn")?.addEventListener("click", () => this.exportSyncData());
            getElement("#importSyncDataBtn")?.addEventListener("change", (e) => this.importSyncData(e));
            getElement("#deleteSyncDataBtn")?.addEventListener("click", () => this.deleteSyncData());
        }
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
                const mergedData = Object.values(mergedDataRecord);

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

}