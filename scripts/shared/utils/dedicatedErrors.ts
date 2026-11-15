export class NoPastFoundError extends Error {

    public readonly url: string

    constructor(url: string) {
        super('No earlier entry found for this page.');
        this.url = url
        this.name = 'NoPastFoundError';
    }
}

export class SaveFailedError extends Error {
    constructor(message = 'Could not save chapter progress.', options?: ErrorOptions) {
        super(message, options);
        this.name = 'SaveFailedError';
    }
}