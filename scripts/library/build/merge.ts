import { logConsoleError } from "../../shared/utils/ErrorMessage";
import { HermidataMigration } from "../../shared/migration/Hermidata";
import type { Hermidata, Settings, MergeLetter, MergeSuggestion, MergeConflictChoice } from "../../shared/types";
import { HermidataModel } from "../../shared/utils/HermidataSelector";
import { LibraryBuilder } from "../build";

const LETTERS: readonly MergeLetter[] = ['A', 'B'];
const TOAST_DURATION = 5000;
/** How many tags a record card lists before it summarises the rest */
const MAX_TAGS_SHOWN = 4;

/** Readable names for the field paths HermidataMigration.mergeHermidata reports */
const FIELD_LABELS: Record<string, string> = {
    title: 'Title',
    novelType: 'Type',
    source: 'Source site',
    'meta.notes': 'Notes',
    'meta.novelStatus': 'Status',
    'chapter.bookmarks': 'Bookmarks',
    'chapter.latest': 'Latest chapter',
    'chapter.lastChecked': 'Last checked',
    'meta.tags': 'Tags',
    'meta.altSources': 'Other sources',
    'meta.altTitles': 'Alternative titles',
    'meta.updated': 'Last updated',
    'meta.added': 'Date added',
};

/**
 * Merging two entries in the Library.
 *
 * Selection is the shared entry checkboxes ( bulk actions use them too ), so merging has no selection UI of its own.
 * The toolbar button acts on it: with exactly two entries ticked it opens the compare dialog ( pick the entry that
 * stays, pick a value for each conflicting field, see what is combined automatically, then merge ). Otherwise a toast
 * says what is missing and the checkboxes flash to show where to tick.
 */
export class HermidataMerge extends LibraryBuilder {

    private readonly mergeButton = document.querySelector<HTMLButtonElement>('#mergeTwoHermidatas');
    private readonly entriesContainer = document.querySelector<HTMLDivElement>('#library-entries-container');

    private readonly dialog = document.querySelector<HTMLDialogElement>('#merge-dialog');
    private readonly dialogBody = document.querySelector<HTMLDivElement>('#merge-dialog-body');
    private readonly dialogSummary = document.querySelector<HTMLParagraphElement>('#merge-dialog-summary');
    private readonly dialogError = document.querySelector<HTMLParagraphElement>('#merge-dialog-error');
    private readonly dialogConfirm = document.querySelector<HTMLButtonElement>('#merge-dialog-confirm');
    private readonly dialogCancel = document.querySelector<HTMLButtonElement>('#merge-dialog-cancel');
    private readonly dialogClose = document.querySelector<HTMLButtonElement>('#merge-dialog-close');

    private readonly toast = document.querySelector<HTMLDivElement>('#library-toast');
    private toastTimer: number | undefined;

    /** the two entries in the open dialog */
    private records: Record<MergeLetter, Hermidata> | null = null;
    private keep: MergeLetter = 'A';
    private conflicts: MergeConflictChoice[] = [];

    private readonly onMerged: () => Promise<void>;

    constructor(AllHermidata: Record<string, Hermidata>, settings: Settings, onMerged: () => Promise<void>) {
        super(AllHermidata, settings);
        this.onMerged = onMerged;
    }

    public build(): void {
        this.bindEvents();
        this.refreshButton();
    }
    /** Entries were rebuilt ( their checkboxes start unchecked ): refresh the button state */
    public reload(): void {
        this.refreshButton();
    }

    // --- selection ---

    private get selectedItems(): HTMLDivElement[] {
        return Array.from(document.querySelectorAll<HTMLDivElement>('.hermidata-item:has(.hermidata-item-checkbox:checked)'));
    }

