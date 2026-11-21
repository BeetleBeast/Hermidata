import { describe, expect, it } from "vitest";
import { extractTitleFromFormattedBookmark, formatBookmarkTitle, missingBookmarkTitlePlaceholders, parseBookmarkTitleFormat } from "../scripts/shared/utils/BookmarkTitle";
import { resolveTombstoneTtlDays } from "../scripts/shared/constants";

const values = { title: "Solo", chapter: 5, type: "Manga", domain: "example.com" };

describe("bookmark title format", () => {
    it("uses the default when the template is missing, empty or lacks {title}", () => {
        for (const t of [undefined, "", "   ", "Chapter {chapter}"]) {
            expect(formatBookmarkTitle(t, values)).toBe("Solo - Chapter 5");
        }
    });
    it("fills a custom template", () => {
        expect(formatBookmarkTitle("{title} (ch. {chapter})", { ...values, chapter: "12" })).toBe("Solo (ch. 12)");
    });
    it("fills type and domain", () => {
        expect(formatBookmarkTitle("{type}: {title} @ {domain}", values)).toBe("Manga: Solo @ example.com");
    });
    it("gets the title back out of custom and default formats", () => {
        expect(extractTitleFromFormattedBookmark("Solo (ch. 12)", "{title} (ch. {chapter})")).toBe("Solo");
        expect(extractTitleFromFormattedBookmark("Solo - Chapter 12", "{title} (ch. {chapter})")).toBe("Solo");
        expect(extractTitleFromFormattedBookmark("Solo - Chapter 12", undefined)).toBe("Solo");
        expect(extractTitleFromFormattedBookmark("Manga: Solo @ example.com", "{type}: {title} @ {domain}")).toBe("Solo");
        expect(extractTitleFromFormattedBookmark("[12] Solo", "[{chapter}] {title}")).toBe("Solo");
        expect(extractTitleFromFormattedBookmark("Solo (ch. 12)", "{title}")).toBe("Solo (ch. 12)");
    });
});

describe("format parts for the editor", () => {
    it("splits a format into text and placeholders, leaving out empty text", () => {
        const parts = parseBookmarkTitleFormat("{type}{title} - {chapter}");
        expect(parts.map(p => p.kind === "text" ? p.text : p.placeholder.label)).toEqual(["Type", "Title", " - ", "Chapter"]);
    });
    it("keeps unknown braces as text", () => {
        expect(parseBookmarkTitleFormat("{chaptr}")).toEqual([{ kind: "text", text: "{chaptr}" }]);
    });
    it("reports Title as missing until it is in the format", () => {
        expect(missingBookmarkTitlePlaceholders("").map(p => p.label)).toEqual(["Title"]);
        expect(missingBookmarkTitlePlaceholders("Chapter {chapter}").map(p => p.label)).toEqual(["Title"]);
        expect(missingBookmarkTitlePlaceholders("{title}")).toEqual([]);
    });
});

describe("tombstone ttl", () => {
    it("falls back to 30 days for invalid values and clamps large ones", () => {
        expect(resolveTombstoneTtlDays(undefined)).toBe(30);
        expect(resolveTombstoneTtlDays(0)).toBe(30);
        expect(resolveTombstoneTtlDays(NaN)).toBe(30);
        expect(resolveTombstoneTtlDays(7.9)).toBe(7);
        expect(resolveTombstoneTtlDays(99999)).toBe(3650);
    });
});
