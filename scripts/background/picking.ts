import type { PickedElementData, RuntimeMessage } from "../content/picker";
import { saveHermidata } from "../shared/db/Storage";
import type { Hermidata } from "../shared/types";
import { HermidataModel } from "../shared/utils/HermidataSelector";
import { getMultipleTitles, TrimTitle } from "../shared/utils/StringOutput";



const pendingPicks = new Map<number, (result: PickedElementData | null) => void>();

chrome.runtime.onMessage.addListener((msg: RuntimeMessage, sender) => {
    const tabId = sender.tab?.id;

    if (tabId === undefined) return;
    
    const resolve = pendingPicks.get(tabId);
    if (!resolve) return;

    if (msg.action === "elementPicked") resolve(msg.data);
    else if (msg.action === "pickingCancelled") resolve(null);

    pendingPicks.delete(tabId);
});


class ElementPicker {

    private currentTabId: number | null = null;

    public async init(entry: HermidataModel, tabId: number) {

        if (!entry) return;

        // start picking
        const picked = await this.getPickerElement(tabId);
        if (!picked) {
            console.log('picker cancelled');
            return;
        }
        // get all new alt. titles
        const newTitle = getMultipleTitles(picked);
        if (!newTitle) return;
        
        // normalize titles
        entry = this.normalizeTitles(newTitle, entry);
        

        // give feedback to user
        await this.giveFeedback();

        // Save to storage
        await saveHermidata(entry.id, entry.toJSON());
    }

    private normalizeTitles(newTitle: string[], entry: HermidataModel) {
        // Normalize and deduplicate
        for (let i = 0; i < newTitle.length; i++) {
            const trimmed = TrimTitle.trimTitle(newTitle[i], entry.GetUrl()).title;
            entry.meta.altTitles = Array.from(
                new Set([...(entry.meta.altTitles || []), trimmed])
            );
        }
        return entry;
    }

    private async giveFeedback() {
        if (this.currentTabId) return;

        console.warn("No current tab ID found.");

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab.id) {
            console.warn("No active tab found.");
            return null;
        }
        this.currentTabId = tab.id;
    }

    private async getPickerElement(tabId: number): Promise<PickedElementData | null> {
        this.currentTabId = tabId;

        await chrome.tabs.sendMessage(tabId, { action: "startPicking" });

        return new Promise<PickedElementData | null>((resolve) => pendingPicks.set(tabId, resolve));
    }
}


export async function handleStartPickingFlow(entry: Hermidata, tabId: number) {

    const hermidata = new HermidataModel(entry);

    const picker = new ElementPicker();

    await picker.init(hermidata, tabId);
}