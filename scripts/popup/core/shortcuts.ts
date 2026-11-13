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

type PopupMode = "classic" | "rss";

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


async function init() {

    const { popupMode } = await ext.storage.session.get<{ popupMode: PopupMode }>("popupMode");
    
    await ext.storage.session.remove("popupMode");
    // open in RSS mode if set to "rss", otherwise do nothing (default is classic mode).
    if (popupMode === "rss") {
        await (await getModeSwitcher()).setMode("rss");
    }
}

await init();


let pendingG = false;
let gTimer: ReturnType<typeof setTimeout> | undefined;

document.addEventListener("keydown", async (e) => {
    const target = e.target as HTMLElement;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;

    // Works even while typing
    if (e.key === "Escape") {
        const search = document.querySelector<HTMLInputElement>("#search");

        if (!search) return;

        if (typing && search.value) {
            search.value = "";
            search.dispatchEvent(new Event("input"));
        } else window.close();

        return;
    }
    if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        try {
            await (await getModeSwitcher()).saveCurrentHermidata();
        } catch (error) {
            new ErrorMessage("Could not save this item.", undefined, { details: [error] }).sendMessage();
        }
        return;
    }
    if (typing || e.ctrlKey || e.altKey || e.metaKey) return;

    // "g" then a letter
    if (pendingG) {
        clearTimeout(gTimer);
        pendingG = false;
        const k = e.key.toLowerCase();
        if (k === "l") ext.tabs.create({ url: ext.runtime.getURL("dist/pages/Library.html") });
        if (k === "s") ext.tabs.create({ url: ext.runtime.getURL("dist/pages/settings.html") });

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
});

export class ModeSwitcher {

    private currentMode: "classic" | "rss" = "classic";

    private Hermidata: HermidataModel | null = null;

    private RSS: RSS | null = null;

    public async init() {

        const { hermidata } = await this.createHermidataFromDOM();


        this.Hermidata = hermidata;

        this.RSS = new RSS(this.Hermidata, await getAllHermidata());
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

    private async createHermidataFromDOM(): Promise<{ hermidata: HermidataModel, pastHermidata: PastHermidata }> {
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
        await Hermidata.SetPast(past);
        
        return { hermidata: Hermidata, pastHermidata: past };
    }

}
