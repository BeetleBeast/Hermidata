import type { KeyboardShortcutSettings } from "../types";
import { ext } from "./BrowserCompat";

export const DEFAULT_KEYBOARD_SHORTCUTS: KeyboardShortcutSettings = {
    openSettings: "G+S",
    openLibraryPopup: "G+L",
    focusSearch: "Ctrl+K",
    saveCurrentPage: "Ctrl+Enter",
    switchToClassic: "1",
    switchToRSS: "2",
};

export const BROWSER_COMMAND_SHORTCUTS = {
    openHermidata: "_execute_action",
    openRSSMode: "open-rss",
    saveHermidata: "save-hermidata",
    openLibrary: "open-library",
} as const;
export type BrowserCommandAction = keyof typeof BROWSER_COMMAND_SHORTCUTS;

const modifierKeys = new Set(["ctrl", "control", "alt", "shift", "meta"]);

function normalizeKey(key: string): string {
    if (key.length === 1) return key.toLowerCase();
    if (key === "Esc") return "Escape";
    if (key === " ") return "Space";
    return key;
}

export function isModifierKey(key: string): boolean {
    return modifierKeys.has(key.toLowerCase());
}

export function formatKeyboardEventShortcut(event: KeyboardEvent): string | null {
    if (isModifierKey(event.key)) return null;

    const modifiers: string[] = [];
    if (event.ctrlKey) modifiers.push("Ctrl");
    if (event.altKey) modifiers.push("Alt");
    if (event.shiftKey) modifiers.push("Shift");
    if (event.metaKey) modifiers.push("Meta");

    const key = normalizeKey(event.key);
    if (key.length === 1) modifiers.push(key.toUpperCase());
    else modifiers.push(key);
    return modifiers.join("+");
}

export function matchesShortcutKey(event: KeyboardEvent, key: string): boolean {
    return normalizeKey(event.key) === normalizeKey(key)
        && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
}

export function matchesKeyboardShortcut(event: KeyboardEvent, shortcut: string): boolean {
    const parts = shortcut.split("+").map(part => part.trim()).filter(Boolean);
    if (parts.length === 0) return false;

    if (!isModifierKey(parts[0])) return parts.length === 1 && matchesShortcutKey(event, parts[0]);

    const key = parts.at(-1)!;
    const expected = new Set(parts.slice(0, -1).map(part => part.toLowerCase()));
    
    return normalizeKey(event.key) === normalizeKey(key)
        && event.ctrlKey === expected.has("ctrl")
        && event.altKey === expected.has("alt")
        && event.shiftKey === expected.has("shift")
        && event.metaKey === expected.has("meta");
}

export function shortcutsConflict(first: string, second: string): boolean {
    const firstParts = first.split("+").map(part => part.trim().toLowerCase()).filter(Boolean);
    const secondParts = second.split("+").map(part => part.trim().toLowerCase()).filter(Boolean);
    if (firstParts.join("+") === secondParts.join("+")) return true;

    const firstIsSequence = firstParts.length === 2 && !isModifierKey(firstParts[0]);
    const secondIsSequence = secondParts.length === 2 && !isModifierKey(secondParts[0]);
    if (firstIsSequence && secondParts.length === 1) return firstParts[0] === secondParts[0];
    if (secondIsSequence && firstParts.length === 1) return secondParts[0] === firstParts[0];
    return false;
}

export async function getBrowserCommandShortcuts(): Promise<Record<BrowserCommandAction, string>> {
    const commands = await ext.commands.getAll();
    return Object.fromEntries(
        Object.entries(BROWSER_COMMAND_SHORTCUTS).map(([action, commandName]) => [
            action,
            commands.find(command => command.name === commandName)?.shortcut || "Not assigned",
        ])
    ) as Record<BrowserCommandAction, string>;
}

export async function openBrowserShortcutSettings(): Promise<void> {
    const commands = ext.commands as typeof ext.commands & {
        openShortcutSettings?: () => Promise<void>;
    };
    if (commands.openShortcutSettings) {
        await commands.openShortcutSettings();
        return;
    }

    const url = /Edg\//.test(navigator.userAgent)
        ? "edge://extensions/shortcuts"
        : "chrome://extensions/shortcuts";
    await ext.tabs.create({ url });
}
