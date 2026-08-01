import type { Hermidata, Settings } from "../../shared/types";
import { RSSPageBuilder } from "../build";

export class HermidataMerge extends RSSPageBuilder {

    private get getText(): HTMLParagraphElement | null {
        return document.querySelector<HTMLParagraphElement>('#merger-dialog-text');
    }

    

    private get getAllItemWithSelectedCheckboxes(): NodeListOf<HTMLDivElement> | null {
        return document.querySelectorAll<HTMLDivElement>('.hermidata-item:has(.hermidata-item-checkbox:checked)');
    }
    private get getAllCheckboxes(): NodeListOf<HTMLInputElement> | null {
        return document.querySelectorAll<HTMLInputElement>('.hermidata-item-checkbox');
    }



    public build(): void {

        this.eventListener();
        
        this.checkProgress();


    }
    protected reload(): void {
        throw new Error("Method not implemented.");
    }

    constructor(AllHermidata: Record<string, Hermidata>, settings: Settings) {
        super(AllHermidata, settings)
    }

    private eventListener(): void {
        this.getAllCheckboxes?.forEach(checkbox => {
            checkbox.addEventListener('change', () => this.checkProgress())
        })
    }
    private checkProgress(): void {
        const amountOfSelectedItems = this.getAllItemWithSelectedCheckboxes?.length;

        if (amountOfSelectedItems === 2) this.buildMerger();
        else if (amountOfSelectedItems && amountOfSelectedItems > 2) {
            console.log('too many selected');
            if (this.getText) this.getText.textContent = 'too many selected';
        } else if (amountOfSelectedItems === 1) {
            console.log('only one selected');
            if (this.getText) this.getText.textContent = 'only one selected';
        }
    }

    private buildMerger(): void {
        console.log(this.getAllItemWithSelectedCheckboxes, "getAllItemWithSelectedCheckboxes");
        throw new Error("Method not implemented.");
    }



}