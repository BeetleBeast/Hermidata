import { RELATED_WORK_LABELS } from "../../shared/constants";
import type { CommitChange, Hermidata, RelatedEntry, RelatedWorkType, Settings } from "../../shared/types";
import { markAsCombobox, markAsOption, setActiveOption } from "../../shared/utils/Accessibility";
import type { HermidataModel } from "../../shared/utils/HermidataSelector";
import { resolveRelatedGroup } from "../../shared/utils/Relations";
import { LibraryBuilder } from "../build";

const RELATION_TYPES = Object.keys(RELATED_WORK_LABELS) as RelatedWorkType[];
/** What a title added from the search is, until it is changed */
const DEFAULT_ADD_TYPE: RelatedWorkType = 'sequel';
const MAX_SUGGESTIONS = 7;

/**
 * The related titles card: the whole group of related titles, this one included, each with its type ( main story,
 * sequel, adaptation, … ) and each opening its own detail page. A type describes the title itself, so the card
 * reads the same on every title of the group, and any title's type, or the group itself, can be changed from here.
 */
export class RelatedWorks extends LibraryBuilder {

    private readonly list = document.querySelector<HTMLUListElement>('#hermidata-relations-list');
    private readonly count = document.querySelector<HTMLElement>('#hermidata-relations-count');
    private readonly addButton = document.querySelector<HTMLButtonElement>('#hermidata-relations-add');
    private readonly form = document.querySelector<HTMLFormElement>('#hermidata-relations-form');
    private readonly typeSelect = document.querySelector<HTMLSelectElement>('#hermidata-relations-type');
    private readonly search = document.querySelector<HTMLInputElement>('#hermidata-relations-search');
    private readonly suggestions = document.querySelector<HTMLDivElement>('#hermidata-relations-suggestions');
    private readonly cancelButton = document.querySelector<HTMLButtonElement>('#hermidata-relations-cancel');

    private selectedIndex = -1;

    private readonly hermidata: HermidataModel;
    private readonly commit: CommitChange;

    constructor(AllHermidata: Record<string, Hermidata>, settings: Settings, hermidata: HermidataModel, commit: CommitChange) {
        super(AllHermidata, settings);
        this.hermidata = hermidata;
        this.commit = commit;
    }

    public build(): void {
        this.typeSelect?.replaceChildren(...this.buildTypeOptions());
        if (this.typeSelect) this.typeSelect.value = DEFAULT_ADD_TYPE;
        markAsCombobox(this.search, this.suggestions);
        this.bindEvents();
        this.render();
    }

    public reload(): void {
        window.location.reload();
    }

    public render(): void {
        if (!this.list) return;
        const group = this.relatedGroup();
        if (this.count) this.count.textContent = group.length ? String(group.length - 1) : '';

        if (group.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'ov-empty';
            empty.textContent = 'No related titles yet. Link the sequels, side stories and adaptations in your library: they share one list, the same on each of their pages.';
            this.list.replaceChildren(empty);
            return;
        }
        this.list.replaceChildren(...group.map(member => this.buildRow(member)));
    }

    /** The titles of the group in the order of the type picker, then by title */
    private relatedGroup(): RelatedEntry[] {
        return resolveRelatedGroup(this.hermidata, this.AllHermidata).sort((a, b) =>
            RELATION_TYPES.indexOf(a.type) - RELATION_TYPES.indexOf(b.type) || a.entry.title.localeCompare(b.entry.title, this.locale));
    }

    /** This title is in the list too, so its own type can be changed, but it is not opened or removed from here */
    private buildRow({ type, entry }: RelatedEntry): HTMLLIElement {
        const isThis = entry.id === this.hermidata.id;
        const row = document.createElement('li');
        row.className = 'ov-relation';
        row.dataset.current = String(isThis);

        const relation = document.createElement('select');
        relation.className = 'ov-field ov-select ov-relation-type';
        relation.setAttribute('aria-label', isThis ? 'Type of this title' : `Type of ${entry.title}`);
        relation.replaceChildren(...this.buildTypeOptions());
        relation.value = type;
        relation.addEventListener('change', () => void this.link(entry, relation.value as RelatedWorkType));

        const title = document.createElement(isThis ? 'span' : 'a');
        title.className = 'ov-relation-title';
        title.textContent = isThis ? `${entry.title} (this title)` : entry.title;
        if (title instanceof HTMLAnchorElement) {
            title.href = `#/id/${entry.id}`;
            title.title = `Open ${entry.title}`;
        }

        const novelType = document.createElement('span');
        novelType.className = 'ov-relation-meta';
        novelType.textContent = entry.novelType;

        row.append(relation, title, novelType);
        if (!isThis) row.append(this.buildRemoveButton(entry));
        return row;
    }

    private buildRemoveButton(entry: Hermidata): HTMLButtonElement {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'ov-icon-btn ov-relation-remove';
        remove.setAttribute('aria-label', `Remove ${entry.title} from the related titles`);
        remove.title = 'Remove from the related titles';
        remove.innerHTML = '<svg class="ov-icon" aria-hidden="true"><use href="#i-close"/></svg>';
        remove.addEventListener('click', () => void this.unlink(entry));
        return remove;
    }

