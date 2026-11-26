import { ext } from "../../shared/utils/BrowserCompat";
import { getElement, setElement } from "../../shared/utils/Selection";
import { DEFAULT_SHEET_NAME, isValidGoogleSheetUrl, resolveSheetName } from "../../shared/sheets/sheetConfig";
import type { SheetCheck } from "../../shared/types";
import { Build } from "../build";

const SHEET_URL_HINT = "Go to your spreadsheet and copy the url of the sheet. It should look like this: https://docs.google.com/spreadsheets/d/< your spreadsheet id >/edit";

export class Account_Connection extends Build {

    private readonly LogOutBtn = getElement<HTMLButtonElement>("#logOut");
    private readonly accountAuthStatus = getElement<HTMLParagraphElement>("#accountAuthStatus");

    private readonly sheetCard = getElement<HTMLElement>("#googleSpreadsheetCard");
    private readonly spreadsheetInput = getElement<HTMLInputElement>("#spreadsheetUrl");
    private readonly saveUrlBtn = getElement<HTMLButtonElement>("#saveSpreadsheetUrl");
    private readonly checkUrlBtn = getElement<HTMLButtonElement>("#testSpreadsheetUrl");
    private readonly urlStatus = getElement<HTMLParagraphElement>("#statusSheetURL");


    public async init() {
        const settings = await this.db.getSettings();
        if (this.spreadsheetInput) this.spreadsheetInput.value = settings.AccountAndConnections.spreadsheetUrl;
        if (this.tabInput) this.tabInput.value = resolveSheetName(settings.AccountAndConnections.sheetName);
        this.showSheetCard(settings.ExtensionBehaviour.SaveTarget.GoogleSpreadsheet);

        this.loadAccountAuthStatus();
        this.bindEvents();
    }
    /** The sheet URL and the Google account only matter while the spreadsheet is a save target. */
    private showSheetCard(enabled: boolean) {
        if (this.sheetCard) this.sheetCard.hidden = !enabled;
    }
    public async resetValues() {
        const settings = await this.db.getSettings();
        settings.AccountAndConnections.spreadsheetUrl = "";
        settings.AccountAndConnections.sheetName = DEFAULT_SHEET_NAME;
        await this.db.setSettings(settings);
        if (this.spreadsheetInput) this.spreadsheetInput.value = "";
        if (this.tabInput) this.tabInput.value = DEFAULT_SHEET_NAME;
        this.notifyUrlChanged();
    }
    private bindEvents() {

        this.LogOutBtn?.addEventListener("click", () => this.ResetLoginAuth());
        this.saveUrlBtn?.addEventListener("click", () => this.saveSpreadsheetUrl());
        this.checkUrlBtn?.addEventListener("click", () => this.testSpreadsheet());
        document.addEventListener("hermidata:spreadsheet-target-changed", e => this.showSheetCard((e as CustomEvent<boolean>).detail));
    }

    private readonly tabInput = getElement<HTMLInputElement>("#spreadsheetTabName");

