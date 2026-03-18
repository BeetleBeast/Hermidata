export function getElement<T extends HTMLElement>(selector: string, parent: Document | HTMLElement = document): T {
    const el = parent.querySelector(selector);
    if (!el) {
        throw new Error(`Element not found: ${selector}`);
    }
    return el as T;
}