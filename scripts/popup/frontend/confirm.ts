import type { Hermidata } from "../../shared/types/type";
import { getElement, setElement } from "../../utils/Selection";

/**
 *  Create a clear confirmation message for user
 */
export async function confirmMigrationPrompt(newer: Hermidata, older: Hermidata, options: { message?: string; } = {}) {
    try {
        const msg = options.message || 
            `
            Same title detected with different types.
    
            Title: ${newer.title}
    
            • Old type: ${older.type}
            • New type: ${newer.type}
    
            Chapters:
            • Old: ${older.chapter?.current || "?"}
            • New: ${newer.chapter?.current || "?"}
    
            Notes:
            • Old: ${older.meta?.notes || "(none)"}
            • New: ${newer.meta?.notes || "(none)"}
    
            → Keep the newer type (“${newer.type}”) and merge?
        `;
        return await customConfirm(msg);
    } catch (error: any) {
        console.warn("Prompt blocked; auto-selecting newest entry:", error.message);
        return false;
    }
}

function deactivateother() {
    // deactivate links in classic
    document.querySelectorAll<HTMLButtonElement>(".HDClassic").forEach(a => {
        a.style.pointerEvents = 'none';
    });
    // deactivate links in HDRSS
    document.querySelectorAll<HTMLButtonElement>(".HDRSS").forEach(a => {
        a.style.pointerEvents = 'none';
    });
    const classicCurrentActive = document.querySelector(`#${'HDClassicBtn'}.${'active'}`);
    setElement(".HDRSS", el => el.style.opacity = String(classicCurrentActive ? 0 : 0.2));
    setElement(".HDClassic", el => el.style.opacity = String(classicCurrentActive ? 0.2 : 0));
}
function activateother() {
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
}


export function customPrompt(msg: string, defaultInput: string): Promise<string | false> {
    return new Promise<string | false>((resolve) => {
        const container = getElement('.promptSection');
        const input = getElement<HTMLInputElement>('.genericInput');
        const label = getElement('.genericLabel');
        const btn1 = getElement('.genericButton1');
        const btn2 = getElement('.genericButton2');

        if (!container || !input || !label || !btn1 || !btn2) return resolve(false);
        const activateConfirmSetup = () => {
            deactivateother();
            container.style.display = 'flex';
            container.style.height = `${document.body.offsetHeight / 2}px`;
            label.style.display = 'block';
            input.style.display = 'block';
            btn1.style.display = 'block';
            btn2.style.display = 'block';
        }
        const deactivateConfirmSetup = () => {
            activateother();
            container.style.display = 'none';
            label.style.display = 'none';
            input.style.display = 'none';
            btn1.style.display = 'none';
            btn2.style.display = 'none';
        }
        const cleanup = () => {
            deactivateConfirmSetup();
            btn1.removeEventListener('click', onYes);
            btn2.removeEventListener('click', onNo);
        };
        const onYes = () => {
            cleanup();
            resolve(input.value);
        };

        const onNo = () => {
            cleanup();
            resolve(false);
        };

        activateConfirmSetup();
        label.textContent = msg;
        input.value = defaultInput;

        btn1.addEventListener('click', onYes);
        btn2.addEventListener('click', onNo);
    });
}
export function customConfirm(msg: string) {
    return new Promise((resolve) => {
        const container = getElement('.promptSection');
        const label = getElement('.genericLabel');
        const btn1 = getElement('.genericButton1');
        const btn2 = getElement('.genericButton2');

        if (!container || !label || !btn1 || !btn2) return resolve(false);

        const activateConfirmSetup = () => {
            deactivateother();
            container.style.display = 'flex';
            container.style.height = `${document.body.offsetHeight / 2}px`;
            label.style.display = 'block';
            btn1.style.display = 'block';
            btn2.style.display = 'block';
        }
        const deactivateConfirmSetup = () => {
            activateother();
            container.style.display = 'none';
            label.style.display = 'none';
            btn1.style.display = 'none';
            btn2.style.display = 'none';
        }
        const onYes = () => {
            deactivateConfirmSetup();
            btn1.removeEventListener('click', onYes);
            btn2.removeEventListener('click', onNo);
            resolve(true);
        };

        const onNo = () => {
            deactivateConfirmSetup();
            btn1.removeEventListener('click', onYes);
            btn2.removeEventListener('click', onNo);
            resolve(false);
        };

        activateConfirmSetup();
        label.textContent = msg;

        btn1.addEventListener('click', onYes);
        btn2.addEventListener('click', onNo);
    });
}