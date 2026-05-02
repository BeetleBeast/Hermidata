import type { NotificationTypes, Settings } from "../../shared/types";
import { getElement, setElement } from "../../utils/Selection";
import { Build } from "../build";

export class ExtensionBehaviour extends Build {

    private readonly enableLightMode = getElement<HTMLInputElement>("#enableLightMode");
    private readonly allowContextMenu = getElement<HTMLInputElement>("#AllowContextMenu");

    private readonly anableNotification = getElement<HTMLInputElement>("#enableNotification");
    private readonly notificationBadge = getElement<HTMLInputElement>("#notificationBadge");
    private readonly notificationMessageMinimum = getElement<HTMLInputElement>("#notificationMessageMinimum");
    private readonly notificationMessageFull = getElement<HTMLInputElement>("#notificationMessageFull");

    private readonly enableKeyboardShortcuts = getElement<HTMLInputElement>("#enableKeyboardShortcuts");
    private readonly enableAutoSubscribe = getElement<HTMLInputElement>("#enableAutoSubscribe");
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
        // Save Target
        this.setValueOptionSaveTarget(settings);


        this.bindEvents();
    }
    private bindEvents() {
        this.enableLightMode?.addEventListener("change", (e) => this.EnableLightMode(e));
        this.allowContextMenu?.addEventListener("change", (e) => this.AllowContextMenu(e));

        this.anableNotification?.addEventListener("change", (e) => this.EnableNotification(e));

        this.notificationBadge?.addEventListener("change", (e) => this.NotificationType(e));
        this.notificationMessageMinimum?.addEventListener("change", (e) => this.NotificationType(e));
        this.notificationMessageFull?.addEventListener("change", (e) => this.NotificationType(e));

        this.enableKeyboardShortcuts?.addEventListener("change", (e) => this.EnableKeyboardShortcuts(e));
        this.enableAutoSubscribe?.addEventListener("change", (e) => this.EnableAutoSubscribe(e));
        this.saveTarget?.addEventListener("change", (e) => this.SaveTarget(e));
    }


    private setValueOptionLightMode(settings: Settings) {
        const isDarkMode = settings.ExtensionBehaviour.EnableLightMode;
        setElement<HTMLInputElement>("#enableLightMode", el => el.checked = isDarkMode);
    }
    private setValueOptionContextMenu(settings: Settings) {
        const AllowContextMenu = settings.ExtensionBehaviour.AllowContextMenu;
        setElement<HTMLInputElement>("#AllowContextMenu", el => el.checked = AllowContextMenu);
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
        setElement<HTMLInputElement>("#enableNotification", el => el.checked = notification !== "None");
    }
    private setValueOptionKeyboardShortcuts(settings: Settings) {
        const keyboardShortcuts = settings.ExtensionBehaviour.EnableKeyboardShortcuts;
        setElement<HTMLInputElement>("#enableKeyboardShortcuts", el => el.checked = keyboardShortcuts);
    }
    private setValueOptionAutoSubscribe(settings: Settings) {
        const autoSubscribe = settings.ExtensionBehaviour.EnableAutoSubscribe;
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
    }

    // Notification Type
    private async NotificationType(e: Event) {
        const event = e.target as HTMLInputElement;
        const isChecked = event.checked;
        const updatedSettings = await this.ensureSettingsUpToDate();
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
        updatedSettings.ExtensionBehaviour.EnableAutoSubscribe = isChecked;

        this.setSettings(updatedSettings);
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

}