import { DEFAULT_BOOKMARK_TITLE_FORMAT } from "../../shared/constants";
import type { BookmarkTitlePlaceholder, BookmarkTitleValues } from "../../shared/types";
import { getElement } from "../../shared/utils/Selection";
import { ext } from "../../shared/utils/BrowserCompat";
import { BOOKMARK_TITLE_PLACEHOLDERS, missingBookmarkTitlePlaceholders, parseBookmarkTitleFormat, resolveBookmarkTitleFormat} from "../../shared/utils/BookmarkTitle";
import { customConfirm } from "../../popup/frontend/confirm";
import { Build } from "../build";

/** Keeps the caret placeable after a placeholder at the end of the editor; never part of the format */
const CARET_ANCHOR = "​";
const PREVIEW_VALUES: BookmarkTitleValues = { title: "Solo Leveling", chapter: 12, type: "Manhwa", domain: "example.com" };

type MessageKind = "error" | "unsaved" | "hint";

/**
 * The bookmark title format editor: text the user types, with placeholders shown as blocks rather than as
 * {braces}, so they are added by clicking and never have to be written by hand.
 */
export class BookmarkTitleFormat extends Build {

    private readonly editor = getElement<HTMLDivElement>("#bookmarkTitleFormat");
    private readonly label = getElement<HTMLLabelElement>("#bookmarkTitleFormatLabel");
    private readonly palette = getElement<HTMLDivElement>("#bookmarkTitlePlaceholders");
    private readonly message = getElement<HTMLParagraphElement>("#bookmarkTitleFormatMessage");
    private readonly preview = getElement<HTMLDivElement>("#bookmarkTitlePreview");
    private readonly saveButton = getElement<HTMLButtonElement>("#saveBookmarkTitleFormat");
    private readonly defaultButton = getElement<HTMLButtonElement>("#resetBookmarkTitleFormat");
    private readonly status = getElement<HTMLParagraphElement>("#bookmarkTitleFormatStatus");

    private saved = DEFAULT_BOOKMARK_TITLE_FORMAT;
    private enabled = true;
    private lastRange: Range | null = null;

    public async init() {
        this.buildPalette();
        this.bindEvents();
        await this.resetValues();
    }

    /** Shows the stored format, dropping unsaved edits */
    public async resetValues() {
        const settings = await this.db.getSettings();
        this.saved = resolveBookmarkTitleFormat(settings.ExtensionBehaviour.BookmarkTitleFormat);
        this.render(this.saved);
    }

    /** The format only applies to browser bookmarks, so it is locked while they are not saved */
    public setEnabled(enabled: boolean) {
        this.enabled = enabled;
        if (this.editor) {
            this.editor.contentEditable = String(enabled);
            this.editor.setAttribute("aria-disabled", String(!enabled));
        }
        this.palette?.querySelectorAll("button").forEach(button => button.disabled = !enabled);
        this.refresh();
    }

    private bindEvents() {
        this.label?.addEventListener("click", () => this.editor?.focus());
        this.editor?.addEventListener("input", () => this.refresh());
        this.editor?.addEventListener("keydown", (e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();             // one line only: Enter saves instead
            void this.save();
        });
        this.editor?.addEventListener("paste", (e) => this.paste(e));
        this.editor?.addEventListener("drop", (e) => e.preventDefault());   // dragged blocks would arrive as loose HTML
        this.editor?.addEventListener("blur", () => this.blocksFromTypedPlaceholders());
        document.addEventListener("selectionchange", () => this.rememberCaret());
        this.saveButton?.addEventListener("click", () => this.save());
        this.defaultButton?.addEventListener("click", () => {
            this.render(DEFAULT_BOOKMARK_TITLE_FORMAT);
            this.editor?.focus();
        });
    }

    // ------------------------------------------------------------ editor content