    private bindEvents(): void {
        // one delegated listener survives feed rebuilds
        this.entriesContainer?.addEventListener('change', (e) => {
            if ((e.target as HTMLElement).matches('.hermidata-item-checkbox')) this.refreshButton();
        });

        this.mergeButton?.addEventListener('click', () => this.startMerge());

        this.dialogCancel?.addEventListener('click', () => this.dialog?.close());
        this.dialogClose?.addEventListener('click', () => this.dialog?.close());
        this.dialogConfirm?.addEventListener('click', () => void this.confirmMerge());
        // a click on the backdrop ( the dialog element itself, outside its content ) closes it
        this.dialog?.addEventListener('click', (e) => { if (e.target === e.currentTarget) this.dialog?.close(); });
    }

    /** the button stands out once exactly two entries are ticked */
    private refreshButton(): void {
        if (!this.mergeButton) return;
        const ready = this.selectedItems.length === 2;
        this.mergeButton.dataset.ready = String(ready);
        this.mergeButton.title = ready ? 'Compare and merge the two ticked entries' : 'Tick two entries to merge them';
    }

    private startMerge(): void {
        const selected = this.selectedItems;
        if (selected.length === 2) return this.openDialog();

        this.showToast(this.selectionHint(selected));
        if (selected.length < 2) this.flashCheckboxes();
    }
    private selectionHint(selected: HTMLDivElement[]): string {
        switch (selected.length) {
            case 0: return 'Tick the two entries you want to merge, then press Merge duplicates again.';
            case 1: return `Tick one more entry to merge with “${this.AllHermidata[this.GetHashItem(selected[0])]?.title ?? 'Unknown'}”.`;
            default: return `Merging works on exactly two entries. Untick ${selected.length - 2}.`;
        }
    }
    /** briefly highlights every checkbox ( spinning ring, library/feed.css ) so it is clear where to tick */
    private flashCheckboxes(): void {
        const checkboxes = document.querySelectorAll<HTMLInputElement>('.hermidata-item-checkbox');
        for (const checkbox of checkboxes) checkbox.dataset.temporaryChecked = 'true';
        window.setTimeout(() => { for (const checkbox of checkboxes) checkbox.dataset.temporaryChecked = 'false'; }, 2000);
    }

    // --- compare dialog ---

    private openDialog(): void {
        const selected = this.selectedItems;
        if (selected.length !== 2 || !this.dialog || !this.dialogBody) return;

        const [a, b] = selected.map(item => this.AllHermidata[this.GetHashItem(item)]);
        if (!a || !b) return;
        this.records = { A: a, B: b };

        const suggestion = this.calculateSuggestion(a, b);
        this.keep = suggestion.keep;

        // conflict detection is symmetric, so A/B order here only decides which value is `valueA`
        const { conflicts, autoResolved } = HermidataMigration.mergeHermidata(a, b);
        this.conflicts = conflicts.map(conflict => ({
            path: conflict.path,
            label: this.fieldLabel(conflict.path),
            values: { A: conflict.valueA, B: conflict.valueB },
            chosen: this.keep,
            touched: false,
        }));

        this.dialogBody.replaceChildren(
            this.buildKeepSection(suggestion),
            this.buildConflictSection(),
            this.buildAutoSection(autoResolved),
        );
        this.setError(null);
        this.setBusy(false);
        this.syncKeepState();

        this.dialog.showModal();
        this.dialogBody.scrollTop = 0;
    }

