import { putAllHermidata } from "../../shared/db/db";
import { getAllHermidata, getAllRawFeeds, getSettings, saveSettings, setAllRawFeeds } from "../../shared/db/Storage";
import type { Hermidata, RawFeed } from "../../shared/types";
import type { FolderMapping, FolderRule, Settings } from "../../shared/types/settings"

import { Build } from "../build";



export class ImportsAndExports extends Build {

    constructor() {
        super();
    }

    // Export Settings as JSON
    public async exportSettings() {
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
    public async importSettings(event: Event) {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file) return
        try {
            const importedData = await new Blob([file]).text();
            
            const existingData = await getSettings();
            const mergedData: Settings = { ...existingData, ...JSON.parse(importedData) };
            saveSettings(mergedData);

            alert("Settings imported successfully!");
        } catch (err) {
            console.error("Failed to parse JSON:", err);
            alert("Invalid JSON format.");
        }
    };

    public async exportHermidata() {
        try {
            const Data = getAllHermidata();
            
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

    public async importHermidata(event: Event) {
        const target = event.target as HTMLInputElement;
        const file = target?.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const target = e.target ?? null;
                const importedData: Record<string, Hermidata> = JSON.parse(target?.result as string);

                // Get existing storage
                const existingData = await getAllHermidata();

                // Merge
                const mergedDataRecord = { ...existingData, ...importedData };
                const mergedData = Object.values(mergedDataRecord);

                // Save merged result
                putAllHermidata(mergedData);

                console.log("Hermidata import + merge complete!");
            } catch (error) {
                console.error("Extension error: Failed importHermidata:", error);
            }
        };
        reader.readAsText(file);
    }

    public async importRSSBtn(event: Event) {
        const target = event.target as HTMLInputElement;
        const file = target?.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const target = e.target ?? null;
                const importedData: RawFeed[] = JSON.parse(target?.result as string);

                // Get existing storage
                const existingDataRecord = await getAllRawFeeds();
                const existingData = Object.values(existingDataRecord);

                // Merge
                const mergedData: RawFeed[] = { ...existingData, ...importedData };

                // Save merged result
                await setAllRawFeeds(mergedData);

                console.log("Hermidata import + merge complete!");
            } catch (error) {
                console.error("Extension error: Failed importHermidata:", error);
            }
        };
        reader.readAsText(file);
    }

    public async exportRSSBtn() { // possible rss
        try {
            const Data = await getAllRawFeeds();
            
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

}




export function migrateFolderMapping( old: Record<string, Record<string, { path: string }>>, root: string ): FolderMapping {
    // Collect status → folder name from the first type's entries
    const statusFolders: Record<string, string> = {}
    const overrides: FolderRule[] = []

    const firstType = Object.values(old)[0] ?? {}
    for (const [status, { path }] of Object.entries(firstType)) {
        const segment = path.split('/').at(-1) ?? status
        statusFolders[status] = segment
    }

    // Anything that doesn't match the pattern becomes an override
    for (const [type, statuses] of Object.entries(old)) {
        for (const [status, { path }] of Object.entries(statuses)) {
            const expected = `${root}/${type}/${statusFolders[status]}`
            if (path !== expected) {
                overrides.push({ type, status, path })
            }
        }
    }

    return {
        root,
        statusFolders,
        overrides,
        defaultPath: `${root}/Unsorted`
    }
}