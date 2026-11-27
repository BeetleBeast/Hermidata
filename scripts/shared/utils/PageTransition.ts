/**
 * Same-document page transitions, built on the View Transition API.
 * ( Cross-document ones need no code: the pages opt in with `@view-transition`, see `general/transitions.css`, and `openLink` navigates in the page. )
 * Where it is missing ( older browsers ) or motion is reduced, everything still works, just without the animation.
 */

/** Whether the user asked the system to cut down on motion */
function prefersReducedMotion(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Apply a DOM change inside a view transition ( same document ).
 * The returned promise resolves once the change has been applied, not once the animation is over,
 * so callers can keep working with the new DOM straight away.
 */
export function withViewTransition(update: () => void): Promise<void> {
    if (typeof document === 'undefined' || typeof document.startViewTransition !== 'function' || prefersReducedMotion()) {
        update();
        return Promise.resolve();
    }

    const transition = document.startViewTransition(update);
    // a skipped transition rejects these ( e.g. a newer one started ), the change itself still ran
    transition.ready.catch(() => {});
    transition.finished.catch(() => {});
    return transition.updateCallbackDone;
}