    private buildKeepSection(suggestion: MergeSuggestion): HTMLElement {
        const section = this.buildSection('Which entry stays?', 'The other one is merged into it, then removed.');

        const records = document.createElement('div');
        records.className = 'merge-records';
        records.setAttribute('role', 'radiogroup');
        records.setAttribute('aria-label', 'Entry to keep');

        records.append(...LETTERS.map(letter => this.buildRecordCard(letter, suggestion.keep)));

        const hint = document.createElement('p');
        hint.className = 'merge-suggestion';
        hint.textContent = `Suggested: keep ${suggestion.keep}, ${suggestion.reason}.`;

        section.append(records, hint);
        return section;
    }
    private buildRecordCard(letter: MergeLetter, suggested: MergeLetter): HTMLLabelElement {
        if (!this.records) throw new Error('No records to compare');
        const record = new HermidataModel(this.records[letter]);
        const other = new HermidataModel(this.records[letter === 'A' ? 'B' : 'A']);

        const card = document.createElement('label');
        card.className = 'merge-record';
        card.dataset.letter = letter;

        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'merge-keep';
        radio.value = letter;
        radio.className = 'merge-record-radio';
        radio.checked = letter === this.keep;
        radio.addEventListener('change', () => this.setKeep(letter));

        // head: letter, suggested badge, "stays" / "removed" state
        const head = document.createElement('div');
        head.className = 'merge-record-head';
        head.append(this.buildLetter(letter));
        if (letter === suggested) head.append(this.buildBadge('Suggested', 'suggested'));
        const state = document.createElement('span');
        state.className = 'merge-record-state';
        head.append(state);

        const cover = document.createElement('img');
        cover.className = 'merge-record-cover';
        cover.alt = '';
        cover.loading = 'lazy';
        // the cover can come from IndexedDB: open the dialog now, fill the cover in when it resolves
        record.getDisplayImageUrl()
            .then(src => { cover.src = src; })
            .catch(err => logConsoleError('Merge: cover failed to load', err));

        const title = document.createElement('p');
        title.className = 'merge-record-title';
        title.textContent = record.title;

        const facts = this.buildFacts(record, other);

        card.append(radio, head, cover, title, facts);
        return card;
    }
    /** key facts of one record; a value that differs from the other record is marked */
    private buildFacts(record: HermidataModel, other: HermidataModel): HTMLDListElement {
        const rows: [string, string, string][] = [
            ['Type', record.novelType, other.novelType],
            ['Site', record.source || record.meta.altSources[0] || '', other.source || other.meta.altSources[0] || ''],
            ['Status', record.meta.novelStatus ?? '', other.meta.novelStatus ?? ''],
            ['Read up to', `Ch. ${record.GetLatestReadChapter()}`, `Ch. ${other.GetLatestReadChapter()}`],
            ['Latest', `Ch. ${record.chapter.latest}`, `Ch. ${other.chapter.latest}`],
            ['Tags', this.tagSummary(record.meta.tags), this.tagSummary(other.meta.tags)],
            ['Added', this.isoToLocal(record.meta.added), this.isoToLocal(other.meta.added)],
            ['Updated', this.isoToLocal(record.meta.updated), this.isoToLocal(other.meta.updated)],
        ];

        const list = document.createElement('dl');
        list.className = 'merge-record-facts';
        for (const [label, value, otherValue] of rows) {
            const row = document.createElement('div');
            row.className = 'merge-fact';
            if (value !== otherValue) row.dataset.differs = 'true';

            const term = document.createElement('dt');
            term.textContent = label;
            const detail = document.createElement('dd');
            detail.textContent = value || '—';

            row.append(term, detail);
            list.appendChild(row);
        }
        return list;
    }
    private tagSummary(tags: string[]): string {
        const unique = Array.from(new Set(tags));
        if (unique.length <= MAX_TAGS_SHOWN) return unique.join(', ');
        return `${unique.slice(0, MAX_TAGS_SHOWN).join(', ')} +${unique.length - MAX_TAGS_SHOWN}`;
    }

