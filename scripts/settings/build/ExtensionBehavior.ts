import { defaultSettings } from "../../shared/constants";
import { type KeyboardShortcutSettings, type NotificationTypes, type Settings } from "../../shared/types";
import { getElement, setElement } from "../../shared/utils/Selection";
import {
    BROWSER_COMMAND_SHORTCUTS,
    DEFAULT_KEYBOARD_SHORTCUTS,
    formatKeyboardEventShortcut,
    getBrowserCommandShortcuts,
    isModifierKey,
    openBrowserShortcutSettings,
    shortcutsConflict,
} from "../../shared/utils/KeyboardShortcuts";
import { Build } from "../build";

export class ExtensionBehavior extends Build {

    private readonly enableLightMode = getElement<HTMLInputElement>("#enableLightMode");
    private readonly allowContextMenu = getElement<HTMLInputElement>("#AllowContextMenu");

    private readonly enableNotification = getElement<HTMLInputElement>("#enableNotification");
    private readonly notificationBadge = getElement<HTMLInputElement>("#notificationBadge");
    private readonly notificationMessageMinimum = getElement<HTMLInputElement>("#notificationMessageMinimum");
    private readonly notificationMessageFull = getElement<HTMLInputElement>("#notificationMessageFull");

    private readonly enableKeyboardShortcuts = getElement<HTMLInputElement>("#enableKeyboardShortcuts");
    private readonly keyboardShortcutsList = getElement<HTMLDivElement>("#keyboardShortcuts");
    private readonly keyboardShortcutStatus = getElement<HTMLParagraphElement>("#keyboardShortcutStatus");
    private readonly openBrowserShortcutSettingsButton = getElement<HTMLButtonElement>("#openBrowserShortcutSettings");
    private activeShortcutCapture: {
        button: HTMLButtonElement;
        action: keyof KeyboardShortcutSettings;
        pendingKey?: string;
        timer?: ReturnType<typeof setTimeout>;
    } | undefined;
    private readonly shortcutCaptureListener = (event: KeyboardEvent) => {
        void this.CaptureKeyboardShortcut(event);
    };

    private readonly enableAutoSubscribe = getElement<HTMLInputElement>("#enableAutoSubscribe");
    private readonly enableAutoSubscribeThreshold = getElement<HTMLInputElement>("#enableAutoSubscribeThreshold"); // radio button ( boolean )
    private readonly autoSubscribeThreshold = getElement<HTMLInputElement>("#autoSubscribeThreshold"); // input ( number )
    private readonly autoSubscribeThresholdValue = getElement<HTMLSpanElement>("#autoSubscribeThresholdValue");

    private readonly autoUpdateNovelStatusOnlyRSS = getElement<HTMLInputElement>("#autoUpdateNovelStatusOnlyRSS");
    private readonly autoUpdateNovelStatusAllValue = getElement<HTMLInputElement>("#autoUpdateNovelStatusAllValue");

    private readonly saveTarget = document.querySelectorAll<HTMLInputElement>('input[name="SaveCollection"]')
    private readonly spreadsheetTarget = getElement<HTMLInputElement>("#SaveToGoogleSpreadsheet");
    private readonly spreadsheetSetup = getElement<HTMLElement>("#spreadsheetSetup");
    private readonly spreadsheetTargetReminder = getElement<HTMLElement>("#spreadsheetTargetReminder");

    private readonly spreadsheetInput = getElement<HTMLInputElement>("#spreadsheetUrl"); // was input
    private readonly saveBtn = getElement<HTMLButtonElement>("#saveSpreadsheetUrl");
    private readonly testBtn = getElement<HTMLButtonElement>("#testSpreadsheetUrl");
    private readonly status = getElement<HTMLParagraphElement>("#statusSheetURL");

    private spreadsheetUrl: string = "";

