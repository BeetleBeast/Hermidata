import type { Hermidata, Settings } from "../../shared/types";
import { markAsCombobox, markAsOption, setActiveOption } from "../../shared/utils/Accessibility";
import type { HermidataModel } from "../../shared/utils/HermidataSelector";
import { findByTitleOrAlt, openLink } from "../../shared/utils/StringOutput";
import { LibraryBuilder } from "../build";

/** The parts of the detail page that are only shown, not edited: cover, latest release and the title search */
export class Detail extends LibraryBuilder {

    private readonly searchInput = document.querySelector<HTMLInputElement>('#search');

    private readonly autocompleteContainer = document.querySelector<HTMLDivElement>('#search-suggestions');

    private selectedIndex: number = -1;

    private readonly hermidata: HermidataModel;

    constructor(AllHermidata: Record<string, Hermidata>, settings: Settings, hermidata: HermidataModel) {
        super(AllHermidata, settings);
        this.hermidata = hermidata;
    }

    public async build(): Promise<void> {
        await this.populateImage();
        this.populateReadLatestChapterButton();
        this.populateLatestRelease();
        this.addEventListener();
    }

    public reload(): void {
        // force page reload
        window.location.reload();
    }

    private addEventListener(): void {
        this.searchInput?.addEventListener('input', (e) => this.handleSearchInput(e, this.autocompleteContainer!));
        this.searchInput?.addEventListener('keydown', (e) => this.setupSearchBar(e, this.autocompleteContainer!));
        markAsCombobox(this.searchInput, this.autocompleteContainer);

        // hide the suggestions when clicking elsewhere
        document.addEventListener('click', (e) => {
            const target = e.target as Node;
            if (target !== this.searchInput && !this.autocompleteContainer?.contains(target)) this.autocompleteContainer?.replaceChildren();
        });
    }

    private async populateImage() {
        const img = document.querySelector<HTMLImageElement>('#hermidata-img');
        if (!img) throw new Error("Image does not exist");

        // the app icon stands in when there is no cover: show it small instead of stretched over the frame
        img.addEventListener('load', () => { img.dataset.placeholder = String(img.src.endsWith('icon48.png')); });
        // a cover link that died shows the app icon instead of a broken image
        img.addEventListener('error', () => {
            const fallback = new URL(this.hermidata.GetImageDefaultPath(), location.href).href;
            if (img.src !== fallback) img.src = fallback;
        });
        img.src = await this.hermidata.getDisplayImageUrl();
        img.alt = `Cover of ${this.hermidata.title}`;
    }

    private populateReadLatestChapterButton() {
        const button = document.getElementById('hermidata-readLatest-btn');
        if (!button) throw new Error("Read latest chapter button does not exist");

        button.addEventListener('click', () => {
            openLink(this.hermidata.GetLatestRssFeed()?.latestItem?.link ?? this.hermidata.GetUrl(), 'newTab');
        });
    }

    private populateLatestRelease() {
        const latestRelease = document.getElementById('hermidata-latestRelease');
        if (!latestRelease) throw new Error("Latest release does not exist");

        const latestChapter = this.hermidata.GetLatestChapter();
        const source = this.hermidata.GetSourceOfLatestChapter();

        latestRelease.textContent = source ? `Latest: Ch. ${latestChapter} · ${source}` : `Latest: Ch. ${latestChapter}`;
    }

    private setupSearchBar(e_: KeyboardEvent, suggestionBox: HTMLDivElement) {
        const searchInput = this.searchInput;
        if (!searchInput) throw new Error('Element not found');

        const items = suggestionBox.querySelectorAll<HTMLDivElement>('.autocomplete-item');
        if (!items.length) return;

        if (e_.key === 'ArrowDown') {
            e_.preventDefault();
            this.selectedIndex = (this.selectedIndex + 1) % items.length;
            this.updateHighlightedSuggestion(items, this.selectedIndex);
        } else if (e_.key === 'ArrowUp') {
            e_.preventDefault();
            this.selectedIndex = (this.selectedIndex - 1 + items.length) % items.length;
            this.updateHighlightedSuggestion(items, this.selectedIndex);
        } else if (e_.key === 'Enter') {
            e_.preventDefault();
            // the highlighted suggestion, or else the first one
            const chosen = items[this.selectedIndex >= 0 ? this.selectedIndex : 0];
            if (chosen) this.applySearchSelection(searchInput, suggestionBox, chosen.textContent ?? '');
        }
    }

    private updateHighlightedSuggestion(items: NodeListOf<HTMLDivElement>, selectedIndex: number) {
        items.forEach((el, i) => {
            el.classList.toggle('highlighted', i === selectedIndex);
        });
        setActiveOption(this.searchInput, items, selectedIndex);
    }

    private applySearchSelection(input: HTMLInputElement, suggestionBox: HTMLDivElement, value: string) {
        input.value = value;
        suggestionBox.replaceChildren();
        input.focus();
        const entry = findByTitleOrAlt(value, this.AllHermidata);
        if (!entry) return;
        openLink('./Overview.html#/id/' + entry.id, 'sameTab');
    }

    private handleSearchInput(e: Event, suggestionBox: HTMLDivElement) {
        const target = e.target as HTMLInputElement;
        const query = target.value.trim().toLowerCase();
        suggestionBox.replaceChildren();
        this.selectedIndex = -1;

        if (!query) return;

        const filtered = Object.values(this.AllHermidata)
            .filter(item => [item.title, ...(item.meta?.altTitles || [])].some(t => t.toLowerCase().includes(query)));

        const suggestions = [...new Set(filtered.map(item => item.title))].slice(0, 7);

        for (const title of suggestions) {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            markAsOption(div, suggestionBox);
            div.textContent = title;
            div.addEventListener('click', () => this.applySearchSelection(target, suggestionBox, title));
            suggestionBox.appendChild(div);
        }
    }
}
