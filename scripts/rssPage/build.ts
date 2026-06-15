import { PastHermidata } from "../popup/core/Past";
import type { Hermidata, Settings } from "../shared/types";
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
        const editEntry = this.AllHermidata![id];
        new Detail(editEntry).open();
    }

    public abstract build(): Promise<void>;

    protected abstract reload(): void;
}