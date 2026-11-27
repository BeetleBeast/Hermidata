import { ErrorMessage, logConsoleError } from "../../shared/utils/ErrorMessage";

import { TrimTitle, generateBookmarkId, generateHermidataHash } from "../../shared/utils/StringOutput";
import type {  Hermidata, AnyNovelType, Bookmark } from "../../shared/types/index";
import { getAllHermidata, getHermidataViaKey, linkHermidata, saveHermidata } from "../../shared/db/Storage";
import { HERMIDATA_VERSION } from "../../shared/constants";
import { groupRoles } from "../../shared/utils/Relations";
import { PastHermidata } from "./Past";
import { HermidataModel } from "../../shared/utils/HermidataSelector";
import type { PastHermidataPromptOptions } from "./Past";

const notificationTarget = typeof document === "undefined" ? "browser" : "in-page";
const notifyUser = typeof document !== "undefined";



export async function updateChapterProgress( hermidata: HermidataModel, pastPrompts?: PastHermidataPromptOptions ): Promise<boolean> {
    try {
        const newChapterNumber = hermidata.GetChapter();

        const key = generateHermidataHash(hermidata.title, hermidata.novelType, hermidata.GetUrl(), false);
        // an item that already has an id is that item, even when it is not stored under the hash of its title ( separate items )
        const byId = hermidata.id ? await getHermidataViaKey(hermidata.id) : null;
        const data = byId ?? await getHermidataViaKey(key);

        // not stored under the computed key: look for the saved item ( e.g. found by alt title ), otherwise it is new
        const past = data ? null : await new PastHermidata(hermidata, pastPrompts).init();
        const entry = new HermidataModel(data ?? past ?? await makeHermidata(hermidata.title, hermidata.GetUrl(), hermidata.novelType));

        // a found item keeps its own id, so it is updated in place instead of copied under a new key
        const saveKey = byId || past ? entry.id : key;

        const oldChapterNumber = entry.GetChapter(hermidata.chapter.bookmarkInUse) || entry.GetChapter();
        if (newChapterNumber >= oldChapterNumber) {

            entry.Update(saveKey, hermidata, newChapterNumber);
            await saveHermidata(saveKey, entry.toJSON());
            console.log(`[HermidataV3] Updated ${hermidata.title} to chapter ${newChapterNumber}`);
        }
        return true
    } catch (error) {
        new ErrorMessage("Could not save the chapter progress.", undefined, {
            consoleLevel: 'error',
            notifyUser,
            notificationTarget,
            details: [error]
        }).sendMessage();
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
        logConsoleError(error);
    }
}

export async function makeHermidata(title: string, url: string, novelType: AnyNovelType = "Manga", isPrimary: boolean = true): Promise<Hermidata> {
    const Title = TrimTitle.trimTitle(title, url);
    const hash = generateHermidataHash(title, novelType, url);
    const source = new URL(url).hostname.replace(/^www\./, "");

    const pagePositionObject = await getPagePosition();
    const scrollPosition = pagePositionObject?.[0]?.result ?? 0;
    

    const label = 'Primary';
    const newBookmark: Bookmark = {
        version: 6,        
        id: generateBookmarkId(label),
        current: 0,
        history: [],
        label: label,
        color: '#5979d6',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
        note: '',
        isPrimary,
        readStatus: 'Viewing',
        scrollPosition: scrollPosition,
        url
    }

    return {
        version: HERMIDATA_VERSION,
        id: hash,
        title: Title.title,
        novelType,
        source,
        chapter: {
            latest: 0,
            bookmarks: {
                [newBookmark.id]: newBookmark
            },
            revisitingCount: 0,
            lastChecked: new Date().toISOString(),
            bookmarkInUse: generateBookmarkId(label),
            releaseSchedule: "Unknown"
        },
        rss: [],
        import: null,
        titleTrimming: { type: 'default' },
        meta: {
            tags: [],
            notes: Title.note ?? '',
            altSources: [source],
            altTitles: [Title.title],
            added: new Date().toISOString(),
            updated: new Date().toISOString(),
            originalRelease: null,
            novelStatus: 'Ongoing',
            contentRating: "Safe",
            contentWarnings: [],
            starRating: 5.0,
            image: { kind: 'url', url: '../../../assets/icon/icon48.png' },
            readingQueue: false,
            relations: "None",
            
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

    const entryKey = hermidata.id || generateHermidataHash(hermidata.title, hermidata.novelType);

    await saveHermidata(entryKey, hermidata.toJSON());
    console.log(`[Hermidata] Added alt title "${trimmed}" for ${hermidata.title}`);
}

/**
 * Stores a new, empty item for a separate work that shares its title with a saved one.
 * - it gets the hash of its title and type when that is free ( e.g. the manga of a saved novel )
 * - otherwise a random id, so the item already stored under that hash is never overwritten
 */
export async function createSeparateItem(title: string, url: string, novelType: AnyNovelType): Promise<Hermidata> {
    const item = await makeHermidata(title, url, novelType);
    if (await getHermidataViaKey(item.id)) item.id = crypto.randomUUID();
    await saveHermidata(item.id, item);
    return item;
}

/**
 * Links an item to one telling the same story in another medium ( e.g. the manga of a novel ):
 * it joins the related titles of `originalId` with the same type, so the manga of a sequel is a sequel too.
 */
export async function linkAsSameStory(originalId: string, id: string): Promise<void> {
    const type = groupRoles(originalId, await getAllHermidata())[originalId];
    if (!type) throw new Error("Could not find the item to link to.");
    await linkHermidata(originalId, id, type);
}