    public async init() {
        const settings = await this.ensureSettingsUpToDate();

        // populate values from settings

        // Light mode
        this.setValueOptionLightMode(settings);
        // Context Menu
        this.setValueOptionContextMenu(settings);
        // Enable Notification
        this.setValueOptionNotification(settings);
        // Keyboard Shortcuts
        this.setValueOptionKeyboardShortcuts(settings);
        this.setValueKeyboardShortcuts(settings.ExtensionBehaviour.KeyboardShortcuts);
        await this.setBrowserShortcutLabels();
        // Auto Subscribe
        this.setValueOptionAutoSubscribe(settings);
        // Auto Subscribe - Threshold
        this.setValueOptionAutoSubscribeThreshold(settings)

        // Auto Subscribe Threshold value only
        this.setValueOptionAutoSubscribeThresholdOnly();
        // Save Target
        this.setValueOptionSaveTarget(settings);
        this.updateSpreadsheetSetup(settings.ExtensionBehaviour.SaveTarget.GoogleSpreadsheet, settings.AccountAndConnections.spreadsheetUrl);
        // Auto Update Novel Status
        this.setValueOptionAutoUpdateNovelStatus(settings);


        this.bindEvents();
    }
    private bindEvents() {
        this.enableLightMode?.addEventListener("change", (e) => this.EnableLightMode(e));
        this.allowContextMenu?.addEventListener("change", (e) => this.AllowContextMenu(e));

        this.enableNotification?.addEventListener("change", (e) => this.EnableNotification(e));

        this.notificationBadge?.addEventListener("change", (e) => this.NotificationType(e));
        this.notificationMessageMinimum?.addEventListener("change", (e) => this.NotificationType(e));
        this.notificationMessageFull?.addEventListener("change", (e) => this.NotificationType(e));

        this.enableKeyboardShortcuts?.addEventListener("change", (e) => this.EnableKeyboardShortcuts(e));
        this.openBrowserShortcutSettingsButton?.addEventListener("click", () => this.OpenBrowserShortcutSettings());
        window.addEventListener("focus", () => void this.setBrowserShortcutLabels());
        this.keyboardShortcutsList?.querySelectorAll<HTMLButtonElement>(".shortcut-recorder[data-shortcut]").forEach(button => {
            button.addEventListener("click", () => this.StartShortcutCapture(button));
        });
        this.keyboardShortcutsList?.querySelectorAll<HTMLButtonElement>("[data-shortcut-reset]").forEach(button => {
            button.addEventListener("click", () => this.ResetKeyboardShortcut(button));
        });
        
        this.enableAutoSubscribe?.addEventListener("change", (e) => this.EnableAutoSubscribe(e));
        this.enableAutoSubscribeThreshold?.addEventListener("change", (e) => this.AllowSimilarityScanning(e));
        this.autoSubscribeThreshold?.addEventListener("change", (e) => this.AutoSubscribeThreshold(e));

        this.autoUpdateNovelStatusOnlyRSS?.addEventListener("change", (e) => this.AutoUpdateNovelStatus(e, 'onlyRSS'));
        this.autoUpdateNovelStatusAllValue?.addEventListener("change", (e) => this.AutoUpdateNovelStatus(e, 'allowAll'));
        
        this.saveTarget?.forEach(el => el?.addEventListener("change", (e) => this.SaveTarget(e)));

        this.saveBtn?.addEventListener("click", () => this.SetSpreadsheetUrl());

        this.spreadsheetInput?.addEventListener("change", () => this.giveFeedback());

        this.testBtn?.addEventListener("click", () => this.TestSpreadsheetUrl());


    }
    public async resetValues() {
        this.CancelShortcutCapture();
        // reset all values from inputs to default
        const settings = await this.getSettings();
        const updatedSettings: Settings = { ...settings, ExtensionBehaviour: { ...defaultSettings.ExtensionBehaviour } };
        // reset settings in IndexedDB
        await this.setSettings(updatedSettings);

        this.setValueOptionKeyboardShortcuts(updatedSettings);
        this.setValueKeyboardShortcuts(updatedSettings.ExtensionBehaviour.KeyboardShortcuts);
    }

