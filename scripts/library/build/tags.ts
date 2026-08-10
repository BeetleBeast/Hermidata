import { DEMOGRAPHIC_TAGS } from "../../shared/constants";
import type { HermidataModel } from "../../shared/utils/HermidataSelector";

export class Tags {

    private readonly hermidata: HermidataModel;

    private readonly allTagsAllowed: string[];

    private readonly allDemographicsUsed: string[];
    private readonly allGenresUsed: string[];

    private readonly selectedRow: HTMLDivElement;
    private readonly allTags: HTMLDivElement;
    private readonly filterInput: HTMLInputElement;

    private isGenre: boolean;

    private _selected: Set<string> = new Set();

    public get selected(): Set<string> { return this._selected; }

    constructor(tagsUsed: string[], isGenre: boolean, hermidata: HermidataModel, { selectedRow, allTags: allTagsElement, filterInput }: { selectedRow: HTMLDivElement, allTags: HTMLDivElement, filterInput: HTMLInputElement }) {
        this.hermidata = hermidata;

        this.allTagsAllowed = tagsUsed;

        this.allDemographicsUsed = hermidata.meta.tags.filter(tag => DEMOGRAPHIC_TAGS.includes(tag));
        this.allGenresUsed = hermidata.meta.tags.filter(tag => !DEMOGRAPHIC_TAGS.includes(tag));

        this.selectedRow = selectedRow;
        this.allTags = allTagsElement;
        this.filterInput = filterInput;

        const usedTags = isGenre ? this.allGenresUsed : this.allDemographicsUsed;
        usedTags.forEach(tag => this._selected.add(tag));

        this.isGenre = isGenre;
        
        this.eventListeners();

        this.renderSelected();
        this.renderAllTags();


    }

    private eventListeners() {
        this.filterInput?.addEventListener('input', () => this.renderAllTags(this.filterInput?.value));
    }

    public createPill(tag: string, withRemoveButton: 'WithRemoveButton' | 'WithoutRemoveButton' = 'WithRemoveButton') {
        const pill = document.createElement('div');
        pill.classList.add(this.isGenre ? 'hermidata-genre' : 'hermidata-demographic');
        pill.textContent = tag;

        if (withRemoveButton === 'WithRemoveButton') {
            const rm = document.createElement('button');
            rm.type = 'button';
            rm.setAttribute('aria-label', 'Remove ' + tag);
            rm.classList.add('tag-pill-removeX');
            rm.textContent = '\u00d7';
            rm.addEventListener('click', () => { this._selected.delete(tag); this.renderSelected(); this.renderAllTags(this.filterInput?.value); });

            pill.appendChild(rm);
        }
        this.selectedRow!.appendChild(pill);
    }


    private renderSelected() {
        if (!this.selectedRow) return;

        this.selectedRow.innerHTML = '';
        if (this._selected.size === 0) {
            this.noMessageSelected();
            return;
        }
        this._selected.forEach(tag => this.createPill(tag));
    }
    private noMessageSelected() {
        if (!this.selectedRow) return;
        const hint = document.createElement('div');
        hint.textContent = 'No genres selected yet';
        hint.dataset.empty = 'true';
        hint.style.cssText = 'font-size:13px;color:var(--text-muted);';
        this.selectedRow.appendChild(hint);
    }
    private renderAllTags(filter: string | undefined = '') {
        if (!this.allTags) return;

        this.allTags.innerHTML = '';
        const list = this.allTagsAllowed.filter(t => t.toLowerCase().includes((filter || '').toLowerCase()));

        for (const tag of list) {
            const isSelected = this._selected.has(tag);
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.textContent = tag;
            chip.style.cssText = 'padding:4px 10px;border-radius:999px;font-size:13px;cursor:pointer;border:0.5px solid ' + (isSelected ? 'var(--border-accent)' : 'var(--border)') + ';background:' + (isSelected ? 'var(--bg-accent)' : 'var(--surface-1)') + ';color:' + (isSelected ? 'var(--text-accent)' : 'var(--text-primary)') + ';';

            chip.addEventListener('click', () => {
                if (this._selected.has(tag)) this._selected.delete(tag);
                else this._selected.add(tag);
                this.renderSelected();
                this.renderAllTags(this.filterInput?.value);
            });
            this.allTags.appendChild(chip);
        }
    }
}