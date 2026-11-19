import { openDB, type IDBPDatabase } from 'idb';
import type { KeyStore } from '../types';

// Unlocked library keys, per device. IndexedDB can hold a CryptoKey as is, so the key is stored non-extractable:
// scripts on this device can encrypt and decrypt with it, but nothing can read the key bytes back out, and the
// passphrase itself is never stored. The extension's pages and its background share this database.

const DB_NAME = 'hermidata-sync-keys';
const STORE = 'keys';

export class IdbKeyStore implements KeyStore {
    private db: Promise<IDBPDatabase> | null = null;

    private open(): Promise<IDBPDatabase> {
        this.db ??= openDB(DB_NAME, 1, {
            upgrade(db) { db.createObjectStore(STORE); },
        });
        return this.db;
    }

    async get(kid: string): Promise<CryptoKey | undefined> {
        return (await this.open()).get(STORE, kid);
    }

    async set(kid: string, key: CryptoKey): Promise<void> {
        await (await this.open()).put(STORE, key, kid);
    }

    async delete(kid: string): Promise<void> {
        await (await this.open()).delete(STORE, kid);
    }
}
