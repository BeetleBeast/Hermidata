// Why this file exists, and why it is a plain script in public/:
//
// The theme must be set before the browser first paints, otherwise a page opened
// in light mode flashes dark. The usual places can't do that:
//   - The page's module scripts (scripts/**/main.ts) are deferred until the HTML
//     is parsed, and the saved setting lives in IndexedDB, which is async.
//   - Inline <script> is blocked by the Manifest V3 content security policy.
//   - Vite only bundles type="module" scripts, so a classic blocking script has to
//     be copied into dist unchanged, which is what public/ does.
//
// So this reads a cached copy of the theme from localStorage (synchronous) and sets
// data-theme on <html>. Theme.ts (initTheme/applyLightMode) later applies the real
// saved setting and refreshes this cache. Keep the key in sync with Theme.ts.
try {
    if (localStorage.getItem("hermidataTheme") === "light") {
        document.documentElement.dataset.theme = "light";
    }
} catch {
    // Storage can be unavailable; initTheme still applies the saved setting.
}
