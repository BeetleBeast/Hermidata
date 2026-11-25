import { beforeEach, describe, expect, it, vi } from "vitest";
import { HermidataModel } from "../../scripts/shared/utils/HermidataSelector";
import { bookmarkTitleValues, extractTitleFromFormattedBookmark, formatBookmarkTitle } from "../../scripts/shared/utils/BookmarkTitle";
import { DEFAULT_BOOKMARK_TITLE_FORMAT } from "../../scripts/shared/constants";

const store = vi.hoisted(() => ({
    items: [] as unknown[],
    bookmarks: [] as Array<{ id: string; title: string; url: string; parentId: string }>,
}));

vi.mock("../../scripts/shared/db/Storage", () => ({
    getSettings: vi.fn(),
    getAllHermidata: vi.fn(async () => Object.fromEntries(store.items.map((item: any) => [item.id, item]))),
}));
vi.mock("../../scripts/shared/utils/BrowserCompat", () => ({
    ext: {
        bookmarks: {
            getTree: (cb: (nodes: unknown[]) => void) => cb([{ id: "0", title: "", children: [] }]),
            search: (_query: unknown, cb: (results: unknown[]) => void) => cb(store.bookmarks.map(b => ({ ...b }))),
            update: (id: string, changes: { title: string }, cb: (result: unknown) => void) => {
                const bookmark = store.bookmarks.find(b => b.id === id)!;
                bookmark.title = changes.title;
                cb(bookmark);
            },
        },
        runtime: {},
    },
}));
vi.mock("../../scripts/background/fuzzy", () => ({ hasRelatedBookmarkCached: vi.fn() }));
vi.mock("../../scripts/background/state", () => ({ allHermidataCashed: null, currentBookmark: null, setState: vi.fn() }));
vi.mock("../../scripts/background/tabs", () => ({ updateIcon: vi.fn() }));
vi.mock("../../scripts/settings/build/FolderMapping", () => ({ FolderMapping: {} }));

import { countBookmarkRenames, renameBookmarks } from "../../scripts/background/bookmarks";

vi.stubGlobal("browser", undefined);

const FORMATS = [
    "{title} (ch. {chapter})",
    "[{chapter}] {title}",
    "{title} | Chapter {chapter} | {title}",
    "{type}: {title} ({domain}) {chapter}",
];

let nextId = 0;
/** A saved item, plus the browser bookmark Hermidata made for it with this format. */
function saveItem(title: string, chapter: number, format: string) {
    const model = HermidataModel.from("Manga", "Viewing", "Ongoing");
    model.id = `item-${nextId}`;
    model.title = title;
    model.SetUrl(`https://example.com/${nextId}`);
    model.SetChapter(chapter);
    store.items.push(model.toJSON());
    store.bookmarks.push({ id: `bm-${nextId}`, title: formatBookmarkTitle(format, bookmarkTitleValues(model)), url: `https://example.com/${nextId}`, parentId: "10" });
    nextId++;
}

beforeEach(() => {
    store.items = [];
    store.bookmarks = [];
    nextId = 0;
});

describe("renaming bookmarks after a format change", () => {
    it("counts nothing when every bookmark already has the format", async () => {
        saveItem("Solo", 5, DEFAULT_BOOKMARK_TITLE_FORMAT);
        expect(await countBookmarkRenames(DEFAULT_BOOKMARK_TITLE_FORMAT)).toBe(0);
        expect(await renameBookmarks(DEFAULT_BOOKMARK_TITLE_FORMAT)).toBe(0);
    });

    it("leaves bookmarks that are not Hermidata items alone", async () => {
        saveItem("Solo", 5, DEFAULT_BOOKMARK_TITLE_FORMAT);
        store.bookmarks.push({ id: "other", title: "My recipes", url: "https://recipes.example", parentId: "10" });

        expect(await renameBookmarks(FORMATS[0])).toBe(1);
        expect(store.bookmarks.find(b => b.id === "other")!.title).toBe("My recipes");
    });

    it("renames every bookmark across several format changes, each with a bookmark saved in that format", async () => {
        let current = DEFAULT_BOOKMARK_TITLE_FORMAT;
        saveItem("Solo", 5, current);
        saveItem("Tower", 7, current);

        for (const [step, format] of FORMATS.entries()) {
            // every bookmark so far still has the previous format: all of them change
            expect(await countBookmarkRenames(format)).toBe(store.bookmarks.length);
            expect(await renameBookmarks(format)).toBe(store.bookmarks.length);
            current = format;

            // a bookmark saved after the change already has the new format, so it is not counted
            saveItem(`Saved after change ${step + 1}`, 10 + step, current);
            expect(await countBookmarkRenames(current)).toBe(0);

            for (const [i, item] of (store.items as Array<{ title: string; id: string }>).entries()) {
                const bookmark = store.bookmarks[i];
                const values = bookmarkTitleValues(new HermidataModel(item as never));
                expect(bookmark.title).toBe(formatBookmarkTitle(current, values));
                expect(extractTitleFromFormattedBookmark(bookmark.title, current)).toBe(item.title);
            }
        }
        expect(store.bookmarks).toHaveLength(6);
    });

    it("names bookmarks of chapter 0 as 0", async () => {
        saveItem("Fresh", 0, "{title}");
        await renameBookmarks(FORMATS[0]);
        expect(store.bookmarks[0].title).toBe("Fresh (ch. 0)");
    });

    it("fills type and domain from the item", async () => {
        saveItem("Solo", 5, DEFAULT_BOOKMARK_TITLE_FORMAT);
        await renameBookmarks("{type} | {title} | {domain}");
        expect(store.bookmarks[0].title).toBe("Manga | Solo | example.com");
    });
});