    private buildTypeOptions(): HTMLOptionElement[] {
        return RELATION_TYPES.map(type => new Option(RELATED_WORK_LABELS[type], type));
    }

    // -- linking --

    private bindEvents(): void {
        this.addButton?.addEventListener('click', () => this.setFormOpen(Boolean(this.form?.hidden)));
        this.cancelButton?.addEventListener('click', () => this.setFormOpen(false));
        this.form?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.pickSuggestion();
        });

        this.search?.addEventListener('input', () => this.showSuggestions());
        this.search?.addEventListener('keydown', (event) => this.handleSearchKey(event));

        // hide the suggestions when clicking elsewhere
        document.addEventListener('click', (event) => {
            const target = event.target as Node;
            if (target !== this.search && !this.suggestions?.contains(target)) this.suggestions?.replaceChildren();
        });
    }

    private setFormOpen(open: boolean): void {
        if (!this.form) return;
        this.form.hidden = !open;
        this.addButton?.setAttribute('aria-expanded', String(open));
        if (this.search) this.search.value = '';
        this.suggestions?.replaceChildren();
        if (open) this.search?.focus();
        else this.addButton?.focus();
    }

    /** Library titles matching the search, leaving out the ones already in the group ( this title among them ) */
    private showSuggestions(): void {
        if (!this.suggestions) return;
        this.suggestions.replaceChildren();
        this.selectedIndex = -1;

        const query = this.search?.value.trim().toLocaleLowerCase() ?? '';
        if (!query) return;

        const inGroup = new Set([this.hermidata.id, ...this.relatedGroup().map(member => member.entry.id)]);
        const matches = Object.values(this.AllHermidata)
            .filter(item => !inGroup.has(item.id))
            .filter(item => [item.title, ...(item.meta?.altTitles ?? [])].some(title => title.toLocaleLowerCase().includes(query)))
            .slice(0, MAX_SUGGESTIONS);

        for (const item of matches) {
            const option = document.createElement('div');
            option.className = 'autocomplete-item';
            markAsOption(option, this.suggestions);
            option.textContent = `${item.title} · ${item.novelType}`;
            option.dataset.id = item.id;
            option.addEventListener('click', () => void this.link(item, this.chosenType()));
            this.suggestions.appendChild(option);
        }
    }

    /** Escape closes the form; the arrow keys move the highlight through the suggestions */
    private handleSearchKey(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            event.preventDefault();
            this.setFormOpen(false);
            return;
        }
        const options = this.suggestions?.querySelectorAll<HTMLDivElement>('.autocomplete-item');
        if (!options?.length) return;
        const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
        if (!step) return;
        event.preventDefault();
        this.selectedIndex = (this.selectedIndex + step + options.length) % options.length;
        options.forEach((option, index) => option.classList.toggle('highlighted', index === this.selectedIndex));
        setActiveOption(this.search, options, this.selectedIndex);
    }

    /** Enter links the highlighted suggestion, or else the first one */
    private pickSuggestion(): void {
        const options = this.suggestions?.querySelectorAll<HTMLDivElement>('.autocomplete-item');
        const chosen = options?.[this.selectedIndex >= 0 ? this.selectedIndex : 0];
        const item = chosen?.dataset.id ? this.AllHermidata[chosen.dataset.id] : undefined;
        if (item) void this.link(item, this.chosenType());
    }

    private chosenType(): RelatedWorkType {
        return (this.typeSelect?.value as RelatedWorkType | undefined) ?? DEFAULT_ADD_TYPE;
    }

    /**
     * Put `item` in the group as `type`, or change its type ( this title's own too ); every title of the group is written.
     * Not undoable from the toast: an undo would only put back this title's copy of the group.
     */
    private link(item: Hermidata, type: RelatedWorkType): Promise<void> {
        if (this.form && !this.form.hidden) this.setFormOpen(false);
        const name = item.id === this.hermidata.id ? 'This title' : `“${item.title}”`;
        return this.commit(`${name} set as ${RELATED_WORK_LABELS[type].toLocaleLowerCase()}`, async () => {
            this.adopt(await this.db.linkHermidata(this.hermidata.id, item.id, type));
        }, { undoable: false }).then(() => this.render());
    }

    private unlink(item: Hermidata): Promise<void> {
        return this.commit(`Removed “${item.title}” from the related titles`, async () => {
            this.adopt(await this.db.unlinkHermidata(this.hermidata.id, item.id));
        }, { undoable: false }).then(() => this.render());
    }

    /**
     * Take the group as stored: this title's links into the page's model ( so the next save keeps them ), the other
     * titles into the library copy the card reads, so the card shows the group as it is now.
     */
    private adopt(stored: Hermidata[]): void {
        for (const entry of stored) {
            if (entry.id === this.hermidata.id) this.hermidata.meta.relations = entry.meta.relations;
            else this.AllHermidata[entry.id] = entry;
        }
    }
}
