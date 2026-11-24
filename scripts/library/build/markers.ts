import type { Bookmark, CommitChange, Hermidata, MarkerSortKey, Settings, SortDirection } from "../../shared/types";
import type { HermidataModel } from "../../shared/utils/HermidataSelector";
import { LibraryBuilder } from "../build";

/**
 * The markers card: each marker is a row that opens its chapter. The pencil on a row opens an editor right under it,
 * whose fields save as soon as they change. Search and sort only change what is shown.
 */
export class MarkerList extends LibraryBuilder {

    private readonly list = document.querySelector<HTMLUListElement>('#hermidata-markers-list');
    private readonly count = document.querySelector<HTMLElement>('#hermidata-markers-count');
    private readonly search = document.querySelector<HTMLInputElement>('#search-marker');
    private readonly sortButtons: Record<MarkerSortKey, HTMLButtonElement | null> = {
        chapter: document.querySelector<HTMLButtonElement>('#hermidata-markers-utility-sort-chapter'),
        date: document.querySelector<HTMLButtonElement>('#hermidata-markers-utility-sort-date'),
    };

    private sortKey: MarkerSortKey = 'chapter';
    private sortDirection: SortDirection = 'asc';

    /** The marker whose editor is open, kept across re-renders */
    private editingId: string | null = null;

    private readonly hermidata: HermidataModel;
    private readonly commit: CommitChange;

    constructor(AllHermidata: Record<string, Hermidata>, settings: Settings, hermidata: HermidataModel, commit: CommitChange) {
        super(AllHermidata, settings);
        this.hermidata = hermidata;
        this.commit = commit;
    }

    public build(): void {
        this.search?.addEventListener('input', () => this.render());
        for (const key of ['chapter', 'date'] as const) {
            this.sortButtons[key]?.addEventListener('click', () => this.setSort(key));
        }
        this.render();
    }

    public reload(): void {
        window.location.reload();
    }

    public render(): void {
        if (!this.list) return;
        const markers = this.hermidata.getAllBookmarks();
        if (this.count) this.count.textContent = markers.length ? String(markers.length) : '';

        const query = this.search?.value.trim().toLocaleLowerCase() ?? '';
        const shown = markers
            .filter(marker => !query || String(marker.current).includes(query) || marker.label.toLocaleLowerCase().includes(query))
            .sort((a, b) => this.compare(a, b));

        if (shown.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'ov-empty';
            empty.textContent = query ? `No markers match "${query}"` : 'No markers yet. Save a chapter from the popup to add one.';
            this.list.replaceChildren(empty);
            return;
        }
        this.list.replaceChildren(...shown.map(marker => this.buildMarker(marker)));
    }

    private setSort(key: MarkerSortKey): void {
        // the active button flips the direction, the other one switches what is sorted on
        if (key === this.sortKey) this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        this.sortKey = key;

        for (const [buttonKey, button] of Object.entries(this.sortButtons)) {
            if (!button) continue;
            const active = buttonKey === key;
            button.setAttribute('aria-pressed', String(active));
            button.dataset.sort = this.sortDirection;
            const arrow = button.querySelector('.ov-sort-dir');
            if (arrow) arrow.textContent = this.sortDirection === 'asc' ? '↓' : '↑';
            if (active) button.setAttribute('aria-label', `${button.textContent?.replace(/[↑↓]/g, '').trim()}, ${this.sortDirection === 'asc' ? 'ascending' : 'descending'}`);
            else button.removeAttribute('aria-label');
        }
        this.render();
    }

    private compare(a: Bookmark, b: Bookmark): number {
        const difference = this.sortKey === 'chapter'
            ? a.current - b.current
            : new Date(a.updatedAt ?? a.createdAt).getTime() - new Date(b.updatedAt ?? b.createdAt).getTime();
        return this.sortDirection === 'asc' ? difference : -difference;
    }

    private buildMarker(marker: Bookmark): HTMLLIElement {
        const item = document.createElement('li');
        item.className = 'ov-marker';
        item.dataset.id = marker.id;
        item.style.setProperty('--marker-color', marker.color);

        const isEditing = this.editingId === marker.id;
        item.append(this.buildRow(marker, isEditing));
        if (marker.note && !isEditing) item.append(this.span('ov-marker-note', marker.note));
        if (isEditing) item.append(this.buildEditor(marker));
        return item;
    }

    private buildRow(marker: Bookmark, isEditing: boolean): HTMLDivElement {
        const row = document.createElement('div');
        row.className = 'ov-marker-row';

        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'ov-marker-open';
        open.setAttribute('aria-label', `Open marker ${marker.label}, chapter ${marker.current}`);
        open.addEventListener('click', () => this.hermidata.jumpToUrl(marker.url));
        open.append(
            this.span('ov-marker-swatch', ''),
            this.span('ov-marker-chapter', `Ch. ${marker.current}`),
            this.span('ov-marker-label', marker.label),
            this.span('ov-marker-status', marker.readStatus),
            this.span('ov-marker-time', this.getTimeAgo(marker.updatedAt ?? marker.createdAt)),
        );

        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'ov-icon-btn ov-marker-edit';
        edit.setAttribute('aria-label', `Edit marker ${marker.label}`);
        edit.setAttribute('aria-expanded', String(isEditing));
        edit.innerHTML = '<svg class="ov-icon" aria-hidden="true"><use href="#i-edit"/></svg>';
        edit.addEventListener('click', () => this.toggleEditor(marker.id));

        row.append(open, edit);
        return row;
    }

