import { getSettings, type dbAccess } from "../shared/db/Storage";
import type { GrabbedRow, Hermidata, QueueFilters, QueuePosition, RankedRow, ReadingQueuePriorityBand, RowActions, RowOptions } from "../shared/types";
import { ext } from "../shared/utils/BrowserCompat";
import { ErrorMessage } from "../shared/utils/ErrorMessage";
import { HermidataModel } from "../shared/utils/HermidataSelector";
import { resolveAutoReadingList } from "../shared/utils/SettingsValues";
import { openLink } from "../shared/utils/StringOutput";
import { markSeen } from "../shared/utils/Unread";
import {
    addToQueue, clampPriority, getPriorityBand, getQueue, isQueueable, isQueued, moveInQueue, normaliseQueue,
    pickForMe, priorityOf, QUEUE_PRIORITY_DEFAULT, QUEUE_PRIORITY_MAX, QUEUE_PRIORITY_MIN, removeFromQueue, setQueuePriority,
    sortQueueByPriority,
} from "./queue";
import { describeRow, GROUP_LABEL, pinAt, rankReadingList, setAutoPriority, settlePins, unpin } from "./rank";
import { buildAddRow, buildGroupDivider, buildPickCard, buildRow, buildUpNext, resetCovers } from "./render";

const TOAST_MS = 6000;
const MAX_ADD_ROWS = 200;

function requireElement<T extends HTMLElement>(selector: string): T {
    const node = document.querySelector<T>(selector);
    if (!node) throw new Error(`Reading list page is missing ${selector}`);
    return node;
}

