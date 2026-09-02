import { ElementPicker } from "./picker";
import type { ElementPickerCallbacks, UserFeedbackData, UserFeedbackMessage as _unused } from "./picker";

interface PickerFeedbackCallbacks {
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
    public updateFeedbackWindow(newDynamicText: string, isFinal = false): void {
        console.log("updateFeedbackWindow", { newDynamicText, isFinal });
        if (!this.textEl || !this.confirmBtn) return;
        console.log("updateFeedbackWindow", { newDynamicText, isFinal, textEl: this.textEl, confirmBtn: this.confirmBtn });

        this.textEl.textContent = newDynamicText || (isFinal ? "(empty text)" : HOVER_PROMPT);

        this.textEl.style.border = isFinal ? "1px solid #2f7d3f" : "1px solid transparent";
        if (isFinal) {
            this.textEl.title = "Element selected — text can no longer be changed";
        } else {
            this.textEl.removeAttribute("title");
        }

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

export class PickerFeedback {
    private readonly view = new PickerFeedbackView();
    private resolveFn: ((result: UserFeedbackData | null) => void) | null = null;


    private readonly onRepick: () => void

    constructor(onRepick: () => void) {
        this.onRepick = onRepick;
    }

    public getUserFeedback(): Promise<UserFeedbackData | null> {
        return new Promise((resolve) => {
            this.resolveFn = resolve;
            this.view.createFeedbackWindow({
                onConfirm: () => this.settle("accepted"),
                onCancel: () => this.settle("cancelled"),
                onRepick: () => this.onRepick(),
            });
        });
    }

    public showLiveText(text: string): void {
        this.view.updateFeedbackWindow(text, false);
    }

    public showFinalText(text: string): void {
        this.view.updateFeedbackWindow(text, true);
    }

    /** Called when picking itself is aborted (e.g. Escape before any click). */
    public cancel(): void {
        this.settle("cancelled");
    }

    private settle(result: UserFeedbackData): void {
        this.view.destroyFeedbackWindow();
        const resolve = this.resolveFn;
        this.resolveFn = null;
        resolve?.(result);
    }
}

export class PickerFeedbackController {
    private picker: ElementPicker | null = null;
    private feedback: PickerFeedback | null = null;
    private ownsPicker = false;

    /**
     * @param existingPicker the picker already started by a prior
     *        "startPicking" message, if one is live. If null/undefined,
     *        a fresh backup instance is created and started here.
     */
    public async run(existingPicker?: ElementPicker | null): Promise<UserFeedbackData | null> {
        this.feedback = new PickerFeedback(() => this.repick());
        this.attachTo(existingPicker ?? null);

        return this.feedback.getUserFeedback().then((result) => {
            this.picker?.forceCancel();
            this.picker = null;
            return result;
        });
    }

    private attachTo(existingPicker: ElementPicker | null): void {
        if (existingPicker) {
            this.picker = existingPicker;
            this.ownsPicker = false;
            this.picker.setCallbacks(this.callbacksFor());
            // already running — do not call initPicker() again
        } else {
            this.picker = new ElementPicker(this.callbacksFor());
            this.ownsPicker = true;
            this.picker.initPicker();
        }
    }

    private callbacksFor(): ElementPickerCallbacks {
        return {
            onHover: (el) => this.feedback?.showLiveText((el.textContent ?? "").trim()),
            onPick: (data) => this.feedback?.showFinalText(data.text),
            onCancel: () => this.feedback?.cancel(),
        };
    }

    private repick(): void {
        this.feedback?.showLiveText(HOVER_PROMPT);
        this.picker = new ElementPicker(this.callbacksFor());
        this.ownsPicker = true;
        this.picker.initPicker();
    }
}