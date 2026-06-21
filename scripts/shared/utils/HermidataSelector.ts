import { makeDefaultHermidata } from "../constants";
import { getSettings } from "../db/db";
import type { AnyNovelType, Bookmark, Feed, Hermidata } from "../types";

export class HermidataModel implements Hermidata {
    // ...all Hermidata fields, assigned via constructor as before...
    id: string;
    title: string;
    novelType: AnyNovelType;
    source: string;
    rss: Feed | null;
    import: string | null;
    chapter: Hermidata["chapter"];
    meta: Hermidata["meta"];

    constructor(data: Hermidata) {
        this.id = data.id;
        this.title = data.title;
        this.novelType = data.novelType;
        this.source = data.source;
        this.rss = data.rss;
        this.import = data.import;
        this.chapter = data.chapter;
        this.meta = data.meta;
    }

    static async from(novelType: AnyNovelType | null, readStatus: string | null, novelStatus: string | null): Promise<HermidataModel | null> {
        const settings = await getSettings();
        
        if (!settings && (novelType && readStatus && novelStatus)) return new HermidataModel(makeDefaultHermidata(novelType, readStatus, novelStatus));
        if (!settings) return null;

        const {  TYPE_OPTIONS: defaultNovelType, NOVEL_STATUS_OPTIONS: defaultNovelStatus, STATUS_OPTIONS: defaultReadStatus }  = settings.ContentTypesAndStatuses;

        
        return new HermidataModel(makeDefaultHermidata(novelType ?? defaultNovelType[0], readStatus ?? defaultReadStatus[0], novelStatus ?? defaultNovelStatus[0]));
    }

    private getActiveBookmark(): Bookmark {
        return this.chapter.bookmarks[this.chapter.bookmarkInUse];
    }

    GetUrlFromCurrentBookmark(): string {
        return this.getActiveBookmark()?.url;
    }

    GetChapterFromCurrentBookmark(): number {
        return this.getActiveBookmark()?.current;
    }

    GetReadStatusFromCurrentBookmark(): Bookmark["readStatus"] {
        return this.getActiveBookmark()?.readStatus;
    }

    GetScrollPositionFromCurrentBookmark(): number {
        return this.getActiveBookmark()?.scrollPosition;
    }
    
    toJSON(): Hermidata {
        const { id, title, novelType, source, chapter, rss, import: imp, meta } = this;
        return { id, title, novelType, source, chapter, rss, import: imp, meta };
    }
}
// hermidata-selectors.ts

function getActiveBookmark(data: Hermidata): Bookmark {
    return data.chapter.bookmarks[data.chapter.bookmarkInUse];
}

export function getUrlFromCurrentBookmark(data: Hermidata): string {
    return getActiveBookmark(data)?.url;
}

export function getChapterFromCurrentBookmark(data: Hermidata): number {
    return getActiveBookmark(data)?.current;
}

export function getReadStatusFromCurrentBookmark(data: Hermidata): Bookmark["readStatus"] {
    return getActiveBookmark(data)?.readStatus;
}