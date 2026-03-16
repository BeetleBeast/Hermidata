export function getElement<T extends HTMLDivElement>(selector: string, parent: Document | HTMLDivElement = document): T {
    const el = parent.querySelector(selector);
    if (!el) {
        throw new Error(`Element not found: ${selector}`);
    }
    return el as T;
}