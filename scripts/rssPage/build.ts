import { PastHermidata } from "../popup/core/Past";
import type { Hermidata, Settings } from "../shared/types";
import { Detail } from "./build/detail";

export abstract class RSSPageBuilder {

    protected AllHermidata: Record<string, Hermidata> | null = null;

    protected settings: Settings | null = null;

    protected async init(): Promise<void> {
        this.AllHermidata = await PastHermidata.getAllHermidata();
        
    }

    protected openDetails(id: string): void {
        const editEntry = this.AllHermidata![id];
        new Detail(editEntry).open();
    }

    protected abstract reload(): void;

    protected editHermidata(): void {
        throw new Error("Method not implemented.");
    }
    protected deleteHermidata(): void {
        throw new Error("Method not implemented.");
    }
    protected addHermidata(): void {
        throw new Error("Method not implemented.");
    }
    protected openSettings(): void {
        throw new Error("Method not implemented.");
    }
}