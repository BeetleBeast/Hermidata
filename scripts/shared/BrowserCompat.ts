// Firefox uses `browser` (Promise-based), Chrome uses `chrome` (callback-based)
// In MV3 Chrome also supports promises, but not everywhere yet

// Tell TS these globals may exist
declare const browser: typeof chrome | undefined

export const ext: typeof chrome = ( typeof browser === 'undefined' ? chrome : browser )