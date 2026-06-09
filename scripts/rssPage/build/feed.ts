import { RSSPageBuilder } from "../build";

export abstract class feed extends RSSPageBuilder {

    protected readonly AllHermidataContainer: HTMLDivElement | null = document.querySelector('.entries');


    protected abstract reload(): void


    protected abstract build(): void


}