    private toggleEditor(markerId: string): void {
        this.editingId = this.editingId === markerId ? null : markerId;
        this.render();
        const selector = this.editingId ? '.ov-marker-editor input' : '.ov-marker-edit';
        this.list?.querySelector<HTMLElement>(`[data-id="${CSS.escape(markerId)}"] ${selector}`)?.focus();
    }

    private buildEditor(marker: Bookmark): HTMLElement {
        const editor = document.createElement('div');
        editor.className = 'ov-marker-editor';
        editor.setAttribute('role', 'group');
        editor.setAttribute('aria-label', `Edit marker ${marker.label}`);

        const chapter = this.input('number', String(marker.current));
        chapter.min = '0';
        chapter.step = 'any';
        this.onCommit(chapter, () => {
            const value = Number(chapter.value);
            if (chapter.value === '' || !Number.isFinite(value) || value < 0) { chapter.value = String(marker.current); return; }
            this.save('Marker chapter updated', () => { marker.current = value; });
        });

        const label = this.input('text', marker.label);
        this.onCommit(label, () => {
            const value = label.value.trim();
            if (!value) { label.value = marker.label; return; }
            this.save('Marker label updated', () => { marker.label = value; });
        });

        const status = document.createElement('select');
        const statuses = this.settings.ContentTypesAndStatuses.STATUS_OPTIONS;
        for (const option of statuses.includes(marker.readStatus) ? statuses : [marker.readStatus, ...statuses]) status.add(new Option(option, option));
        status.value = marker.readStatus;
        status.addEventListener('change', () => this.save('Marker status updated', () => { marker.readStatus = status.value; }));

        const colour = this.input('color', this.toHex(marker.color));
        colour.addEventListener('change', () => this.save('Marker colour updated', () => { marker.color = colour.value; }));

        const note = this.input('text', marker.note ?? '');
        note.placeholder = 'Add a note';
        this.onCommit(note, () => {
            const value = note.value.trim();
            this.save('Marker note updated', () => { marker.note = value || undefined; });
        });

        const done = document.createElement('button');
        done.type = 'button';
        done.className = 'ov-btn ov-btn-small';
        done.textContent = 'Done';
        done.addEventListener('click', () => this.toggleEditor(marker.id));

        editor.append(
            this.field('Chapter', chapter, 'ov-field-chapter'),
            this.field('Label', label, 'ov-field-label'),
            this.field('Status', status, 'ov-field-status'),
            this.field('Colour', colour, 'ov-field-colour'),
            this.field('Note', note, 'ov-field-note'),
            done,
        );
        editor.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') { event.preventDefault(); this.toggleEditor(marker.id); }
        });
        return editor;
    }

    /** Re-render after the change so the row text follows, but keep the editor open */
    private save(message: string, change: () => void): void {
        void this.commit(message, change).then(() => this.refreshRow());
    }

    /** Update the open row's summary without rebuilding the editor ( so focus stays where it is ) */
    private refreshRow(): void {
        if (!this.editingId || !this.list) return;
        const item = this.list.querySelector<HTMLElement>(`[data-id="${CSS.escape(this.editingId)}"]`);
        const marker = this.hermidata.chapter.bookmarks[this.editingId];
        if (!item || !marker) return;
        item.querySelector('.ov-marker-row')?.replaceWith(this.buildRow(marker, true));
        item.style.setProperty('--marker-color', marker.color);
    }

    private onCommit(input: HTMLInputElement, handler: () => void): void {
        input.addEventListener('change', handler);
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
        });
    }

    private field(labelText: string, control: HTMLElement, className: string): HTMLLabelElement {
        const label = document.createElement('label');
        label.className = `ov-marker-field ${className}`;
        label.append(this.span('ov-marker-field-label', labelText), control);
        return label;
    }

    private input(type: string, value: string): HTMLInputElement {
        const input = document.createElement('input');
        input.type = type;
        input.value = value;
        input.autocomplete = 'off';
        return input;
    }

    private span(className: string, text: string): HTMLSpanElement {
        const span = document.createElement('span');
        span.className = className;
        span.textContent = text;
        return span;
    }

    /** `<input type="color">` only takes #rrggbb, while older markers can hold any css colour */
    private toHex(colour: string): string {
        if (/^#[0-9a-f]{6}$/i.test(colour)) return colour;
        const probe = document.createElement('canvas').getContext('2d');
        if (!probe) return '#000000';
        probe.fillStyle = colour;
        return /^#[0-9a-f]{6}$/i.test(probe.fillStyle) ? probe.fillStyle : '#000000';
    }
}
