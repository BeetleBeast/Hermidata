
export interface Range {
    min: number;
    max: number;
}

export class DualRangeSlider {
    private root: HTMLElement;
    private min: number;
    private max: number;
    private step: number;
    private onChange?: (range: Range) => void;

    private value: Range;

    private minInput!: HTMLInputElement;
    private maxInput!: HTMLInputElement;
    private trackFill!: HTMLDivElement;
    private labelEl!: HTMLDivElement;

    constructor(containerRef: HTMLElement | string, startValue: Range, onChange?: (range: { min: number; max: number }) => void) {
        
        const container = typeof containerRef === "string" ? document.querySelector<HTMLElement>(containerRef) : containerRef;

        if (!container) throw new Error("DualRangeSlider: container not found");

        this.root = container;
        this.min = 0;
        this.max = 10;
        this.step = 1;
        this.onChange = onChange;

        this.value = { min: startValue.min ?? 3, max: startValue.max ?? 5 };

        this.render();
        this.update(false);
    }

    /** Current selected {min, max}. */
    public getValue(): Range {
        return { ...this.value };
    }

    /** Programmatically set the selected range (clamped + validated). */
    public setValue(min: number, max: number): void {
        this.value.min = this.clamp(Math.min(min, max));
        this.value.max = this.clamp(Math.max(min, max));
        this.minInput.value = String(this.value.min);
        this.maxInput.value = String(this.value.max);
        this.update(true);
    }

    /** Remove listeners and DOM. Call if the filter is torn down dynamically. */
    public destroy(): void {
        this.root.innerHTML = "";
    }

    private clamp(v: number): number {
        return Math.min(this.max, Math.max(this.min, v));
    }

    private render(): void {
        this.root.innerHTML = "";
        this.root.classList.add("drs-root");

        this.labelEl = document.createElement("div");
        this.labelEl.className = "drs-label";

        const track = document.createElement("div");
        track.className = "drs-track";
    
        const trackBg = document.createElement("div");
        trackBg.className = "drs-track-bg";
    
        this.trackFill = document.createElement("div");
        this.trackFill.className = "drs-track-fill";
    
        this.minInput = this.makeRangeInput(["drs-thumb", "drs-thumb-min"]);
        this.maxInput = this.makeRangeInput(["drs-thumb", "drs-thumb-max"]);
        this.minInput.value = String(this.value.min);
        this.maxInput.value = String(this.value.max);
    
        track.appendChild(trackBg);
        track.appendChild(this.trackFill);
        track.appendChild(this.minInput);
        track.appendChild(this.maxInput);
    
        const ticks = document.createElement("div");
        ticks.className = "drs-ticks";
        for (let v = this.min; v <= this.max; v += this.step) {
            const tick = document.createElement("span");
            tick.textContent = String(v);

            if (v >= this.value.min && v <= this.value.max) tick.classList.add('active-drs-stick');

            ticks.appendChild(tick);
        }
    
        this.root.appendChild(this.labelEl);
        this.root.appendChild(track);
        this.root.appendChild(ticks);
    
        this.minInput.addEventListener("input", () => this.handleMinInput());
        this.maxInput.addEventListener("input", () => this.handleMaxInput());

    }

    private makeRangeInput(classNames: string[]): HTMLInputElement {
        const input = document.createElement("input");
        input.type = "range";
        input.classList.add(...classNames);
        input.min = String(this.min);
        input.max = String(this.max);
        input.step = String(this.step);
        return input;
    }

    private handleMinInput(): void {
        let minVal = Number(this.minInput.value);
        let maxVal = Number(this.maxInput.value);
        if (minVal > maxVal) {
            maxVal = minVal;
            this.minInput.value = String(minVal);
            this.maxInput.value = String(maxVal);
        }
        this.value.min = minVal;
        this.value.max = maxVal;
        this.update(true);
    }

    private handleMaxInput(): void {
        let minVal = Number(this.minInput.value);
        let maxVal = Number(this.maxInput.value);
        if (maxVal < minVal) {
            minVal = maxVal;
            this.maxInput.value = String(maxVal);
            this.minInput.value = String(minVal);
        }
        this.value.min = minVal;
        this.value.max = maxVal;
        this.update(true);
    }

    

    private update(fireChange: boolean): void {
        const span = this.max - this.min || 1;
        const minPct = ((this.value.min - this.min) / span) * 100;
        const maxPct = ((this.value.max - this.min) / span) * 100;

        this.trackFill.style.left = `${Math.max(minPct, 0)}%`;
        this.trackFill.style.right = `${Math.min((100 - maxPct), 100)}%`;

        // Keep whichever thumb is at the top end of the range grabbable when both thumbs land on the same value.
        if (this.value.min === this.value.max) {
            this.minInput.style.zIndex = minPct > 50 ? "3" : "2";
            this.maxInput.style.zIndex = minPct > 50 ? "2" : "3";
        } else {
            this.minInput.style.zIndex = "2";
            this.maxInput.style.zIndex = "2";
        }

        const sameValueContent = `${this.value.min} ★`;
        const normalContent =  `${this.value.min} ★ <———> ${this.value.max} ★`;
        this.labelEl.textContent = this.value.min === this.value.max ? sameValueContent : normalContent;

        if (fireChange && this.onChange) {
        this.onChange(this.getValue());
        }
    }
}