import type { MenuOption, MenuOptions, subMenu } from "../../shared/types/rss";

/** Smallest gap kept between a context menu and the viewport edge, in px */
const MENU_EDGE_MARGIN = 8;
/** A submenu stays open this long after the pointer left it, so a diagonal move to it does not close it */
const SUBMENU_CLOSE_DELAY_MS = 150;

const MENU_CLASS = "custom-context-menu";
const SUBMENU_CLASS = "sub-menu-container";
const ITEM_CONTAINER_CLASS = "context-menu-item-container";
/** The items of one panel, not those of the submenus inside it */
const PANEL_ITEMS = `:scope > .${ITEM_CONTAINER_CLASS} > [role="menuitem"]`;

/** Shows a context menu for `options` at the pointer of `event`, replacing any menu already open. Submenus can nest */
export function openContextMenu(options: MenuOptions[], event: MouseEvent): void {
    document.querySelectorAll(`.${MENU_CLASS}`).forEach(el => el.remove());

    const menu = createPanel("Item actions");
    menu.classList.add(MENU_CLASS);

    const outsideClick = new AbortController();
    const dismiss = () => {
        menu.remove();
        outsideClick.abort();
    };
    const returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const closeMenu = () => {
        dismiss();
        if (returnFocusTo?.isConnected) returnFocusTo.focus();
    };

    appendItems(menu, options, closeMenu);
    document.body.appendChild(menu);
    placeAtPointer(menu, event);

    bindPanelKeys(menu, closeMenu);
    menu.querySelector<HTMLElement>(PANEL_ITEMS)?.focus();

    // clicking elsewhere closes the menu ( a click on a submenu item stops before it: it only opens the submenu )
    document.addEventListener("click", dismiss, { once: true, signal: outsideClick.signal });
}

function createPanel(label?: string): HTMLDivElement {
    const panel = document.createElement("div");
    panel.setAttribute("role", "menu");
    if (label) panel.setAttribute("aria-label", label);
    return panel;
}

function appendItems(panel: HTMLElement, options: MenuOptions[], closeMenu: () => void): void {
    for (const option of options) {
        if (option === "separator") {
            const hr = document.createElement("hr");
            hr.className = "menu-separator";
            panel.appendChild(hr);
        } else if ("options" in option) panel.appendChild(createSubMenuItem(option, closeMenu));
        else panel.appendChild(createActionItem(option, closeMenu));
    }
}

function createItemContainer(): HTMLDivElement {
    const container = document.createElement("div");
    container.className = ITEM_CONTAINER_CLASS;
    container.setAttribute("role", "none");
    return container;
}

function createMenuItem(label: string): HTMLDivElement {
    const item = document.createElement("div");
    item.className = "menu-item";
    item.setAttribute("role", "menuitem");
    item.setAttribute("tabindex", "-1");
    item.textContent = label;
    return item;
}

function createActionItem(option: MenuOption, closeMenu: () => void): HTMLDivElement {
    const container = createItemContainer();
    const item = createMenuItem(option.label);
    item.dataset.danger = option.danger === true ? "true" : "false";
    item.addEventListener("click", () => {
        option.action();
        closeMenu();
    });
    container.appendChild(item);
    return container;
}

function createSubMenuItem(option: subMenu, closeMenu: () => void): HTMLDivElement {
    const container = createItemContainer();
    const trigger = createMenuItem(option.label);
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");

    const arrow = document.createElement("span");
    arrow.className = "sub-menu-direction";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = ">";
    trigger.appendChild(arrow);

    // a child of the item, so the pointer moving into the submenu is still inside the item
    const panel = createPanel();
    panel.classList.add(SUBMENU_CLASS);
    appendItems(panel, option.options, closeMenu);
    container.append(trigger, panel);

    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    const open = () => {
        clearTimeout(closeTimer);
        closeOtherSubMenus(container);
        trigger.setAttribute("aria-expanded", "true");
        arrow.textContent = placeSubMenu(container, panel) ? "<" : ">";
    };
    const close = () => {
        clearTimeout(closeTimer);
        hideSubMenu(trigger, panel);
    };

    container.addEventListener("mouseenter", open);
    container.addEventListener("mouseleave", () => { closeTimer = setTimeout(close, SUBMENU_CLOSE_DELAY_MS); });
    trigger.addEventListener("click", (event) => {
        event.stopPropagation(); // not an outside click: it only opens the submenu
        open();
    });
    trigger.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowRight" && event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        open();
        panel.querySelector<HTMLElement>(PANEL_ITEMS)?.focus();
    });
    bindPanelKeys(panel, () => {
        close();
        trigger.focus();
    });
    return container;
}

