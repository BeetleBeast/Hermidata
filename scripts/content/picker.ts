
// Guard against double-injection if the user clicks "Pick Element" again
// while a picking session is already active on this page.
const w = window as unknown as { __elementPickerActive?: boolean };

/** id of the feedback window; the picker lets events inside it through so its buttons stay usable */
export const PICKER_PANEL_ID = "__element-picker-feedback-window";

/** Keys that keep working while picking: moving focus / scrolling the page is how keyboard users reach an element */
const NAVIGATION_KEYS = new Set(["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"]);

export interface ElementPickerCallbacks {
    onHover?: (el: HTMLElement) => void;
    /** fired once an element is clicked and locked in, awaiting Confirm */
    onPick?: (data: PickedElementData) => void;
    /** fired on Escape or Cancel — picker is already cleaned up when this fires */
    onCancel?: () => void;
}

interface ElementAttribute {
    name: string;
    value: string;
}

interface ChildInfo {
    tag: string;
    text: string;
}

export interface PickedElementData {
    tag: string;
    id: string;
    classes: string[];
    /** Direct text content, trimmed */
    text: string;
    /** innerHTML, trimmed */
    html: string;
    attributes: ElementAttribute[];
    /** Direct children only (not full descendant tree) */
    children: ChildInfo[];
    /** Best-effort unique-ish CSS selector for re-selecting this element later */
    selector: string;
    /** one entry per lowest-level text-bearing element, in DOM order */
    leafTexts: string[];
}

interface ElementPickedMessage {
    action: "elementPicked";
    data: PickedElementData;
}

interface PickingCancelledMessage {
    action: "pickingCancelled";
}

export interface StartPickingMessage { action: "startPicking"; }

export interface CancelPickingMessage { action: "cancelPicking"; }

export type RuntimeMessage = ElementPickedMessage | PickingCancelledMessage | StartPickingMessage | CancelPickingMessage;

export class ElementPicker {

    private callbacks: ElementPickerCallbacks;
    private locked = false;
    private lockedData: PickedElementData | null = null;

    constructor(callbacks: ElementPickerCallbacks = {}) {
        this.callbacks = callbacks;
    }

    /** Attach/replace callbacks on an already-running picker instance. */
    public setCallbacks(callbacks: ElementPickerCallbacks): void {
        this.callbacks = { ...this.callbacks, ...callbacks };
    }

    public initPicker(): void {
        if (w.__elementPickerActive) return;

        w.__elementPickerActive = true;


        this.setCursor("crosshair");
        // Capture phase so we intercept before the page's own handlers
        // (stops link navigation, button actions, etc. from firing on pick).
        document.addEventListener("mouseover", this.onMouseOver, true);
        document.addEventListener("focusin", this.onFocusIn, true); // keyboard: the focused element is "hovered"
        document.addEventListener("click", this.onClick, true);
        document.addEventListener("keydown", this.onKeyDown, true);
    }

    public setCursor(cursorStyle: string = 'crosshair'): void {
        document.body.style.cursor = cursorStyle;
    }


    private readonly HIGHLIGHT_OUTLINE = "2px solid #ff4444";
    private hovered: HTMLElement | null = null;
    private readonly prevOutlines = new WeakMap<HTMLElement, string>();

    public forceCancel(): void {
        this.cleanup();
    }

    /** Called by the feedback window's Confirm button. */
    public confirmPick(): void {
        if (!this.lockedData) return;
        const data = this.lockedData;
        this.cleanup();
        const msg: ElementPickedMessage = { action: "elementPicked", data };
        chrome.runtime.sendMessage(msg);
        this.callbacks.onCancel?.(); // reuse as "session over" signal? — see note below
    }

    /** Called by the feedback window's Cancel button, or internally on Escape. */
    public cancelPick(): void {
        this.cleanup();
        const msg: PickingCancelledMessage = { action: "pickingCancelled" };
        chrome.runtime.sendMessage(msg);
        this.callbacks.onCancel?.();
    }

    /** Called by the feedback window's Repick button. */
    public repick(): void {
        if (this.hovered) this.clearOutline(this.hovered);
        this.hovered = null;
        this.locked = false;
        this.lockedData = null;
        // mouseover/click/keydown listeners are still attached — locked=false
        // just lets onMouseOver/onClick respond again.
    }

