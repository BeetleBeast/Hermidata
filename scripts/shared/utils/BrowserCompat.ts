// Firefox uses `browser` (Promise-based), Chrome uses `chrome` (callback-based)
// In MV3 Chrome also supports promises, but not everywhere yet

// Tell TS these globals may exist
/// <reference types="firefox-webext-browser" />
//declare const browser: typeof chrome | typeof globalThis.browser

const g = globalThis as unknown as {
    browser?: typeof chrome;
    chrome?: typeof chrome;
};

export const ext: typeof chrome = (g.browser ?? g.chrome)!;

//export const ext: typeof chrome = (browser as typeof chrome) ?? chrome;

