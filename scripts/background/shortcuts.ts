import { getSettings } from "../shared/db/Storage";
import { HermidataService } from "../popup/in/service";
import type { CurrentTab } from "../shared/types";
import type { HermidataModel } from "../shared/utils/HermidataSelector";
import { Message, ErrorMessage } from "../shared/utils/ErrorMessage";
import { saveNovelDirect } from "./rssCache";
import { ext } from "../shared/utils/BrowserCompat";

type Command = "open-rss" | "open-library" | "save-hermidata";
type ActiveWebTab = chrome.tabs.Tab & { id: number; title: string; url: string };


export function initShortcuts() {
    ext.commands.onCommand.addListener(async (command) => {
        if (!isCommand(command)) return;
        try {
            await shortcut(command);
        } catch (error) {
            new ErrorMessage("Could not run this keyboard shortcut.", undefined, {
                notificationTarget: "browser",
                details: [error],
            }).sendMessage();
        }
    });
}

function isCommand(command: string): command is Command {
    return command === "open-rss"
        || command === "open-library"
        || command === "save-hermidata";
}

async function shortcut(command: Command) {
    const settings = await getSettings();
    if (!settings.ExtensionBehaviour.EnableKeyboardShortcuts) return;

    switch (command) {
        case "open-rss":
            await openPopupInMode();
            break;

        case "open-library":
            await ext.tabs.create({ url: ext.runtime.getURL("dist/pages/Library.html") });
            break;

        case "save-hermidata":
            await saveActiveTab();
            break;
    }
}

async function openPopupInMode(): Promise<void> {
    await ext.storage.session.set({ popupMode: "rss" });
    try {
        await ext.action.openPopup();
    } catch (error) {
        try {
            await ext.storage.session.remove("popupMode");
        } catch (cleanupError) {
            console.warn("Could not clear the pending popup mode:", cleanupError);
        }
        console.warn("openPopup failed:", error);
    }
}

async function saveActiveTab(): Promise<void> {
    try {
        const tab = await getActiveWebTab();
        const settings = await getSettings();
        const service = new HermidataService(settings, saveNovelDirect, {
            confirm: async () => false,
            confirmMigration: async () => false
        });
        const hermidata = await service.saveCurrentTab(toCurrentTab(tab));

        notifySaveSuccess(hermidata);
    } catch (error) {
        notifySaveFailure(error);
    }
}

async function getActiveWebTab(): Promise<ActiveWebTab> {
    const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.title || !tab.url || !/^https?:\/\//i.test(tab.url)) {
        throw new Error("The active tab cannot be saved.");
    }
    return tab as ActiveWebTab;
}

function toCurrentTab(tab: ActiveWebTab): Pick<CurrentTab, "pageTitle" | "url"> {
    return {
        pageTitle: tab.title,
        url: tab.url
    };
}

function notifySaveSuccess(hermidata: HermidataModel): void {
    new Message(`Saved "${hermidata.title}".`, undefined, {
        notificationTarget: "browser"
    }).sendMessage();
}

function notifySaveFailure(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    new ErrorMessage(`Could not save the active tab: ${message}`, undefined, {
        notificationTarget: "browser",
        details: [error]
    }).sendMessage();
}