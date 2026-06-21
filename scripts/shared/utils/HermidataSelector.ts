import { makeDefaultHermidata } from "../constants";
import { getSettings } from "../db/db";
import type { AnyNovelType, Bookmark, Feed, Hermidata, InputArraySheetType, InputArrayType } from "../types";

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

    private makeSureTagsISNotAnArray(dataArray: InputArrayType | InputArraySheetType): InputArraySheetType {
        const tags = (Array.isArray(dataArray[6]) ? dataArray[6].join(", ") : dataArray[6])
        return [dataArray[0], dataArray[1], dataArray[2], dataArray[3], dataArray[4], dataArray[5], tags, dataArray[7]]
    }
    
    toInputArrayRow(): InputArrayType {
        return [this.title, this.novelType, this.chapter.bookmarks[this.chapter.bookmarkInUse].current, this.chapter.bookmarks[this.chapter.bookmarkInUse].url, this.chapter.bookmarks[this.chapter.bookmarkInUse].readStatus, this.meta.updated, this.meta.tags, this.meta.notes]
    }
    toInputArraySheetRow(): InputArraySheetType {
        return this.makeSureTagsISNotAnArray(this.toInputArrayRow())
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