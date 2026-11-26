import { logConsoleError } from "../shared/utils/ErrorMessage";
import { ext } from "../shared/utils/BrowserCompat";
import { defaultSettings } from "../shared/constants";
import { type Settings } from "../shared/types";
import { getElement } from "../shared/utils/Selection";
import { dbAccess } from "../shared/db/Storage";




export abstract class Build {

    public abstract init(): Promise<void>;

    public abstract resetValues(): Promise<void>;



    protected readonly db = new dbAccess();
    private readonly temporaryStatusTimeouts = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

    protected temporaryStatus(status: string, elementTag: string | HTMLElement | null, timeout: number = 2000, color: string = 'var(--success)'): void {
        if (!elementTag) {
            logConsoleError(`Error in temporaryStatus: status element not found`);
            return;
        }
        const statusElement = elementTag instanceof HTMLElement ? elementTag : getElement<HTMLParagraphElement>(elementTag);
        
        if (!statusElement) {
            logConsoleError(`Error in temporaryStatus: status element not found`);
            return;
        }

        const previousTimeout = this.temporaryStatusTimeouts.get(statusElement);
        if (previousTimeout) clearTimeout(previousTimeout);

        statusElement.style.color = color;
        statusElement.textContent = status;
        const statusTimeout = setTimeout(() => {
            if (this.temporaryStatusTimeouts.get(statusElement) !== statusTimeout) return;
            statusElement.textContent = "";
            statusElement.style.color = "";
            this.temporaryStatusTimeouts.delete(statusElement);
        }, timeout);
        this.temporaryStatusTimeouts.set(statusElement, statusTimeout);
    }

    protected async ensureSettingsUpToDate(): Promise<Settings> {

        const storedSettings = await this.db.getSettings();
        

        let updated = false;

        updated = this.deepMerge(storedSettings, defaultSettings);

        if (updated) {
            await this.db.setSettings(storedSettings);
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
            logConsoleError(error);
            throw error;
        }
    }
}