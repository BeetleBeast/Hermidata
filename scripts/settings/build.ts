import { ext } from "../shared/utils/BrowserCompat";
import { defaultSettings } from "../shared/constants";
import { type Hermidata, type RawFeed, type Settings } from "../shared/types";
import { getElement, setElement } from "../shared/utils/Selection";
import { dbAccess } from "../shared/db/Storage";




export abstract class Build {

    private readonly dbAccess = new dbAccess();

    protected getSettings(): Promise<Settings> {
        return this.dbAccess.getSettings();
    }
    protected setSettings(data: Settings): Promise<void> {
        return this.dbAccess.setSettings(data);
    }
    /** @implements `updateHermidata` instead of `setHermidata` for backwards compatibility */
    protected setHermidata(data: Hermidata): Promise<void> {
        return this.dbAccess.updateHermidata(data);
    }
    protected getAllHermidata(): Promise<Record<string, Hermidata>> {
        return this.dbAccess.getAllHermidata();
    }
    protected putAllHermidata(data: Record<string, Hermidata>): Promise<void> {
        return this.dbAccess.putAllHermidata(data);
    }
    protected getAllFeeds(): Promise<RawFeed[]> {
        return this.dbAccess.getAllFeeds();
    }
    protected putAllFeeds(data: RawFeed[]): Promise<void> {
        return this.dbAccess.putAllFeeds(data);
    }

    protected temporaryStatus(status: string, elementTag: string | HTMLElement | null, timeout: number = 2000, color: string = 'green'): void {
        if (!elementTag) {
            console.error(`Error in temporaryStatus: status element not found`);
            return;
        }
        const statusElement = elementTag instanceof HTMLElement ? elementTag : getElement<HTMLParagraphElement>(elementTag);
        
        if (!statusElement) {
            console.error(`Error in temporaryStatus: status element not found`);
            return;
        }
        statusElement.style.color = color;
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