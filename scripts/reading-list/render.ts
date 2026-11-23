import type { Hermidata, PickActions, QueueIconName, QueueProgress, ReadingQueue, RowActions, RowOptions, WaitingCover } from "../shared/types";
import { HermidataModel } from "../shared/utils/HermidataSelector";
import { getActiveStatus, getPriorityBand, QUEUE_PRIORITY_MAX, QUEUE_PRIORITY_MIN } from "./queue";

const MAX_HERO_TAGS = 4;

const ICON_PATHS: Record<QueueIconName, string> = {
    grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
    play: 'M7 4.5v15l12-7.5z',
    toTop: 'M5 4h14M12 20V9M7 13l5-5 5 5',
    toBottom: 'M5 20h14M12 4v11M7 11l5 5 5-5',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
    info: 'M12 11v5M12 8h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    close: 'M6 6l12 12M18 6L6 18',
    shuffle: 'M3 7h3.5c2 0 3.2 1 4.3 2.6l2.4 4.8C14.3 16 15.5 17 17.5 17H21M3 17h3.5c1.4 0 2.4-.5 3.2-1.3M21 7h-3.5c-1.4 0-2.4.5-3.2 1.3M18 4l3 3-3 3M18 14l3 3-3 3',
    check: 'M5 12.5l4.5 4.5L19 7.5',
};

// -- covers: loaded once when scrolled near, then reused so re-renders never flicker --

const coverLoads = new Map<string, Promise<string | null>>();
const waitingCovers = new WeakMap<Element, WaitingCover>();

const coverObserver = new IntersectionObserver((observed) => {
    for (const { isIntersecting, target } of observed) {
        const waiting = waitingCovers.get(target);
        if (!isIntersecting || !waiting) continue;
        coverObserver.unobserve(target);
        showCover(target as HTMLElement, waiting.model, waiting.onLoad);
    }
}, { rootMargin: '240px' });

/** Free every loaded cover so the next render reads them again */
export function resetCovers(): void {
    for (const load of coverLoads.values()) {
        void load.then(url => { if (url?.startsWith('blob:')) URL.revokeObjectURL(url); });
    }
    coverLoads.clear();
}

/** The stored image, else the feed's cover; null when only the default icon exists */
async function resolveCover(model: HermidataModel): Promise<string | null> {
    const url = await model.getDisplayImageUrl();
    if (url !== model.GetImageDefaultPath()) return url;
    return model.GetLatestRssFeed()?.image || null;
}

function showCover(cover: HTMLElement, model: HermidataModel, onLoad?: (url: string) => void): void {
    let load = coverLoads.get(model.id);
    if (!load) {
        load = resolveCover(model).catch(() => null);
        coverLoads.set(model.id, load);
    }
    void load.then(url => {
        if (!url) return;
        const img = el('img');
        img.alt = '';
        img.decoding = 'async';
        img.addEventListener('error', () => img.remove());
        img.src = url;
        cover.append(img);
        onLoad?.(url);
    });
}

/** Stable hue per title, so titles without art still look distinct */
function titleHue(title: string): number {
    let hash = 0;
    for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) % 360;
    return hash;
}

function buildCover(entry: Hermidata, onLoad?: (url: string) => void): HTMLElement {
    const model = new HermidataModel(entry);
    const cover = el('div', 'rl-cover');
    cover.dataset.fallback = entry.title.trim().charAt(0).toUpperCase();
    cover.style.setProperty('--cover-hue', String(titleHue(entry.title)));

    if (coverLoads.has(entry.id)) {
        showCover(cover, model, onLoad);
    } else {
        waitingCovers.set(cover, { model, onLoad });
        coverObserver.observe(cover);
    }
    return cover;
}

// -- small parts --

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function icon(name: QueueIconName): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'rl-icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ICON_PATHS[name]);
    svg.append(path);
    return svg;
}

function iconButton(name: QueueIconName, label: string, onClick: () => void): HTMLButtonElement {
    const btn = el('button', 'rl-icon-btn');
    btn.type = 'button';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.append(icon(name));
    btn.addEventListener('click', onClick);
    return btn;
}

function textButton(className: string, name: QueueIconName, text: string, onClick: () => void): HTMLButtonElement {
    const btn = el('button', className);
    btn.type = 'button';
    btn.append(icon(name), text);
    btn.addEventListener('click', onClick);
    return btn;
}

function queueOf(entry: Hermidata): ReadingQueue {
    return entry.meta.readingQueue as ReadingQueue;
}

