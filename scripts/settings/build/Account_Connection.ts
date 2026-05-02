import { ext } from "../../shared/BrowserCompat";
import type { Settings } from "../../shared/types";
import { getElement, setElement } from "../../utils/Selection";
import { Build } from "../build";

export class Account_Connection extends Build {


    private readonly input = getElement<HTMLInputElement>("#spreadsheetUrl")?.value.trim();
    private readonly status = getElement<HTMLParagraphElement>("#statusSheetURL");
    private readonly saveBtn = getElement<HTMLButtonElement>("#saveSpreadsheetUrl");
    private readonly testBtn = getElement<HTMLButtonElement>("#testSpreadsheetUrl");
    
    private readonly LogOutBtn = getElement<HTMLButtonElement>("#logOut");



    public async init() {

        // Load & populate page inputs and tables
        await this.loadSheetUrl();

        this.bindEvents();
    }
    private bindEvents() {
        this.saveBtn?.addEventListener("click", () => this.SetSpreadsheetUrl());

        this.testBtn?.addEventListener("click", () => this.TestSpreadsheetUrl());

        this.LogOutBtn?.addEventListener("click", () => this.ResetLoginAuth());
    }
    private async SetSpreadsheetUrl() {
        if (!this.input || !this.status) return;
        this.setSpreadsheetUrl(this.input);
        this.temporaryStatus("Saved!", "#statusSheetURL");
    }
    private async TestSpreadsheetUrl() {
        if (!this.input || !this.status) return;
        this.status.textContent = "Testing...";
        const response = await fetch(this.input);
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