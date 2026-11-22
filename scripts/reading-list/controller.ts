import type { dbAccess } from "../shared/db/Storage";
import type { Hermidata, ReadingQueuePriorityBand } from "../shared/types";
import { ErrorMessage } from "../shared/utils/ErrorMessage";
import { HermidataModel } from "../shared/utils/HermidataSelector";
import { openLink } from "../shared/utils/StringOutput";
import {
    addToQueue, clampPriority, getPriorityBand, getQueue, isQueueable, isQueued, moveInQueue, normaliseQueue,
    pickForMe, QUEUE_PRIORITY_DEFAULT, QUEUE_PRIORITY_MAX, QUEUE_PRIORITY_MIN, removeFromQueue, setQueuePriority,
    sortQueueByPriority,
    type QueuePosition,
} from "./queue";
import { buildAddRow, buildPickCard, buildRow, buildUpNext, resetCovers } from "./render";
import type { QueueFilters, RowActions, RowOptions } from "./types";

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
    private grabbed: { id: string; originalIndex: number } | null = null;
    private draggingId: string | null = null;
    private lastPickId: string | null = null;
    private undoAction: (() => Promise<void>) | null = null;
    private toastTimer: number | undefined;

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
        moveTo: (entry, index) => void this.commit(moveInQueue(this.all, entry.id, index)).then(() => this.focusHandle(entry.id)),
        remove: (entry) => void this.removeEntry(entry),
        setPriority: (entry, priority) => void this.commit(setQueuePriority(this.all, entry.id, priority)).then(() => this.focusPriority(entry.id)),
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
        this.all = Object.values(await this.db.getAllHermidata());
        // repair imports (all index 0) and finished titles before showing anything
        const repairs = normaliseQueue(this.all);
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
        const stamped: Hermidata = { ...entry, meta: { ...entry.meta, updated: new Date().toISOString() } };
        await this.db.updateHermidata(stamped); // the hermidata store uses in-line keys, so no separate key is passed
        try {
            await this.db.pushToSync(stamped);
        } catch (error) {
            console.warn('[Hermidata] Reading list sync push failed; the local copy is saved.', error);
        }
        return stamped;
    }

    private async removeEntry(entry: Hermidata): Promise<void> {
        await this.commit(removeFromQueue(this.all, entry.id), `Removed "${entry.title}"`);
    }

    // -- filters --

    private get isFiltering(): boolean {
        const { search, priority, type, site } = this.filters;
        return Boolean(search || priority || type || site);
    }

    private matchesFilters(entry: Hermidata): boolean {
        const { search, priority, type, site } = this.filters;
        const queue = entry.meta.readingQueue;
        if (!queue) return false;
        if (priority && getPriorityBand(queue.priority) !== priority) return false;
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
        const queue = getQueue(this.all);
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
        const bandCount = (band: ReadingQueuePriorityBand) => queue.filter(entry => entry.meta.readingQueue && getPriorityBand(entry.meta.readingQueue.priority) === band).length;
        const high = bandCount('High');

        this.summary.textContent = queue.length === 0
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
        this.sortButton.hidden = filtering;
        this.sortButton.disabled = queue.length < 2;
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
        this.emptyTitle.textContent = filtering ? 'No matches' : 'Your reading list is empty';
        this.emptyText.textContent = filtering
            ? 'No queued titles match these filters.'
            : 'Queue the titles you want to read next and keep them in the order you like.';

        this.upNext.replaceChildren();
        this.list.replaceChildren();
        if (nothingToShow) return;

        const optionsFor = (entry: Hermidata): RowOptions => ({
            index: queue.indexOf(entry),
            total: queue.length,
            canReorder: !filtering,
            grabbed: this.grabbed?.id === entry.id,
        });

        // unfiltered: first entry is the Up next card; filtered: one flat list with real positions
        const rows = filtering ? visible : visible.slice(1);
        if (!filtering) this.upNext.append(buildUpNext(visible[0], optionsFor(visible[0]), this.actions));
        this.listHeading.textContent = filtering ? 'Matches' : 'Queue';
        this.queueCount.textContent = filtering ? `${visible.length} of ${queue.length}` : String(rows.length);
        this.list.append(...rows.map(entry => buildRow(entry, optionsFor(entry), this.actions)));
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
        const queue = getQueue(this.all);
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
        const changed = moveInQueue(this.all, id, target);
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
        const from = getQueue(this.all).findIndex(entry => entry.id === this.draggingId);
        target.dataset.drop = from < Number(target.dataset.index) ? 'after' : 'before';
    }

    private onDrop(event: DragEvent): void {
        const target = this.dropTarget(event);
        if (!this.draggingId || !target?.dataset.index) return;
        event.preventDefault();

        const id = this.draggingId;
        this.endDrag();
        if (target.dataset.queueId !== id) void this.commit(moveInQueue(this.all, id, Number(target.dataset.index)));
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
        const visible = getQueue(this.all).filter(entry => this.matchesFilters(entry));
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
            const changed = addToQueue(this.all, [...this.selectedToAdd], clampPriority(Number(this.addPriority.value)), position);
            const count = this.selectedToAdd.size;
            this.addDialog.close();
            void this.commit(changed, `Added ${plural(count, 'title')}`);
        });
    }

    private renderAddList(): void {
        const needle = this.addSearch.value.trim().toLowerCase();
        const candidates = this.all
            .filter(entry => !isQueued(entry) && isQueueable(entry))
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
            none.textContent = needle ? 'No titles match your search.' : 'Every title that can be queued is already here.';
            this.addList.append(none);
        }
        this.updateAddFooter();
    }

    private updateAddFooter(): void {
        const count = this.selectedToAdd.size;
        this.addCount.textContent = count ? `${count} selected` : 'Select titles to add';
        this.addConfirm.disabled = count === 0;
        this.addConfirm.textContent = count ? `Add ${plural(count, 'title')}` : 'Add';
    }
}
