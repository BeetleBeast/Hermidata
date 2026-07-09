import { ext } from "../../shared/utils/BrowserCompat";
import { getElement, setElement } from "../../shared/utils/Selection";
import { Build } from "../build";

export class Account_Connection extends Build {


    private readonly input = getElement<HTMLInputElement>("#spreadsheetUrl");
    private readonly status = getElement<HTMLParagraphElement>("#statusSheetURL");
    private readonly saveBtn = getElement<HTMLButtonElement>("#saveSpreadsheetUrl");
    private readonly testBtn = getElement<HTMLButtonElement>("#testSpreadsheetUrl");
    
    private readonly LogOutBtn = getElement<HTMLButtonElement>("#logOut");

    private spreadsheetUrl: string = "";


    public async init() {

        // Load & populate page inputs and tables
        await this.loadSheetUrl();

        this.bindEvents();
    }
    public async resetValues() {
        const settings = await this.getSettings();
        settings.AccountAndConnections.spreadsheetUrl = "";
        await this.setSettings(settings);
        this.cancelValues();
    }
    public async cancelValues() {
        // reset page values to current settings
        await this.loadSheetUrl();
        if (this.input) this.input.value = "";
        if (this.status) this.status.textContent = "";
    }
    public async saveValues() {
        this.SetSpreadsheetUrl();
    }
    private bindEvents() {
        this.saveBtn?.addEventListener("click", () => this.SetSpreadsheetUrl());

        this.input?.addEventListener("change", () => this.giveFeedback());

        this.testBtn?.addEventListener("click", () => this.TestSpreadsheetUrl());

        this.LogOutBtn?.addEventListener("click", () => this.ResetLoginAuth());
    }
    private async SetSpreadsheetUrl() {
        if (!this.input || !this.status) return;
        const value = this.input.value.trim();
        if (!value) {
            this.temporaryStatus("Please enter a URL", "#statusSheetURL");
            return;
        }
        this.setSpreadsheetUrl(value);
        this.temporaryStatus("Saved!", "#statusSheetURL");
    }
    private async TestSpreadsheetUrl() {
        try {
            if (!this.input || !this.status) return;
            this.status.textContent = "Testing...";
            const value = this.input.value.trim() || this.spreadsheetUrl;
            if (!value) {
                this.temporaryStatus("Please enter a URL", "#statusSheetURL", 500, "red");
                return;
            }

            const url = this.constructUrl(value);
            if (!url) { 
                this.temporaryStatus("Invalid URL", "#statusSheetURL", 500, "red"); 
                throw new Error("Invalid URL");
            }
            const response = await fetch(url, { method: "HEAD" });
            if (response.ok) this.temporaryStatus("connected!", "#statusSheetURL", 500);
            else this.temporaryStatus("Failed to connect", "#statusSheetURL", 500, "red");
            
        } catch (error) {
            this.temporaryStatus("Failed to connect", "#statusSheetURL", 500, "red");
        }
    }
    private constructUrl(url: string): string | null {
        let newUrl = "";
        // 1. Check if url has http:// or https://
        if (!url.startsWith("http://") && !url.startsWith("https://")) newUrl = "https://" + url;
        else newUrl = url;
        // 2. Check if url has a dot and a web type
        if (!newUrl.includes(".")) return null;
        // 3. Check if url has trailing slash
        if (!newUrl.endsWith("/")) newUrl += "/";
        
        
        return newUrl;

    }
    private async ResetLoginAuth() {
        ext.storage.local.remove(["googleAccessToken", "googleTokenExpiry", "userEmail"], () => {
            console.log("OAuth credentials cleared");
        });
    }
    private giveFeedback() {
        // give hint of how the link to google sheets needs to look like
        if (!this.input || !this.status) return;
        if (!this.input.value) this.status.textContent = `Go to your spreadsheet and copy the url of the sheet. It should look like this: https://docs.google.com/spreadsheets/d/<spreadsheetId>/edit?pli=1&gid=0#gid=0`;
        else this.status.textContent = "";
    }


    private async loadSheetUrl() {
        // Load spreadsheetUrl value
        const result = await this.getSpreadsheetUrl();
        this.spreadsheetUrl = result;
        setElement<HTMLInputElement>("#spreadsheetUrl", el => el.value = result);
    }

    private async getSpreadsheetUrl(): Promise<string> {
        const settings = await this.getSettings();
        return settings.AccountAndConnections.spreadsheetUrl;
    }
    private async setSpreadsheetUrl(url: string): Promise<void> {
        const settings = await this.getSettings();
        settings.AccountAndConnections.spreadsheetUrl = url;
        await this.setSettings(settings);
    }
}