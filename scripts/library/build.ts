import { PastHermidata } from "../popup/core/Past";
import type { Hermidata, Settings } from "../shared/types";
import { HermidataModel } from "../shared/utils/HermidataSelector";

export abstract class RSSPageBuilder {

    protected AllHermidata: Record<string, Hermidata>;

    protected settings: Settings;

    constructor(AllHermidata: Record<string, Hermidata>, settings: Settings) {
        this.settings = settings;
        this.AllHermidata = AllHermidata;
    }


    protected async init(): Promise<void> {
        this.AllHermidata = await PastHermidata.getAllHermidata();
        
    }

    public abstract build(): void;

    protected abstract reload(): void;


    protected async dbRequest<T>(store: string, operation: string, payload?: { id: string, data: any}): Promise<T> {
        try {
            return new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({ type: 'DB_OPERATION', store, operation, payload }, async (response: { success: boolean, error?: string, result?: any }) => {
                    if (!response) reject(new Error('No response from background script'));
                    if (!response?.success) reject(new Error(response.error));
                    resolve(await response.result as T);
                });
            });
        } catch (error) {
            console.error(error);
            throw error;
        }
    }
    protected GetHashItem(item: HTMLElement): string {
        const newVersion = item.dataset.id;
        if(!newVersion) throw new Error('hash not found');

        return newVersion;
    }
    protected setToFrenchDate(date: Date | string | number): string {
        return new Date(date).toLocaleDateString('fr-FR');
    }
    protected frenchDateToISO(value: string): string {
        const match = value.trim().match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
        if (!match) return '';

        const [, day, month, year] = match;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    protected isoDateToFrench(value: string): string {
        const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return '';

        const [, year, month, day] = match;
        return `${day}/${month}/${year}`;
    }
    protected getTimeAgo(date: string): string {
        
        const unixTime = new Date(date).getTime();
        const today = new Date().getTime();

        const hours = Math.floor((today - unixTime) / 1000 / 60 / 60);
        const isHoursAgo = hours < 24;
        const days = Math.floor((today - unixTime) / 1000 / 60 / 60 / 24);
        const isDaysAgo = days < 7;
        const weeks = Math.floor((today - unixTime) / 1000 / 60 / 60 / 24 / 7);
        const isWeeksAgo = weeks < 4;
        const months = Math.floor((today - unixTime) / 1000 / 60 / 60 / 24 / 7 / 4);
        const isMonthsAgo = months < 12;
        const years = Math.floor((today - unixTime) / 1000 / 60 / 60 / 24 / 7 / 4 / 12);
        const isYearsAgo = years < 5;
        const decades = Math.floor((today - unixTime) / 1000 / 60 / 60 / 24 / 7 / 4 / 12 / 5);
        const isDecadesAgo = decades < 10;
        const centuries = Math.floor((today - unixTime) / 1000 / 60 / 60 / 24 / 7 / 4 / 12 / 5 / 10);
        const isCenturiesAgo = centuries < 100;

        let time: string;

        if (isHoursAgo) time = `${hours}h ago`;
        else if (isDaysAgo) time = `${days}d ago`;
        else if (isWeeksAgo) time = `${weeks}w ago`;
        else if (isMonthsAgo) time = `${months} month${months > 1 ? 's' : ''} ago`;
        else if (isYearsAgo) time = `${years}y ago`;
        else if (isDecadesAgo) time = `${decades}d ago`;
        else if (isCenturiesAgo) time = `${centuries}c ago`;
        else time = this.setToFrenchDate(unixTime);

        return time;
    }
    protected calculateImageRatio(imgElement: HTMLImageElement) {
        const ratio = imgElement.naturalWidth / imgElement.naturalHeight;
        const targetRatio = 500 / 600;
        const tolerance = 0.3;
        imgElement.style.objectFit = Math.abs(ratio - targetRatio) < tolerance ? 'scale-down' : 'cover';
    }
}


export class PageDetailBuilder {

    static hermidata: HermidataModel;

    /** NOTE: when using make sure there is a local hermidata used */
    static handleMarkerClick = (event: MouseEvent) => {
        // FIXME: this doesn't work
        const marker = (event.target as HTMLElement).closest<HTMLElement>('.hermidata-marker-container');
        if (!marker) return;

        const markerId = marker.dataset.id;
        if (!markerId) return;
        
        const url = this.hermidata.chapter.bookmarks[markerId].url;

        this.hermidata.jumpToUrl(url);
    };
}