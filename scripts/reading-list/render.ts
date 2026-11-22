import type { Hermidata, ReadingQueue } from "../shared/types";
import { HermidataModel } from "../shared/utils/HermidataSelector";
import { getPriorityBand, QUEUE_PRIORITY_MAX, QUEUE_PRIORITY_MIN } from "./queue";
import type { RowActions, RowOptions } from "./types";

const coverUrls: string[] = [];

/** Free the blob URLs of the covers from the previous render */
export function revokeCovers(): void {
    for (const url of coverUrls.splice(0)) {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function button(className: string, text: string, label: string, onClick: () => void): HTMLButtonElement {
    const btn = el('button', className, text);
    btn.type = 'button';
    btn.setAttribute('aria-label', label);
    btn.addEventListener('click', onClick);
    return btn;
}

function queueOf(entry: Hermidata): ReadingQueue {
    return entry.meta.readingQueue as ReadingQueue;
}

function buildCover(entry: Hermidata, model: HermidataModel): HTMLElement {
    const cover = el('div', 'rl-cover');
    cover.dataset.fallback = entry.title.trim().charAt(0).toUpperCase();

    const img = el('img');
    img.alt = '';
    img.loading = 'lazy';
    img.addEventListener('error', () => img.remove());
    void model.getDisplayImageUrl().then(url => {
        coverUrls.push(url);
        img.src = url;
        cover.append(img);
    }).catch(() => { /* the letter tile stays */ });
    return cover;
}

function buildHandle(entry: Hermidata, options: RowOptions): HTMLButtonElement {
    const handle = el('button', 'rl-handle', '⠿');
    handle.type = 'button';
    handle.dataset.handleFor = entry.id;
    handle.disabled = !options.canReorder;
    handle.setAttribute('aria-pressed', String(options.grabbed));
    handle.setAttribute('aria-label', `Reorder ${entry.title}, position ${options.index + 1} of ${options.total}. Space to grab, arrow keys to move.`);
    handle.title = options.canReorder ? 'Drag, or press Space then the arrow keys' : 'Clear the filters to reorder';
    return handle;
}

function buildMeta(entry: Hermidata, model: HermidataModel): HTMLElement {
    const read = model.GetLatestReadChapter();
    const latest = model.GetLatestChapter();
    const progress = latest > 0 ? `ch. ${read} / ${latest}` : `ch. ${read}`;

    const meta = el('p', 'rl-meta', [entry.novelType, entry.source, progress].filter(Boolean).join(' · '));
    if (latest > read) meta.append(el('span', 'rl-new', `+${latest - read} new`));
    return meta;
}

function buildPriority(entry: Hermidata, actions: RowActions): HTMLElement {
    const priority = queueOf(entry).priority;
    const select = el('select', `rl-priority rl-priority-${getPriorityBand(priority).toLowerCase()}`);
    select.setAttribute('aria-label', `Priority of ${entry.title}`);
    for (let value = QUEUE_PRIORITY_MAX; value >= QUEUE_PRIORITY_MIN; value--) {
        const option = el('option', undefined, `${getPriorityBand(value)} ${value}`);
        option.value = String(value);
        option.selected = value === priority;
        select.append(option);
    }
    select.addEventListener('change', () => actions.setPriority(entry, Number(select.value)));
    return select;
}

function buildMenu(entry: Hermidata, options: RowOptions, actions: RowActions): HTMLElement {
    const menu = el('details', 'rl-menu');
    const summary = el('summary', undefined, '⋯');
    summary.setAttribute('aria-label', `More actions for ${entry.title}`);

    const list = el('div', 'rl-menu-list');
    list.append(
        button('rl-menu-item', 'Open in Overview', `Open ${entry.title} in Overview`, () => actions.openOverview(entry)),
    );
    if (options.canReorder && options.index > 0) {
        list.append(button('rl-menu-item', 'Move to top', `Move ${entry.title} to the top`, () => actions.moveTo(entry, 0)));
    }
    if (options.canReorder && options.index < options.total - 1) {
        list.append(button('rl-menu-item', 'Move to bottom', `Move ${entry.title} to the bottom`, () => actions.moveTo(entry, options.total - 1)));
    }
    list.append(button('rl-menu-item rl-menu-danger', 'Remove from queue', `Remove ${entry.title} from the queue`, () => actions.remove(entry)));

    menu.append(summary, list);
    return menu;
}

function buildTitle(entry: Hermidata, actions: RowActions): HTMLAnchorElement {
    const title = el('a', 'rl-title', entry.title);
    title.href = './Overview.html#/id/' + entry.id;
    title.addEventListener('click', (event) => {
        event.preventDefault();
        actions.openOverview(entry);
    });
    return title;
}

/** The one "Up next" card (queue position 1) */
export function buildUpNext(entry: Hermidata, options: RowOptions, actions: RowActions): HTMLElement {
    const model = new HermidataModel(entry);
    const card = el('article', 'rl-card');
    card.dataset.queueId = entry.id;
    card.dataset.index = String(options.index);
    card.draggable = options.canReorder;

    const body = el('div', 'rl-card-body');
    body.append(buildTitle(entry, actions), buildMeta(entry, model));
    if (entry.meta.tags.length) body.append(el('p', 'rl-tags', entry.meta.tags.map(tag => `#${tag}`).join(' ')));

    const side = el('div', 'rl-card-side');
    side.append(
        button('Btn rl-open', 'Open', `Open ${entry.title}`, () => actions.open(entry)),
        buildPriority(entry, actions),
        buildMenu(entry, options, actions),
    );

    card.append(buildHandle(entry, options), buildCover(entry, model), body, side);
    return card;
}

/** A compact row for queue positions 2 and up */
export function buildRow(entry: Hermidata, options: RowOptions, actions: RowActions): HTMLLIElement {
    const model = new HermidataModel(entry);
    const row = el('li', 'rl-row');
    row.dataset.queueId = entry.id;
    row.dataset.index = String(options.index);
    row.draggable = options.canReorder;

    const body = el('div', 'rl-row-body');
    body.append(buildTitle(entry, actions), buildMeta(entry, model));

    row.append(
        el('span', 'rl-position', String(options.index + 1)),
        buildHandle(entry, options),
        buildCover(entry, model),
        body,
        button('Btn rl-open', 'Open', `Open ${entry.title}`, () => actions.open(entry)),
        buildPriority(entry, actions),
        buildMenu(entry, options, actions),
    );
    return row;
}
