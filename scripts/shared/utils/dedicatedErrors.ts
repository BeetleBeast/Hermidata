export class NoPastFoundError extends Error {

    public readonly url: string

    constructor(url: string) {
        super('No earlier entry found for this page.');
        this.url = url
        this.name = 'NoPastFoundError';
    }
}

/** Several saved items match this page and none clearly wins: only the user can decide, so nothing is saved. */
export class AmbiguousItemError extends Error {

    public readonly url: string
    public readonly candidateCount: number

    constructor(url: string, candidateCount: number) {
        super('Several saved items match this page.');
        this.url = url
        this.candidateCount = candidateCount
        this.name = 'AmbiguousItemError';
    }
}

/** Only the title matches a saved item ( e.g. a site it was never saved from ): auto-save will not risk updating the wrong item. */
export class UnsureMatchError extends Error {

    public readonly url: string
    public readonly title: string

    constructor(url: string, title: string) {
        super('This page might not be the saved item.');
        this.url = url
        this.title = title
        this.name = 'UnsureMatchError';
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

/** A passphrase or recovery key that does not unlock the library. */
export class WrongSecretError extends Error {
    constructor(message = 'This does not unlock the library.', options?: ErrorOptions) {
        super(message, options);
        this.name = 'WrongSecretError';
    }
}

/** An encrypted snapshot that cannot be parsed or decrypted (damaged, tampered with, or a key mismatch). */
export class MalformedEnvelopeError extends Error {
    constructor(message = 'The encrypted library is damaged or cannot be read.', options?: ErrorOptions) {
        super(message, options);
        this.name = 'MalformedEnvelopeError';
    }
}
