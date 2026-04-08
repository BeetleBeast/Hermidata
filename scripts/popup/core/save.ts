
import { TrimTitle, returnHashedTitle } from "../../shared/StringOutput";
import type {  Hermidata, AnyNovelType } from "../../shared/types/index";
import { getHermidataViaKey, saveHermidataV3 } from "../../shared/db/Storage";
import { PastHermidata } from "./Past";




export async function updateChapterProgress(title: string, type: string, newChapterNumber: number, hermidata: Hermidata) {
    let needsToMigrate = false
    
    const key = returnHashedTitle(title, type);
    const data = await getHermidataViaKey(key);

    
    let entry: Hermidata | null = null;

    if (data) {
        entry = data;
    } else {
        // id entry is new/can't be found in storage
        const Hermidata: Hermidata | null = new PastHermidata(hermidata).pastHermidata;
        if (Hermidata) entry = Hermidata
        else entry = makeHermidataV3(title, hermidata.url, hermidata.type);
    }

    if (!entry) {
        console.warn(`[HermidataV3] No entry found for ${title}`);
        return;
    }

    if ( entry.title !== title || entry.type !== type || key !== entry.id) needsToMigrate = true

    if (newChapterNumber >= entry.chapter.current) {
        entry.id = key;
        entry.chapter.history.push(entry.chapter.current);
        entry.chapter.current = newChapterNumber;
        entry.status = hermidata.status;
        entry.type = hermidata.type;
        const rawTags = hermidata.meta.tags as string[] | string;
        entry.meta.tags = (Array.isArray(rawTags)) ? rawTags : rawTags.split(',').map(tag => tag.trim()).filter(Boolean);
        entry.chapter.lastChecked = new Date().toISOString();
        entry.meta.updated = new Date().toISOString();
        await saveHermidataV3(key, entry);
        console.log(`[HermidataV3] Updated ${title} to chapter ${newChapterNumber}`);
    }
    if (needsToMigrate) {
        const past = new PastHermidata(hermidata);
        past.init().catch(error => console.error(error));
    }
}


export function makeHermidataV3(title: string, url: string, type: AnyNovelType = "Manga"): Hermidata {
    const Title = TrimTitle.trimTitle(title, url);
    const hash = returnHashedTitle(title, type, url);
    const source = new URL(url).hostname.replace(/^www\./, "");

    return {
        id: hash,
        title: Title.title,
        type,
        url,
        source,
        status: "Viewing",
        chapter: {
            current: 0,
            latest: 0,
            history: [],
            lastChecked: new Date().toISOString()
        },
        rss: null,
        import: null,
        meta: {
            tags: [],
            notes: Title.note ?? '',
            altTitles: [Title.title],
            added: new Date().toISOString(),
            updated: new Date().toISOString(),
            originalRelease: null,
            novelStatus: undefined
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

    const entryKey = entry.id || returnHashedTitle(entry.title, entry.type);

    await saveHermidataV3(entryKey, entry);
    console.log(`[Hermidata] Added alt title "${trimmed}" for ${entry.title}`);
}