    private buildConflictSection(): HTMLElement {
        const count = this.conflicts.length;
        const section = count === 0
            ? this.buildSection('Differences', 'None. Both entries agree on every field you would have to pick.')
            : this.buildSection(`Pick what to keep · ${count}`, 'These fields are filled in differently. The kept entry\'s value is selected until you change it.');

        for (const conflict of this.conflicts) section.appendChild(this.buildConflict(conflict));
        return section;
    }
    private buildConflict(conflict: MergeConflictChoice): HTMLFieldSetElement {
        const fieldset = document.createElement('fieldset');
        fieldset.className = 'merge-conflict';
        fieldset.dataset.path = conflict.path;

        const legend = document.createElement('legend');
        legend.textContent = conflict.label;
        fieldset.appendChild(legend);

        for (const letter of LETTERS) {
            const option = document.createElement('label');
            option.className = 'merge-option';

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = `merge-conflict-${conflict.path}`;
            radio.value = letter;
            radio.className = 'merge-option-radio';
            radio.checked = conflict.chosen === letter;
            radio.addEventListener('change', () => {
                conflict.chosen = letter;
                conflict.touched = true;
            });

            const value = document.createElement('span');
            value.className = 'merge-option-value';
            value.textContent = this.formatValue(conflict.values[letter]);

            option.append(radio, this.buildLetter(letter), value);
            fieldset.appendChild(option);
        }
        return fieldset;
    }

    private buildAutoSection(autoResolved: string[]): HTMLDetailsElement {
        const labels = Array.from(new Set(autoResolved.map(path => this.fieldLabel(path))));

        const details = document.createElement('details');
        details.className = 'merge-auto';

        const summary = document.createElement('summary');
        summary.textContent = `Combined automatically · ${labels.length}`;

        const note = document.createElement('p');
        note.className = 'merge-section-hint';
        note.textContent = 'Lists are joined, the furthest reading progress and the earliest added date win, and an empty field takes the other entry\'s value.';

        const chips = document.createElement('ul');
        chips.className = 'merge-auto-list';
        for (const label of labels) {
            const chip = document.createElement('li');
            chip.textContent = label;
            chips.appendChild(chip);
        }

        details.append(summary, note, chips);
        return details;
    }

    private buildSection(title: string, hint: string): HTMLElement {
        const section = document.createElement('section');
        section.className = 'merge-section';

        const heading = document.createElement('h3');
        heading.className = 'merge-section-title';
        heading.textContent = title;

        const text = document.createElement('p');
        text.className = 'merge-section-hint';
        text.textContent = hint;

        section.append(heading, text);
        return section;
    }
    private buildLetter(letter: MergeLetter): HTMLSpanElement {
        const badge = document.createElement('span');
        badge.className = 'merge-letter';
        badge.dataset.letter = letter;
        badge.textContent = letter;
        badge.setAttribute('aria-label', `Entry ${letter}`);
        return badge;
    }
    private buildBadge(text: string, kind: string): HTMLSpanElement {
        const badge = document.createElement('span');
        badge.className = `merge-badge merge-badge--${kind}`;
        badge.textContent = text;
        return badge;
    }

    /** the kept entry changed: untouched conflict choices follow it */
    private setKeep(letter: MergeLetter): void {
        this.keep = letter;
        for (const conflict of this.conflicts) {
            if (conflict.touched) continue;
            conflict.chosen = letter;
            const radio = this.dialogBody?.querySelector<HTMLInputElement>(`input[name="merge-conflict-${CSS.escape(conflict.path)}"][value="${letter}"]`);
            if (radio) radio.checked = true;
        }
        this.syncKeepState();
    }
    /** card states and the footer summary reflect the kept entry */
    private syncKeepState(): void {
        if (!this.records) return;
        const remove = this.other(this.keep);

        for (const card of this.dialogBody?.querySelectorAll<HTMLLabelElement>('.merge-record') ?? []) {
            const kept = card.dataset.letter === this.keep;
            card.dataset.kept = String(kept);
            const state = card.querySelector('.merge-record-state');
            if (state) state.textContent = kept ? 'Stays' : 'Merged in, then removed';
        }

        if (this.dialogSummary) {
            this.dialogSummary.textContent = `“${this.records[remove].title}” (${remove}) will be merged into “${this.records[this.keep].title}” (${this.keep}). This can't be undone.`;
        }
        if (this.dialogConfirm) this.dialogConfirm.textContent = `Merge into ${this.keep}`;
    }

