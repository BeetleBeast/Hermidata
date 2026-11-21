import { DEFAULT_BOOKMARK_TITLE_FORMAT } from "../constants";
import type { BookmarkTitleFormatPart, BookmarkTitlePlaceholder, BookmarkTitleValues } from "../types";
import type { HermidataModel } from "./HermidataSelector";

const TITLE_PLACEHOLDER = '{title}';

export const BOOKMARK_TITLE_PLACEHOLDERS: readonly BookmarkTitlePlaceholder[] = [
    { token: TITLE_PLACEHOLDER, key: 'title', label: 'Title', required: true },
    { token: '{chapter}', key: 'chapter', label: 'Chapter', required: false },
    { token: '{type}', key: 'type', label: 'Type', required: false },
    { token: '{domain}', key: 'domain', label: 'Domain', required: false },
];

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, match => `\\${match}`);
/** Splits a template into its literal text and its placeholders, keeping the placeholders. */
const PLACEHOLDER_SPLIT = new RegExp(`(${BOOKMARK_TITLE_PLACEHOLDERS.map(p => escapeRegExp(p.token)).join('|')})`);

/** The template as literal text and placeholders, in order. Empty text between placeholders is left out. */
export function parseBookmarkTitleFormat(template: string): BookmarkTitleFormatPart[] {
    return template.split(PLACEHOLDER_SPLIT).flatMap((part): BookmarkTitleFormatPart[] => {
        const placeholder = BOOKMARK_TITLE_PLACEHOLDERS.find(p => p.token === part);
        if (placeholder) return [{ kind: 'placeholder', placeholder }];
        return part ? [{ kind: 'text', text: part }] : [];
    });
}

/** The required placeholders the template lacks. */
export function missingBookmarkTitlePlaceholders(template: string): BookmarkTitlePlaceholder[] {
    return BOOKMARK_TITLE_PLACEHOLDERS.filter(p => p.required && !template.includes(p.token));
}

/** A template must be non-empty and name the title, or bookmarks could not be told apart. */
function isValidBookmarkTitleFormat(template: string | undefined): template is string {
    return !!template?.trim() && missingBookmarkTitlePlaceholders(template).length === 0;
}

/** The template to use: the user's when valid, the default otherwise. */
export function resolveBookmarkTitleFormat(template: string | undefined): string {
    return isValidBookmarkTitleFormat(template) ? template.trim() : DEFAULT_BOOKMARK_TITLE_FORMAT;
}

/** What each placeholder stands for in this item's bookmark title. */
export function bookmarkTitleValues(hermidata: HermidataModel): BookmarkTitleValues {
    let domain = '';
    try { domain = new URL(hermidata.GetUrl()).hostname.replace(/^www\./, ''); } catch { /* no usable URL: leave it empty */ }
    return { title: hermidata.title, chapter: hermidata.GetChapter() || '0', type: hermidata.novelType, domain };
}

export function formatBookmarkTitle(template: string | undefined, values: BookmarkTitleValues): string {
    return parseBookmarkTitleFormat(resolveBookmarkTitleFormat(template))
        .map(part => part.kind === 'text' ? part.text : String(values[part.placeholder.key]))
        .join('');
}

/** Gets the title back out of a bookmark title made with the template; titles in any other format fall back to the default format. */
export function extractTitleFromFormattedBookmark(bookmarkTitle: string, template: string | undefined): string {
    let titleCaptured = false;
    const pattern = parseBookmarkTitleFormat(resolveBookmarkTitleFormat(template))
        .map(part => {
            if (part.kind === 'text') return escapeRegExp(part.text);
            if (part.placeholder.token !== TITLE_PLACEHOLDER) return '.*?';
            const group = titleCaptured ? '.+?' : '(.+?)';
            titleCaptured = true;
            return group;
        })
        .join('');
    const match = new RegExp(`^${pattern}$`).exec(bookmarkTitle);
    return (match?.[1] ?? bookmarkTitle.split(" - Chapter ")[0]).trim();
}
