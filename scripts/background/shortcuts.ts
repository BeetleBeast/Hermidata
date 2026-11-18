import { getSettings } from "../shared/db/Storage";
import { HermidataService } from "../popup/in/service";
import type { CurrentTab } from "../shared/types";
import type { HermidataModel } from "../shared/utils/HermidataSelector";
import { Message, ErrorMessage, WarningMessage } from "../shared/utils/ErrorMessage";
import { saveNovelDirect } from "./rssCache";
import { ext } from "../shared/utils/BrowserCompat";
import { whenReady } from "./ready";
import { AmbiguousItemError, NoPastFoundError, UnsureMatchError } from "../shared/utils/dedicatedErrors";

type Command = "open-rss" | "open-library" | "save-hermidata";
type ActiveWebTab = chrome.tabs.Tab & { id: number; title: string; url: string };


export function initShortcuts() {
    ext.commands.onCommand.addListener(whenReady(async (command) => {
        if (!isCommand(command)) return;
        try {
            await shortcut(command);
        } catch (error) {
            new ErrorMessage("Could not run this keyboard shortcut.", undefined, {
                notificationTarget: "toast",
                locationSender: 'background',
                details: [error],
            }).sendMessage();
        }
    }));
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
            confirm: async () => false
        });
        const hermidata = await service.saveCurrentTab(toCurrentTab(tab));

        notifySaveSuccess(hermidata);
    } catch (error) {
        // expected outcome: log quietly, show a helpful hint, not an error
        if (error instanceof AmbiguousItemError) return notifyAmbiguous(error);
        if (error instanceof UnsureMatchError) return notifyUnsure(error);
        if (error instanceof NoPastFoundError) return notifyNoPast();
        notifySaveFailure(error);
    }
}

async function getActiveWebTab(): Promise<ActiveWebTab> {
    const tabs = await ext.tabs.query({ active: true, currentWindow: true });
    const tab = tabs.at(0);
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
        notificationTarget: 'toast',
        locationSender: 'background'
    }).sendMessage();
}

function notifySaveFailure(error: unknown): void {
    new ErrorMessage('Something went wrong while saving. Please try again.', undefined, {
        notificationTarget: 'toast',
        locationSender: 'background',
        details: [error], // the raw message stays in details/console, not in the toast
    }).sendMessage();
}

function notifyAmbiguous(error: AmbiguousItemError): void {
    new WarningMessage(`${error.candidateCount} saved items match this page, so nothing was saved. ` + 'Open the popup to choose which one to update.', undefined, {
        notificationTarget: 'toast',
        locationSender: 'background'
    }).sendMessage();
}

function notifyUnsure(error: UnsureMatchError): void {
    new WarningMessage(`Not sure this page is "${error.title}": you haven't saved it from this site yet, so nothing was saved. ` + 'Open the popup and save once to confirm.', undefined, {
        notificationTarget: 'toast',
        locationSender: 'background'
    }).sendMessage();
}

function notifyNoPast(): void {
    new ErrorMessage("This novel isn't in your library yet, so there's no progress to update. " + 'Add it first, then save again.', undefined, { 
        notificationTarget: 'toast',
        locationSender: 'background'
    }).sendMessage();
}