    private buildPalette() {
        if (!this.palette) return;
        this.palette.replaceChildren(...BOOKMARK_TITLE_PLACEHOLDERS.map(placeholder => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "format-palette-item";
            button.dataset.token = placeholder.token;
            button.textContent = placeholder.label;
            button.setAttribute("aria-label", `Add ${placeholder.label}`);
            button.disabled = !this.enabled;
            if (placeholder.required) {
                const required = document.createElement("span");
                required.className = "format-palette-required";
                required.textContent = "required";
                button.append(required);
            }
            // keep the caret in the editor, so the block lands where the user was typing
            button.addEventListener("mousedown", (e) => e.preventDefault());
            button.addEventListener("click", () => this.insertAtCaret(this.createBlock(placeholder)));
            return button;
        }));
    }

    private createBlock(placeholder: BookmarkTitlePlaceholder): HTMLSpanElement {
        const block = document.createElement("span");
        block.className = "format-token";
        block.contentEditable = "false";
        block.dataset.token = placeholder.token;
        if (placeholder.required) block.dataset.required = "true";

        const label = document.createElement("span");
        label.textContent = placeholder.label;

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "format-token-remove";
        remove.tabIndex = -1;
        remove.textContent = "×";
        remove.setAttribute("aria-label", `Remove ${placeholder.label}`);
        remove.addEventListener("mousedown", (e) => e.preventDefault());
        remove.addEventListener("click", () => {
            if (!this.enabled) return;
            block.remove();
            this.refresh();
        });

        block.append(label, remove);
        return block;
    }

    /** Text and blocks for this format, replacing what the editor shows */
    private render(format: string) {
        if (!this.editor) return;
        this.editor.replaceChildren(...this.formatNodes(format));
        this.anchorCaretAfterLastBlock();
        this.lastRange = null;
        this.refresh();
    }

    private formatNodes(format: string): Node[] {
        return parseBookmarkTitleFormat(format).map(part => part.kind === "text"
            ? document.createTextNode(part.text)
            : this.createBlock(part.placeholder));
    }

    /** The format the editor holds, with each block written back as its placeholder */
    private readFormat(): string {
        if (!this.editor) return "";
        let format = "";
        const walk = (node: Node) => {
            for (const child of node.childNodes) {
                if (child instanceof HTMLElement && child.dataset.token) format += child.dataset.token;
                else if (child.nodeType === Node.TEXT_NODE) format += child.textContent ?? "";
                else walk(child);
            }
        };
        walk(this.editor);
        return format.replaceAll(CARET_ANCHOR, "").replace(/[\r\n]+/g, " ");
    }

    private anchorCaretAfterLastBlock() {
        if (this.editor?.lastChild instanceof HTMLElement) this.editor.append(document.createTextNode(CARET_ANCHOR));
    }

    // ------------------------------------------------------------ caret

    private rememberCaret() {
        const selection = document.getSelection();
        if (!selection?.rangeCount || !this.editor?.contains(selection.anchorNode)) return;
        this.lastRange = selection.getRangeAt(0).cloneRange();
    }

    /** Inserts at the caret, or at the end when the editor has not had one yet */
    private insertAtCaret(...nodes: Node[]) {
        const editor = this.editor;
        const last = nodes.at(-1);
        if (!editor || !this.enabled || !last) return;
        editor.focus();

        let range = this.lastRange;
        if (!range || !editor.contains(range.startContainer)) {
            range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);
        }
        const insideBlock = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)?.closest(".format-token");
        if (insideBlock) { range.setStartAfter(insideBlock); range.collapse(true); }

        range.deleteContents();
        const fragment = document.createDocumentFragment();
        fragment.append(...nodes);
        range.insertNode(fragment);

        this.anchorCaretAfterLastBlock();
        const caret = document.createRange();
        caret.setStartAfter(last);
        caret.collapse(true);
        const selection = document.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(caret);
        this.lastRange = caret.cloneRange();
        this.refresh();
    }

    /** Pasted text stays on one line, and any placeholders in it become blocks */
    private paste(e: ClipboardEvent) {
        e.preventDefault();
        const text = (e.clipboardData?.getData("text/plain") ?? "").replace(/[\r\n]+/g, " ");
        if (text) this.insertAtCaret(...this.formatNodes(text));
    }

    /** A placeholder typed out by hand is turned into its block once the user leaves the editor */
    private blocksFromTypedPlaceholders() {
        const typed = [...(this.editor?.childNodes ?? [])].some(node =>
            node.nodeType === Node.TEXT_NODE && BOOKMARK_TITLE_PLACEHOLDERS.some(p => node.textContent?.includes(p.token)));
        if (typed) this.render(this.readFormat());
    }

    // ------------------------------------------------------------ state

    /** Validation, the message under the editor, the preview and the buttons, all from the current content */
    private refresh() {
        const format = this.readFormat();
        // the browser can leave a stray <br> behind; an empty editor must be truly empty to show its hint
        if (!format && this.editor?.childNodes.length) this.editor.replaceChildren();

        const missing = missingBookmarkTitlePlaceholders(format);
        const valid = missing.length === 0;
        const unsaved = format.trim() !== this.saved;

        this.editor?.setAttribute("aria-invalid", String(this.enabled && !valid));
        this.palette?.querySelectorAll<HTMLButtonElement>(".format-palette-item").forEach(button => {
            button.classList.toggle("is-missing", this.enabled && missing.some(p => p.token === button.dataset.token));
        });

        if (!this.enabled) this.setMessage("hint", "Turn on Browser bookmark under Save target to change this.");
        else if (!valid) this.setMessage("error", `Add ${missing.map(p => p.label).join(" and ")} to the format. It cannot be saved without it.`);
        else if (unsaved) this.setMessage("unsaved", "Unsaved changes. Press Save or Enter.");
        else this.setMessage(null, "");

        if (this.saveButton) this.saveButton.disabled = !this.enabled || !valid || !unsaved;
        if (this.defaultButton) this.defaultButton.disabled = !this.enabled || format.trim() === DEFAULT_BOOKMARK_TITLE_FORMAT;

        this.renderPreview(format, valid);
    }

    private setMessage(kind: MessageKind | null, text: string) {
        if (!this.message) return;
        this.message.textContent = text;
        this.message.hidden = kind === null;
        if (kind) this.message.dataset.kind = kind;
    }

    /** The title an example item would get; each filled-in placeholder is marked, so the mapping is visible */
    private renderPreview(format: string, valid: boolean) {
        if (!this.preview) return;
        this.preview.dataset.state = valid ? "valid" : "invalid";
        if (!valid) {
            this.preview.textContent = "The preview appears once Title is added.";
            return;
        }
        this.preview.replaceChildren(...parseBookmarkTitleFormat(format.trim()).map(part => {
            if (part.kind === "text") return document.createTextNode(part.text);
            const value = document.createElement("span");
            value.className = "format-preview-value";
            value.title = part.placeholder.label;
            value.textContent = String(PREVIEW_VALUES[part.placeholder.key]);
            return value;
        }));
    }

    // ------------------------------------------------------------ saving

    private async save() {
        const format = this.readFormat().trim();
        if (!this.enabled || missingBookmarkTitlePlaceholders(format).length || format === this.saved) return;

        const settings = await this.ensureSettingsUpToDate();
        const previous = resolveBookmarkTitleFormat(settings.ExtensionBehaviour.BookmarkTitleFormat);
        settings.ExtensionBehaviour.BookmarkTitleFormat = resolveBookmarkTitleFormat(format);
        await this.db.setSettings(settings);

        this.saved = settings.ExtensionBehaviour.BookmarkTitleFormat;
        this.render(this.saved);
        this.temporaryStatus("Saved.", this.status);

        if (this.saved !== previous) await this.offerRename(this.saved);
    }

    /** Asks before renaming the bookmarks already saved; "Keep" leaves them as they are, so only new ones use the format */
    private async offerRename(format: string) {
        try {
            const count = await ext.runtime.sendMessage({ type: 'BOOKMARK_RENAME_COUNT', format });
            if (typeof count !== 'number' || count === 0) return;

            const items = `${count} saved bookmark${count === 1 ? '' : 's'}`;
            const confirmed = await customConfirm(
                `Rename ${items} to the new format?\n` +
                `Only bookmarks saved by Hermidata are renamed. Their titles are replaced and cannot be restored automatically.`,
                { accept: 'Rename', reject: 'Keep' }
            );
            if (!confirmed) return;

            const renamed = await ext.runtime.sendMessage({ type: 'BOOKMARK_RENAME_APPLY', format });
            this.temporaryStatus(`Renamed ${renamed} bookmark${renamed === 1 ? '' : 's'}.`, this.status, 4000);
        } catch (error) {
            console.warn('[Settings] bookmark rename:', error);
        }
    }
}