    private setOutline(el: HTMLElement): void {
        this.prevOutlines.set(el, el.style.outline);
        el.style.outline = this.HIGHLIGHT_OUTLINE;
    }

    private clearOutline(el: HTMLElement): void {
        el.style.outline = this.prevOutlines.get(el) ?? "";
        this.prevOutlines.delete(el);
    }

    private buildSelector(el: Element): string {
        if (el.id) return `#${CSS.escape(el.id)}`;

        const parts: string[] = [];
        let node: Element | null = el;

        while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 6) {
            let part = node.tagName.toLowerCase();

            if (node.classList.length > 0) {
                part += "." + Array.from(node.classList).map((c) => CSS.escape(c)).join(".");
            }

            const currentTag = node.tagName;
            const parent: Element | null = node.parentElement;
            if (parent) {
                const siblings: Element[] = Array.from(parent.children).filter(
                (c) => c.tagName === currentTag
                );
                if (siblings.length > 1) {
                const index = siblings.indexOf(node) + 1;
                part += `:nth-of-type(${index})`;
                }
            }

            parts.unshift(part);
            if (node.id) {
                parts[0] = `#${CSS.escape(node.id)}`;
                break;
            }
            node = parent;
        }

        return parts.join(" > ");
    }

    public extractLeafTexts(el: HTMLElement): string[] {
        const results: string[] = [];

        function walk(node: Element): void {
            const hasElementChildren = Array.from(node.children).length > 0;

            if (!hasElementChildren) {
                const text = (node.textContent ?? "").trim();
                if (text.length > 0) results.push(text);
                return;
            }

            for (const child of Array.from(node.children)) {
                walk(child);
            }
        }

        walk(el);
        return results;
    }

    private extractData(el: HTMLElement): PickedElementData {

        const pickedElementData: PickedElementData = {
            tag: el.tagName.toLowerCase(),
            id: el.id,
            classes: Array.from(el.classList),
            text: (el.textContent ?? "").trim(),
            html: el.innerHTML.trim(),
            attributes: Array.from(el.attributes).map((a) => ({ name: a.name, value: a.value })),
            children: Array.from(el.children).map((child) => ({
                tag: child.tagName.toLowerCase(),
                text: (child.textContent ?? "").trim(),
            })),
            selector: this.buildSelector(el),
            leafTexts: this.extractLeafTexts(el),
        };

        return pickedElementData;
    }

    private cleanup(): void {
        document.removeEventListener("mouseover", this.onMouseOver, true);
        document.removeEventListener("focusin", this.onFocusIn, true);
        document.removeEventListener("click", this.onClick, true);
        document.removeEventListener("keydown", this.onKeyDown, true);
        if (this.hovered) this.clearOutline(this.hovered);
        document.body.style.cursor = "";
        w.__elementPickerActive = false;
    }

    private isInsidePanel(target: EventTarget | null): boolean {
        return target instanceof Element && target.closest(`#${PICKER_PANEL_ID}`) !== null;
    }

    private highlight(target: HTMLElement): void {
        if (this.locked || this.isInsidePanel(target)) return;
        if (target === this.hovered) return;
        if (this.hovered) this.clearOutline(this.hovered);
        this.hovered = target;
        this.setOutline(this.hovered);
        this.callbacks.onHover?.(target);
    }

    private pick(target: HTMLElement): void {
        this.lockedData = this.extractData(target);
        this.locked = true;

        this.callbacks.onPick?.(this.lockedData);
    }

    private onMouseOver = (e: MouseEvent): void => {
        this.highlight(e.target as HTMLElement);
    };

    private onFocusIn = (e: FocusEvent): void => {
        this.highlight(e.target as HTMLElement);
    };

    private onClick = (e: MouseEvent): void => {
        if (this.locked || this.isInsidePanel(e.target)) return; // ignore clicks after the first one until repick is called
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        this.pick(e.target as HTMLElement);
    };

    private onKeyDown = (e: KeyboardEvent): void => {
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            this.cancelPick();
            return;
        }
        if (this.isInsidePanel(e.target) || NAVIGATION_KEYS.has(e.key)) return; // the panel's buttons and moving around the page keep working

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // Enter / Space on the focused element picks it, like a click
        const isActivation = e.key === "Enter" || e.key === " ";
        if (isActivation && !this.locked && !e.repeat && e.target instanceof HTMLElement) this.pick(e.target);
    };
}