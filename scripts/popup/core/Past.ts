import { getAllHermidata, getHermidataViaKey } from "../../shared/db/Storage";
import { TrimTitle, findByTitleOrAltV2, returnHashedTitle } from "../../shared/StringOutput";
import { type Hermidata, type NovelType, type AllHermidata, novelTypes, type AltCheck } from "../../shared/types/index";
import { customConfirm } from "../frontend/confirm";
import { appendAltTitle } from "./save";
import { migrateCopy } from "./migrate";


// --- cashe ---
const CalcDiffCache = new Map();
let AllHermidataCashe: AllHermidata;


export class PastHermidata {
    
    private static _allHermidata: AllHermidata | undefined;

    // Lazy cache — fetches once, returns cached after that
    public static async getAllHermidata(): Promise<AllHermidata> {
        PastHermidata._allHermidata ??= await getAllHermidata();
        return PastHermidata._allHermidata;
    }

    // Call this when you know the data has changed (e.g. after a save)
    public static invalidateCache(): void {
        PastHermidata._allHermidata = undefined;
    }

    public pastHermidata: Hermidata | null = null;

    private readonly hermidata: Hermidata;

    constructor(hermidata: Hermidata) {
        this.hermidata = hermidata;
    }

    public async init(): Promise<Hermidata | null> {
        this.pastHermidata = await this.getPastHermidata();
        return this.pastHermidata;
    }


    private async getPastHermidata(): Promise<Hermidata | null> {
        // ojective => find if the Hermidata already exists in the browser storage

        // get all Hermidata
        const AllHermidata = await PastHermidata.getAllHermidata();
        // update cashe
        if (AllHermidataCashe && Object.keys(AllHermidataCashe).length != Object.keys(AllHermidata).length) {
            AllHermidataCashe = AllHermidata
        }

        // find title from alt ( includes main title and alt title )
        const potentialTrueTitle = this.getTitleFromAlt(AllHermidata) || '';

        // find title from fuzzy seach
        const { possibleObj, AltKeyNeeded, fuzzyKey } = await this.getTitleFromFuzzy(potentialTrueTitle);

        // early returns

        // add alt title to Object
        if (AltKeyNeeded?.needAltTitle && fuzzyKey && possibleObj[fuzzyKey]) {
            const confirmation = await customConfirm(`${AltKeyNeeded.reason}\nAdd "${this.hermidata.title}" as an alt title for "${possibleObj[fuzzyKey].title}"?`);
            if (confirmation) await appendAltTitle(this.hermidata.title, possibleObj[fuzzyKey]);
        }

        // only 1 result -> return
        if ( Object.keys(possibleObj).length == 1 ) return Object.values(possibleObj)[0]

        // more then 1 result -> filter it
        if ( Object.keys(possibleObj).length > 1 ) {
            const byOtherMeans = await this.tryToFindByOtherMeans(possibleObj);
            if (byOtherMeans ) return byOtherMeans;
            const objs = Object.values(possibleObj);
            // Check for possible same-series different-type pairs
            return await migrateCopy(objs)
        }

        const key: string = returnHashedTitle(this.hermidata.title, this.hermidata.type, this.hermidata.url);

        return getHermidataViaKey(key).catch(error => {
            console.error('Extention error: Failed Premise getHermidata: ',error);
            console.log('Key',key,'\n', '\n','this.hermidata', this.hermidata);
            return null;
        })
    }
    private getTitleFromAlt(allHermidata: AllHermidata): string | undefined {

        const posibleTitleV2 = this.hermidata.meta.notes.replace('Chapter Title: ', '');

        const TrueTitle = findByTitleOrAltV2(this.hermidata.title, allHermidata)?.title ?? findByTitleOrAltV2(posibleTitleV2, allHermidata)?.title;
        if  (!TrueTitle) this.hermidata.meta.notes = '';
        return TrueTitle
    }
    private async getTitleFromFuzzy(trueTitle: string): Promise<{ possibleObj: AllHermidata, AltKeyNeeded: { needAltTitle: boolean, reason: string }, fuzzyKey: string | null | undefined  }> {
        const AltKeyNeeded = await detectAltTitleNeeded(this.hermidata.title, this.hermidata.type, this.hermidata.source, this.hermidata.url);
        const fuzzyKey = AltKeyNeeded?.relatedKey;
        // Generate all possible keys
        const possibleKeys = novelTypes.map(type => returnHashedTitle(trueTitle, type));
        // add fuzzy key if not inside possible keys
        if (fuzzyKey && !possibleKeys.includes(fuzzyKey)) possibleKeys.push(fuzzyKey);
        // get all posible hermidata Obj
        const possibleObj: AllHermidata = {};
        for (const key of possibleKeys) {
            const obj = await getHermidataViaKey(key);
            if ( obj && Object.keys(obj).length) possibleObj[key] = obj;
        }

        const returnObj = {
            possibleObj: possibleObj,
            AltKeyNeeded: AltKeyNeeded,
            fuzzyKey: fuzzyKey,
        }

        return returnObj;
    }
    private async tryToFindByOtherMeans(possibleObj: AllHermidata): Promise<Hermidata | null> {
        // Try to find by URL domain or substring
        const urlDomain = this.hermidata.url ? new URL(this.hermidata.url).hostname.replace(/^www\./, '') : "";
        const byUrl = Object.values(possibleObj).find(item => {
            try {
                const storedDomain = new URL(item.url || "").hostname.replace(/^www\./, '');
                return storedDomain === urlDomain;
            } catch { return false; }
        });
        if (byUrl) return byUrl;
    
        // Try to find same title + newest date
        const sameTitleMatches = Object.values(possibleObj).filter(item => {
            return TrimTitle.trimTitle(item.title, item.url).title.toLowerCase() === TrimTitle.trimTitle(this.hermidata.title, this.hermidata.url).title.toLowerCase();
        });
        if (sameTitleMatches.length) {
            sameTitleMatches.sort((a, b) => new Date(b.meta.updated).getDate() - new Date(a.meta.updated).getDate());
            return sameTitleMatches[0];
        }
         // Prefer the same type if exists
        const typeKey = returnHashedTitle(this.hermidata.title, this.hermidata.type);
        if (possibleObj[typeKey]) return possibleObj[typeKey];
    
        // Fallback: old V1 hash (title only)
        const fallbackKey = returnHashedTitle(this.hermidata.title, this.hermidata.type, this.hermidata.url);
        const fallbackObj = await getHermidataViaKey(fallbackKey);
        if (fallbackObj) return fallbackObj;
    
        // Nothing found
        return null;
    }
}

