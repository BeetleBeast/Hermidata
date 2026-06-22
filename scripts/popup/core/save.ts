
import { TrimTitle, returnBookmarkHash, returnHashedTitle } from "../../shared/utils/StringOutput";
import type {  Hermidata, AnyNovelType, Bookmark } from "../../shared/types/index";
import { getHermidataViaKey, saveHermidata } from "../../shared/db/Storage";
import { PastHermidata } from "./Past";
import { HermidataModel } from "../../shared/utils/HermidataSelector";




export async function updateChapterProgress(hermidata: HermidataModel): Promise<boolean> {
    try {
        let needsToMigrate = false
    
        const newChapterNumber = hermidata.GetChapter();
        
        const key = returnHashedTitle(hermidata.title, hermidata.novelType, hermidata.GetUrl(), false);
        const data = await getHermidataViaKey(key);
    
        
        let entry: HermidataModel | null = null;
    
        if (data) entry = new HermidataModel(data);
        else {
            // id entry is new/can't be found in storage
            const Hermidata: Hermidata | null = new PastHermidata(hermidata).pastHermidata;
            if (Hermidata) entry = new HermidataModel(Hermidata);
            else entry = new HermidataModel(await makeHermidata(hermidata.title, hermidata.GetUrl(), hermidata.novelType));
        }
    
        if (!entry) {
            console.warn(`[HermidataV3] No entry found for ${hermidata.title}`);
            return false;
        }
    
        if ( entry.title !== hermidata.title || entry.novelType !== hermidata.novelType || key !== entry.id) needsToMigrate = true
        
        const oldChapterNumber = entry.GetChapter(hermidata.chapter.bookmarkInUse) || entry.GetChapter();
        if (newChapterNumber >= oldChapterNumber) {

            entry.Update(key, hermidata, newChapterNumber);
            await saveHermidata(key, entry);
            console.log(`[HermidataV3] Updated ${hermidata.title} to chapter ${newChapterNumber}`);
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
        scrollPosition: scrollPosition,
        url
    }

    return {
        id: hash,
        title: Title.title,
        novelType,
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
    const hermidata = new HermidataModel(entry);
    // Normalize and deduplicate
    const trimmed = TrimTitle.trimTitle(newTitle, hermidata.GetUrl()).title;
    hermidata.meta = hermidata.meta || {};
    hermidata.meta.altTitles = Array.from(
        new Set([...(hermidata.meta.altTitles || []), trimmed])
    );

    const entryKey = hermidata.id || returnHashedTitle(hermidata.title, hermidata.novelType);

    await saveHermidata(entryKey, hermidata);
    console.log(`[Hermidata] Added alt title "${trimmed}" for ${hermidata.title}`);
}