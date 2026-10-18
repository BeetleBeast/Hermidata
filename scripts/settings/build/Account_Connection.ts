import { ext } from "../../shared/utils/BrowserCompat";
import { getElement, setElement } from "../../shared/utils/Selection";
import { Build } from "../build";

export class Account_Connection extends Build {
    
    private readonly LogOutBtn = getElement<HTMLButtonElement>("#logOut");
    private readonly accountAuthStatus = getElement<HTMLParagraphElement>("#accountAuthStatus");


    public async init() {

        this.loadAccountAuthStatus();
        this.bindEvents();
    }
    public async resetValues() {
        const settings = await this.getSettings();
        settings.AccountAndConnections.spreadsheetUrl = "";
        await this.setSettings(settings);
        this.cancelValues();
    }
    public async cancelValues() {
        // no values to reset
    }
    private bindEvents() {

        this.LogOutBtn?.addEventListener("click", () => this.ResetLoginAuth());
    }

    private loadAccountAuthStatus() {
        ext.storage.local.get(["googleAccessToken", "googleTokenExpiry", "userEmail"], (items: {
            googleAccessToken?: string;
            googleTokenExpiry?: number;
            userEmail?: string;
        }) => {
            const error = ext.runtime.lastError;
            if (error) {
                if (this.accountAuthStatus) this.accountAuthStatus.textContent = `Could not check account status: ${error.message}`;
                return;
            }

            const isConnected = Boolean(items.googleAccessToken && items.googleTokenExpiry && items.googleTokenExpiry > Date.now());
            const hasStoredAccount = Boolean(items.googleAccessToken || items.userEmail);
            if (this.accountAuthStatus) {
                this.accountAuthStatus.dataset.state = isConnected ? "connected" : "signed-out";
                this.accountAuthStatus.textContent = isConnected
                    ? `Connected${items.userEmail ? ` as ${items.userEmail}` : ""}.`
                    : "Not currently connected. Google sign-in happens automatically when saving to a spreadsheet.";
            }
            if (this.LogOutBtn) this.LogOutBtn.hidden = !hasStoredAccount;
        });
    }
    private async ResetLoginAuth() {
        if (this.LogOutBtn) this.LogOutBtn.disabled = true;
        ext.storage.local.remove(["googleAccessToken", "googleTokenExpiry", "userEmail"], () => {
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