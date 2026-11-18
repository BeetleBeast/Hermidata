import type { Hermidata, ScoredCandidate } from "../../shared/types/index";
import { HermidataModel } from "../../shared/utils/HermidataSelector";
import { getElement } from "../../shared/utils/Selection";

function getHost(url: string): string {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch { return ''; }
}

function formatDate(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Site · Ch. 12 · Updated 3 Jun 2026 */
function describeCandidate(item: HermidataModel): string {
    const updated = formatDate(item.meta.updated);
    return [
        getHost(item.GetUrl()) || item.source,
        `Ch. ${item.GetLatestChapter() || item.GetChapter() || '?'}`,
        updated && `Updated ${updated}`,
    ].filter(Boolean).join(' · ');
}

function createOption(candidate: ScoredCandidate, onPick: (item: Hermidata) => void): HTMLLIElement {
    const item = new HermidataModel(candidate.item);
    const li = document.createElement('li');

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'itemChooser-option';

    const heading = document.createElement('span');
    heading.className = 'itemChooser-option-heading';

    const title = document.createElement('span');
    title.className = 'itemChooser-option-title';
    title.textContent = item.title;

    const type = document.createElement('span');
    type.className = 'itemChooser-option-type';
    type.textContent = item.novelType;

    const meta = document.createElement('span');
    meta.className = 'itemChooser-option-meta';
    meta.textContent = describeCandidate(item);

    heading.append(title, type);
    button.append(heading, meta);
    button.addEventListener('click', () => onPick(candidate.item));
    li.append(button);
    return li;
}

/**
 * Asks which saved item the current page belongs to when the match is ambiguous.
 * Resolves with the picked item, or null for "None of these" / Escape.
 */
export function chooseItem(candidates: ScoredCandidate[]): Promise<Hermidata | null> {
    const dialog = getElement<HTMLDialogElement>('#itemChooser');
    const list = getElement<HTMLUListElement>('.itemChooser-list');
    const none = getElement<HTMLButtonElement>('#itemChooser-none');
    if (!dialog || !list || !none || candidates.length === 0) return Promise.resolve(null);

    return new Promise(resolve => {
        const stopShortcuts = (e: KeyboardEvent) => e.stopPropagation(); // the popup's shortcuts ( Escape closes the popup, save ) must not fire behind the dialog
        const finish = (item: Hermidata | null) => {
            dialog.removeEventListener('keydown', stopShortcuts);
            dialog.removeEventListener('cancel', onCancel);
            none.removeEventListener('click', onNone);
            dialog.close();
            resolve(item);
        };
        const onCancel = (e: Event) => { e.preventDefault(); finish(null); };
        const onNone = () => finish(null);

        list.replaceChildren(...candidates.map(candidate => createOption(candidate, finish)));
        dialog.addEventListener('keydown', stopShortcuts);
        dialog.addEventListener('cancel', onCancel);
        none.addEventListener('click', onNone);

        dialog.showModal();
        list.querySelector<HTMLButtonElement>('.itemChooser-option')?.focus();
    });
}
