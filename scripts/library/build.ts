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

    protected readonly locale: string = navigator.language; // e.g. "fr-FR", "en-US", "ja-JP"

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
    protected isoToLocal(rawDate: string, locale?: string): string {
        const isoDate = rawDate.includes('T') ? rawDate : rawDate + 'T00:00:00';
        if (isoDate.includes('/')) {
            console.trace('slash found');
            const isoDateWithoutSlash = isoDate.replaceAll('/', '-');
            const list = isoDateWithoutSlash.split('T')[0].split('-').map(String);
            // reverse order
            list.reverse();
            // if second or third is only 1 char long, pad with 0
            list[1] = String(list[1]).padStart(2, '0');
            list[2] = String(list[2]).padStart(2, '0');
            // stich back

            const trueIsoDate = list.join('-') + 'T' + isoDateWithoutSlash.split('T')[1];
            const d = new Date(trueIsoDate); // avoid TZ shift
            return new Intl.DateTimeFormat(locale ?? this.locale).format(d);
        }
        const d = new Date(isoDate); // avoid TZ shift
        return new Intl.DateTimeFormat(locale ?? this.locale).format(d);
    }
    private getDateOrder(locale?: string): (keyof Intl.DateTimeFormatPartTypesRegistry)[] {
        const parts = new Intl.DateTimeFormat(locale ?? this.locale).formatToParts(new Date(2026, 0, 2)); 
        const result = parts
            .filter(p => ["day", "month", "year"].includes(p.type))
            .map(p => p.type);
        return result
    }
    protected localToISO(str: string, locale?: string, withTime = true): string {
        const order = this.getDateOrder(locale ?? this.locale);
        const separators = /[\/\-\.]/;
        const values = str.split(separators).map(Number);
        const map: Partial<Intl.DateTimeFormatPartTypesRegistry> = {};

        order.forEach((field, i) => map[field] = values[i]);
        
        const yyyy = String(map.year).padStart(4, '0');
        const mm = String(map.month).padStart(2, '0');
        const dd = String(map.day).padStart(2, '0');

        const date = `${yyyy}-${mm}-${dd}`;

        if(!withTime) return date;
        else return `${date}T00:00:00`;
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
        else time = this.isoToLocal(new Date(unixTime).toISOString());

        return time;
    }
    protected calculateImageRatio(imgElement: HTMLImageElement) {
        const ratio = imgElement.naturalWidth / imgElement.naturalHeight;
        const usedRation = 250 / 350;
        const tolerance = 0.3;
        const isWithinMargin = Math.abs(ratio - usedRation) < tolerance;

        // if the ratio is NaN
        if (isNaN(ratio)) {
            imgElement.style.objectFit = 'scale-down';
            console.warn('ratio is NaN');
            return;
        }

        // if ration is 1:1 or default image
        if (ratio === 1 || imgElement.src.endsWith('icon48.png')) {
            imgElement.style.objectFit = 'scale-down';
            return;
        }

        // is fill mode when image is within margin or just outside
        imgElement.style.objectFit = isWithinMargin ? 'fill' : 'cover';


        // if ration is *much* bigger than the allowed tolerance
        /*
        if (!isWithinMargin && Math.abs(ratio - usedRation) > 1) {
            imgElement.style.objectFit = 'cover';
            return;
        }
        */
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

export class dbAcsess {

    public getSettings(): Promise<Settings> {
        return this.dbRequest<Settings>('settings', 'get', { id: 'Settings', data: null });
    }
    public setSettings(data: Settings): Promise<void> {
        return this.dbRequest<void>('settings', 'put', { id: 'Settings', data });
    }
    public setHermidata(data: Hermidata): Promise<void> {
        return this.dbRequest<void>('hermidata', 'update', { id: data.id, data });
    }
    public async getAllHermidata(): Promise<Record<string, Hermidata>> {
        const existingDataList = await this.dbRequest<Hermidata[]>('hermidata', 'getAll');
        const existingData = Object.fromEntries(existingDataList.map(h => [h.id, h]));

        return existingData;
    }

    public dbRequest<T>(store: string, operation: string, payload?: { id: string, data: any}): Promise<T> {
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
}

