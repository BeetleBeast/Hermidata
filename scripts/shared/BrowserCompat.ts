// Firefox uses `browser` (Promise-based), Chrome uses `chrome` (callback-based)
// In MV3 Chrome also supports promises, but not everywhere yet

// Tell TS these globals may exist
export declare const browser: typeof chrome | undefined

export const ext: typeof chrome = ( browser ?? chrome )