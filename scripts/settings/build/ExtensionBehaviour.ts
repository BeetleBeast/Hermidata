import { defaultSettings } from "../../shared/constants";
import { type NotificationTypes, type Settings } from "../../shared/types";
import { getElement, setElement } from "../../shared/utils/Selection";
import { Build } from "../build";

export class ExtensionBehaviour extends Build {

    private readonly enableLightMode = getElement<HTMLInputElement>("#enableLightMode");
    private readonly allowContextMenu = getElement<HTMLInputElement>("#AllowContextMenu");

    private readonly enableNotification = getElement<HTMLInputElement>("#enableNotification");
    private readonly notificationBadge = getElement<HTMLInputElement>("#notificationBadge");
    private readonly notificationMessageMinimum = getElement<HTMLInputElement>("#notificationMessageMinimum");
    private readonly notificationMessageFull = getElement<HTMLInputElement>("#notificationMessageFull");

    private readonly enableKeyboardShortcuts = getElement<HTMLInputElement>("#enableKeyboardShortcuts");

    private readonly enableAutoSubscribe = getElement<HTMLInputElement>("#enableAutoSubscribe");
    private readonly enableAutoSubscribeThreshold = getElement<HTMLInputElement>("#enableAutoSubscribeThreshold"); // radio button ( boolean )
    private readonly autoSubscribeThreshold = getElement<HTMLInputElement>("#autoSubscribeThreshold"); // input ( number )
    private readonly autoSubscribeThresholdValue = getElement<HTMLSpanElement>("#autoSubscribeThresholdValue");

    private readonly autoUpdateNovelStatusOnlyRSS = getElement<HTMLInputElement>("#autoUpdateNovelStatusOnlyRSS");
    private readonly autoUpdateNovelStatusAllValue = getElement<HTMLInputElement>("#autoUpdateNovelStatusAllValue");

    private readonly saveTarget = getElement<HTMLInputElement>("#saveTarget");


    public async init() {
        const settings = await this.getSettings();

        // populate values from settings

        // Light mode
        this.setValueOptionLightMode(settings);
        // Context Menu
        this.setValueOptionContextMenu(settings);
        // Enable Notification
        this.setValueOptionNotification(settings);
        // Keyboard Shortcuts
        this.setValueOptionKeyboardShortcuts(settings);
        // Auto Subscribe
        this.setValueOptionAutoSubscribe(settings);
        // Auto Subscribe - Threshold
        this.setValueOptionAutoSubscribeThreshold(settings)

        // Auto Subscribe Threshold vaule only
        this.setValueOptionAutoSubscribeThresholdOnly();
        // Save Target
        this.setValueOptionSaveTarget(settings);
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
        
        this.enableAutoSubscribe?.addEventListener("change", (e) => this.EnableAutoSubscribe(e));
        this.enableAutoSubscribeThreshold?.addEventListener("change", (e) => this.AllowSimilarityScanning(e));
        this.autoSubscribeThreshold?.addEventListener("change", (e) => this.AutoSubscribeThreshold(e));

        this.autoUpdateNovelStatusOnlyRSS?.addEventListener("change", (e) => this.AutoUpdateNovelStatus(e, 'onlyRSS'));
        this.autoUpdateNovelStatusAllValue?.addEventListener("change", (e) => this.AutoUpdateNovelStatus(e, 'allowAll'));
        
        this.saveTarget?.addEventListener("change", (e) => this.SaveTarget(e));
    }
    public async resetValues() {
        // reset all values from inputs to default
        const settings = await this.getSettings();
        const updatedSettings: Settings = { ...settings, ExtensionBehaviour: { ...defaultSettings.ExtensionBehaviour } };
        // reset settings in IndexedDB
        await this.setSettings(updatedSettings);
    }
    public async cancelValues() {
        // reset page values to current settings
        const settings = await this.getSettings();
        this.setValueOptionLightMode(settings);
        this.setValueOptionContextMenu(settings);
        this.setValueOptionNotification(settings);
        this.setValueOptionKeyboardShortcuts(settings);
        this.setValueOptionAutoSubscribe(settings);
        this.setValueOptionSaveTarget(settings);
    }
    public async saveValues() {
        // values are saved on input change, so no need to do anything here
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
    }
    private setValueOptionAutoSubscribe(settings: Settings) {
        const autoSubscribe = settings.ExtensionBehaviour.AutoSubscribe.EnableAutoSubscribe;
        setElement<HTMLInputElement>("#autoSubscribe", el => el.checked = autoSubscribe);
    }
    private setValueOptionSaveTarget(settings: Settings) {
        const googleSpreadsheet = settings.ExtensionBehaviour.SaveTarget.GoogleSpreadsheet;
        const browserBookmark = settings.ExtensionBehaviour.SaveTarget.BrowserBookmark;
        setElement<HTMLInputElement>("#saveToGoogleSpreadsheet", el => el.checked = googleSpreadsheet);
        setElement<HTMLInputElement>("#saveToBrowserBookmark", el => el.checked = browserBookmark);
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
        const updatedSettings = await this.ensureSettingsUpToDate();
        updatedSettings.ExtensionBehaviour.EnableKeyboardShortcuts = isChecked;

        this.setSettings(updatedSettings);
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
        const ennableAutoSubscribe = settings.ExtensionBehaviour.AutoSubscribe.EnableAutoSubscribe;
        const enableAutoSubscribeThreshold = settings.ExtensionBehaviour.AutoSubscribe.AllowSimilarityScanning;
        this.autoSubscribeThreshold.value = String(threshold);
        this.enableAutoSubscribe.checked = ennableAutoSubscribe;
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

        this.setSettings(updatedSettings);
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