    private async confirmMerge(): Promise<void> {
        if (!this.records) return;
        const keepRecord = this.records[this.keep];
        const removeRecord = this.records[this.other(this.keep)];

        // the migration reads 'A' as "the kept record's value" and 'B' as "the removed record's value"
        const resolutions: Record<string, MergeLetter> = {};
        for (const conflict of this.conflicts) resolutions[conflict.path] = conflict.chosen === this.keep ? 'A' : 'B';

        this.setError(null);
        this.setBusy(true);

        const result = await HermidataMigration.mergeTwoHermidataWithConfiguration(keepRecord, removeRecord, {
            keepId: keepRecord.id,
            removeId: removeRecord.id,
            resolutions,
        });

        if (!result.merged) {
            this.setBusy(false);
            this.setError('Merging failed. Reload the library to check both entries, then try again.');
            return;
        }

        const titleConflict = this.conflicts.find(conflict => conflict.path === 'title');
        const mergedTitle = titleConflict ? String(titleConflict.values[titleConflict.chosen]) : keepRecord.title;

        this.dialog?.close();
        this.records = null;

        try {
            await this.onMerged();
        } catch (err) {
            logConsoleError('Merged, but reloading the library failed:', err);
        }
        this.showToast(`Merged into “${mergedTitle}”`);
    }

    private setBusy(busy: boolean): void {
        if (!this.dialogConfirm) return;
        this.dialogConfirm.disabled = busy;
        if (busy) this.dialogConfirm.textContent = 'Merging…';
        else this.syncKeepState();
    }
    private setError(message: string | null): void {
        if (!this.dialogError) return;
        this.dialogError.hidden = message === null;
        this.dialogError.textContent = message ?? '';
    }
    private showToast(message: string): void {
        if (!this.toast) return;
        this.toast.textContent = message;
        this.toast.hidden = false;
        window.clearTimeout(this.toastTimer);
        this.toastTimer = window.setTimeout(() => { if (this.toast) this.toast.hidden = true; }, TOAST_DURATION);
    }

    // --- helpers ---

    private other(letter: MergeLetter): MergeLetter {
        return letter === 'A' ? 'B' : 'A';
    }
    private fieldLabel(path: string): string {
        if (FIELD_LABELS[path]) return FIELD_LABELS[path];
        // fallback: last path part, camelCase split into words
        const last = path.split('.').at(-1) ?? path;
        const words = last.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
        return words.charAt(0).toUpperCase() + words.slice(1);
    }
    private formatValue(value: unknown): string {
        if (value == null || value === '') return '—';
        if (Array.isArray(value)) return value.join(', ');
        return String(value);
    }

    /* returns the record to keep and why */
    private calculateSuggestion(a: Hermidata, b: Hermidata): MergeSuggestion {
        const filledA = this.countFilledFields(a);
        const filledB = this.countFilledFields(b);

        // 1. most filled in fields wins
        // 2. tie: furthest reading progress wins
        // 3. tie: record A
        if (filledA !== filledB) {
            const difference = Math.abs(filledA - filledB);
            return { keep: filledA > filledB ? 'A' : 'B', reason: `it has ${difference} more field${difference > 1 ? 's' : ''} filled in` };
        }
        if (a.chapter.latest !== b.chapter.latest) {
            return { keep: a.chapter.latest > b.chapter.latest ? 'A' : 'B', reason: 'it is further along in the story' };
        }
        return { keep: 'A', reason: 'both are equally complete' };
    }
    /* counts the fields that hold a meaningful value, looking inside nested objects and arrays */
    private countFilledFields(value: unknown): number {
        if (typeof value === 'number') return value > 0 ? 1 : 0;
        if (typeof value === 'string') return value.trim().length > 0 ? 1 : 0;
        if (typeof value === 'boolean') return value ? 1 : 0;
        if (Array.isArray(value)) return value.length > 0 ? 1 : 0;
        if (value && typeof value === 'object') return Object.values(value).reduce<number>((sum, child) => sum + this.countFilledFields(child), 0);
        return 0; // null / undefined
    }
}
