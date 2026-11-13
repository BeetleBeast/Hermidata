import { describe, expect, it } from "vitest";
import {
    formatKeyboardEventShortcut,
    matchesKeyboardShortcut,
    matchesShortcutKey,
    shortcutsConflict,
} from "../scripts/shared/utils/KeyboardShortcuts";

function keyboardEvent(key: string, modifiers: Partial<KeyboardEvent> = {}): KeyboardEvent {
    return Object.assign(new Event("keydown"), {
        key,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false,
        ...modifiers,
    }) as KeyboardEvent;
}

describe("keyboard shortcut parsing", () => {
    it("formats modifier chords consistently", () => {
        expect(formatKeyboardEventShortcut(keyboardEvent("Control", { ctrlKey: true }))).toBeNull();
        expect(formatKeyboardEventShortcut(keyboardEvent("s", { ctrlKey: true, shiftKey: true })))
            .toBe("Ctrl+Shift+S");
        expect(formatKeyboardEventShortcut(keyboardEvent("Enter", { ctrlKey: true })))
            .toBe("Ctrl+Enter");
    });

    it("matches configured chords without accepting extra modifiers", () => {
        expect(matchesKeyboardShortcut(keyboardEvent("k", { ctrlKey: true }), "Ctrl+K")).toBe(true);
        expect(matchesKeyboardShortcut(keyboardEvent("k", { ctrlKey: true, shiftKey: true }), "Ctrl+K")).toBe(false);
    });

    it("matches bare keys only when no modifiers are held", () => {
        expect(matchesShortcutKey(keyboardEvent("g"), "G")).toBe(true);
        expect(matchesShortcutKey(keyboardEvent("g", { ctrlKey: true }), "G")).toBe(false);
    });

    it("detects collisions between a sequence and its single-key prefix", () => {
        expect(shortcutsConflict("G+S", "g")).toBe(true);
        expect(shortcutsConflict("G+S", "G+L")).toBe(false);
    });
});
