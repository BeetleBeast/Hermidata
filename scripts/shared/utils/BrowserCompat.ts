// Firefox uses `browser` (Promise-based), Chrome uses `chrome` (callback-based)
// In MV3 Chrome also supports promises, but not everywhere yet

// Read the globals off globalThis: naming a bare `browser` throws a ReferenceError on Chrome, where it does not exist
const g = globalThis as unknown as {
    browser?: typeof chrome;
    chrome?: typeof chrome;
};

/** Firefox's Promise-based `browser` namespace, undefined where it does not exist (Chrome) */
export const browserApi: typeof chrome | undefined = g.browser;

export const ext: typeof chrome = (g.browser ?? g.chrome)!;
