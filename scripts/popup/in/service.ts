import type { CurrentTab, Settings, OnlyPlainHermidata } from "../../shared/types";

import { ext } from "../../shared/utils/BrowserCompat";
import { HermidataModel } from "../../shared/utils/HermidataSelector";
import { getChapterFromTitle } from "../../shared/utils/StringOutput";

import { getPagePosition, updateChapterProgress } from "../core/save";
import { PastHermidata, type PastHermidataPromptOptions } from "../core/Past";


type SaveTargetOptions = {
    allowedSendSHeet: boolean;
    allowedSendBookmark: boolean;
}

type SaveTargetExecutor = ( data: OnlyPlainHermidata, args: SaveTargetOptions ) => Promise<boolean | { success: false; errors: string[] }>;

const sendSaveMessage: SaveTargetExecutor = async (data, args) => 
    await ext.runtime.sendMessage({ type: "SAVE_NOVEL", data, args }) as boolean | { success: false; errors: string[] };

export class HermidataService {

    private hermidata: HermidataModel | null = null;
    private readonly settings: Settings;
    private readonly executeSaveTargets: SaveTargetExecutor;
    private readonly pastPrompts?: PastHermidataPromptOptions;


    constructor(settings: Settings, executeSaveTargets: SaveTargetExecutor = sendSaveMessage, pastPrompts?: PastHermidataPromptOptions ) {
        this.settings = settings;
        this.executeSaveTargets = executeSaveTargets;
        this.pastPrompts = pastPrompts;
    }

    public async saveHermidata(hermidata: HermidataModel): Promise<boolean> {
        this.hermidata = hermidata;

        // update hermidata with latest values
        await this.updateHermidata();


        const allowedSendSHeet = this.settings.ExtensionBehaviour.SaveTarget.GoogleSpreadsheet;
        const allowedSendBookmark = this.settings.ExtensionBehaviour.SaveTarget.BrowserBookmark;

        const savedInStorage = await updateChapterProgress(this.hermidata, this.pastPrompts);
        const saved = await this.saveBookmarkOrAndSheet({allowedSendBookmark, allowedSendSHeet});

        return savedInStorage && saved;

    }

    public async saveCurrentTab(tab: Pick<CurrentTab, "pageTitle" | "url">): Promise<HermidataModel> {
        const defaults = this.settings.DefaultBookmarkSettings.DefaultChoice;
        const candidate = HermidataModel.from(defaults.novelType, defaults.readStatus, defaults.novelStatus);
        candidate.SetFromTab({
            ...tab,
            currentChapter: getChapterFromTitle(tab.pageTitle, tab.url) || 0
        });

        const past = new PastHermidata(candidate, this.pastPrompts);
        await candidate.SetPast(past);

        const saved = await this.saveHermidata(candidate);
        if (!saved) throw new Error("Could not save chapter progress.");
        return candidate;
    }

    private async updateHermidata(): Promise<void> {
        this.updateHermidataChapterHistory();
        this.updateHermidataSources();
        await this.setScrollPosition();
    }
    private updateHermidataSources() {
        if (!this.hermidata) return
        const url = this.hermidata.GetUrl();
        if (!url) return
        const currentUrlSource = new URL(url).hostname.replace(/^www\./, "");
        const savedUrlSource = new URL(this.hermidata.GetUrl()).hostname.replace(/^www\./, "");
        const possibleRSSSource = this.hermidata.GetLatestRssFeed()?.domain;
        const altSources = this.hermidata.meta.altSources;

        // check if url is already in sources
        if (!altSources.includes(currentUrlSource)) this.hermidata.meta.altSources.push(currentUrlSource);
        // check if RSS source is different / isn't saved in alt sources
        if (possibleRSSSource && !altSources.includes(possibleRSSSource)) this.hermidata.meta.altSources.push(possibleRSSSource);
        // check if current url source is different from saved url source
        // NOTE: hermidata.source is the latest source used NOT the first used
        // NOTE: first used is the first item in altSources
        if (currentUrlSource !== savedUrlSource) this.hermidata.source = currentUrlSource;

        if (this.hermidata.source.trim() === undefined || this.hermidata.source === '') this.hermidata.source = currentUrlSource;

        // remove duplicates & empty entries
        this.hermidata.meta.altSources = Array.from( new Set(this.hermidata.meta.altSources) ).filter(Boolean);
    }
    private updateHermidataChapterHistory() {
        if (!this.hermidata) return
        // if history is undefined
        if (this.hermidata.GetHistory() === undefined) this.hermidata.SetHistory([]);
        // max 20 entries in history
        if (this.hermidata.GetHistory()?.length >= 20) this.hermidata.ShiftHistory();

        this.hermidata.PushHistory(this.hermidata.GetChapter(), new Date().toISOString());
        // only unique entries in history
        this.hermidata.SetHistory(Array.from( new Set(this.hermidata.GetHistory())));
    }
    private async saveBookmarkOrAndSheet(allowed: {allowedSendBookmark: boolean, allowedSendSHeet: boolean }): Promise<boolean> {
        if (!this.hermidata) throw new Error("Hermidata not initialized.");
        const saved = await this.executeSaveTargets(this.hermidata.toJSON(), {
            allowedSendSHeet: allowed.allowedSendSHeet,
            allowedSendBookmark: allowed.allowedSendBookmark
        });
        if (saved === true) return true;

        const errors = typeof saved === 'object' && saved !== null ? saved.errors : [];
        throw new Error(errors.length ? errors.join('\n') : "Could not save to the selected targets.");
    }
    private async setScrollPosition() {
        if (!this.hermidata) throw new Error("Hermidata not initialized.");
        const scrollPositionObject = await getPagePosition();
        const scrollPosition = scrollPositionObject?.[0]?.result;
        this.hermidata.SetScrollPosition(scrollPosition ?? 0);
    }
}