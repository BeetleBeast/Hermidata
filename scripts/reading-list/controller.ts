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
import { buildRow, buildUpNext, revokeCovers } from "./render";
import type { QueueFilters, RowActions, RowOptions } from "./types";

const TOAST_MS = 6000;

function requireElement<T extends HTMLElement>(selector: string): T {
    const node = document.querySelector<T>(selector);
    if (!node) throw new Error(`Reading list page is missing ${selector}`);
    return node;
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

    private readonly summary = requireElement<HTMLElement>('#queue-summary');
    private readonly upNext = requireElement<HTMLElement>('#up-next');
    private readonly upNextSection = this.upNext.closest('section') as HTMLElement;
    private readonly list = requireElement<HTMLOListElement>('#queue-list');
    private readonly listHeading = requireElement<HTMLElement>('#queue-heading');
    private readonly empty = requireElement<HTMLElement>('#queue-empty');
    private readonly emptyText = requireElement<HTMLElement>('#queue-empty-text');
    private readonly emptyAdd = requireElement<HTMLButtonElement>('#empty-add');
    private readonly reorderHint = requireElement<HTMLElement>('#reorder-hint');
    private readonly pickResult = requireElement<HTMLElement>('#pick-result');
    private readonly announce = requireElement<HTMLElement>('#sr-announce');
    private readonly toast = requireElement<HTMLElement>('#toast');

    private readonly search = requireElement<HTMLInputElement>('#queue-search');
    private readonly filterPriority = requireElement<HTMLSelectElement>('#filter-priority');
    private readonly filterType = requireElement<HTMLSelectElement>('#filter-type');
    private readonly filterSite = requireElement<HTMLSelectElement>('#filter-site');
    private readonly clearFilters = requireElement<HTMLButtonElement>('#clear-filters');

    private readonly addDialog = requireElement<HTMLDialogElement>('#add-dialog');
    private readonly addSearch = requireElement<HTMLInputElement>('#add-search');
    private readonly addList = requireElement<HTMLUListElement>('#add-list');
    private readonly addPriority = requireElement<HTMLSelectElement>('#add-priority');
    private readonly addConfirm = requireElement<HTMLButtonElement>('#add-confirm');

    private readonly actions: RowActions = {
        open: (entry) => void openLink(new HermidataModel(entry).GetUrl(), 'newTab'),
        openOverview: (entry) => void openLink('./Overview.html#/id/' + entry.id, 'sameTab'),
        moveTo: (entry, index) => void this.commit(moveInQueue(this.all, entry.id, index)),
        remove: (entry) => void this.removeEntry(entry),
        setPriority: (entry, priority) => void this.commit(setQueuePriority(this.all, entry.id, priority)),
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
            new ErrorMessage('Could not update the reading list. Reloading it.', undefined, { details: [error] }).sendMessage();
            await this.load();
            return;
        }

        this.render();
        if (toastText) this.showToast(toastText, () => this.commit(previous));
    }

    private async save(entry: Hermidata): Promise<Hermidata> {
        const stamped: Hermidata = { ...entry, meta: { ...entry.meta, updated: new Date().toISOString() } };
        await this.db.setHermidata(stamped.id, stamped);
        try {
            await this.db.pushToSync(stamped);
        } catch (error) {
            console.warn('[Hermidata] Reading list sync push failed; the local copy is saved.', error);
        }
        return stamped;
    }

    private async removeEntry(entry: Hermidata): Promise<void> {
        await this.commit(removeFromQueue(this.all, entry.id), `Removed "${entry.title}" from the reading list.`);
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

    private fillFilterSelect(select: HTMLSelectElement, values: string[], current: string): void {
        const unique = [...new Set(values)].sort((a, b) => a.localeCompare(b));
        select.replaceChildren(new Option('Any', ''), ...unique.map(value => new Option(value, value)));
        select.value = unique.includes(current) ? current : '';
    }

    // -- render --

    private render(): void {
        revokeCovers();
        const queue = getQueue(this.all);
        this.fillFilterSelect(this.filterType, queue.map(entry => entry.novelType), this.filters.type);
        this.fillFilterSelect(this.filterSite, queue.map(entry => entry.source), this.filters.site);
        this.filters.type = this.filterType.value;
        this.filters.site = this.filterSite.value;

        const filtering = this.isFiltering;
        const visible = queue.filter(entry => this.matchesFilters(entry));
        const highCount = queue.filter(entry => entry.meta.readingQueue && getPriorityBand(entry.meta.readingQueue.priority) === 'High').length;

        this.summary.textContent = queue.length === 0 ? 'Nothing queued' : `${queue.length} queued · ${highCount} high priority`;
        this.clearFilters.hidden = !filtering;
        this.reorderHint.hidden = !(filtering && queue.length > 1);
        (document.querySelector('#pick-for-me') as HTMLButtonElement).disabled = visible.length === 0;
        (document.querySelector('#sort-by-priority') as HTMLButtonElement).disabled = filtering || queue.length < 2;

        this.renderBody(queue, visible, filtering);
        if (!this.pickResult.hidden && this.lastPickId && !visible.some(entry => entry.id === this.lastPickId)) this.pickResult.hidden = true;
    }

    private renderBody(queue: Hermidata[], visible: Hermidata[], filtering: boolean): void {
        const nothingToShow = visible.length === 0;
        this.empty.hidden = !nothingToShow;
        this.upNextSection.hidden = nothingToShow || filtering;
        this.listHeading.parentElement!.hidden = nothingToShow;
        this.emptyAdd.hidden = filtering;
        this.emptyText.textContent = filtering
            ? 'No queued titles match the filters.'
            : 'Nothing queued. Add a title from your library to start your reading list.';

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
        this.list.append(...rows.map(entry => buildRow(entry, optionsFor(entry), this.actions)));
        this.listHeading.parentElement!.hidden = rows.length === 0;
    }

    // -- events --

    private bindEvents(): void {
        requireElement('#reloadData').addEventListener('click', () => void this.load());
        requireElement('#back-to-library').addEventListener('click', () => void openLink('Library.html', 'sameTab'));
        requireElement('#sort-by-priority').addEventListener('click', () => void this.commit(sortQueueByPriority(this.all), 'Sorted by priority.'));
        requireElement('#pick-for-me').addEventListener('click', () => this.pick());

        this.search.addEventListener('input', () => this.setFilters({ search: this.search.value.trim() }));
        this.filterPriority.addEventListener('change', () => this.setFilters({ priority: this.filterPriority.value as ReadingQueuePriorityBand | '' }));
        this.filterType.addEventListener('change', () => this.setFilters({ type: this.filterType.value }));
        this.filterSite.addEventListener('change', () => this.setFilters({ site: this.filterSite.value }));
        this.clearFilters.addEventListener('click', () => {
            this.search.value = '';
            this.filterPriority.value = '';
            this.setFilters({ search: '', priority: '', type: '', site: '' });
        });

        requireElement('#toast-undo').addEventListener('click', () => void this.runUndo());

        const main = requireElement('#queue-main');
        main.addEventListener('keydown', (event) => this.onHandleKey(event));
        main.addEventListener('dragstart', (event) => this.onDragStart(event));
        main.addEventListener('dragover', (event) => this.onDragOver(event));
        main.addEventListener('drop', (event) => this.onDrop(event));
        main.addEventListener('dragend', () => { this.draggingId = null; });
        main.addEventListener('click', (event) => this.closeOtherMenus(event));

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
        await this.commit(moveInQueue(this.all, id, target));
        this.announceText(message ?? `Moved to position ${target + 1} of ${total}.`);
        this.focusHandle(id);
    }

    private focusHandle(id: string): void {
        document.querySelector<HTMLButtonElement>(`.rl-handle[data-handle-for="${CSS.escape(id)}"]`)?.focus();
    }

    private announceText(text: string): void {
        this.announce.textContent = text;
    }

    // -- reorder: drag and drop --

    private onDragStart(event: DragEvent): void {
        const id = (event.target as HTMLElement).closest<HTMLElement>('[data-queue-id]')?.dataset.queueId;
        if (!id || this.isFiltering) return;
        this.draggingId = id;
        event.dataTransfer?.setData('text/plain', id);
    }

    private onDragOver(event: DragEvent): void {
        if (this.draggingId && (event.target as HTMLElement).closest('[data-queue-id]')) event.preventDefault();
    }

    private onDrop(event: DragEvent): void {
        const target = (event.target as HTMLElement).closest<HTMLElement>('[data-queue-id]');
        if (!this.draggingId || !target?.dataset.index) return;
        event.preventDefault();

        const id = this.draggingId;
        this.draggingId = null;
        if (target.dataset.queueId !== id) void this.commit(moveInQueue(this.all, id, Number(target.dataset.index)));
    }

    // -- pick for me --

    private pick(): void {
        const visible = getQueue(this.all).filter(entry => this.matchesFilters(entry));
        // do not repeat the previous pick when there is another choice
        const pool = visible.length > 1 ? visible.filter(entry => entry.id !== this.lastPickId) : visible;
        const picked = pickForMe(pool);
        if (!picked) return;

        this.lastPickId = picked.id;
        const queue = picked.meta.readingQueue as { priority: number };

        const text = document.createElement('p');
        text.textContent = `How about "${picked.title}"? (${getPriorityBand(queue.priority)} priority)`;

        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'Btn';
        open.textContent = 'Open';
        open.addEventListener('click', () => this.actions.open(picked));

        const again = document.createElement('button');
        again.type = 'button';
        again.className = 'Btn';
        again.textContent = 'Pick again';
        again.addEventListener('click', () => this.pick());

        const dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.className = 'Btn';
        dismiss.textContent = 'Dismiss';
        dismiss.addEventListener('click', () => { this.pickResult.hidden = true; });

        this.pickResult.replaceChildren(text, open, again, dismiss);
        this.pickResult.hidden = false;
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
        requireElement('#add-cancel').addEventListener('click', () => this.addDialog.close());
        this.addSearch.addEventListener('input', () => this.renderAddList());

        requireElement<HTMLFormElement>('#add-form').addEventListener('submit', (event) => {
            event.preventDefault();
            const position = (document.querySelector<HTMLInputElement>('input[name="add-position"]:checked')?.value ?? 'bottom') as QueuePosition;
            const changed = addToQueue(this.all, [...this.selectedToAdd], clampPriority(Number(this.addPriority.value)), position);
            this.addDialog.close();
            void this.commit(changed, `Added ${this.selectedToAdd.size} title${this.selectedToAdd.size === 1 ? '' : 's'} to the reading list.`);
        });
    }

    private renderAddList(): void {
        const needle = this.addSearch.value.trim().toLowerCase();
        const candidates = this.all
            .filter(entry => !isQueued(entry) && isQueueable(entry))
            .filter(entry => !needle || [entry.title, ...entry.meta.altTitles].some(title => title.toLowerCase().includes(needle)))
            .sort((a, b) => a.title.localeCompare(b.title))
            .slice(0, 200);

        this.addList.replaceChildren(...candidates.map(entry => {
            const item = document.createElement('li');
            const label = document.createElement('label');
            const box = document.createElement('input');
            box.type = 'checkbox';
            box.checked = this.selectedToAdd.has(entry.id);
            box.addEventListener('change', () => {
                if (box.checked) this.selectedToAdd.add(entry.id);
                else this.selectedToAdd.delete(entry.id);
                this.addConfirm.disabled = this.selectedToAdd.size === 0;
            });
            label.append(box, ` ${entry.title}`, Object.assign(document.createElement('span'), { className: 'muted', textContent: ` · ${entry.novelType}` }));
            item.append(label);
            return item;
        }));

        if (candidates.length === 0) {
            const none = document.createElement('li');
            none.className = 'muted';
            none.textContent = needle ? 'No titles match.' : 'Every title that can be queued is already in the list.';
            this.addList.append(none);
        }
        this.addConfirm.disabled = this.selectedToAdd.size === 0;
    }
}