function getProgress(entry: Hermidata): QueueProgress {
    const model = new HermidataModel(entry);
    // not GetLatestReadChapter: it falls back to the latest release, which shows unread titles as caught up
    const read = model.GetHistory().filter(item => item.chapter > 0).at(-1)?.chapter ?? model.GetChapter();
    const latest = model.GetLatestChapter();
    const unit = /anime|tv/i.test(entry.novelType) ? 'Ep.' : 'Ch.';
    const percent = latest > 0 ? Math.min(100, Math.round((read / latest) * 100)) : 0;
    return { unit, read, latest, percent };
}

function buildProgress(progress: QueueProgress): HTMLElement {
    const { unit, read, latest, percent } = progress;
    const wrap = el('div', 'rl-progress');

    const line = el('div', 'rl-progress-line');
    const count = el('span', 'rl-progress-count', `${unit} ${read}`);
    if (latest > 0) count.append(el('span', 'rl-progress-of', ` / ${latest}`));
    line.append(count);
    if (latest > read) line.append(el('span', 'rl-new', `+${latest - read}`));
    else if (latest > 0) line.append(el('span', 'rl-caught-up', 'Caught up'));
    wrap.append(line);

    if (latest > 0) {
        const bar = el('div', 'rl-bar');
        bar.setAttribute('role', 'img');
        bar.setAttribute('aria-label', `${percent}% read`);
        const fill = el('div');
        fill.style.width = `${percent}%`;
        bar.append(fill);
        wrap.append(bar);
    }
    return wrap;
}

function buildHandle(entry: Hermidata, options: RowOptions): HTMLButtonElement {
    const handle = el('button', 'rl-handle');
    handle.type = 'button';
    handle.append(icon('grip'));
    handle.dataset.handleFor = entry.id;
    handle.disabled = !options.canReorder;
    handle.setAttribute('aria-pressed', String(options.grabbed));
    handle.setAttribute('aria-label', `Reorder ${entry.title}, position ${options.index + 1} of ${options.total}. Space to grab, arrow keys to move.`);
    handle.title = options.canReorder ? 'Drag, or press Space then the arrow keys' : 'Clear the filters to reorder';
    return handle;
}

function buildPriority(entry: Hermidata, actions: RowActions): HTMLElement {
    const priority = queueOf(entry).priority;
    const wrap = el('label', 'rl-priority');
    wrap.dataset.band = getPriorityBand(priority).toLowerCase();

    const select = el('select');
    select.dataset.priorityFor = entry.id;
    select.setAttribute('aria-label', `Priority of ${entry.title}`);
    for (let value = QUEUE_PRIORITY_MAX; value >= QUEUE_PRIORITY_MIN; value--) {
        const option = el('option', undefined, `${getPriorityBand(value)} ${value}`);
        option.value = String(value);
        option.selected = value === priority;
        select.append(option);
    }
    select.addEventListener('change', () => actions.setPriority(entry, Number(select.value)));
    wrap.append(select);
    return wrap;
}

function buildMenu(entry: Hermidata, options: RowOptions, actions: RowActions): HTMLElement {
    const menu = el('details', 'rl-menu');
    const summary = el('summary');
    summary.setAttribute('aria-label', `More actions for ${entry.title}`);
    summary.title = 'More actions';
    summary.append(icon('more'));

    const list = el('div', 'rl-menu-list');
    list.append(textButton('rl-menu-item', 'info', 'View details', () => actions.openOverview(entry)));
    if (options.canReorder && options.index > 0) {
        list.append(textButton('rl-menu-item', 'toTop', 'Move to top', () => actions.moveTo(entry, 0)));
    }
    if (options.canReorder && options.index < options.total - 1) {
        list.append(textButton('rl-menu-item', 'toBottom', 'Move to bottom', () => actions.moveTo(entry, options.total - 1)));
    }
    list.append(textButton('rl-menu-item rl-menu-danger', 'trash', 'Remove from queue', () => actions.remove(entry)));

    menu.append(summary, list);
    return menu;
}

function buildTitle(entry: Hermidata, actions: RowActions): HTMLAnchorElement {
    const title = el('a', 'rl-title', entry.title);
    title.href = './Overview.html#/id/' + entry.id;
    title.title = entry.title;
    title.addEventListener('click', (event) => {
        event.preventDefault();
        actions.openOverview(entry);
    });
    return title;
}

function metaText(entry: Hermidata): string {
    return [entry.novelType, entry.source, getActiveStatus(entry)].filter(Boolean).join(' · ');
}

