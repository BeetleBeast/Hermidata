import type { RemoteBlob, SyncBackend, WriteResult } from "../types";

/**
 * The "backend" of a device that does not sync: nothing is ever published and nothing is ever read.
 * The engine recognises it and never starts a pull or a push, so write() is not expected to run.
 */
export class LocalBackend implements SyncBackend {
    readonly capabilities = { conditionalWrite: false, canWatch: false };

    async read(): Promise<RemoteBlob | 'unchanged' | 'incomplete' | null> {
        return null;
    }

    async write(): Promise<WriteResult> {
        throw new Error('This device is local only: nothing is published.');
    }
}
