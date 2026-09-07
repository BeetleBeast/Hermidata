
// Guard against double-injection if the user clicks "Pick Element" again
// while a picking session is already active on this page.
const w = window as unknown as { __elementPickerActive?: boolean };

interface ElementAttribute {
    name: string;
    value: string;
}

interface ChildInfo {
    tag: string;
    text: string;
}

interface PickedElementData {
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

interface StartPickingMessage { action: "startPicking"; }

interface CancelPickingMessage { action: "cancelPicking"; }

export type RuntimeMessage = ElementPickedMessage | PickingCancelledMessage | StartPickingMessage | CancelPickingMessage;

export class ElementPicker {

    public initPicker(): void {
        if (w.__elementPickerActive) return;

        w.__elementPickerActive = true;


        document.body.style.cursor = "crosshair";
        // Capture phase so we intercept before the page's own handlers
        // (stops link navigation, button actions, etc. from firing on pick).
        document.addEventListener("mouseover", this.onMouseOver, true);
        document.addEventListener("click", this.onClick, true);
        document.addEventListener("keydown", this.onKeyDown, true);
    }


    private readonly HIGHLIGHT_OUTLINE = "2px solid #ff4444";
    private hovered: HTMLElement | null = null;
    private readonly prevOutlines = new WeakMap<HTMLElement, string>();

    public forceCancel(): void {
        this.cleanup();
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

    private extractLeafTexts(el: HTMLElement): string[] {
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
        document.removeEventListener("click", this.onClick, true);
        document.removeEventListener("keydown", this.onKeyDown, true);
        if (this.hovered) this.clearOutline(this.hovered);
        document.body.style.cursor = "";
        w.__elementPickerActive = false;
    }

    private onMouseOver = (e: MouseEvent): void => {
        const target = e.target as HTMLElement;
        if (target === this.hovered) return;
        if (this.hovered) this.clearOutline(this.hovered);
        this.hovered = target;
        this.setOutline(this.hovered);
    };

    private onClick = (e: MouseEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const target = e.target as HTMLElement;
        const data = this.extractData(target);
        this.cleanup();

        const msg: ElementPickedMessage = { action: "elementPicked", data };
        chrome.runtime.sendMessage(msg);
    };

    private onKeyDown = (e: KeyboardEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (e.key === "Escape") {
            this.cleanup();
            const msg: PickingCancelledMessage = { action: "pickingCancelled" };
            chrome.runtime.sendMessage(msg);
        }
    };
}