function continueLabel(progress: QueueProgress): string {
    const verb = progress.unit === 'Ep.' ? 'watching' : 'reading';
    return progress.read > 0 ? `Continue ${verb}` : `Start ${verb}`;
}

// -- views --

/** The one "Up next" card (queue position 1) */
export function buildUpNext(entry: Hermidata, options: RowOptions, actions: RowActions): HTMLElement {
    const progress = getProgress(entry);
    const card = el('article', 'rl-hero');
    card.dataset.queueId = entry.id;
    card.dataset.index = String(options.index);
    card.draggable = options.canReorder;

    const backdrop = el('img', 'rl-hero-backdrop');
    backdrop.alt = '';
    backdrop.hidden = true;
    backdrop.addEventListener('error', () => { backdrop.hidden = true; });

    const art = el('div', 'rl-hero-art');
    art.append(backdrop, buildCover(entry, (url) => {
        backdrop.src = url;
        backdrop.hidden = false;
    }));

    const controls = el('div', 'rl-hero-controls');
    controls.append(buildHandle(entry, options), buildMenu(entry, options, actions));

    const body = el('div', 'rl-hero-body');
    body.append(buildTitle(entry, actions), el('p', 'rl-meta', metaText(entry)));
    if (entry.meta.tags.length) {
        const tags = el('ul', 'rl-tags');
        tags.append(...entry.meta.tags.slice(0, MAX_HERO_TAGS).map(tag => el('li', undefined, tag)));
        body.append(tags);
    }
    body.append(buildProgress(progress));

    const cta = el('div', 'rl-hero-cta');
    cta.append(
        textButton('rl-btn rl-btn-primary', 'play', continueLabel(progress), () => actions.open(entry)),
        buildPriority(entry, actions),
    );
    body.append(cta);

    card.append(art, controls, body);
    return card;
}

/** A compact row for queue positions 2 and up */
export function buildRow(entry: Hermidata, options: RowOptions, actions: RowActions): HTMLLIElement {
    const row = el('li', 'rl-row');
    row.dataset.queueId = entry.id;
    row.dataset.index = String(options.index);
    row.draggable = options.canReorder;

    const grab = el('div', 'rl-grab');
    grab.append(el('span', 'rl-position', String(options.index + 1)), buildHandle(entry, options));

    const main = el('div', 'rl-row-main');
    main.append(buildTitle(entry, actions), el('p', 'rl-meta', metaText(entry)));

    const rowActions = el('div', 'rl-row-actions');
    rowActions.append(
        iconButton('external', `Open ${entry.title}`, () => actions.open(entry)),
        buildMenu(entry, options, actions),
    );

    row.append(grab, buildCover(entry), main, buildProgress(getProgress(entry)), buildPriority(entry, actions), rowActions);
    return row;
}

/** Content of the "Pick for me" dialog */
export function buildPickCard(entry: Hermidata, actions: PickActions): HTMLElement {
    const progress = getProgress(entry);
    const card = el('div', 'rl-pick');

    const body = el('div', 'rl-pick-body');
    const band = getPriorityBand(queueOf(entry).priority);
    body.append(
        el('p', 'rl-eyebrow', 'Picked for you'),
        el('h2', undefined, entry.title),
        el('p', 'rl-meta', `${metaText(entry)} · ${band} priority`),
        buildProgress(progress),
    );

    const buttons = el('div', 'rl-pick-actions');
    buttons.append(textButton('rl-btn rl-btn-primary', 'play', continueLabel(progress), () => actions.open(entry)));
    if (actions.canPickAgain) buttons.append(textButton('rl-btn', 'shuffle', 'Pick again', actions.again));
    body.append(buttons);

    const close = iconButton('close', 'Close', actions.close);
    close.classList.add('rl-pick-close');

    card.append(buildCover(entry), body, close);
    return card;
}

/** A selectable title in the add dialog */
export function buildAddRow(entry: Hermidata, checked: boolean, onToggle: (checked: boolean) => void): HTMLLIElement {
    const item = el('li');
    const label = el('label', 'rl-add-row');

    const box = el('input');
    box.type = 'checkbox';
    box.checked = checked;
    box.addEventListener('change', () => onToggle(box.checked));

    const mark = el('span', 'rl-check');
    mark.append(icon('check'));

    const text = el('span', 'rl-add-text');
    text.append(el('span', 'rl-add-title', entry.title), el('span', 'rl-meta', metaText(entry)));

    label.append(box, mark, buildCover(entry), text);
    item.append(label);
    return item;
}
