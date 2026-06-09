
import { TrimTitle, returnBookmarkHash, returnHashedTitle } from "../../shared/utils/StringOutput";
import type {  Hermidata, AnyNovelType, Bookmark } from "../../shared/types/index";
import { getHermidataViaKey, saveHermidata } from "../../shared/db/Storage";
import { PastHermidata } from "./Past";




export async function updateChapterProgress(title: string, type: string, hermidata: Hermidata): Promise<boolean> {
    try {
        let needsToMigrate = false
    
        const newChapterNumber = getChapterFromBookmarkInUse(hermidata);
        
        const key = returnHashedTitle(title, type, hermidata.url, false);
        const data = await getHermidataViaKey(key);
    
        
        let entry: Hermidata | null = null;
    
        if (data) {
            entry = data;
        } else {
            // id entry is new/can't be found in storage
            const Hermidata: Hermidata | null = new PastHermidata(hermidata).pastHermidata;
            if (Hermidata) entry = Hermidata
            else entry = await makeHermidata(title, hermidata.url, hermidata.novelType);
        }
    
        if (!entry) {
            console.warn(`[HermidataV3] No entry found for ${title}`);
            return false;
        }
    
        if ( entry.title !== title || entry.novelType !== type || key !== entry.id) needsToMigrate = true
        
        const oldChapterNumber = entry.chapter.bookmarks[hermidata.chapter.bookmarkInUse]?.current || getChapterFromBookmarkInUse(entry);
        if (newChapterNumber >= oldChapterNumber) {
            entry.id = key;

            const bookmarkInUse = getBookmarkInUse(hermidata);
            bookmarkInUse.current = newChapterNumber;
            bookmarkInUse.updatedAt = new Date().toISOString();
            if (!bookmarkInUse?.history.some(chapter => chapter === newChapterNumber)) bookmarkInUse?.history.push(bookmarkInUse.current);
            entry.chapter.bookmarks[bookmarkInUse.id] = bookmarkInUse;
            
            entry.chapter.bookmarkInUse = bookmarkInUse.id;
            entry.chapter.lastChecked = new Date().toISOString();
            
            entry.novelType = hermidata.novelType;
            entry.chapter.bookmarks[hermidata.chapter.bookmarkInUse].readStatus = hermidata.chapter.bookmarks[hermidata.chapter.bookmarkInUse].readStatus;
            entry.meta.novelStatus = hermidata.meta.novelStatus;
    
            const rawTags = hermidata.meta.tags as string[] | string;
            entry.meta.tags = (Array.isArray(rawTags)) ? rawTags : rawTags.split(',').map(tag => tag.trim()).filter(Boolean);
            
            entry.meta.updated = new Date().toISOString();
    
            if (hermidata.chapter.latest > entry.chapter.latest) entry.chapter.latest = hermidata.chapter.latest;
    
            await saveHermidata(key, entry);
            console.log(`[HermidataV3] Updated ${title} to chapter ${newChapterNumber}`);
        }
        if (needsToMigrate) {
            const past = new PastHermidata(hermidata);
            await past.init().catch(error => console.error(error));
            return false
        }
        return true
    } catch (error) {
        console.error('[HermidataV3] updateChapterProgress failed:', error);
        return false;
    }
}
export async function getPagePosition(): Promise<chrome.scripting.InjectionResult<number>[] | undefined> {
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs.length) return;
        const tab = tabs[0];
        const tabId = tab.id;
        if (!tabId) return;
        // get scroll position
        const result = chrome.scripting.executeScript({
            target: { tabId },
            func: () => window.scrollY
        });
        return result;
    }
    catch (error) {
        console.error(error);
    }
}

export async function makeHermidata(title: string, url: string, novelType: AnyNovelType = "Manga", isPrimary: boolean = true): Promise<Hermidata> {
    const Title = TrimTitle.trimTitle(title, url);
    const hash = returnHashedTitle(title, novelType, url);
    const source = new URL(url).hostname.replace(/^www\./, "");

    const pagePositionObject = await getPagePosition();
    const scrollPosition = pagePositionObject?.[0]?.result ?? 0;
    

    const label = 'Primary';
    const newBoomark: Bookmark = {
        id: returnBookmarkHash(label),
        current: 0,
        history: [],
        label: label,
        color: 'blue',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        note: '',
        isPrimary,
        readStatus: 'Viewing',
        scrollPosition: scrollPosition
    }

    return {
        id: hash,
        title: Title.title,
        novelType,
        url,
        source,
        chapter: {
            latest: 0,
            bookmarks: {
                [newBoomark.id]: newBoomark
            },
            revisitingCount: 0,
            lastChecked: new Date().toISOString(),
            bookmarkInUse: returnBookmarkHash(label)
        },
        rss: null,
        import: null,
        meta: {
            tags: [],
            notes: Title.note ?? '',
            altSources: [source],
            altTitles: [Title.title],
            added: new Date().toISOString(),
            updated: new Date().toISOString(),
            originalRelease: null,
            novelStatus: 'Ongoing'
        }
    };
}

export async function appendAltTitle(newTitle: string, entry: Hermidata): Promise<void> {
    // Normalize and deduplicate
    const trimmed = TrimTitle.trimTitle(newTitle, entry.url).title;
    entry.meta = entry.meta || {};
    entry.meta.altTitles = Array.from(
        new Set([...(entry.meta.altTitles || []), trimmed])
    );

    const entryKey = entry.id || returnHashedTitle(entry.title, entry.novelType);

    await saveHermidata(entryKey, entry);
    console.log(`[Hermidata] Added alt title "${trimmed}" for ${entry.title}`);
}

export function getchapterFromPrimaryBookmark(hermidata: Hermidata): number {
    const primary = Object.values(hermidata.chapter.bookmarks).find(b => b.isPrimary) as Bookmark;
    return primary.current ?? 0;
}
export function getchapterFromBookmark(hermidata: Hermidata, bookmarkId: string): number {
    const primary = hermidata.chapter.bookmarks[bookmarkId]
    return primary.current;
}
export function getBookmarkFromHermidata(hermidata: Hermidata, bookmarkId: string): Bookmark {
    const bookmark = hermidata.chapter.bookmarks[bookmarkId]
    return bookmark;
}
export function getChapterFromBookmarkInUse(hermidata: Hermidata): number {
    const inUse = hermidata.chapter.bookmarks[hermidata.chapter.bookmarkInUse]
    return inUse.current ?? 0;
}
export function getBookmarkInUse(hermidata: Hermidata): Bookmark {
    const inUse = hermidata.chapter.bookmarks[hermidata.chapter.bookmarkInUse]
    return inUse;
}