// Start in the requested mode

import { RSS } from "../../rss/main";
import { getAllHermidata, getSettings } from "../../shared/db/Storage";
import type { CurrentTab, Settings } from "../../shared/types";
import { ext } from "../../shared/utils/BrowserCompat";
import { HermidataModel } from "../../shared/utils/HermidataSelector";
import { getChapterFromTitle } from "../../shared/utils/StringOutput";
import { ErrorMessage } from "../../shared/utils/ErrorMessage";
import { HermidataService } from "../in/service";
import { PastHermidata } from "./Past";

let modeSwitcher: ModeSwitcher | undefined;
let modeSwitcherPromise: Promise<ModeSwitcher> | undefined;

async function getModeSwitcher(): Promise<ModeSwitcher> {
    if (modeSwitcher) return modeSwitcher;
    modeSwitcherPromise ??= (async () => {
        const instance = new ModeSwitcher();
        await instance.init();
        modeSwitcher = instance;
        return instance;
    })();
    return modeSwitcherPromise;
}


let pendingG = false;
let gTimer: ReturnType<typeof setTimeout> | undefined;

export async function shortcutEventListener(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;

    // Works even while typing
    // if closing window
    if (e.key === "Escape") return closeWindow(typing);
    // if saving
    if (e.ctrlKey && e.key === "Enter") return saveProgress(e);


    if (typing || e.ctrlKey || e.altKey || e.metaKey) return;

    // "g" then a letter
    if (pendingG) {
        clearTimeout(gTimer);
        pendingG = false;
        if (e.key.toLowerCase() === "l") ext.tabs.create({ url: ext.runtime.getURL("dist/pages/Library.html") });
        if (e.key.toLowerCase() === "s") ext.tabs.create({ url: ext.runtime.getURL("dist/pages/settings.html") });

        // Not implemented yet, but could be added in the future
        // if (k === "n") ext.tabs.create({ url: ext.runtime.getURL("dist/pages/Notification.html") });
        // if (k === "r") ext.tabs.create({ url: ext.runtime.getURL("dist/pages/ReadingList.html") });
        return;
    }
    if (e.key.toLowerCase() === "g") {
        pendingG = true;
        gTimer = setTimeout(() => (pendingG = false), 800);
        return;
    }

    if (e.key === "1") await (await getModeSwitcher()).setMode("classic");
    if (e.key === "2") await (await getModeSwitcher()).setMode("rss");
}

function closeWindow(typing: boolean) {
    const search = document.querySelector<HTMLInputElement>("#search");

    if (!search) return;

    if (typing && search.value) {
        search.value = "";
        search.dispatchEvent(new Event("input"));
    }
    else window.close();
}
async function saveProgress(e: KeyboardEvent) {
    e.preventDefault();
    setSaveInProgress(true);
    try {
        await (await getModeSwitcher()).saveCurrentHermidata();
        setTimeout(() => window.close(), 400);
        
    } catch (error) {
        new ErrorMessage("Could not save this item.", undefined, { details: [error] }).sendMessage();
    } finally {
        setSaveInProgress(false);
    }
}


function setSaveInProgress(isSaving: boolean): void {
    const button = document.querySelector<HTMLButtonElement>('#save');
    if (!button) return;

    button.disabled = isSaving;
    button.setAttribute('aria-busy', String(isSaving));
    button.dataset.saving = String(isSaving);
}

export class ModeSwitcher {

    private currentMode: "classic" | "rss" = "classic";

    private Hermidata: HermidataModel | null = null;

    private RSS: RSS | null = null;

    public async init() {

        this.Hermidata = await this.createHermidataFromDOM();

        this.RSS = new RSS(this.Hermidata!, await getAllHermidata());
    }

    public async setMode(mode: "classic" | "rss"): Promise<void> {
        if (this.currentMode === mode) return;
        this.currentMode = mode;

        switch (mode) {
            case "classic":
                this.RSS?.openClassic();
                break;
            case "rss":
                if (!this.RSS) throw new Error("RSS not initialized.");
                await this.RSS.openRSS();
                break;
        }
    }

    public async saveCurrentHermidata(): Promise<void> {
        if (!this.Hermidata) throw new Error("Hermidata not initialized.");
        await new HermidataService(await getSettings()).saveHermidata(this.Hermidata);
    }

    static async getCurrentTabInfo(): Promise<CurrentTab> {
        // Get active tab info
        return new Promise<CurrentTab>((resolve, reject) => {
            ext.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const tab = tabs[0];
                if (!tab.title || !tab.url) reject(new Error(ext.runtime.lastError?.message)); 
                const currentTab: CurrentTab = {
                    currentChapter: getChapterFromTitle(tab.title, tab.url!) || 0,
                    pageTitle: tab.title || "Untitled Page",
                    url: tab.url || "NO URL FOUND"
                };
                resolve(currentTab);
            });
        });
    }

    private async createHermidataFromDOM(): Promise<HermidataModel | null> {
        const [ CurrentTabInfo, settings ]: [CurrentTab, Settings] = await Promise.all([
            ModeSwitcher.getCurrentTabInfo(),
            getSettings(),
        ]);
    
        const defaultNovelType = settings.DefaultBookmarkSettings.DefaultChoice.novelType;
        const defaultNovelStatus = settings.DefaultBookmarkSettings.DefaultChoice.novelStatus;
        const defaultReadStatus = settings.DefaultBookmarkSettings.DefaultChoice.readStatus;
    
        // create a Hermidata baseplate
        const Hermidata = new HermidataModel(HermidataModel.from(defaultNovelType, defaultReadStatus, defaultNovelStatus));
        // set the values from the tab
        Hermidata.SetFromTab(CurrentTabInfo);
        // initialize the  PastHermidata class
        const past = new PastHermidata(Hermidata);
        // create the Hermidata with all values set from a past if it exists
        const hasPastAndSaved = await Hermidata.SetPast(past);

        // if no past was found, return
        if (!hasPastAndSaved) return null;
        
        return Hermidata;
    }

}
