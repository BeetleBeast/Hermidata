import type { TagPickerOptions } from "../../shared/types";

/**
 * Selected tags as removable chips, plus an "Add" button that opens a filterable picker.
 * Removing a chip is reported at once; picks made in the open picker are reported together when it closes,
 * so one round of picking is one change ( and one undo ).
 */
export class TagPicker {

    private selected: string[] = [];

    private pickedBeforeOpen: string[] | null = null;

    private readonly chips = document.createElement('div');
    private readonly panel = document.createElement('div');
    private readonly filter = document.createElement('input');
    private readonly list = document.createElement('div');

    private readonly container: HTMLElement;
    private readonly options: TagPickerOptions;

    constructor(container: HTMLElement, options: TagPickerOptions) {
        this.container = container;
        this.options = options;
        this.chips.className = 'ov-chip-list';
        this.chips.setAttribute('role', 'list');
        this.buildPanel();
        this.container.append(this.chips, this.panel);

        document.addEventListener('pointerdown', (event) => {
            if (this.isOpen() && !this.container.contains(event.target as Node)) this.close(false);
        });
        this.container.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.isOpen()) {
                event.preventDefault();
                this.close(true);
            }
        });
    }

    public render(selected: string[]): void {
        this.selected = [...selected];
        this.renderChips();
        if (this.isOpen()) this.renderOptions();
    }

    private isOpen(): boolean {
        return !this.panel.hidden;
    }

    private buildPanel(): void {
        this.panel.className = 'ov-picker';
        this.panel.hidden = true;
        this.panel.setAttribute('role', 'group');
        this.panel.setAttribute('aria-label', `Pick ${this.options.itemName}s`);

        this.filter.type = 'search';
        this.filter.className = 'ov-picker-filter';
        this.filter.placeholder = `Find or create a ${this.options.itemName}…`;
        this.filter.setAttribute('aria-label', `Find ${this.options.itemName}`);
        this.filter.autocomplete = 'off';
        this.filter.addEventListener('input', () => this.renderOptions());
        this.filter.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            const query = this.filter.value.trim();
            if (!query) return;
            const match = this.options.available().find(tag => tag.toLowerCase() === query.toLowerCase());
            this.toggle(match ?? query);
            this.filter.value = '';
            this.renderOptions();
        });

        this.list.className = 'ov-picker-list';

        const done = document.createElement('button');
        done.type = 'button';
        done.className = 'ov-btn ov-btn-small ov-picker-done';
        done.textContent = 'Done';
        done.addEventListener('click', () => this.close(true));

        this.panel.append(this.filter, this.list, done);
    }

    private renderChips(): void {
        const chips = this.selected.map(tag => {
            const chip = document.createElement('span');
            chip.className = 'ov-chip ov-chip-tag';
            chip.setAttribute('role', 'listitem');
            chip.textContent = tag;

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'ov-chip-remove';
            remove.setAttribute('aria-label', `Remove ${this.options.itemName} ${tag}`);
            remove.textContent = '×';
            remove.addEventListener('click', () => {
                this.toggle(tag);
                if (!this.isOpen()) this.report();
                this.addButton()?.focus();
            });
            chip.append(remove);
            return chip;
        });

        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'ov-chip-add';
        add.innerHTML = '<svg class="ov-icon" aria-hidden="true"><use href="#i-plus"/></svg>';
        add.append(document.createTextNode(this.selected.length ? 'Edit' : 'Add'));
        add.setAttribute('aria-label', `Choose ${this.options.itemName}s`);
        add.setAttribute('aria-expanded', String(this.isOpen()));
        add.addEventListener('click', () => this.isOpen() ? this.close(true) : this.open());

        this.chips.replaceChildren(...chips, add);
    }

    private renderOptions(): void {
        // the list is rebuilt on every pick: keep the keyboard on the option that was just toggled
        const focusedTag = this.list.contains(document.activeElement) ? document.activeElement?.textContent : null;
        const query = this.filter.value.trim().toLowerCase();
        const options = [...new Set([...this.selected, ...this.options.available()])]
            .filter(tag => tag.toLowerCase().includes(query))
            .sort((a, b) => a.localeCompare(b));

        const buttons = options.map(tag => {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'ov-picker-option';
            option.textContent = tag;
            option.setAttribute('aria-pressed', String(this.selected.includes(tag)));
            option.addEventListener('click', () => this.toggle(tag));
            return option;
        });
        if (buttons.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'ov-picker-empty';
            empty.textContent = query ? `Press Enter to add "${this.filter.value.trim()}"` : `No ${this.options.itemName}s yet`;
            this.list.replaceChildren(empty);
            return;
        }
        this.list.replaceChildren(...buttons);
        if (focusedTag) buttons.find(button => button.textContent === focusedTag)?.focus();
    }

    private toggle(tag: string): void {
        this.selected = this.selected.includes(tag) ? this.selected.filter(item => item !== tag) : [...this.selected, tag];
        this.renderChips();
        if (this.isOpen()) this.renderOptions();
    }

    private open(): void {
        this.pickedBeforeOpen = [...this.selected];
        this.panel.hidden = false;
        this.filter.value = '';
        this.renderChips();
        this.renderOptions();
        this.filter.focus();
    }

    private close(returnFocus: boolean): void {
        this.panel.hidden = true;
        this.renderChips();
        const before = this.pickedBeforeOpen;
        this.pickedBeforeOpen = null;
        const changed = !before || before.length !== this.selected.length || before.some(tag => !this.selected.includes(tag));
        if (changed) this.report();
        if (returnFocus) this.addButton()?.focus();
    }

    private report(): void {
        this.options.onChange([...this.selected]);
    }

    private addButton(): HTMLButtonElement | null {
        return this.chips.querySelector<HTMLButtonElement>('.ov-chip-add');
    }
}
