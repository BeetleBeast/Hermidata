import type { ChipListOptions } from "../../shared/types";

/**
 * An editable list of short values ( alternative titles, sources ): each value is a chip with a remove button,
 * and "Add" turns into a text field in place. Every add or remove is reported through `onChange`.
 */
export class ChipList {

    private values: string[] = [];

    private readonly container: HTMLElement;
    private readonly options: ChipListOptions;

    constructor(container: HTMLElement, options: ChipListOptions) {
        this.container = container;
        this.options = options;
        this.container.setAttribute('role', 'list');
    }

    public render(values: string[]): void {
        this.values = [...values];
        this.container.replaceChildren(...this.values.map(value => this.buildChip(value)), this.buildAddButton());
    }

    private buildChip(value: string): HTMLElement {
        const chip = document.createElement('span');
        chip.className = 'ov-chip';
        chip.setAttribute('role', 'listitem');

        const text = document.createElement('span');
        text.className = 'ov-chip-text';
        text.textContent = value;
        text.title = value;
        chip.append(text);

        if (this.options.isLocked?.(value)) {
            chip.dataset.locked = 'true';
            return chip;
        }
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'ov-chip-remove';
        remove.setAttribute('aria-label', `Remove ${this.options.itemName} ${value}`);
        remove.textContent = '×';
        remove.addEventListener('click', () => this.commit(this.values.filter(item => item !== value)));
        chip.append(remove);
        return chip;
    }

    private buildAddButton(): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ov-chip-add';
        button.innerHTML = '<svg class="ov-icon" aria-hidden="true"><use href="#i-plus"/></svg>';
        button.append(document.createTextNode('Add'));
        button.setAttribute('aria-label', `Add ${this.options.itemName}`);
        button.addEventListener('click', () => button.replaceWith(this.buildAddInput()));
        return button;
    }

    private buildAddInput(): HTMLInputElement {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'ov-chip-input';
        input.autocomplete = 'off';
        input.setAttribute('aria-label', `New ${this.options.itemName}`);

        let finished = false;
        // leaving the field by tabbing or clicking elsewhere keeps the value but must not pull focus back
        const finish = (keep: boolean, refocus = true) => {
            if (finished) return;
            finished = true;
            const value = input.value.trim();
            if (keep && value && !this.values.includes(value)) this.commit([...this.values, value], refocus);
            else { this.render(this.values); if (refocus) this.focusAddButton(); }
        };
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') { event.preventDefault(); finish(true); }
            if (event.key === 'Escape') { event.preventDefault(); finish(false); }
        });
        input.addEventListener('blur', () => finish(true, false));
        queueMicrotask(() => input.focus());
        return input;
    }

    /** Show and report the new values; focus goes back to Add so the keyboard user keeps their place */
    private commit(values: string[], refocus = true): void {
        this.render(values);
        this.options.onChange(values);
        if (refocus) this.focusAddButton();
    }

    private focusAddButton(): void {
        this.container.querySelector<HTMLButtonElement>('.ov-chip-add')?.focus();
    }
}