function plural(count: number, word: string): string {
    return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export class ReadingListController {
    private all: Hermidata[] = [];
    private filters: QueueFilters = { search: '', priority: '', type: '', site: '' };
    private selectedToAdd = new Set<string>();
    private grabbed: GrabbedRow | null = null;
    private draggingId: string | null = null;
    private lastPickId: string | null = null;
    private undoAction: (() => Promise<void>) | null = null;
    private toastTimer: number | undefined;
    /** The automatic list is on: the order is computed from releases, only pins are placed by hand */
    private auto = false;
    /** The list as shown: the ranked rows when auto, else the manual queue */
    private queue: Hermidata[] = [];
    private rows: RankedRow[] = [];

    private readonly main = requireElement<HTMLElement>('#queue-main');
    private readonly summary = requireElement<HTMLElement>('#queue-summary');
    private readonly upNext = requireElement<HTMLElement>('#up-next');
    private readonly upNextSection = requireElement<HTMLElement>('.rl-next');
    private readonly queueSection = requireElement<HTMLElement>('.rl-queue');
    private readonly list = requireElement<HTMLOListElement>('#queue-list');
    private readonly listHeading = requireElement<HTMLElement>('#queue-heading');
    private readonly queueCount = requireElement<HTMLElement>('#queue-count');
    private readonly queueEnd = requireElement<HTMLButtonElement>('#queue-end-add');
    private readonly empty = requireElement<HTMLElement>('#queue-empty');
    private readonly emptyTitle = requireElement<HTMLElement>('#queue-empty-title');
    private readonly emptyText = requireElement<HTMLElement>('#queue-empty-text');
    private readonly emptyAdd = requireElement<HTMLButtonElement>('#empty-add');
    private readonly emptyClear = requireElement<HTMLButtonElement>('#empty-clear');
    private readonly reorderHint = requireElement<HTMLElement>('#reorder-hint');
    private readonly pickButton = requireElement<HTMLButtonElement>('#pick-for-me');
    private readonly sortButton = requireElement<HTMLButtonElement>('#sort-by-priority');
    private readonly autoBadge = requireElement<HTMLElement>('#auto-badge');
    private readonly openAdd = requireElement<HTMLButtonElement>('#open-add-dialog');
    private readonly addTitle = requireElement<HTMLElement>('#add-dialog-title');
    private readonly pickDialog = requireElement<HTMLDialogElement>('#pick-dialog');
    private readonly pickContent = requireElement<HTMLElement>('#pick-content');
    private readonly announce = requireElement<HTMLElement>('#sr-announce');
    private readonly toast = requireElement<HTMLElement>('#toast');

    private readonly filterBar = requireElement<HTMLElement>('#queue-filters');
    private readonly search = requireElement<HTMLInputElement>('#queue-search');
    private readonly filterPriority = requireElement<HTMLElement>('#filter-priority');
    private readonly filterType = requireElement<HTMLSelectElement>('#filter-type');
    private readonly filterSite = requireElement<HTMLSelectElement>('#filter-site');
    private readonly clearFilters = requireElement<HTMLButtonElement>('#clear-filters');

    private readonly addDialog = requireElement<HTMLDialogElement>('#add-dialog');
    private readonly addSearch = requireElement<HTMLInputElement>('#add-search');
    private readonly addList = requireElement<HTMLUListElement>('#add-list');
    private readonly addPriority = requireElement<HTMLSelectElement>('#add-priority');
    private readonly addConfirm = requireElement<HTMLButtonElement>('#add-confirm');
    private readonly addCount = requireElement<HTMLElement>('#add-count');

    private readonly actions: RowActions = {
        open: (entry) => void openLink(new HermidataModel(entry).GetUrl(), 'newTab'),
        openOverview: (entry) => void openLink('./Overview.html#/id/' + entry.id, 'sameTab'),
        moveTo: (entry, index) => void this.commit(this.moveEntry(entry, index)).then(() => this.focusHandle(entry.id)),
        remove: (entry) => void this.removeEntry(entry),
        setPriority: (entry, priority) => void this.commit(this.auto ? setAutoPriority(entry, priority) : setQueuePriority(this.all, entry.id, priority)).then(() => this.focusPriority(entry.id)),
    };

    private readonly db: dbAccess;

    constructor(db: dbAccess) {
        this.db = db;
    }

    public async init(): Promise<void> {
        this.buildPrioritySelect(this.addPriority, QUEUE_PRIORITY_DEFAULT);
        this.bindEvents();
        await this.load();
    }

    // -- data --

    private async load(): Promise<void> {
        resetCovers();
        this.setAuto(resolveAutoReadingList((await getSettings()).ExtensionBehaviour?.AutoReadingList));
        this.all = Object.values(await this.db.getAllHermidata());
        // repair imports (all index 0) and finished titles before showing anything; the manual queue is left alone while auto is on
        const repairs = this.auto ? settlePins(this.all) : normaliseQueue(this.all);
        if (repairs.length) await this.commit(repairs);
        else this.render();
    }

    /** Write changed entries, update the page, and optionally offer an undo */
    private async commit(changed: Hermidata[], toastText?: string): Promise<void> {
        if (changed.length === 0) return;

        const previous = changed.map(entry => this.all.find(candidate => candidate.id === entry.id)).filter((entry): entry is Hermidata => !!entry);
        try {
            const saved = await Promise.all(changed.map(entry => this.save(entry)));
            const byId = new Map(saved.map(entry => [entry.id, entry]));
            this.all = this.all.map(entry => byId.get(entry.id) ?? entry);
        } catch (error) {
            new ErrorMessage('Could not update the reading list. Showing the saved version.', undefined, { details: [error] }).sendMessage();
            // re-read without repairing: a repair that keeps failing must not retry forever
            this.all = Object.values(await this.db.getAllHermidata());
            this.render();
            return;
        }

        this.render();
        if (toastText) this.showToast(toastText, () => this.commit(previous));
    }

    private async save(entry: Hermidata): Promise<Hermidata> {
        // a clone, so the copy kept in `this.all` (and used by undo) is never changed in place
        const model = new HermidataModel(structuredClone(entry));
        model.Touch();
        const saved = model.toJSON();

        await this.db.updateHermidata(saved); // the hermidata store uses in-line keys, so no separate key is passed
        try {
            await this.db.pushToSync(saved);
        } catch (error) {
            console.warn('[Hermidata] Reading list sync push failed; the local copy is saved.', error);
        }
        return saved;
    }

    private async removeEntry(entry: Hermidata): Promise<void> {
        if (!this.auto) return this.commit(removeFromQueue(this.all, entry.id), `Removed "${entry.title}"`);

        const pinned = this.rows.find(row => row.entry.id === entry.id)?.group === 'pinned';
        if (pinned) return this.commit(unpin(entry), `Unpinned "${entry.title}"`);

        // dismissed titles come back with the next release; the badge counts the same unread chapters, so refresh it
        await this.commit([markSeen(entry)], `Dismissed "${entry.title}" until the next release`);
        await ext.runtime.sendMessage({ type: 'INVALIDATE_RSS' }).catch(() => {});
    }

    /** Move a manual queue entry, or pin an automatic one, so it ends up at this position */
    private moveEntry(entry: Hermidata, index: number): Hermidata[] {
        return this.auto ? pinAt(this.rows, entry, index) : moveInQueue(this.all, entry.id, index);
    }

    /** Pin several titles one after the other, so each sees the order the one before it left */
    private pinTitles(ids: readonly string[], position: QueuePosition): Hermidata[] {
        let all = this.all;
        const changed = new Map<string, Hermidata>();
        for (const id of ids) {
            const entry = all.find(candidate => candidate.id === id);
            if (!entry) continue;
            const rows = rankReadingList(all);
            for (const updated of pinAt(rows, entry, position === 'top' ? 0 : rows.length)) changed.set(updated.id, updated);
            all = all.map(candidate => changed.get(candidate.id) ?? candidate);
        }
        return [...changed.values()];
    }

    // -- filters --

    private get isFiltering(): boolean {
        const { search, priority, type, site } = this.filters;
        return Boolean(search || priority || type || site);
    }

    private matchesFilters(entry: Hermidata): boolean {
        const { search, priority, type, site } = this.filters;
        if (priority && getPriorityBand(priorityOf(entry)) !== priority) return false;
        if (type && entry.novelType !== type) return false;
        if (site && entry.source !== site) return false;
        if (!search) return true;

        const needle = search.toLowerCase();
        return [entry.title, ...entry.meta.altTitles].some(title => title.toLowerCase().includes(needle));
    }

    /** Refill a dropdown from the queue; it is hidden when there is nothing to choose between */
    private fillFilterSelect(select: HTMLSelectElement, values: string[], current: string): void {
        const unique = [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
        select.replaceChildren(new Option('Any', ''), ...unique.map(value => new Option(value, value)));
        select.value = unique.includes(current) ? current : '';
        (select.closest('label') as HTMLElement).hidden = unique.length < 2 && !select.value;
    }

    private setPriorityRadio(value: string): void {
        const radio = this.filterPriority.querySelector<HTMLInputElement>(`input[value="${value}"]`);
        if (radio) radio.checked = true;
    }

    private resetFilters(): void {
        this.search.value = '';
        this.setPriorityRadio('');
        this.setFilters({ search: '', priority: '', type: '', site: '' });
    }

    // -- render --

    private render(): void {
        this.rows = this.auto ? rankReadingList(this.all) : [];
        const queue = this.auto ? this.rows.map(row => row.entry) : getQueue(this.all);
        this.queue = queue;
        this.fillFilterSelect(this.filterType, queue.map(entry => entry.novelType), this.filters.type);
        this.fillFilterSelect(this.filterSite, queue.map(entry => entry.source), this.filters.site);
        this.filters.type = this.filterType.value;
        this.filters.site = this.filterSite.value;

        const filtering = this.isFiltering;
        const visible = queue.filter(entry => this.matchesFilters(entry));

        this.renderHeader(queue, visible, filtering);
        this.renderBody(queue, visible, filtering);
    }

    private renderHeader(queue: Hermidata[], visible: Hermidata[], filtering: boolean): void {
        const bandCount = (band: ReadingQueuePriorityBand) => queue.filter(entry => getPriorityBand(priorityOf(entry)) === band).length;
        const high = bandCount('High');

        this.summary.textContent = this.auto ? this.autoSummary(queue.length) : queue.length === 0
            ? 'Nothing queued yet'
            : `${plural(queue.length, 'title')} queued${high ? ` · ${high} high priority` : ''}`;

        this.filterPriority.querySelectorAll<HTMLElement>('[data-band-count]').forEach(count => {
            const band = count.dataset.bandCount as ReadingQueuePriorityBand | '';
            count.textContent = String(band ? bandCount(band) : queue.length);
        });

        this.filterBar.hidden = queue.length === 0;
        this.clearFilters.hidden = !filtering;
        this.reorderHint.hidden = !filtering;
        this.pickButton.disabled = visible.length === 0;
        this.sortButton.hidden = filtering || this.auto;
        this.sortButton.disabled = queue.length < 2;
    }

    private autoSummary(total: number): string {
        if (total === 0) return 'Nothing to read right now';
        const newToday = this.rows.filter(row => row.group === 'new-today').length;
        const pinned = this.rows.filter(row => row.group === 'pinned').length;
        return [`${plural(total, 'title')} to read`, newToday && `${newToday} new today`, pinned && `${pinned} pinned`].filter(Boolean).join(' · ');
    }

    /** Switch the page between the manual queue and the automatic list: labels and what is offered */
    private setAuto(auto: boolean): void {
        this.auto = auto;
        this.autoBadge.hidden = !auto;
        this.main.dataset.auto = String(auto);
        this.addTitle.textContent = auto ? 'Pin to your reading list' : 'Add to your reading list';
        this.addPriority.closest('label')!.hidden = auto;
        for (const button of [this.openAdd, this.queueEnd, this.emptyAdd]) {
            const text = [...button.childNodes].reverse().find(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
            if (text) text.textContent = auto ? 'Pin titles' : button === this.queueEnd ? 'Add more titles' : 'Add titles';
        }
    }

    private renderBody(queue: Hermidata[], visible: Hermidata[], filtering: boolean): void {
        const nothingToShow = visible.length === 0;
        this.main.dataset.layout = filtering || nothingToShow ? 'flat' : 'split';
        this.empty.hidden = !nothingToShow;
        this.upNextSection.hidden = nothingToShow || filtering;
        this.queueSection.hidden = nothingToShow;
        this.queueEnd.hidden = filtering;
        this.emptyAdd.hidden = filtering;
        this.emptyClear.hidden = !filtering;
        this.emptyTitle.textContent = filtering ? 'No matches' : this.auto ? 'Nothing to read right now' : 'Your reading list is empty';
        this.emptyText.textContent = filtering
            ? 'No queued titles match these filters.'
            : this.auto
                ? 'Titles appear here when a chapter you have not read comes out. Pin a title to keep it here.'
                : 'Queue the titles you want to read next and keep them in the order you like.';

        this.upNext.replaceChildren();
        this.list.replaceChildren();
        if (nothingToShow) return;

        const now = Date.now();
        const rowOf = new Map(this.rows.map(row => [row.entry.id, row]));
        const optionsFor = (entry: Hermidata): RowOptions => {
            const row = rowOf.get(entry.id);
            return {
                index: queue.indexOf(entry),
                total: queue.length,
                canReorder: !filtering,
                grabbed: this.grabbed?.id === entry.id,
                auto: row ? { group: row.group, reason: describeRow(row, now) } : null,
            };
        };

        // unfiltered: first entry is the Up next card; filtered: one flat list with real positions
        const rows = filtering ? visible : visible.slice(1);
        if (!filtering) this.upNext.append(buildUpNext(visible[0], optionsFor(visible[0]), this.actions));
        this.listHeading.textContent = filtering ? 'Matches' : this.auto ? 'Coming up' : 'Queue';
        this.queueCount.textContent = filtering ? `${visible.length} of ${queue.length}` : String(rows.length);
        const built = rows.map(entry => buildRow(entry, optionsFor(entry), this.actions));
        this.list.append(...(this.auto && !filtering ? this.withGroupDividers(rows, visible[0], rowOf, built) : built));
    }

    /**
     * Put a heading before the first row of each group. Pinned rows are skipped, so a pin in the middle
     * of a group does not split it; the Up next card counts as the start of its group.
     */
    private withGroupDividers(rows: Hermidata[], first: Hermidata, rowOf: Map<string, RankedRow>, built: HTMLLIElement[]): HTMLLIElement[] {
        const groupOf = (entry: Hermidata) => rowOf.get(entry.id)?.group;
        let current = groupOf(first);
        return rows.flatMap((entry, index) => {
            const group = groupOf(entry);
            if (!group || group === 'pinned' || group === current) return [built[index]];
            current = group;
            return [buildGroupDivider(GROUP_LABEL[group]), built[index]];
        });
    }

    // -- events --

    private bindEvents(): void {
        requireElement('#reloadData').addEventListener('click', () => void this.load());
        requireElement('#back-to-library').addEventListener('click', () => void openLink('Library.html', 'sameTab'));
        this.sortButton.addEventListener('click', () => void this.commit(sortQueueByPriority(this.all), 'Sorted by priority'));
        this.pickButton.addEventListener('click', () => this.pick());
        this.pickDialog.addEventListener('click', (event) => { if (event.target === this.pickDialog) this.pickDialog.close(); });

        this.search.addEventListener('input', () => this.setFilters({ search: this.search.value.trim() }));
        this.filterPriority.addEventListener('change', (event) => {
            this.setFilters({ priority: (event.target as HTMLInputElement).value as ReadingQueuePriorityBand | '' });
        });
        this.filterType.addEventListener('change', () => this.setFilters({ type: this.filterType.value }));
        this.filterSite.addEventListener('change', () => this.setFilters({ site: this.filterSite.value }));
        this.clearFilters.addEventListener('click', () => this.resetFilters());
        this.emptyClear.addEventListener('click', () => this.resetFilters());

        requireElement('#toast-undo').addEventListener('click', () => void this.runUndo());

        this.main.addEventListener('keydown', (event) => this.onHandleKey(event));
        this.main.addEventListener('dragstart', (event) => this.onDragStart(event));
        this.main.addEventListener('dragover', (event) => this.onDragOver(event));
        this.main.addEventListener('drop', (event) => this.onDrop(event));
        this.main.addEventListener('dragend', () => this.endDrag());
        document.addEventListener('click', (event) => this.closeOtherMenus(event));

        this.bindAddDialog();
    }

    private setFilters(change: Partial<QueueFilters>): void {
        this.filters = { ...this.filters, ...change };
        this.render();
    }

    private closeOtherMenus(event: Event): void {
        const target = event.target as HTMLElement;
        document.querySelectorAll<HTMLDetailsElement>('.rl-menu[open]').forEach(menu => {
            if (!menu.contains(target) || target.closest('.rl-menu-item')) menu.open = false;
        });
    }

    // -- reorder: keyboard --

    private onHandleKey(event: KeyboardEvent): void {
        const handle = (event.target as HTMLElement).closest<HTMLButtonElement>('.rl-handle');
        if (!handle?.dataset.handleFor) return;

        const id = handle.dataset.handleFor;
        const queue = this.queue;
        const index = queue.findIndex(entry => entry.id === id);

        if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            this.grabbed = this.grabbed?.id === id ? null : { id, originalIndex: index };
            this.announceText(this.grabbed ? `Grabbed ${queue[index].title}, position ${index + 1} of ${queue.length}.` : `Dropped at position ${index + 1}.`);
            this.render();
            this.focusHandle(id);
        } else if (this.grabbed?.id === id && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
            event.preventDefault();
            void this.moveGrabbed(id, index + (event.key === 'ArrowUp' ? -1 : 1), queue.length);
        } else if (this.grabbed?.id === id && event.key === 'Escape') {
            event.preventDefault();
            const back = this.grabbed.originalIndex;
            this.grabbed = null;
            void this.moveGrabbed(id, back, queue.length, `Cancelled, back at position ${back + 1}.`);
        }
    }

    private async moveGrabbed(id: string, toIndex: number, total: number, message?: string): Promise<void> {
        const target = Math.min(Math.max(toIndex, 0), total - 1);
        const entry = this.queue.find(candidate => candidate.id === id);
        const changed = entry ? this.moveEntry(entry, target) : [];
        if (changed.length) await this.commit(changed);
        else this.render(); // a cancel without movement still has to clear the grabbed look
        this.announceText(message ?? `Moved to position ${target + 1} of ${total}.`);
        this.focusHandle(id);
    }

    private focusHandle(id: string): void {
        document.querySelector<HTMLButtonElement>(`.rl-handle[data-handle-for="${CSS.escape(id)}"]`)?.focus();
    }

    private focusPriority(id: string): void {
        document.querySelector<HTMLSelectElement>(`select[data-priority-for="${CSS.escape(id)}"]`)?.focus();
    }

    private announceText(text: string): void {
        this.announce.textContent = text;
    }

    // -- reorder: drag and drop --

    private dropTarget(event: Event): HTMLElement | null {
        return (event.target as HTMLElement).closest<HTMLElement>('[data-queue-id]');
    }

    private onDragStart(event: DragEvent): void {
        const source = this.dropTarget(event);
        if (!source?.dataset.queueId || this.isFiltering) return;
        this.draggingId = source.dataset.queueId;
        event.dataTransfer?.setData('text/plain', source.dataset.queueId);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        // after the browser has captured the drag image
        requestAnimationFrame(() => source.classList.add('is-dragging'));
    }

    private onDragOver(event: DragEvent): void {
        const target = this.dropTarget(event);
        if (!this.draggingId || !target) return;
        event.preventDefault();

        this.clearDropMarkers(target);
        if (target.dataset.queueId === this.draggingId) return;
        const from = this.queue.findIndex(entry => entry.id === this.draggingId);
        target.dataset.drop = from < Number(target.dataset.index) ? 'after' : 'before';
    }

    private onDrop(event: DragEvent): void {
        const target = this.dropTarget(event);
        if (!this.draggingId || !target?.dataset.index) return;
        event.preventDefault();

        const id = this.draggingId;
        this.endDrag();
        const entry = this.queue.find(candidate => candidate.id === id);
        if (entry && target.dataset.queueId !== id) void this.commit(this.moveEntry(entry, Number(target.dataset.index)));
    }

    private endDrag(): void {
        this.draggingId = null;
        this.clearDropMarkers();
        this.main.querySelector('.is-dragging')?.classList.remove('is-dragging');
    }

    private clearDropMarkers(except?: HTMLElement): void {
        this.main.querySelectorAll<HTMLElement>('[data-drop]').forEach(node => {
            if (node !== except) delete node.dataset.drop;
        });
    }

    // -- pick for me --

    private pick(): void {
        const visible = this.queue.filter(entry => this.matchesFilters(entry));
        // do not repeat the previous pick when there is another choice
        const pool = visible.length > 1 ? visible.filter(entry => entry.id !== this.lastPickId) : visible;
        const picked = pickForMe(pool);
        if (!picked) return;

        this.lastPickId = picked.id;
        this.pickContent.replaceChildren(buildPickCard(picked, {
            open: (entry) => {
                this.pickDialog.close();
                this.actions.open(entry);
            },
            again: () => this.pick(),
            close: () => this.pickDialog.close(),
            canPickAgain: visible.length > 1,
        }));
        if (!this.pickDialog.open) this.pickDialog.showModal();
    }

    // -- toast / undo --

    private showToast(text: string, undo: () => Promise<void>): void {
        window.clearTimeout(this.toastTimer);
        requireElement('#toast-text').textContent = text;
        this.undoAction = undo;
        this.toast.hidden = false;
        this.toastTimer = window.setTimeout(() => this.hideToast(), TOAST_MS);
    }

    private hideToast(): void {
        window.clearTimeout(this.toastTimer);
        this.toast.hidden = true;
        this.undoAction = null;
    }

    private async runUndo(): Promise<void> {
        const undo = this.undoAction;
        this.hideToast();
        await undo?.();
    }

    // -- add dialog --

    private buildPrioritySelect(select: HTMLSelectElement, selected: number): void {
        for (let value = QUEUE_PRIORITY_MAX; value >= QUEUE_PRIORITY_MIN; value--) {
            select.append(new Option(`${getPriorityBand(value)} ${value}`, String(value), false, value === selected));
        }
    }

    private bindAddDialog(): void {
        const open = () => {
            this.selectedToAdd.clear();
            this.addSearch.value = '';
            this.renderAddList();
            this.addDialog.showModal();
            this.addSearch.focus();
        };
        requireElement('#open-add-dialog').addEventListener('click', open);
        this.emptyAdd.addEventListener('click', open);
        this.queueEnd.addEventListener('click', open);
        requireElement('#add-cancel').addEventListener('click', () => this.addDialog.close());
        requireElement('#add-close').addEventListener('click', () => this.addDialog.close());
        this.addSearch.addEventListener('input', () => this.renderAddList());

        requireElement<HTMLFormElement>('#add-form').addEventListener('submit', (event) => {
            event.preventDefault();
            const position = (document.querySelector<HTMLInputElement>('input[name="add-position"]:checked')?.value ?? 'bottom') as QueuePosition;
            const ids = [...this.selectedToAdd];
            const changed = this.auto ? this.pinTitles(ids, position) : addToQueue(this.all, ids, clampPriority(Number(this.addPriority.value)), position);
            const count = this.selectedToAdd.size;
            this.addDialog.close();
            void this.commit(changed, `${this.auto ? 'Pinned' : 'Added'} ${plural(count, 'title')}`);
        });
    }

    private renderAddList(): void {
        const needle = this.addSearch.value.trim().toLowerCase();
        const listed = new Set(this.rows.map(row => row.entry.id));
        const candidates = this.all
            .filter(entry => (this.auto ? !listed.has(entry.id) : !isQueued(entry)) && isQueueable(entry))
            .filter(entry => !needle || [entry.title, ...entry.meta.altTitles].some(title => title.toLowerCase().includes(needle)))
            .sort((a, b) => a.title.localeCompare(b.title))
            .slice(0, MAX_ADD_ROWS);

        this.addList.replaceChildren(...candidates.map(entry => buildAddRow(entry, this.selectedToAdd.has(entry.id), (checked) => {
            if (checked) this.selectedToAdd.add(entry.id);
            else this.selectedToAdd.delete(entry.id);
            this.updateAddFooter();
        })));

        if (candidates.length === 0) {
            const none = document.createElement('li');
            none.className = 'rl-add-empty';
            none.textContent = needle ? 'No titles match your search.' : this.auto ? 'Every title that can be pinned is already here.' : 'Every title that can be queued is already here.';
            this.addList.append(none);
        }
        this.updateAddFooter();
    }

    private updateAddFooter(): void {
        const count = this.selectedToAdd.size;
        this.addCount.textContent = count ? `${count} selected` : 'Select titles to add';
        this.addConfirm.disabled = count === 0;
        this.addConfirm.textContent = count ? `${this.auto ? 'Pin' : 'Add'} ${plural(count, 'title')}` : this.auto ? 'Pin' : 'Add';
    }
}