export async function detectAltTitleNeeded(title: string, type: NovelType, source: string, url: string, threshold = 0.85): Promise<AltCheck> {
    const data = await PastHermidata.getAllHermidata();
    if (!data) return { needAltTitle: false, reason: "No data loaded" };

    const normalizedTitle = TrimTitle.trimTitle(title, url).title;
    const titleOrAltMatch = findByTitleOrAltV2(normalizedTitle, data);

    // 1. Already exists by title or alt title → no alt title needed
    if (titleOrAltMatch) {
        return { 
            needAltTitle: false,
            reason: "Title or alt title already exists",
            existingKey: returnHashedTitle(titleOrAltMatch.title, type)
        };
    }

    // 2. Compute candidate similarities (same source/type only)
    const candidates = Object.entries(data)
        .filter(([, entry]) => entry.source !== source && entry.type === type);

    let bestMatch = null;
    let bestScore = 0;

    for (const [key, entry] of candidates) {
        const sim = CalcDiff(normalizedTitle, entry.title.toLowerCase());
        if (sim > bestScore) {
            bestScore = sim;
            bestMatch = { key, entry };
        }
    }

    // 3. Decide threshold
    if (bestScore >= threshold) {
        return {
            needAltTitle: true,
            reason: "Similar title detected",
            similarity: bestScore,
            relatedKey: bestMatch?.key ?? null,
            relatedTitle: bestMatch?.entry.title ?? null
        };
    }

    // 4. No similar title found
    return {
        needAltTitle: false,
        reason: "No close matches found"
    };
}

export function CalcDiff(a: string, b: string) {
    if (!a || !b) return 0;

    // Create a stable key for caching
    const key = a < b ? `${a}__${b}` : `${b}__${a}`;
    if (CalcDiffCache.has(key)) return CalcDiffCache.get(key);

    // Normalize text
    const clean = (str: string) => str.toLowerCase().replaceAll(/[^a-z0-9\s]/gi, '').trim();
    const A = clean(a), B = clean(b);

    if (A === B) {
        CalcDiffCache.set(key, 1);
        return 1;
    }

    const wordsA = A.split(/\s+/);
    const wordsB = B.split(/\s+/);

    const common = wordsA.filter(w => wordsB.includes(w)).length;
    const wordScore = common / Math.max(wordsA.length, wordsB.length);

    const charScore = 1 - levenshteinDistance(A, B) / Math.max(A.length, B.length);
    const score = (wordScore * 0.4) + (charScore * 0.6);

    CalcDiffCache.set(key, score);
    return score;
}

function levenshteinDistance(a: string, b: string) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;

    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost
            );
        }
    }

    return dp[m][n];
}