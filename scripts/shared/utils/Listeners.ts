const scopes = new WeakMap<object, Map<string, AbortController>>();

/**
 * A fresh signal for the listeners one setup step adds to long-lived nodes. Asking again for the same owner
 * and name aborts the previous signal, which removes every listener added with it, so a setup that runs again
 * ( a re-render ) replaces its listeners instead of stacking a second copy on top.
 */
export function renewListeners(owner: object, name: string): AbortSignal {
    let named = scopes.get(owner);
    if (!named) scopes.set(owner, named = new Map());
    named.get(name)?.abort();
    const controller = new AbortController();
    named.set(name, controller);
    return controller.signal;
}
