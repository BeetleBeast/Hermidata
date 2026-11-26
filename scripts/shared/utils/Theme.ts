import { dbAccess } from "../db/Storage";
import { ext } from "./BrowserCompat";

const THEME_CACHE_KEY = "hermidataTheme";

/** Applies the theme to this page and caches it for theme-init.js on the next load. */
export function applyLightMode(enabled: boolean): void {
    if (enabled) document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;

    try {
        localStorage.setItem(THEME_CACHE_KEY, enabled ? "light" : "dark");
    } catch {
        // The cache only prevents a flash; the stored setting remains the source of truth.
    }
}

/** Matches the page to the saved setting and follows changes from other pages or devices. */
export async function initTheme(): Promise<void> {
    ext.storage.onChanged.addListener((changes, area) => {
        if ((area !== "sync" && area !== "local") || !changes.Settings) return;   // "local": a device that does not sync
        const newSettings = changes.Settings.newValue as { ExtensionBehaviour?: { EnableLightMode?: boolean } } | undefined;
        applyLightMode(newSettings?.ExtensionBehaviour?.EnableLightMode === true);
    });

    const settings = await new dbAccess().getSettings();
    applyLightMode(settings.ExtensionBehaviour?.EnableLightMode === true);
}
