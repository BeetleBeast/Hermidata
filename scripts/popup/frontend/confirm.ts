import type { HermidataModel } from "../../shared/utils/HermidataSelector";
import { getElement, setElement } from "../../shared/utils/Selection";

/**
 *  Create a clear confirmation message for user
 */
export async function confirmMigrationPrompt(newer: HermidataModel, older: HermidataModel, options: { message?: string; } = {}) {
    try {
        const msg = options.message || 
            `
            Same title detected with different types.
    
            Title: ${newer.title}
    
            • Old type: ${older.novelType}
            • New type: ${newer.novelType}
    
            Chapters:
            • Old: ${older.GetChapter() || "?"}
            • New: ${newer.GetChapter() || "?"}
    
            Notes:
            • Old: ${older.meta?.notes || "(none)"}
            • New: ${newer.meta?.notes || "(none)"}
    
            → Keep the newer type (“${newer.novelType}”) and merge?
        `;
        return await customConfirm(msg);
    } catch (error: any) {
        console.warn("Prompt blocked; auto-selecting newest entry:", error.message);
        return false;
    }
}

export function deactivateOther(execptionElement: HTMLElement | null = null) {
    // deactivate links in classic
    document.querySelectorAll<HTMLButtonElement>(".HDClassic").forEach(a => {
        a.style.pointerEvents = 'none';
    });
    // deactivate links in HDRSS
    document.querySelectorAll<HTMLButtonElement>(".HDRSS").forEach(a => {
        a.style.pointerEvents = 'none';
    });
    // deactivate links in classic & HDRSS
    const hdClassic = document.querySelector<HTMLDivElement>(".HDClassic");
    const hdrss = document.querySelector<HTMLDivElement>(".HDRSS");
    if (hdClassic && hdrss) {
        hdClassic.style.pointerEvents = 'none';
        hdrss.style.pointerEvents = 'none';
    }

    const classicCurrentActive = document.querySelector(`#${'HDClassicBtn'}.${'active'}`);
    setElement(".HDRSS", el => el.style.opacity = String(classicCurrentActive ? 0 : 0.2));
    setElement(".HDClassic", el => el.style.opacity = String(classicCurrentActive ? 0.2 : 0));
    toggleBookmarkPopups(false, execptionElement);
}
export function toggleBookmarkPopups(toggleOn: boolean, execptionElement: HTMLElement | null = null) {
    const bookmarkMenuContainer = getElement<HTMLDivElement>('.bookmarkMenuContainer');
    const bookmarkMenuManagerContainer = getElement<HTMLDivElement>('.bookmarkMenuManagerContainer');
    const AddNewBookmarkContainer = getElement<HTMLDivElement>('.AddNewBookmark');

    if (bookmarkMenuContainer && bookmarkMenuContainer !== execptionElement) {
        bookmarkMenuContainer.style.opacity = toggleOn ? '1' : '0.2';
        bookmarkMenuContainer.style.pointerEvents = toggleOn ? 'auto' : 'none';
    }
    if (bookmarkMenuManagerContainer && bookmarkMenuManagerContainer !== execptionElement) {
        bookmarkMenuManagerContainer.style.opacity = toggleOn ? '1' : '0.2';
        bookmarkMenuManagerContainer.style.pointerEvents = toggleOn ? 'auto' : 'none';
    }
    if (AddNewBookmarkContainer && AddNewBookmarkContainer !== execptionElement) {
        AddNewBookmarkContainer.style.opacity = toggleOn ? '1' : '0.2';
        AddNewBookmarkContainer.style.pointerEvents = toggleOn ? 'auto' : 'none';
    }
}
export function activateOther(execptionElement: HTMLElement | null = null) {
    const classicCurrentActive = document.querySelector(`#${'HDClassicBtn'}.${'active'}`);
    // de/activate links in classic depending on current active
    document.querySelectorAll<HTMLButtonElement>(".HDClassic").forEach(a => {
        a.style.pointerEvents = classicCurrentActive ? 'auto' : 'none';
    });
    // de/activate links in HDRSS depending on current active
    document.querySelectorAll<HTMLButtonElement>(".HDRSS").forEach(a => {
        a.style.pointerEvents =  classicCurrentActive ? 'none' : 'auto';
    });
    setElement(".HDRSS", el => el.style.opacity = String(classicCurrentActive ? 0 : 1));
    setElement(".HDClassic", el => el.style.opacity = String(classicCurrentActive ? 1 : 0));
    toggleBookmarkPopups(true, execptionElement);
}