    private async SetSpreadsheetUrl() {
        if (!this.spreadsheetInput || !this.status) return;
        const value = this.spreadsheetInput.value.trim();
        if (!value) {
            this.temporaryStatus("Please enter a URL", "#statusSheetURL");
            return;
        }
        await this.setSpreadsheetUrl(value);
        const reminder = getElement<HTMLElement>("#spreadsheetTargetReminder");
        if (reminder) reminder.hidden = true;
        this.temporaryStatus("Saved!", "#statusSheetURL");
    }
    private async TestSpreadsheetUrl() {
        try {
            if (!this.spreadsheetInput || !this.status) return;
            this.status.textContent = "Testing...";
            const value = this.spreadsheetInput.value.trim() || this.spreadsheetUrl;
            if (!value) {
                this.temporaryStatus("Please enter a URL", "#statusSheetURL", 1000, "var(--danger)");
                return;
            }

            const url = this.constructUrl(value);
            if (!url) { 
                this.temporaryStatus("Invalid URL", "#statusSheetURL", 1000, "var(--danger)");
                throw new Error("Invalid URL");
            }
            const response = await fetch(url, { method: "HEAD" });
            if (response.ok) this.temporaryStatus("connected!", "#statusSheetURL", 1000);
            else this.temporaryStatus("Failed to connect", "#statusSheetURL", 1000, "var(--danger)");
            
        } catch (error) {
            this.temporaryStatus("Failed to connect", "#statusSheetURL", 1000, "var(--danger)");
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
    private giveFeedback() {
        // give hint of how the link to google sheets needs to look like
        if (!this.spreadsheetInput || !this.status) return;
        if (!this.spreadsheetInput.value) this.status.textContent = `Go to your spreadsheet and copy the url of the sheet. It should look like this: https://docs.google.com/spreadsheets/d/< your spreadsheet id >/edit?pli=1&gid=0#gid=0`;
        else this.status.textContent = "";
    }
    private async setSpreadsheetUrl(url: string): Promise<void> {
        const settings = await this.getSettings();
        settings.AccountAndConnections.spreadsheetUrl = url;
        await this.setSettings(settings);
    }

    private setValueOptionLightMode(settings: Settings) {
        const isDarkMode = settings.ExtensionBehaviour.EnableLightMode;
        setElement<HTMLInputElement>("#enableLightMode", el => el.checked = isDarkMode);
    }
    private setValueOptionContextMenu(settings: Settings) {
        const AllowContextMenu = settings.ExtensionBehaviour.AllowContextMenu;
        setElement<HTMLInputElement>("#AllowContextMenu", el => el.checked = AllowContextMenu);
    }
    private updateNotificationSubMenu(enableNotification: HTMLInputElement) {
        const notificationParentIsChecked = enableNotification.checked;
        const updateBadgeState = (badge: HTMLInputElement | null) => {
            if (badge) badge.disabled = !notificationParentIsChecked;
        };
        updateBadgeState(this.notificationBadge);
        updateBadgeState(this.notificationMessageMinimum);
        updateBadgeState(this.notificationMessageFull);
    }
    private setValueOptionNotification(settings: Settings) {
        const notification = settings.ExtensionBehaviour.EnableNotification;
        switch(notification) {
            case "Badge":
                setElement<HTMLInputElement>("#notificationBadge", el => el.checked = true);
                break;
            case "MessageMinimum":
                setElement<HTMLInputElement>("#notificationMessageMinimum", el => el.checked = true);
                break;
            case "MessageFull":
                setElement<HTMLInputElement>("#notificationMessageFull", el => el.checked = true);
                break;
        }
        // disable notification type options if notifications are disabled
        const enableNotification = getElement<HTMLInputElement>('#enableNotification');
        if (!enableNotification) return;
        enableNotification.checked = notification !== "None";

        this.updateNotificationSubMenu(enableNotification);
    }
    private setValueOptionKeyboardShortcuts(settings: Settings) {
        const keyboardShortcuts = settings.ExtensionBehaviour.EnableKeyboardShortcuts;
        setElement<HTMLInputElement>("#enableKeyboardShortcuts", el => el.checked = keyboardShortcuts);
        if (this.keyboardShortcutsList) this.keyboardShortcutsList.hidden = !keyboardShortcuts;
    }
    private setValueKeyboardShortcuts(shortcuts: KeyboardShortcutSettings) {
        this.keyboardShortcutsList?.querySelectorAll<HTMLButtonElement>(".shortcut-recorder[data-shortcut]").forEach(button => {
            const action = button.dataset.shortcut as keyof KeyboardShortcutSettings | undefined;
            if (action && action in shortcuts) this.setShortcutButtonValue(button, shortcuts[action]);
        });
    }
    private async setBrowserShortcutLabels() {
        try {
            const shortcuts = await getBrowserCommandShortcuts();
            this.keyboardShortcutsList?.querySelectorAll<HTMLElement>("[data-browser-command]").forEach(label => {
                const action = label.dataset.browserCommand as keyof typeof BROWSER_COMMAND_SHORTCUTS | undefined;
                if (action && action in shortcuts) label.textContent = shortcuts[action];
            });
        } catch (error) {
            this.setShortcutStatus(error instanceof Error ? error.message : String(error), true);
        }
    }
    private async OpenBrowserShortcutSettings() {
        this.CancelShortcutCapture();
        try {
            await openBrowserShortcutSettings();
            this.setShortcutStatus("Opened browser shortcut settings.");
        } catch (error) {
            const url = /Edg\//.test(navigator.userAgent)
                ? "edge://extensions/shortcuts"
                : "chrome://extensions/shortcuts";
            this.setShortcutStatus(`Could not open browser shortcut settings. Open ${url} manually.`, true);
        }
    }
    private StartShortcutCapture(button: HTMLButtonElement) {
        const action = button.dataset.shortcut as keyof KeyboardShortcutSettings | undefined;
        if (!action || !(action in DEFAULT_KEYBOARD_SHORTCUTS)) return;
        this.CancelShortcutCapture();
        this.activeShortcutCapture = { button, action };
        button.classList.add("is-recording");
        button.setAttribute("aria-pressed", "true");
        button.textContent = "Press keys…";
        this.setShortcutStatus("Press a key combination, or type a two-key sequence. Press Esc to cancel.");
        document.addEventListener("keydown", this.shortcutCaptureListener, true);
    }
    private async CaptureKeyboardShortcut(event: KeyboardEvent) {
        const capture = this.activeShortcutCapture;
        if (!capture) return;
        if (event.key === "Tab") {
            this.CancelShortcutCapture();
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat) return;

        if (event.key === "Escape") {
            this.CancelShortcutCapture();
            this.setShortcutStatus("Shortcut recording cancelled.");
            return;
        }
        if (isModifierKey(event.key)) {
            this.setShortcutStatus("Now press a non-modifier key.");
            return;
        }
        const hasModifier = event.ctrlKey || event.altKey || event.metaKey || event.shiftKey;
        if (hasModifier) {
            if (capture.timer) clearTimeout(capture.timer);
            this.CancelShortcutCapture();
            const shortcut = formatKeyboardEventShortcut(event);
            if (shortcut) await this.SaveKeyboardShortcut(capture.button, capture.action, shortcut);
            return;
        }

        if (capture.pendingKey) {
            clearTimeout(capture.timer);
            const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
            const shortcut = `${capture.pendingKey}+${key}`;
            this.CancelShortcutCapture();
            await this.SaveKeyboardShortcut(capture.button, capture.action, shortcut);
            return;
        }

        const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
        capture.pendingKey = key;
        capture.button.textContent = `${key} …`;
        this.setShortcutStatus(`Press another key for a sequence, or wait to save ${key}.`);
        capture.timer = setTimeout(() => {
            if (this.activeShortcutCapture !== capture) return;
            this.CancelShortcutCapture();
            void this.SaveKeyboardShortcut(capture.button, capture.action, key);
        }, 800);
    }
    private CancelShortcutCapture() {
        const capture = this.activeShortcutCapture;
        if (!capture) return;
        if (capture.timer) clearTimeout(capture.timer);
        document.removeEventListener("keydown", this.shortcutCaptureListener, true);
        capture.button.classList.remove("is-recording");
        capture.button.setAttribute("aria-pressed", "false");
        capture.button.textContent = capture.button.dataset.shortcutValue ?? "";
        this.activeShortcutCapture = undefined;
    }
    private setShortcutButtonValue(button: HTMLButtonElement, shortcut: string) {
        button.dataset.shortcutValue = shortcut;
        button.textContent = shortcut;
        button.setAttribute("aria-pressed", "false");
    }
    private async SaveKeyboardShortcut(button: HTMLButtonElement, action: keyof KeyboardShortcutSettings, shortcut: string) {
        const previousValue = button.dataset.shortcutValue ?? "";
        try {
            const settings = await this.ensureSettingsUpToDate();
            const shortcuts = settings.ExtensionBehaviour.KeyboardShortcuts;
            const duplicate = Object.entries(shortcuts).some(([otherAction, value]) =>
                otherAction !== action && shortcutsConflict(value, shortcut)
            );
            if (duplicate) {
                this.setShortcutButtonValue(button, shortcuts[action]);
                this.setShortcutStatus("That shortcut is already assigned.", true);
                return;
            }

            const updatedShortcuts = { ...shortcuts, [action]: shortcut };
            settings.ExtensionBehaviour.KeyboardShortcuts = updatedShortcuts;
            await this.setSettings(settings);
            this.setShortcutButtonValue(button, shortcut);
            this.setShortcutStatus("Shortcut saved.");
        } catch (error) {
            this.setShortcutButtonValue(button, previousValue);
            this.setShortcutStatus(error instanceof Error ? error.message : String(error), true);
        }
    }
    private async ResetKeyboardShortcut(button: HTMLButtonElement) {
        const action = button.dataset.shortcutReset as keyof KeyboardShortcutSettings | undefined;
        if (!action || !(action in DEFAULT_KEYBOARD_SHORTCUTS)) return;
        this.CancelShortcutCapture();
        const recorder = this.keyboardShortcutsList?.querySelector<HTMLButtonElement>(`[data-shortcut="${action}"]`);
        if (recorder) await this.SaveKeyboardShortcut(recorder, action, DEFAULT_KEYBOARD_SHORTCUTS[action]);
    }
    private setShortcutStatus(message: string, isError = false) {
        if (!this.keyboardShortcutStatus) return;
        this.keyboardShortcutStatus.textContent = message;
        this.keyboardShortcutStatus.style.color = isError ? "var(--danger)" : "var(--success)";
    }
    private setValueOptionAutoSubscribe(settings: Settings) {
        const autoSubscribe = settings.ExtensionBehaviour.AutoSubscribe.EnableAutoSubscribe;
        setElement<HTMLInputElement>("#enableAutoSubscribe", el => el.checked = autoSubscribe);
    }
    private setValueOptionSaveTarget(settings: Settings) {
        const googleSpreadsheet = settings.ExtensionBehaviour.SaveTarget.GoogleSpreadsheet;
        const browserBookmark = settings.ExtensionBehaviour.SaveTarget.BrowserBookmark;
        setElement<HTMLInputElement>("#SaveToGoogleSpreadsheet", el => el.checked = googleSpreadsheet);
        setElement<HTMLInputElement>("#SaveToBrowserBookmark", el => el.checked = browserBookmark);
    }

    // Enable Light Mode
    private async EnableLightMode(e: Event) {
        const event = e.target as HTMLInputElement;
        const isChecked = event.checked;
        const updatedSettings = await this.ensureSettingsUpToDate();
        updatedSettings.ExtensionBehaviour.EnableLightMode = isChecked;

        this.setSettings(updatedSettings);
    }

    // Enable Context Menu
    private async AllowContextMenu(e: Event) {
        const event = e.target as HTMLInputElement;
        const isChecked = event.checked;
        const updatedSettings = await this.ensureSettingsUpToDate();
        updatedSettings.ExtensionBehaviour.AllowContextMenu = isChecked;

        this.setSettings(updatedSettings);
    }

    // Enable Notification
    private async EnableNotification(e: Event) {
        const event = e.target as HTMLInputElement;
        const isChecked = event.checked;
        const updatedSettings = await this.ensureSettingsUpToDate();
        updatedSettings.ExtensionBehaviour.EnableNotification = isChecked ? "Badge" : "None";

        this.setSettings(updatedSettings);

        this.updateNotificationSubMenu(event);
    }

    // Notification Type
    private async NotificationType(e: Event) {
        const enableNotification = getElement<HTMLInputElement>('#enableNotification');
        if (!enableNotification) return;

        const event = e.target as HTMLInputElement;
        const isChecked = event.checked;
        const updatedSettings = await this.ensureSettingsUpToDate();

        const notificationParentIsChecked = enableNotification.checked;
        const updateBadgeState = (badge: HTMLInputElement | null) => {
            if (badge) badge.disabled = !notificationParentIsChecked;
        };
        updateBadgeState(this.notificationBadge);
        updateBadgeState(this.notificationMessageMinimum);
        updateBadgeState(this.notificationMessageFull);

        if (!notificationParentIsChecked && updatedSettings.ExtensionBehaviour.EnableNotification === "None") return;
        else if (!notificationParentIsChecked) {
            updatedSettings.ExtensionBehaviour.EnableNotification = "None";
            this.setSettings(updatedSettings);
            return;
        }
        
        updatedSettings.ExtensionBehaviour.EnableNotification = isChecked ? event.value as NotificationTypes : "None";

        this.setSettings(updatedSettings);
    }

    // Keyboard Shortcuts
    private async EnableKeyboardShortcuts(e: Event) {
        const event = e.target as HTMLInputElement;
        const isChecked = event.checked;
        if (!isChecked) this.CancelShortcutCapture();
        const updatedSettings = await this.ensureSettingsUpToDate();
        updatedSettings.ExtensionBehaviour.EnableKeyboardShortcuts = isChecked;
        await this.setSettings(updatedSettings);
        if (this.keyboardShortcutsList) this.keyboardShortcutsList.hidden = !isChecked;
        this.setShortcutStatus(isChecked ? "Keyboard shortcuts enabled." : "Keyboard shortcuts disabled.");
    }
    // Auto Subscribe
    private async EnableAutoSubscribe(e: Event) {
        const event = e.target as HTMLInputElement;
        const isChecked = event.checked;
        const updatedSettings = await this.ensureSettingsUpToDate();
        updatedSettings.ExtensionBehaviour.AutoSubscribe.EnableAutoSubscribe = isChecked;

        this.enableAutoSubscribeThreshold!.disabled = !isChecked;

        this.setSettings(updatedSettings);
    }
    // Auto Subscribe - Allow Similarity Scanning
    private async AllowSimilarityScanning(e: Event) {
        const event = e.target as HTMLInputElement;
        const isChecked = event.checked;
        const updatedSettings = await this.ensureSettingsUpToDate();
        updatedSettings.ExtensionBehaviour.AutoSubscribe.AllowSimilarityScanning = isChecked;

        this.autoSubscribeThreshold!.disabled = !isChecked;

        this.setSettings(updatedSettings);
    }
    // Auto Subscribe - Threshold
    private async AutoSubscribeThreshold(e: Event) {
        const event = e.target as HTMLInputElement;
        const isPointNine = this.ensurePointNine(event.value);
        if (!isPointNine) return;

        const updatedSettings = await this.ensureSettingsUpToDate();
        updatedSettings.ExtensionBehaviour.AutoSubscribe.Threshold = Number(event.value);

        this.setSettings(updatedSettings);
    }
    private ensurePointNine(value: string) {
        const parsedValue = Number(value);
        if (isNaN(parsedValue)) return false;
        return parsedValue <= 1 && parsedValue >= 0.9;
    }
    private setValueOptionAutoSubscribeThresholdOnly() {
        if (!this.autoSubscribeThreshold || !this.autoSubscribeThresholdValue) return;
        this.autoSubscribeThresholdValue.textContent = this.autoSubscribeThreshold.value;
        this.autoSubscribeThreshold.addEventListener("input", (event) => {
            if (!this.autoSubscribeThreshold || !this.autoSubscribeThresholdValue) return;
            const target = event.target as HTMLInputElement;
            this.autoSubscribeThresholdValue.textContent = target.value;
        });
    }
    private setValueOptionAutoSubscribeThreshold(settings: Settings) {
        if (!this.enableAutoSubscribe || !this.enableAutoSubscribeThreshold || !this.autoSubscribeThreshold) return;
        const threshold = settings.ExtensionBehaviour.AutoSubscribe.Threshold;
        const enableAutoSubscribe = settings.ExtensionBehaviour.AutoSubscribe.EnableAutoSubscribe;
        const enableAutoSubscribeThreshold = settings.ExtensionBehaviour.AutoSubscribe.AllowSimilarityScanning;
        this.autoSubscribeThreshold.value = String(threshold);
        this.enableAutoSubscribe.checked = enableAutoSubscribe;
        this.enableAutoSubscribeThreshold.checked = enableAutoSubscribeThreshold;

        
        this.enableAutoSubscribeThreshold.disabled = !this.enableAutoSubscribe.checked; // threshold changer
        this.autoSubscribeThreshold.disabled = !this.enableAutoSubscribeThreshold.checked; // slider
        
    }
    
    // Save Target
    private async SaveTarget(e: Event) {
        const event = e.target as HTMLInputElement;
        const isChecked = event.checked;
        const updatedSettings = await this.ensureSettingsUpToDate();

        const target = event.value as "Spreadsheet" | "Bookmark";
        const settingsTarget = target == "Spreadsheet" ? "GoogleSpreadsheet" : "BrowserBookmark";
        updatedSettings.ExtensionBehaviour.SaveTarget[settingsTarget] = isChecked;

        if (target === "Spreadsheet") this.updateSpreadsheetSetup(isChecked, updatedSettings.AccountAndConnections.spreadsheetUrl);
        this.setSettings(updatedSettings);
    }

    private updateSpreadsheetSetup(enabled: boolean, url: string) {
        if (this.spreadsheetSetup) this.spreadsheetSetup.hidden = !enabled;
        if (this.spreadsheetTargetReminder) this.spreadsheetTargetReminder.hidden = !enabled || Boolean(url.trim());
        if (this.spreadsheetInput && url) this.spreadsheetInput.value = url;
    }

    // Auto Update Novel Status
    private setValueOptionAutoUpdateNovelStatus(settings: Settings) {
        if (!this.autoUpdateNovelStatusAllValue || !this.autoUpdateNovelStatusOnlyRSS) return;
        const autoUpdateNovelStatus = settings.ExtensionBehaviour.AutoSetStatusScore;
        const RSSOnly = autoUpdateNovelStatus.onlyRSS;
        const allowAll = autoUpdateNovelStatus.allowAllDateFields;

        this.autoUpdateNovelStatusAllValue.checked = allowAll;
        this.autoUpdateNovelStatusOnlyRSS.checked = RSSOnly;
    }
    private async AutoUpdateNovelStatus(e: Event, type: "onlyRSS" | "allowAll") {
        if (!this.autoUpdateNovelStatusAllValue || !this.autoUpdateNovelStatusOnlyRSS) return;
        const event = e.target as HTMLInputElement;
        const isChecked = event.checked;
        const updatedSettings = await this.ensureSettingsUpToDate();

        const settingsTarget = type == 'allowAll' ? 'allowAllDateFields' : 'onlyRSS';
        if (!settingsTarget) return;

        // make sure only one can be checked at a time
        if (settingsTarget == 'onlyRSS') {
            updatedSettings.ExtensionBehaviour.AutoSetStatusScore.allowAllDateFields = false;
            this.autoUpdateNovelStatusAllValue.checked = false;
        } else if (settingsTarget == 'allowAllDateFields') {
            updatedSettings.ExtensionBehaviour.AutoSetStatusScore.onlyRSS = false;
            this.autoUpdateNovelStatusOnlyRSS.checked = false;
        }

        updatedSettings.ExtensionBehaviour.AutoSetStatusScore[settingsTarget] = isChecked;
        this.setSettings(updatedSettings);
    }

}