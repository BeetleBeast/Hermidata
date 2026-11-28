import { beforeEach, describe, expect, it, vi } from "vitest";

type Node = { id: string; title: string; parentId?: string; url?: string };

const tree = vi.hoisted(() => ({
    nodes: [] as Node[],
    firefox: false,
    items: [] as unknown[],
}));

/** Just the bookmarks API the folder code uses, over `tree.nodes` */
const bookmarksApi = vi.hoisted(() => {
    let nextId = 100;
    const childrenOf = (id: string) => tree.nodes.filter(n => n.parentId === id).map(n => ({ ...n }));
    const build = (node: Node): unknown => ({ ...node, children: node.url ? undefined : childrenOf(node.id).map(build) });
    return {
        getChildren: async (id: string) => childrenOf(id),
        create: async (bookmark: Omit<Node, 'id'>) => {
            const node = { ...bookmark, id: String(nextId++) };
            tree.nodes.push(node);
            return { ...node };
        },
        getTree: async () => [build(tree.nodes.find(n => n.parentId === undefined)!)],
        search: async () => tree.nodes.filter(n => n.url).map(n => ({ ...n })),
        update: async (id: string, changes: Partial<Node>) => Object.assign(tree.nodes.find(n => n.id === id)!, changes),
    };
});

vi.mock("../../scripts/shared/utils/BrowserCompat", () => ({
    // Firefox has the promise-based `browser`, Chrome only `chrome` with callbacks
    get browserApi() { return tree.firefox ? { bookmarks: bookmarksApi } : undefined; },
    ext: {
        bookmarks: {
            getChildren: (id: string, cb: (r: unknown) => void) => void bookmarksApi.getChildren(id).then(cb),
            create: (b: Omit<Node, 'id'>, cb: (r: unknown) => void) => void bookmarksApi.create(b).then(cb),
            getTree: (cb: (r: unknown) => void) => void bookmarksApi.getTree().then(cb),
            search: (_q: unknown, cb: (r: unknown) => void) => void bookmarksApi.search().then(cb),
            update: (id: string, c: Partial<Node>, cb: (r: unknown) => void) => void bookmarksApi.update(id, c).then(cb),
        },
        runtime: {},
    },
}));
vi.mock("../../scripts/shared/db/Storage", () => ({
    getSettings: vi.fn(),
    getAllHermidata: vi.fn(async () => Object.fromEntries(tree.items.map((item: any) => [item.id, item]))),
}));
vi.mock("../../scripts/background/fuzzy", () => ({ hasRelatedBookmarkCached: vi.fn() }));
vi.mock("../../scripts/background/state", () => ({ allHermidataCashed: null, currentBookmark: null, setState: vi.fn() }));
vi.mock("../../scripts/background/tabs", () => ({ updateIcon: vi.fn() }));
vi.mock("../../scripts/settings/build/FolderMapping", () => ({ FolderMapping: {} }));

import { countBookmarkRenames, createNestedFolders, findNestedFolder, getFolderRootId } from "../../scripts/background/bookmarks";
import { HermidataModel } from "../../scripts/shared/utils/HermidataSelector";

/** A German Chrome: none of the folder titles are the English ones */
function germanChrome() {
    tree.firefox = false;
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 Chrome/131.0" });
    tree.nodes = [
        { id: "0", title: "" },
        { id: "1", title: "Lesezeichenleiste", parentId: "0" },
        { id: "2", title: "Weitere Lesezeichen", parentId: "0" },
    ];
}

/** A German Firefox */
function germanFirefox() {
    tree.firefox = true;
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 Firefox/133.0" });
    tree.nodes = [
        { id: "root________", title: "" },
        { id: "menu________", title: "Lesezeichen-Menü", parentId: "root________" },
        { id: "toolbar_____", title: "Lesezeichen-Symbolleiste", parentId: "root________" },
        { id: "unfiled_____", title: "Weitere Lesezeichen", parentId: "root________" },
    ];
}

const parentOf = (id: string) => tree.nodes.find(n => n.id === id)?.parentId;

beforeEach(() => { tree.items = []; });

describe("the folder Hermidata files bookmarks under", () => {
    it("is Other bookmarks on Chrome, found by id whatever its title", async () => {
        germanChrome();
        const folderId = await createNestedFolders(["Novels", "Reading"]);

        expect(parentOf(parentOf(folderId)!)).toBe("2");
        expect(await createNestedFolders(["Novels", "Reading"])).toBe(folderId);   // found again, not made twice
    });

    it("is the Bookmarks Menu on Firefox, found by id whatever its title", async () => {
        germanFirefox();
        const folderId = await createNestedFolders(["Manga"]);

        expect(parentOf(folderId)).toBe("menu________");
    });

    it("is the same root the fuzzy bookmark search looks in", async () => {
        germanChrome();
        const folderId = await createNestedFolders(["Novels", "Reading"]);

        expect(await findNestedFolder(["Novels", "Reading"], getFolderRootId())).toBe(folderId);
    });
});

describe("bookmarks directly in Other bookmarks", () => {
    it("are not mistaken for bookmarks in the trash", async () => {
        germanChrome();
        tree.nodes[2].title = "Other bookmarks";
        const model = HermidataModel.from("Manga", "Viewing", "Ongoing");
        model.id = "item";
        model.title = "Solo Leveling";
        model.SetUrl("https://example.com/solo");
        tree.items = [model.toJSON()];
        tree.nodes.push({ id: "50", title: "an old title", url: "https://example.com/solo", parentId: "2" });

        expect(await countBookmarkRenames("{title}")).toBe(1);
    });
});
