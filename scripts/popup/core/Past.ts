import { logConsoleError } from "../../shared/utils/ErrorMessage";
import { getAllHermidata, getHermidataViaKey, getSettings } from "../../shared/db/Storage";
import { TrimTitle, findAllByTitleOrAlt, findByTitleOrAlt, generateHermidataHash } from "../../shared/utils/StringOutput";
import type { Hermidata, AllHermidata, AltCheck, AnyNovelType, ItemResolution } from "../../shared/types/index";
import { customConfirm } from "../frontend/confirm";
import { appendAltTitle } from "./save";
import { resolveItem } from "./ItemResolver";
import type { HermidataModel } from "../../shared/utils/HermidataSelector";

export type PastHermidataPromptOptions = {
    confirm?: (message: string) => Promise<boolean>;
}

// --- cache ---
const CalcDiffCache = new Map();
let AllHermidataCache: AllHermidata | null = null;


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

    /** How the last lookup matched same-titled items; null when no same-titled item exists */
    public resolution: ItemResolution | null = null;

    private readonly hermidata: HermidataModel;
    private readonly confirmPrompt: (message: string) => Promise<boolean>;
    private chosen: Hermidata | null = null;

    constructor(hermidata: HermidataModel, prompts: PastHermidataPromptOptions = {}) {
        this.hermidata = hermidata;
        this.confirmPrompt = prompts.confirm ?? customConfirm;
    }

    public async init(): Promise<Hermidata | null> {
        this.pastHermidata = this.chosen ?? await this.getPastHermidata();
        return this.pastHermidata;
    }
    /** The user settled an ambiguous match; the next init() returns this item */
    public choose(item: Hermidata): void {
        this.chosen = item;
    }
    public get isAmbiguous(): boolean {
        return this.resolution?.kind === 'ambiguous';
    }
    /** The matched item has a marker on this very series page: this page is that item, not a separate work */
    public get isExactMatch(): boolean {
        if (this.resolution?.kind !== 'match') return false;
        const matched = this.resolution.item;
        return this.resolution.candidates.some(candidate => candidate.item.id === matched.id && candidate.exactUrl);
    }
    public async checkForDuplicates(): Promise<Hermidata | false> {
        // get all Hermidata
        const AllHermidata = await PastHermidata.getAllHermidata();
        // update Cache
        if (AllHermidataCache && Object.keys(AllHermidataCache).length != Object.keys(AllHermidata).length) {
            AllHermidataCache = AllHermidata
        }

        // find title from alt ( includes main title and alt title )
        const potentialTrueTitle = this.getTitleFromAlt(AllHermidata) || '';

        // find title from fuzzy search
        const { possibleObj, AltKeyNeeded, fuzzyKey } = await this.getTitleFromFuzzy(potentialTrueTitle);

        // add alt title to Object
        if (AltKeyNeeded?.needAltTitle && fuzzyKey && possibleObj[fuzzyKey]) {
            const confirmation = await this.confirmPrompt(`${AltKeyNeeded.reason}\nAdd "${this.hermidata.title}" as an alt title for "${possibleObj[fuzzyKey].title}"?`);
            if (confirmation) await appendAltTitle(this.hermidata.title, possibleObj[fuzzyKey]);
        }

        // 0 or 1 result -> nothing to disambiguate
        const candidates = this.collectCandidates(possibleObj, AllHermidata, potentialTrueTitle);
        if (candidates.length <= 1) return false;

        // more than 1 result -> only a clear winner counts, an ambiguous one is never merged
        const resolution = this.resolve(candidates);
        return resolution.kind === 'match' ? resolution.item : false;
    }


    private async getPastHermidata(): Promise<Hermidata | null> {
        // objective => find if the Hermidata already exists in the browser storage

        // get all Hermidata
        const AllHermidata = await PastHermidata.getAllHermidata();
        // update Cache
        if (AllHermidataCache && Object.keys(AllHermidataCache).length != Object.keys(AllHermidata).length || !AllHermidataCache) {
            AllHermidataCache = AllHermidata
        }

        // find title from alt ( includes main title and alt title )
        const potentialTrueTitle = this.getTitleFromAlt(AllHermidata) || '';

        // find title from fuzzy search
        const { possibleObj, AltKeyNeeded, fuzzyKey } = await this.getTitleFromFuzzy(potentialTrueTitle);

        // early returns

        // add alt title to Object
        if (AltKeyNeeded?.needAltTitle && fuzzyKey && possibleObj[fuzzyKey]) {
            const confirmation = await this.confirmPrompt(`${AltKeyNeeded.reason}\nAdd "${this.hermidata.title}" as an alt title for "${possibleObj[fuzzyKey].title}"?`);
            if (confirmation) await appendAltTitle(this.hermidata.title, possibleObj[fuzzyKey]);
        }

        // 1 or more results -> let the resolver pick; an ambiguous result is left for the user ( null )
        const candidates = this.collectCandidates(possibleObj, AllHermidata, potentialTrueTitle);
        this.resolution = candidates.length > 0 ? this.resolve(candidates) : null;
        if (this.resolution) return this.resolution.kind === 'match' ? this.resolution.item : null;

        const key: string = generateHermidataHash(this.hermidata.title, this.hermidata.novelType, this.hermidata.GetUrl());

        return getHermidataViaKey(key).catch(error => {
            logConsoleError('Extension error: Failed Premise getHermidata: ',error);
            console.log('Key',key,'\n', '\n','this.hermidata', this.hermidata);
            return null;
        })
    }
    private getTitleFromAlt(allHermidata: AllHermidata): string | undefined {

        const possibleTitleV2 = this.hermidata.meta.notes.replace('Chapter Title: ', '');

        const TrueTitle = findByTitleOrAlt(this.hermidata.title, allHermidata)?.title ?? findByTitleOrAlt(possibleTitleV2, allHermidata)?.title;
        if (!TrueTitle) this.hermidata.meta.notes = '';
        return TrueTitle
    }
    private async getTitleFromFuzzy(trueTitle: string): Promise<{ possibleObj: AllHermidata, AltKeyNeeded: { needAltTitle: boolean, reason: string }, fuzzyKey: string | null | undefined  }> {
        const AltKeyNeeded = await detectAltTitleNeeded(this.hermidata.title, this.hermidata.novelType, this.hermidata.source, this.hermidata.GetUrl());
        const settings = await getSettings();
        
        const fuzzyKey = AltKeyNeeded?.relatedKey;
        // Generate all possible keys
        const possibleKeys = settings.ContentTypesAndStatuses.TYPE_OPTIONS.map(type => generateHermidataHash(trueTitle, type, this.hermidata.GetUrl(), false));
        // add fuzzy key if not inside possible keys
        if (fuzzyKey && !possibleKeys.includes(fuzzyKey)) possibleKeys.push(fuzzyKey);
        // get all possible hermidata Obj
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
    /**
     * Every saved item that could be the current page: the per-type hash hits ( + fuzzy hit )
     * and every item sharing the title, so items not stored under the hash of their title are found too
     */
    private collectCandidates(possibleObj: AllHermidata, allHermidata: AllHermidata, trueTitle: string): Hermidata[] {
        const byTitle = trueTitle ? findAllByTitleOrAlt(trueTitle, allHermidata) : [];
        const unique = new Map<string, Hermidata>();
        for (const item of [...Object.values(possibleObj), ...byTitle]) unique.set(item.id, item);
        return [...unique.values()];
    }
    private resolve(candidates: Hermidata[]): ItemResolution {
        return resolveItem({ title: this.hermidata.title, url: this.hermidata.GetUrl() }, candidates);
    }
}

export async function detectAltTitleNeeded(title: string, type: AnyNovelType, source: string, url: string, threshold = 0.85): Promise<AltCheck> {
    const data = await PastHermidata.getAllHermidata();
    if (!data) return { needAltTitle: false, reason: "No data loaded" };

    const normalizedTitle = TrimTitle.trimTitle(title, url).title;
    const titleOrAltMatch = findByTitleOrAlt(normalizedTitle, data);

    // 1. Already exists by title or alt title → no alt title needed
    if (titleOrAltMatch) {
        return { 
            needAltTitle: false,
            reason: "Title or alt title already exists",
            existingKey: generateHermidataHash(titleOrAltMatch.title, type)
        };
    }

    // 2. Compute candidate similarities (same source/type only)
    const candidates = Object.entries(data)
        .filter(([, entry]) => entry.source !== source && entry.novelType === type);

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

export function CalcDiff(a: string, b: string): number {
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

export function levenshteinDistance(a: string, b: string) {
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