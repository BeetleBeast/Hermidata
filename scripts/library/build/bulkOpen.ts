import type { Hermidata, Settings } from "../../shared/types";
import { HermidataModel } from "../../shared/utils/HermidataSelector";
import { openLink } from "../../shared/utils/StringOutput";
import { customConfirm } from "../../popup/frontend/confirm";
import { LibraryBuilder } from "../build";

const TOAST_DURATION = 5000;
/** Opening more tabs than this at once asks for confirmation first */
export const BULK_OPEN_CONFIRM_THRESHOLD = 10;

/** The url of the bookmark each entry is reading, entries without one are only counted */
export function collectOpenableUrls(entries: Hermidata[]): { urls: string[]; skipped: number } {
    const urls = entries.map(entry => new HermidataModel(entry).GetUrl()).filter(Boolean);
    return { urls, skipped: entries.length - urls.length };
}

export function bulkOpenSummary(opened: number, skipped: number): string {
    const openedText = `Opened ${opened} ${opened === 1 ? 'tab' : 'tabs'}.`;
    return skipped ? `${openedText} Skipped ${skipped} without a link.` : openedText;
}

/**
 * Opening every ticked entry in its own tab.
 *
 * Selection is the shared entry checkboxes ( merging uses them too ), the button stands out once at least one is ticked.
 * Entries without a link are skipped and counted in the toast, and opening more than BULK_OPEN_CONFIRM_THRESHOLD tabs
 * asks first.
 */
export class HermidataBulkOpen extends LibraryBuilder {

    private readonly openButton = document.querySelector<HTMLButtonElement>('#bulkOpen');
    private readonly entriesContainer = document.querySelector<HTMLDivElement>('#library-entries-container');
    private readonly toast = document.querySelector<HTMLDivElement>('#library-toast');
    private toastTimer: number | undefined;

    constructor(AllHermidata: Record<string, Hermidata>, settings: Settings) {
        super(AllHermidata, settings);
    }

    public build(): void {
        // one delegated listener survives feed rebuilds
        this.entriesContainer?.addEventListener('change', (e) => {
            if ((e.target as HTMLElement).matches('.hermidata-item-checkbox')) this.refreshButton();
        });
        this.openButton?.addEventListener('click', () => void this.openSelected());
        this.refreshButton();
    }
    /** Entries were rebuilt ( their checkboxes start unchecked ): refresh the button state */
    public reload(): void {
        this.refreshButton();
    }

    /** the button stands out once at least one entry is ticked */
    private refreshButton(): void {
        if (!this.openButton) return;
        const ready = this.selectedEntries.length > 0;
        this.openButton.dataset.ready = String(ready);
        this.openButton.title = ready ? 'Open the ticked entries in new tabs' : 'Tick the entries you want to open';
    }

    private get selectedEntries(): Hermidata[] {
        const items = document.querySelectorAll<HTMLDivElement>('.hermidata-item:has(.hermidata-item-checkbox:checked)');
        return Array.from(items, item => this.AllHermidata[this.GetHashItem(item)]).filter(Boolean);
    }

    private async openSelected(): Promise<void> {
        const { urls, skipped } = collectOpenableUrls(this.selectedEntries);
        if (!urls.length) return this.showToast(skipped ? bulkOpenSummary(0, skipped) : 'Tick the entries you want to open, then press Open in new tabs again.');

        if (urls.length > BULK_OPEN_CONFIRM_THRESHOLD && !await customConfirm(`Open ${urls.length} tabs at once?`, { accept: 'Open', reject: 'Cancel' })) return;

        // one after the other so the tabs keep the order of the list
        for (const url of urls) await openLink(url, 'newTab');
        this.showToast(bulkOpenSummary(urls.length, skipped));
    }

    private showToast(message: string): void {
        if (!this.toast) return;
        this.toast.textContent = message;
        this.toast.hidden = false;
        window.clearTimeout(this.toastTimer);
        this.toastTimer = window.setTimeout(() => { if (this.toast) this.toast.hidden = true; }, TOAST_DURATION);
    }
}
