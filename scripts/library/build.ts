import { PastHermidata } from "../popup/core/Past";
import type { Hermidata, Settings } from "../shared/types";
import { HermidataModel } from "../shared/utils/HermidataSelector";
import { Detail } from "./build/detail";

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

    protected openDetails(id: string): void {
        const editEntry = new HermidataModel(this.AllHermidata![id]);
        new Detail(editEntry).open();
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
}