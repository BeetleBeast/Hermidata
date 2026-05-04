import { ext } from "../../shared/BrowserCompat";
import type { Settings } from "../../shared/types";
import { getElement, setElement } from "../../utils/Selection";
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
        if (!this.input || !this.status) return;
        this.status.textContent = "Testing...";
        const value = this.input.value.trim() || this.spreadsheetUrl;
        const response = await fetch(value, { method: "HEAD" });
        if (!response.ok) this.temporaryStatus("Failed to connect", "#statusSheetURL");
        else this.temporaryStatus("connected!", "#statusSheetURL", 500);
    }
    private async ResetLoginAuth() {
        ext.storage.local.remove(["googleAccessToken", "googleTokenExpiry", "userEmail"], () => {
            console.log("OAuth credentials cleared");
        });
    }


    private async loadSheetUrl() {
        // Load spreadsheetUrl value
        const result = await this.getSpreadsheetUrl();
        this.spreadsheetUrl = result;
        setElement<HTMLInputElement>("#spreadsheetUrl", el => el.value = result);
    }

    private async getSpreadsheetUrl(): Promise<string> {
        const settings: Settings = await this.dbRequest('settings', 'get', { id: 'Settings', data: null });
        return settings.AccountAndConnections.spreadsheetUrl;
    }
    private async setSpreadsheetUrl(url: string): Promise<void> {
        const settings: Settings = await this.dbRequest('settings', 'get', { id: 'Settings', data: null });
        settings.AccountAndConnections.spreadsheetUrl = url;
        await this.dbRequest('settings', 'put', { id: 'Settings', data: settings });
    }
}