    /** The trimmed URL when it is a Google Sheets link; otherwise shows why not and returns null. */
    private readValidUrl(): string | null {
        const value = this.spreadsheetInput?.value.trim() ?? "";
        if (!value) { this.temporaryStatus("Please enter a URL", this.urlStatus, 2000, "var(--danger)"); return null; }
        if (!isValidGoogleSheetUrl(value)) { this.temporaryStatus(SHEET_URL_HINT, this.urlStatus, 6000, "var(--danger)"); return null; }
        return value;
    }
    /** Asks the background script to sign in if needed and open the spreadsheet and tab. Null when the form is not valid yet. */
    private async verifyForm(): Promise<{ url: string, sheetName: string, check: SheetCheck } | null> {
        const url = this.readValidUrl();
        if (!url) return null;
        const sheetName = resolveSheetName(this.tabInput?.value);

        this.setBusy(true);
        this.temporaryStatus("Checking the spreadsheet… a Google sign-in window may open.", this.urlStatus, 60000, "var(--text-muted)");
        try {
            const reply = await ext.runtime.sendMessage({ type: "VERIFY_SHEET", url, sheetName }) as SheetCheck | { error: string } | undefined;
            const check: SheetCheck = reply && "ok" in reply ? reply : { ok: false, problem: "server", message: "The background script did not answer." };
            this.loadAccountAuthStatus();   // signing in just now changes the account status
            return { url, sheetName, check };
        } finally {
            this.setBusy(false);
        }
    }
    private setBusy(busy: boolean) {
        if (this.saveUrlBtn) this.saveUrlBtn.disabled = busy;
        if (this.checkUrlBtn) this.checkUrlBtn.disabled = busy;
    }
    private showCheck(check: SheetCheck, sheetName: string, okText: string) {
        if (check.ok) this.temporaryStatus(`${okText} "${check.title}", tab "${sheetName}".`, this.urlStatus, 4000);
        else this.temporaryStatus(check.message, this.urlStatus, 8000, "var(--danger)");
    }
    /** Saves only a spreadsheet and tab that this account can actually open. */
    private async saveSpreadsheetUrl() {
        const result = await this.verifyForm();
        if (!result) return;
        if (!result.check.ok) { this.showCheck(result.check, result.sheetName, ""); return; }

        const settings = await this.db.getSettings();
        settings.AccountAndConnections.spreadsheetUrl = result.url;
        settings.AccountAndConnections.sheetName = result.sheetName;
        await this.db.setSettings(settings);
        if (this.tabInput) this.tabInput.value = result.sheetName;
        this.notifyUrlChanged();
        this.showCheck(result.check, result.sheetName, "Saved. Connected to");
    }
    private async testSpreadsheet() {
        const result = await this.verifyForm();
        if (result) this.showCheck(result.check, result.sheetName, "Connected to");
    }
    private notifyUrlChanged() {
        document.dispatchEvent(new CustomEvent("hermidata:spreadsheet-url-changed"));   // the save-target reminder re-reads
    }

    private loadAccountAuthStatus() {
        ext.storage.local.get(["googleAccessToken", "googleTokenExpiry"], (items: {
            googleAccessToken?: string;
            googleTokenExpiry?: number;
        }) => {
            const error = ext.runtime.lastError;
            if (error) {
                if (this.accountAuthStatus) this.accountAuthStatus.textContent = `Could not check account status: ${error.message}`;
                return;
            }

            const isConnected = Boolean(items.googleAccessToken && items.googleTokenExpiry && items.googleTokenExpiry > Date.now());
            if (this.accountAuthStatus) {
                this.accountAuthStatus.dataset.state = isConnected ? "connected" : "signed-out";
                this.accountAuthStatus.textContent = isConnected
                    ? "Connected."
                    : "Not currently connected. Google sign-in happens automatically when saving to a spreadsheet.";
            }
            // an expired token is not a live session: there is nothing to sign out of
            if (this.LogOutBtn) this.LogOutBtn.hidden = !isConnected;
        });
    }
    private async ResetLoginAuth() {
        if (this.LogOutBtn) this.LogOutBtn.disabled = true;
        ext.storage.local.remove(["googleAccessToken", "googleTokenExpiry"], () => {
            const error = ext.runtime.lastError;
            if (error) {
                if (this.accountAuthStatus) this.accountAuthStatus.textContent = `Could not sign out: ${error.message}`;
                if (this.LogOutBtn) this.LogOutBtn.disabled = false;
                return;
            }

            if (this.accountAuthStatus) {
                this.accountAuthStatus.textContent = "Signed out. Google will reconnect automatically the next time you save to a spreadsheet.";
                this.accountAuthStatus.dataset.state = "signed-out";
            }
            if (this.LogOutBtn) this.LogOutBtn.hidden = true;
        });
    }
}