
export interface StarRange {
    min: number;
    max: number;
}

export class StarRangeFilter {
    private root: HTMLElement;
    private min: number;
    private max: number;
    private step: number;
    private onChange?: (range: StarRange) => void;

    private value: StarRange;

    private minInput!: HTMLInputElement;
    private maxInput!: HTMLInputElement;
    private trackFill!: HTMLDivElement;
    private labelEl!: HTMLDivElement;

    constructor(containerRef: HTMLElement | string, startValue: StarRange, onChange?: (range: { min: number; max: number }) => void) {
        
        const container = typeof containerRef === "string" ? document.querySelector<HTMLElement>(containerRef) : containerRef;

        if (!container) throw new Error("StarRangeFilter: container not found");

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
    public getValue(): StarRange {
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
        this.root.classList.add("srf-root");

        this.labelEl = document.createElement("div");
        this.labelEl.className = "srf-label";

        const track = document.createElement("div");
        track.className = "srf-track";
    
        const trackBg = document.createElement("div");
        trackBg.className = "srf-track-bg";
    
        this.trackFill = document.createElement("div");
        this.trackFill.className = "srf-track-fill";
    
        this.minInput = this.makeRangeInput("srf-thumb srf-thumb-min");
        this.maxInput = this.makeRangeInput("srf-thumb srf-thumb-max");
        this.minInput.value = String(this.value.min);
        this.maxInput.value = String(this.value.max);
    
        track.appendChild(trackBg);
        track.appendChild(this.trackFill);
        track.appendChild(this.minInput);
        track.appendChild(this.maxInput);
    
        const ticks = document.createElement("div");
        ticks.className = "srf-ticks";
        for (let v = this.min; v <= this.max; v += this.step) {
            const tick = document.createElement("span");
            tick.textContent = String(v);

            if (v >= this.value.min && v <= this.value.max) tick.classList.add('active-srf-stick');

            ticks.appendChild(tick);
        }
    
        this.root.appendChild(this.labelEl);
        this.root.appendChild(track);
        this.root.appendChild(ticks);
    
        this.minInput.addEventListener("input", () => this.handleMinInput());
        this.maxInput.addEventListener("input", () => this.handleMaxInput());

    }

    private makeRangeInput(className: string): HTMLInputElement {
        const input = document.createElement("input");
        input.type = "range";
        input.className = className;
        input.min = String(this.min);
        input.max = String(this.max);
        input.step = String(this.step);
        return input;
    }

    private handleMinInput(): void {
        let minVal = Number(this.minInput.value);
        const maxVal = Number(this.maxInput.value);
        if (minVal > maxVal) {
            minVal = maxVal;
            this.minInput.value = String(minVal);
        }
        this.value.min = minVal;
        this.value.max = maxVal;
        this.update(true);
    }

    private handleMaxInput(): void {
        const minVal = Number(this.minInput.value);
        let maxVal = Number(this.maxInput.value);
        if (maxVal < minVal) {
            maxVal = minVal;
            this.maxInput.value = String(maxVal);
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
            // TODO: later make it so that if one grab a thumb and move to the position of the other, it takes it with it until the end
            this.minInput.style.zIndex = minPct > 50 ? "3" : "2";
            this.maxInput.style.zIndex = minPct > 50 ? "2" : "3";
        } else {
            this.minInput.style.zIndex = "2";
            this.maxInput.style.zIndex = "2";
        }

        const sameValueContent = `${this.value.min} ★`;
        const normalContent =  `${this.value.min} ★ - ${this.value.max} ★`;
        this.labelEl.textContent = this.value.min === this.value.max ? sameValueContent : normalContent;

        if (fireChange && this.onChange) {
        this.onChange(this.getValue());
        }
    }
}