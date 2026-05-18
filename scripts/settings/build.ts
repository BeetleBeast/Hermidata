import { ext } from "../shared/BrowserCompat";
import { defaultSettings, type Hermidata, type Settings } from "../shared/types";
import { getElement, setElement } from "../utils/Selection";




export abstract class Build {

    protected getSettings(): Promise<Settings> {
        return this.dbRequest<Settings>('settings', 'get', { id: 'Settings', data: null });
    }
    protected setSettings(data: Settings): Promise<void> {
        return this.dbRequest<void>('settings', 'put', { id: 'Settings', data });
    }
    protected setHermidata(data: Hermidata): Promise<void> {
        return this.dbRequest<void>('hermidata', 'update', { id: data.id, data });
    }

    protected temporaryStatus(status: string, elementTag: string | HTMLElement | null, timeout: number = 2000) {
        if (!elementTag) {
            console.error(`Error in temporaryStatus: status element not found`);
            return;
        }
        const statusElement = elementTag instanceof HTMLElement ? elementTag : getElement<HTMLParagraphElement>(elementTag);
        
        if (!statusElement) {
            console.error(`Error in temporaryStatus: status element not found`);
            return;
        }
        statusElement.textContent = status;
        setTimeout(() => elementTag instanceof HTMLElement ? elementTag.textContent = "" : setElement(`${elementTag}`, el => el.textContent = ""), timeout);
    }

    protected async ensureSettingsUpToDate(): Promise<Settings> {

        const storedSettings = await this.getSettings();
        

        let updated = false;

        this.deepMerge(storedSettings, defaultSettings);

        if (updated) {
            await this.setSettings(storedSettings);
            return storedSettings;
        }
        return storedSettings;
    }
    private deepMerge( target: Settings, source: Settings ): boolean {
        let updated = false;

        const t = target as Record<string, any>;
        const s = source as Record<string, any>;

        for (const key in s) {
            if (!(key in t)) {
                t[key] = s[key];
                updated = true;
            } else if ( 
                (typeof t[key] === "object" && typeof s[key] === "object" 
                    && t[key] !== null && s[key] !== null 
                    && !Array.isArray(t[key])
                ) && this.deepMerge(t[key], s[key])
            ) {
                updated = true;
            }
        }

        return updated;
    }


    protected async dbRequest<T>(store: string, operation: string, payload?: { id: string, data: any}): Promise<T> {
        try {
            return new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({ type: 'DB_OPERATION', store, operation, payload }, async (response: { success: boolean, error?: string, result?: any }) => {
                    if (!response.success) reject(new Error(response.error));
                    resolve(await response.result as T);
                });
            });
        } catch (error) {
            console.error(error);
            throw error;
        }
    }
    protected async ResetLocalFilters(): Promise<boolean> {
        // when tags are changed / removed the local ( browser extension local storage ) filters need to be reset
        try {
            return new Promise((resolve, reject) => {
                ext.runtime.sendMessage({ type: "RESET_LOCAL_FILTERS" }, (response: { success: boolean, error?: string }) => {
                    if (!response.success) reject(new Error(response.error));
                    resolve(true);
                });
            });
        } catch (error) {
            console.error(error);
            throw error;
        }
    }
}