/** custom prompt */
export function customPrompt(msg: string, options: Partial<Omit<DialogOptionsInput<string | false>, 'onResolve' | 'message'>> = {}): Promise<string | false> {
    return createDialog<string | false>({
        ...options,
        message: msg,
        onResolve: (result) => result.accepted ? result.value ?? '' : false
    });
}

export function customConfirm(msg: string, options: Partial<Omit<DialogOptionsInput<boolean>, 'onResolve' | 'message'>> = {}): Promise<boolean> {
    const defaultEl = getDefaultElements();
    const elOptions = {
        container: options.elements?.container ?? defaultEl.container,
        label: options.elements?.label ?? defaultEl.label,
        btn1: options.elements?.btn1 ?? defaultEl.btn1,
        btn2: options.elements?.btn2 ?? defaultEl.btn2,
        input: null
    }
    return createDialog<boolean>({
        ...options,
        elements: elOptions,
        message: msg,
        onResolve: (result) => result.accepted
    });;
}


// -----
interface DialogElements {
    container: HTMLDivElement | null,
    label: HTMLDivElement | null,
    btn1: HTMLDivElement | null,
    btn2: HTMLDivElement | null,
    input?: HTMLInputElement | null
}

type DialogResult = { accepted: true; value?: string } | { accepted: false };

interface DialogOptions<T> {
    elements: DialogElements;
    accept: string;
    reject: string;
    message: string;
    defaultValue?: string;
    contentDirection?: 'vertical' | 'horizontal';
    onResolve: (accepted: DialogResult) => T;
}

function activateSetup(exceptionElement: HTMLElement | null, elements: DialogElements, contentDirection: 'vertical' | 'horizontal' = 'vertical'): boolean {
    deactivateOther(exceptionElement);
    
    const { container, label, btn1, btn2, input } = elements;
    
    if (!container || !label || !btn1 || !btn2) return false;

    
    container.style.display = 'flex';
    container.style.flexDirection = contentDirection === 'vertical' ? 'column' : 'row';
    container.style.gap = contentDirection === 'vertical' ? '30px' : '10px';
    label.style.display = 'block';
    btn1.style.display = 'block';
    btn2.style.display = 'block';
    if (input) input.style.display = 'flex';
    return true
}
function deactivateSetup(exceptionElement: HTMLElement | null = null, elements: DialogElements): boolean {
    activateOther(exceptionElement);

    const { container, label, btn1, btn2, input } = elements;
    if (!container || !label || !btn1 || !btn2) return false;

    container.style.display = 'none';
    label.style.display = 'none';
    btn1.style.display = 'none';
    btn2.style.display = 'none';
    if (input) input.style.display = 'none';
    return true
}
function getDefaultElements(): DialogElements {
    return {
        container: getElement<HTMLDivElement>('.promptSection'),
        label: getElement<HTMLDivElement>('.genericLabel'),
        btn1: getElement<HTMLDivElement>('.genericButton1'),
        btn2: getElement<HTMLDivElement>('.genericButton2'),
        input: getElement<HTMLInputElement>('.genericInput'),
    };
}

type DialogOptionsInput<T> = Partial<Omit<DialogOptions<T>, 'onResolve'>> & Pick<DialogOptions<T>, 'onResolve'>


export function createDialog<T>(opts: DialogOptionsInput<T>): Promise<T> {

    const elements: DialogElements = { ...getDefaultElements(), ...opts.elements };
    const { container, label, btn1, btn2, input } = elements;
    const { onResolve } = opts;

    if (!container || !label || !btn1 || !btn2) return Promise.resolve(onResolve({ accepted: false}));

    return new Promise<T>((resolve) => {

        const cleanup = () => {
            deactivateSetup(null, elements);
            btn1.removeEventListener('click', onYes);
            btn2.removeEventListener('click', onNo);
        };

        const onYes = () => {
            cleanup();
            resolve(onResolve({ accepted: true, value: input?.value ?? '' }));
        };

        const onNo = () => {
            cleanup();
            resolve(onResolve({ accepted: false}));
        };

        btn1.innerHTML = opts.accept ?? "Save";
        btn2.innerHTML = opts.reject ?? "Cancel";

        activateSetup(null, elements);

        label.innerHTML = opts.message ?? '';
        if (input) input.value = opts.defaultValue ?? '';

        btn1.addEventListener('click', onYes);
        btn2.addEventListener('click', onNo);
    });
}