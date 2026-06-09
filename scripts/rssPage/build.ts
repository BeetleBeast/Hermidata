export abstract class RSSPageBuilder {

    protected abstract build(): void;

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