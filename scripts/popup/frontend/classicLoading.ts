import { setElement } from "../../shared/utils/Selection";

/**
 * Marks the classic form as still loading ( or done ): its fields show a shimmer instead of empty or stale values
 * and cannot be used meanwhile. Styled by `[data-loading]` in classic.css, so it also clears again when loading fails.
 */
export function setClassicLoading(isLoading: boolean): void {
    setElement<HTMLElement>('.HDClassic .main', main => main.setAttribute('aria-busy', String(isLoading)));
    document.querySelectorAll<HTMLElement>('.HDClassic .autoInput').forEach(field => {
        field.dataset.loading = String(isLoading);
        field.toggleAttribute('inert', isLoading);
    });
}
