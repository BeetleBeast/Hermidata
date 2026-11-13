// Start in the requested mode

import { RSS } from "../../rss/main";
import { getAllHermidata, getSettings } from "../../shared/db/Storage";
import type { CurrentTab, KeyboardShortcutSettings, Settings } from "../../shared/types";
import { ext } from "../../shared/utils/BrowserCompat";
import { HermidataModel } from "../../shared/utils/HermidataSelector";
import { getChapterFromTitle } from "../../shared/utils/StringOutput";
import { ErrorMessage } from "../../shared/utils/ErrorMessage";
import { HermidataService } from "../in/service";
import { PastHermidata } from "./Past";
import { matchesKeyboardShortcut, matchesShortcutKey } from "../../shared/utils/KeyboardShortcuts";

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

type ShortcutSettings = { enabled: boolean; shortcuts: KeyboardShortcutSettings };

const SEQUENCE_TIMEOUT_MS = 800;

let pendingSequence: { key: string; timer: ReturnType<typeof setTimeout> } | undefined;
let keyboardShortcutSettings: Promise<ShortcutSettings> | undefined;



// ---------- Main listener ----------

export async function shortcutEventListener(e: KeyboardEvent) {
    const typing = isTyping(e);

    // Works even while typing
    if (e.key === "Escape") return closeWindow(typing);

    const { enabled, shortcuts } = await loadShortcutSettings();
    if (!enabled) return;

    const firstKey = clearPendingSequence();
    if (firstKey && await tryCompleteSequence(e, firstKey, shortcuts)) return;

    if (matchesKeyboardShortcut(e, shortcuts.saveCurrentPage)) return saveProgress(e);
    if (matchesKeyboardShortcut(e, shortcuts.focusSearch)) return focusOnSearchBar(e);

    // Everything below must not fire while the user is typing
    if (typing) return;

    if (tryStartSequence(e, shortcuts)) return;

    await tryHandleModeSwitch(e, shortcuts);
}

// ---------- Settings ----------

function loadShortcutSettings(): Promise<ShortcutSettings> {
    keyboardShortcutSettings ??= getSettings().then(settings => ({
        enabled: settings.ExtensionBehaviour.EnableKeyboardShortcuts,
        shortcuts: settings.ExtensionBehaviour.KeyboardShortcuts,
    }));
    return keyboardShortcutSettings;
}

// ---------- Event helpers ----------

function isTyping(e: KeyboardEvent): boolean {
    const target = e.target as HTMLElement;
    return /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;
}

function openExtensionPage(path: string) {
    return ext.tabs.create({ url: ext.runtime.getURL(path) });
}

async function switchMode(mode: "classic" | "rss") {
    await (await getModeSwitcher()).setMode(mode);
}

// ---------- Two-key sequences (e.g. "g+s") ----------

/** Splits "a+b" into [a, b]. Returns undefined if it isn't exactly two keys. */
function parseSequence(sequence: string): [string, string] | undefined {
    const [first, second, extra] = sequence.split("+");
    return first && second && !extra ? [first, second] : undefined;
}

function clearPendingSequence(): string | undefined {
    if (!pendingSequence) return undefined;
    clearTimeout(pendingSequence.timer);
    const { key } = pendingSequence;
    pendingSequence = undefined;
    return key;
}

function startPendingSequence(key: string) {
    const timer = setTimeout(() => {
        if (pendingSequence?.timer === timer) pendingSequence = undefined;
    }, SEQUENCE_TIMEOUT_MS);
    pendingSequence = { key, timer };
}

function completesSequence(e: KeyboardEvent, sequence: string, firstKey: string): boolean {
    const keys = sequence.split("+");
    return keys.length === 2
        && matchesShortcutKey(e, keys[1])
        && keys[0].toLowerCase() === firstKey.toLowerCase();
}

/** Called when a first key is already pending. Returns true if the event was handled. */
async function tryCompleteSequence(e: KeyboardEvent, firstKey: string, shortcuts: KeyboardShortcutSettings): Promise<boolean> {
    const targets = [
        { sequence: shortcuts.openSettings, page: "dist/pages/settings.html" },
        { sequence: shortcuts.openLibraryPopup, page: "dist/pages/Library.html" },
    ];

    for (const { sequence, page } of targets) {
        if (completesSequence(e, sequence, firstKey)) {
            e.preventDefault();
            await openExtensionPage(page);
            return true;
        }
    }
    return false;
}

/** Starts a new sequence if this event is the first key of one. Returns true if started. */
function tryStartSequence(e: KeyboardEvent, shortcuts: KeyboardShortcutSettings): boolean {
    for (const sequence of [shortcuts.openSettings, shortcuts.openLibraryPopup]) {
        const parsed = parseSequence(sequence);
        if (!parsed || !matchesShortcutKey(e, parsed[0])) continue;

        e.preventDefault();
        startPendingSequence(parsed[0]);
        return true;
    }
    return false;
}

// ---------- Mode switching ----------

async function tryHandleModeSwitch(
    e: KeyboardEvent,
    shortcuts: KeyboardShortcutSettings,
): Promise<void> {
    if (matchesKeyboardShortcut(e, shortcuts.switchToClassic)) {
        e.preventDefault();
        await switchMode("classic");
    } else if (matchesKeyboardShortcut(e, shortcuts.switchToRSS)) {
        e.preventDefault();
        await switchMode("rss");
    }
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
async function focusOnSearchBar(e: KeyboardEvent) {
    e.preventDefault();
    const searchInRSSMode = document.querySelector<HTMLInputElement>(".search-input");

    const search = searchInRSSMode;
    if (!search) return;

    search.focus();
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
