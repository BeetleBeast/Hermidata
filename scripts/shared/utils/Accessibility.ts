const wired = new WeakSet<Element>();

/** Spoken state of a tri-state filter row, keyed by its data-state ( 0 off, 1 include, 2 exclude ) */
const TRI_STATE_LABEL: Record<string, string> = { '0': 'not selected', '1': 'included', '2': 'excluded' };

type InteractiveRole = 'button' | 'checkbox' | 'radio' | 'link';

/**
 * Makes a non-button element (div, span, svg) usable as an interactive control: announced with the
 * given role, focusable and activated by Enter / Space, which fire its existing click handlers.
 */
export function makeButtonLike(element: HTMLElement | SVGElement, label: string, role: InteractiveRole = 'button'): void {
    element.setAttribute('role', role);
    element.setAttribute('tabindex', '0');
    element.setAttribute('aria-label', label);
    if (wired.has(element)) return; // the keyboard handler is added once, even if the element is made focusable again
    wired.add(element);
    element.addEventListener('keydown', (e) => {
        const event = e as KeyboardEvent;
        if (event.target !== element) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
}

/**
 * A filter row ( visual checkbox + label ) is one checkbox for assistive tech: the 3 states are announced
 * ( not selected / included / excluded ) and the visual parts are skipped. The state is read from the
 * data-state of `checkbox`, so it follows every place that changes it.
 */
export function makeTriStateOption(row: HTMLElement, checkbox: HTMLElement, name: string): void {
    makeButtonLike(row, name, 'checkbox');
    for (const part of row.children) part.setAttribute('aria-hidden', 'true');

    const sync = () => {
        const state = checkbox.dataset.state ?? '0';
        row.setAttribute('aria-checked', state === '1' ? 'true' : state === '2' ? 'mixed' : 'false');
        row.setAttribute('aria-label', `${name}, ${TRI_STATE_LABEL[state] ?? TRI_STATE_LABEL['0']}`);
    };
    sync();
    new MutationObserver(sync).observe(checkbox, { attributes: true, attributeFilter: ['data-state'] });
}

let comboboxCount = 0;

/** A text input + the box that fills with suggestions announce as a combobox + listbox ( expanded while it has options ) */
export function markAsCombobox(input: HTMLInputElement | null, listbox: HTMLElement | null): void {
    if (!input || !listbox) return;
    if (!listbox.id) listbox.id = `suggestions-${++comboboxCount}`;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', listbox.id);
    listbox.setAttribute('role', 'listbox');
    new MutationObserver(() => {
        const hasOptions = listbox.querySelector('[role="option"]') !== null;
        input.setAttribute('aria-expanded', String(hasOptions));
        if (!hasOptions) input.removeAttribute('aria-activedescendant');
    }).observe(listbox, { childList: true });
}

/** One suggestion in a listbox; the id lets the input point at it while the arrow keys move the highlight */
export function markAsOption(option: HTMLElement, listbox: HTMLElement): void {
    option.setAttribute('role', 'option');
    option.id = `${listbox.id || 'suggestions'}-option-${listbox.childElementCount}`;
}

/** Announces which suggestion is highlighted */
export function setActiveOption(input: HTMLInputElement | null, options: NodeListOf<HTMLElement>, activeIndex: number): void {
    options.forEach((option, index) => option.setAttribute('aria-selected', String(index === activeIndex)));
    const activeId = options[activeIndex]?.id;
    if (activeId) input?.setAttribute('aria-activedescendant', activeId);
}
