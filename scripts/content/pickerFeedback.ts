import { ElementPicker, type PickedElementData } from "./picker";


export interface PickerFeedbackCallbacks {
    onConfirm: () => void;
    onCancel: () => void;
    onRepick: () => void;
}

const CONTAINER_ID = "__element-picker-feedback-window";
const HOVER_PROMPT = "Hover an element to preview its text…";


export class PickerFeedbackView  {

    private container: HTMLDivElement | null = null;
    private textEl: HTMLDivElement | null = null;
    private confirmBtn: HTMLButtonElement | null = null;

    public createFeedbackWindow(callbacks: PickerFeedbackCallbacks): void {
        // Guard against a stray leftover window from a previous run.
        this.destroyFeedbackWindow();

        const container = document.createElement("div");
        container.id = CONTAINER_ID;
        Object.assign(container.style, {
            position: "fixed",
            bottom: "16px",
            right: "16px",
            zIndex: "2147483647",
            width: "280px",
            maxWidth: "90vw",
            background: "#1e1e1e",
            color: "#f5f5f5",
            borderRadius: "8px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
            fontFamily: "system-ui, -apple-system, sans-serif",
            fontSize: "13px",
            padding: "12px",
            boxSizing: "border-box",
        });

        const label = document.createElement("div");
        label.textContent = "Element picker";
        Object.assign(label.style, { fontWeight: "600", marginBottom: "6px", opacity: "0.8" });

        const textEl = document.createElement("div");
        textEl.textContent = HOVER_PROMPT;
        Object.assign(textEl.style, {
            background: "rgba(255,255,255,0.08)",
            borderRadius: "4px",
            padding: "8px",
            marginBottom: "10px",
            maxHeight: "120px",
            overflowY: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            border: "1px solid transparent",
        });

        const btnRow = document.createElement("div");
        Object.assign(btnRow.style, { display: "flex", gap: "8px" });

        const makeButton = (text: string, bg: string, fg: string): HTMLButtonElement => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = text;
            Object.assign(btn.style, {
                flex: "1",
                padding: "6px 8px",
                borderRadius: "4px",
                border: "none",
                cursor: "pointer",
                fontSize: "12px",
                background: bg,
                color: fg,
            });
            return btn;
        };

        const repickBtn = makeButton("Repick", "#3a3a3a", "#f5f5f5");
        repickBtn.addEventListener("click", callbacks.onRepick);

        const cancelBtn = makeButton("Cancel", "#3a3a3a", "#f5f5f5");
        cancelBtn.addEventListener("click", callbacks.onCancel);

        const confirmBtn = makeButton("Confirm", "#2f7d3f", "#ffffff");
        confirmBtn.disabled = true;
        confirmBtn.style.opacity = "0.5";
        confirmBtn.style.cursor = "not-allowed";
        confirmBtn.addEventListener("click", () => {
            if (!confirmBtn.disabled) callbacks.onConfirm();
        });

        btnRow.append(repickBtn, cancelBtn, confirmBtn);
        container.append(label, textEl, btnRow);
        document.body.appendChild(container);

        this.container = container;
        this.textEl = textEl;
        this.confirmBtn = confirmBtn;
    }

    /**
     * @param newDynamicText live hover text, or the final locked-in text
     * @param isFinal true once the user has clicked an element — locks the
     *        text visually and enables Confirm
     */
    public updateFeedbackWindow(leadText: PickedElementData["leafTexts"], isFinal = false): void {
        if (!this.textEl || !this.confirmBtn) return;

        this.textEl.textContent = getMultipleTitles(leadText)?.join("\n") || (isFinal ? "(empty text)" : HOVER_PROMPT);

        this.textEl.style.border = isFinal ? "1px solid #2f7d3f" : "1px solid transparent";

        if (isFinal) this.textEl.title = "Element selected: text can no longer be changed";
        else this.textEl.removeAttribute("title");

        this.confirmBtn.disabled = !isFinal;
        this.confirmBtn.style.opacity = isFinal ? "1" : "0.5";
        this.confirmBtn.style.cursor = isFinal ? "pointer" : "not-allowed";
    }

    public destroyFeedbackWindow(): void {
        this.container?.remove();
        this.container = null;
        this.textEl = null;
        this.confirmBtn = null;
    }
}
/**
 * Attaches the confirm/cancel/repick UI onto an already-running ElementPicker.
 * Owns no messaging itself — Confirm/Cancel/Escape all flow through the
 * picker's own confirmPick()/cancelPick(), which send "elementPicked" /
 * "pickingCancelled" exactly as before.
 */
export class PickerFeedbackController {
    private readonly view = new PickerFeedbackView();
    private picker: ElementPicker;

    constructor(picker: ElementPicker) {
        this.picker = picker;
        this.attach();
    }

    private attach(): void {
        this.view.createFeedbackWindow({
            onConfirm: () => this.picker.confirmPick(),
            onCancel: () => this.picker.cancelPick(),
            onRepick: () => this.repick(),
        });

        this.picker.setCallbacks({
            onHover: (el) => this.view.updateFeedbackWindow(this.picker.extractLeafTexts(el), false),
            onPick: (data) => this.onPick(data),
            onCancel: () => this.view.destroyFeedbackWindow(), // confirmPick/cancelPick both end here
        });
    }

    private repick(): void {
        this.picker.repick();
        this.view.updateFeedbackWindow([], false); // back to hover-prompt state
    }
    private onPick(data: PickedElementData): void {
        this.view.updateFeedbackWindow(data.leafTexts, true);
        this.picker.setCursor("default");
    }

    /** For the background's "cancelPicking" teardown path — no messages sent. */
    public forceDestroy(): void {
        this.view.destroyFeedbackWindow();
    }
}


function isConcatenationOfOthers(candidate: string, others: string[]): boolean {
    let remaining = candidate;
    let matchedCount = 0;

    for (const other of others) {
        const idx = remaining.indexOf(other);
        if (idx === -1) continue;
        remaining = remaining.slice(idx + other.length);
        matchedCount++;
    }

    // Only treat as a "summary" if it's stitched together from 2+ other
    // leaves in order — a single containment match is more likely a
    // coincidence (like "New" inside "New Arrivals") than a real duplicate.
    return matchedCount >= 2;
}

function dedupeContainerTexts(texts: string[]): string[] {
    return texts.filter((text, i) => {
        const others = texts.filter((_, j) => j !== i);
        return !isConcatenationOfOthers(text, others);
    });
}

export function getMultipleTitles(data: PickedElementData["leafTexts"], separator = '\n'): string[] | null {

    const deduped = dedupeContainerTexts(data);
    return deduped.length > 0 ? deduped : null;
}