/** Hides a submenu and every submenu inside it */
function hideSubMenu(trigger: HTMLElement, panel: HTMLElement): void {
    trigger.setAttribute("aria-expanded", "false");
    panel.style.display = "none";
    panel.querySelectorAll<HTMLElement>('[aria-expanded="true"]').forEach(el => el.setAttribute("aria-expanded", "false"));
    panel.querySelectorAll<HTMLElement>(`.${SUBMENU_CLASS}`).forEach(el => { el.style.display = "none"; });
}

/** Only one submenu per panel is open: closes the ones of the other items next to `container` */
function closeOtherSubMenus(container: HTMLElement): void {
    const siblings = container.parentElement?.querySelectorAll<HTMLElement>(`:scope > .${ITEM_CONTAINER_CLASS}`) ?? [];
    for (const sibling of siblings) {
        const trigger = sibling.querySelector<HTMLElement>(':scope > [aria-haspopup="menu"]');
        const panel = sibling.querySelector<HTMLElement>(`:scope > .${SUBMENU_CLASS}`);
        if (sibling !== container && trigger && panel) hideSubMenu(trigger, panel);
    }
}

/** Arrow keys move through the items of one panel, Escape ( and Left, in a submenu ) closes it */
function bindPanelKeys(panel: HTMLElement, close: () => void): void {
    const isSubMenu = panel.classList.contains(SUBMENU_CLASS);
    panel.addEventListener("keydown", (event) => {
        const items = Array.from(panel.querySelectorAll<HTMLElement>(PANEL_ITEMS));
        const current = items.indexOf(document.activeElement as HTMLElement);
        if (event.key === "ArrowDown") items[(current + 1) % items.length]?.focus();
        else if (event.key === "ArrowUp") items[(current - 1 + items.length) % items.length]?.focus();
        else if (event.key === "Home") items[0]?.focus();
        else if (event.key === "End") items.at(-1)?.focus();
        else if (event.key === "Escape" || (isSubMenu && event.key === "ArrowLeft")) close();
        else if (event.key === "Enter" || event.key === " ") (document.activeElement as HTMLElement | null)?.click();
        else return;
        event.preventDefault();
        event.stopPropagation(); // the panel around this one must not react to the same key
    });
}

/** Shows the submenu next to its item, on the side with room, and inside the viewport vertically. Returns true when it opened to the left */
function placeSubMenu(container: HTMLElement, panel: HTMLElement): boolean {
    panel.style.display = "block";
    panel.style.top = "0px";
    panel.classList.remove("opens-left");

    const item = container.getBoundingClientRect();
    const spaceRight = window.innerWidth - MENU_EDGE_MARGIN - item.right;
    const spaceLeft = item.left - MENU_EDGE_MARGIN;
    // a submenu keeps going the way its parent went, so it does not open on top of the menu it came from
    const parentOpensLeft = container.parentElement?.classList.contains("opens-left") === true;
    const width = panel.offsetWidth;
    const opensLeft = parentOpensLeft ? width <= spaceLeft || spaceLeft > spaceRight : width > spaceRight && spaceLeft > spaceRight;
    panel.classList.toggle("opens-left", opensLeft);

    const { top, bottom } = panel.getBoundingClientRect();
    const overflowBottom = Math.max(0, bottom - (window.innerHeight - MENU_EDGE_MARGIN));
    const roomAbove = Math.max(0, top - MENU_EDGE_MARGIN);
    panel.style.top = `${-Math.min(overflowBottom, roomAbove)}px`;
    return opensLeft;
}

function placeAtPointer(menu: HTMLElement, event: MouseEvent): void {
    const { width, height } = menu.getBoundingClientRect();
    menu.style.top = `${placeAlongAxis(event.clientY, height, window.innerHeight)}px`;
    menu.style.left = `${placeAlongAxis(event.clientX, width, window.innerWidth)}px`;
}

/** Start of a box of `size` opened at `cursor`: below/after the cursor, flipped before it, or pinned inside the viewport edge */
function placeAlongAxis(cursor: number, size: number, viewportSize: number): number {
    if (cursor + size <= viewportSize - MENU_EDGE_MARGIN) return cursor;
    if (cursor - size >= MENU_EDGE_MARGIN) return cursor - size;
    return Math.max(MENU_EDGE_MARGIN, viewportSize - size - MENU_EDGE_MARGIN);
}
