export function getElement<T extends HTMLElement>(selector: string, parent: Document | HTMLElement = document): T | null {
    const el = parent.querySelector<T>(selector);
    if (!el) {
        // console.warn(`Element not found: ${selector}`);
        return null;
    }
    return el;
}

export function setElement<T extends HTMLElement>( selector: string, callback: (el: T) => void, parent: Document | HTMLElement = document ): void {
    const el = getElement<T>(selector, parent);
    if (el) callback(el);
}