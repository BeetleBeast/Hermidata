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

/** Thrown by write() when ifMatch no longer matches: re-read, re-merge, write again. */
export class ConflictError extends Error {
    constructor(message = 'The remote changed since it was read', options?: ErrorOptions) {
        super(message, options);
        this.name = 'ConflictError';
    }
}