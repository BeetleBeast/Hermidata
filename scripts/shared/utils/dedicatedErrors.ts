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

/** Thrown by write() when the server returned an unexpected status code. */
export class WebDavError extends Error {
    readonly status: number;
    readonly kind: 'auth' | 'forbidden' | 'not-found' | 'server' | 'unexpected';

    constructor(status: number) {
        super(`WebDAV request failed with status ${status}`);
        this.name = 'WebDavError';
        this.status = status;
        this.kind = this.setStatusKind(status);
    }
    private setStatusKind(status: number): typeof this.kind {
        switch (status) {
            case 401: return 'auth';
            case 403: return 'forbidden';
            case 404: return 'not-found';
            case 500: return 'server';
            default: return 'unexpected';
        }
    }
}