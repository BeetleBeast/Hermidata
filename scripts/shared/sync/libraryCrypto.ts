import type { EnvelopeHeader, PassphraseSlot, RecoverySlot } from "../types";
import { MalformedEnvelopeError, WrongSecretError } from "../utils/dedicatedErrors";

// Optional end-to-end encryption of the synced snapshot (WebCrypto only, no dependencies).
//
// - one random AES-256-GCM data key encrypts the snapshot; a fresh IV on every write
// - the data key is wrapped once with a key derived from the passphrase (PBKDF2-SHA256) and once per recovery key
//   (HKDF-SHA256; recovery keys are random, so they need no slow derivation); the wraps travel in the header
// - the header is the AES-GCM additional data, so a swapped or edited header fails to decrypt
// - changing the passphrase or the recovery keys only rewraps the data key: devices that hold it keep working

// ---------------------------------------------------------------- constants

export const ENVELOPE_PREFIX = 'HMENC1.';   // never valid base64, so it cannot be mistaken for a plain snapshot
export const RECOVERY_KEY_COUNT = 5;
export const DEFAULT_PBKDF2_ITERATIONS = 600_000;
export const MIN_PASSPHRASE_LENGTH = 10;

const MIN_ITERATIONS = 1_000;               // low values only exist in tests; the UI always uses the default
const MAX_ITERATIONS = 10_000_000;          // a hostile header must not be able to hang the unlock
const RECOVERY_KEY_CHARS = 32;              // 32 base32 characters = 160 random bits
const RECOVERY_INFO = 'hermidata-recovery-v1';
const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   // Crockford: no I, L, O, U

const enc = new TextEncoder();
const subtle = () => globalThis.crypto.subtle;

// ------------------------------------------------------------ byte helpers

/** WebCrypto wants ArrayBuffer-backed views; this also copies out of any shared buffer. */
const bytes = (view: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(view);

function toB64(data: Uint8Array): string {
    let bin = '';
    for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode(...data.subarray(i, i + 0x8000));
    return btoa(bin);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

const toB64url = (text: string) => toB64(enc.encode(text)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (b64url: string) =>
    new TextDecoder().decode(fromB64(b64url.replace(/-/g, '+').replace(/_/g, '/')));

const randomBytes = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const randomId = () => toB64(randomBytes(9)).replace(/\+/g, '-').replace(/\//g, '_');

// ----------------------------------------------------------- recovery keys

function base32(data: Uint8Array): string {
    let out = '', buffer = 0, bits = 0;
    for (const byte of data) {
        buffer = (buffer << 8) | byte;
        bits += 8;
        while (bits >= 5) { out += BASE32[(buffer >>> (bits - 5)) & 31]; bits -= 5; }
    }
    if (bits > 0) out += BASE32[(buffer << (5 - bits)) & 31];
    return out;
}

/** XXXX-XXXX-… for reading aloud and writing down. */
export const formatRecoveryKey = (key: string) => key.match(/.{1,4}/g)!.join('-');

/** Accepts what people actually type: any case, spaces or dashes, O for 0 and I or L for 1. Null if it cannot be one. */
export function normalizeRecoveryKey(input: string): string | null {
    const key = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
    return key.length === RECOVERY_KEY_CHARS && [...key].every(c => BASE32.includes(c)) ? key : null;
}

function newRecoveryKey(): string {
    return base32(randomBytes(20)).slice(0, RECOVERY_KEY_CHARS);
}

// -------------------------------------------------------------- key wrapping

async function passphraseKek(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
    const base = await subtle().importKey('raw', enc.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt: bytes(salt), iterations },
        base, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey'],
    );
}

async function recoveryKek(recoveryKey: string, salt: Uint8Array): Promise<CryptoKey> {
    const base = await subtle().importKey('raw', enc.encode(recoveryKey), 'HKDF', false, ['deriveKey']);
    return subtle().deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: bytes(salt), info: enc.encode(RECOVERY_INFO) },
        base, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey'],
    );
}

/** Wraps bound to the key id, so a slot cannot be moved into another header. */
async function wrap(dek: CryptoKey, kek: CryptoKey, kid: string): Promise<{ iv: string; wrapped: string }> {
    const iv = randomBytes(12);
    const wrapped = await subtle().wrapKey('raw', dek, kek, { name: 'AES-GCM', iv, additionalData: enc.encode(kid) });
    return { iv: toB64(iv), wrapped: toB64(new Uint8Array(wrapped)) };
}

async function unwrap(slot: { iv: string; wrapped: string }, kek: CryptoKey, kid: string, extractable: boolean): Promise<CryptoKey> {
    return subtle().unwrapKey(
        'raw', fromB64(slot.wrapped), kek,
        { name: 'AES-GCM', iv: fromB64(slot.iv), additionalData: enc.encode(kid) },
        { name: 'AES-GCM' }, extractable, ['encrypt', 'decrypt'],
    );
}

async function passphraseSlot(dek: CryptoKey, kid: string, passphrase: string, iterations: number): Promise<PassphraseSlot> {
    const salt = randomBytes(16);
    return { salt: toB64(salt), iter: iterations, ...await wrap(dek, await passphraseKek(passphrase, salt, iterations), kid) };
}

async function recoverySlots(dek: CryptoKey, kid: string, count: number): Promise<{ slots: RecoverySlot[]; keys: string[] }> {
    const slots: RecoverySlot[] = [];
    const keys: string[] = [];
    for (let i = 0; i < count; i++) {
        const key = newRecoveryKey();
        const salt = randomBytes(16);
        slots.push({ id: randomId(), salt: toB64(salt), ...await wrap(dek, await recoveryKek(key, salt), kid) });
        keys.push(formatRecoveryKey(key));
    }
    return { slots, keys };
}

/** A copy of the data key that can encrypt and decrypt but can never be exported again. What devices store. */
export async function toStorableKey(dek: CryptoKey): Promise<CryptoKey> {
    const raw = await subtle().exportKey('raw', dek);
    return subtle().importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function checkPassphrase(passphrase: string): void {
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
        throw new Error(`The passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters long.`);
    }
}

// ------------------------------------------------------------ public: setup

export type NewEncryption = {
    header: EnvelopeHeader;
    /** Non-extractable: store it in the device's key store. */
    key: CryptoKey;
    /** Formatted for display. Shown once; only their wrapped data key is kept. */
    recoveryKeys: string[];
};

/** A new data key, its header, and RECOVERY_KEY_COUNT recovery keys. */
export async function createEncryption(passphrase: string, opts: { iterations?: number } = {}): Promise<NewEncryption> {
    checkPassphrase(passphrase);
    const dek = await subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']) as CryptoKey;
    const kid = randomId();
    const pass = await passphraseSlot(dek, kid, passphrase, opts.iterations ?? DEFAULT_PBKDF2_ITERATIONS);
    const { slots, keys } = await recoverySlots(dek, kid, RECOVERY_KEY_COUNT);

    return { header: { v: 1, kid, rev: randomId(), pass, recovery: slots }, key: await toStorableKey(dek), recoveryKeys: keys };
}

export type Rewrap = {
    /** A new passphrase. Devices that already hold the data key keep working. */
    passphrase?: string;
    /** Replace every recovery key with RECOVERY_KEY_COUNT new ones (the old ones stop working). */
    newRecoveryKeys?: boolean;
    /** The recovery key that was just used: it only works once. */
    dropRecoveryId?: string;
};

/** A new header for the same data key. `dek` must be extractable (from an unlock with extractable = true). */
export async function rewrapHeader(header: EnvelopeHeader, dek: CryptoKey, change: Rewrap): Promise<{ header: EnvelopeHeader; recoveryKeys?: string[] }> {
    if (change.passphrase !== undefined) checkPassphrase(change.passphrase);
    const pass = change.passphrase !== undefined
        ? await passphraseSlot(dek, header.kid, change.passphrase, header.pass.iter)
        : header.pass;

    let recovery = header.recovery.filter(s => s.id !== change.dropRecoveryId);
    let recoveryKeys: string[] | undefined;
    if (change.newRecoveryKeys) ({ slots: recovery, keys: recoveryKeys } = await recoverySlots(dek, header.kid, RECOVERY_KEY_COUNT));

    return { header: { ...header, rev: randomId(), pass, recovery }, recoveryKeys };
}

// ----------------------------------------------------------- public: unlock

/** The data key, if the passphrase is right. Extractable only for rewrapping; store the non-extractable one. */
export async function unlockWithPassphrase(header: EnvelopeHeader, passphrase: string, extractable = false): Promise<CryptoKey> {
    const { iter } = header.pass;
    if (!Number.isInteger(iter) || iter < MIN_ITERATIONS || iter > MAX_ITERATIONS) {
        throw new MalformedEnvelopeError('The encrypted library uses unsupported settings.');
    }
    const kek = await passphraseKek(passphrase, fromB64(header.pass.salt), iter);
    try {
        return await unwrap(header.pass, kek, header.kid, extractable);
    } catch (err) {
        throw new WrongSecretError('The passphrase is not correct.', { cause: err });
    }
}

/** The data key and the slot that opened it, if the recovery key is one of this library's. */
export async function unlockWithRecoveryKey(header: EnvelopeHeader, input: string, extractable = false): Promise<{ key: CryptoKey; slotId: string }> {
    const recoveryKey = normalizeRecoveryKey(input);
    if (!recoveryKey) throw new WrongSecretError('This is not a recovery key. It has 32 letters and digits.');

    for (const slot of header.recovery) {
        try {
            const key = await unwrap(slot, await recoveryKek(recoveryKey, fromB64(slot.salt)), header.kid, extractable);
            return { key, slotId: slot.id };
        } catch {
            // not this slot
        }
    }
    throw new WrongSecretError('This recovery key does not unlock this library, or it was already used.');
}

// --------------------------------------------------------- public: envelope

export const isEnvelope = (data: string): boolean => data.startsWith(ENVELOPE_PREFIX);

/** Identifies a header version: equal means the snapshot would be sealed the same way. Null for plain. */
export const headerRev = (header: EnvelopeHeader | null | undefined): string | null =>
    header ? `${header.kid}:${header.rev}` : null;

function isHeader(h: unknown): h is EnvelopeHeader {
    const x = h as EnvelopeHeader | null;
    const slot = (s: unknown) => !!s && typeof (s as RecoverySlot).iv === 'string' && typeof (s as RecoverySlot).wrapped === 'string'
        && typeof (s as RecoverySlot).salt === 'string';
    return !!x && x.v === 1 && typeof x.kid === 'string' && typeof x.rev === 'string'
        && slot(x.pass) && typeof x.pass.iter === 'number'
        && Array.isArray(x.recovery) && x.recovery.every(s => slot(s) && typeof s.id === 'string');
}

/** Throws MalformedEnvelopeError unless this is a well-formed header (e.g. one sent by the settings page). */
export function assertHeader(header: unknown): asserts header is EnvelopeHeader {
    if (!isHeader(header)) throw new MalformedEnvelopeError('Invalid encryption header.');
}

function splitEnvelope(data: string): { segment: string; header: EnvelopeHeader; iv: Uint8Array<ArrayBuffer>; ct: Uint8Array<ArrayBuffer> } {
    const parts = data.slice(ENVELOPE_PREFIX.length).split('.');
    if (!isEnvelope(data) || parts.length !== 3) throw new MalformedEnvelopeError();
    try {
        const header: unknown = JSON.parse(fromB64url(parts[0]));
        assertHeader(header);
        return { segment: parts[0], header, iv: fromB64(parts[1]), ct: fromB64(parts[2]) };
    } catch (err) {
        throw err instanceof MalformedEnvelopeError ? err : new MalformedEnvelopeError(undefined, { cause: err });
    }
}

/** The header of an encrypted snapshot, readable without the key. */
export function readEnvelopeHeader(data: string): EnvelopeHeader {
    return splitEnvelope(data).header;
}

/**
 * Encrypts a packed snapshot (base64 of gzip). The gzip bytes are encrypted, not their base64 text, so the
 * envelope is only the header (~1.5 KB) plus 16 bytes larger than the plain snapshot.
 */
export async function sealSnapshot(packed: string, header: EnvelopeHeader, key: CryptoKey): Promise<string> {
    const segment = toB64url(JSON.stringify(header));
    const iv = randomBytes(12);
    const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(segment) }, key, fromB64(packed));
    return `${ENVELOPE_PREFIX}${segment}.${toB64(iv)}.${toB64(new Uint8Array(ct))}`;
}

/** The packed snapshot inside. Throws MalformedEnvelopeError when damaged, tampered with, or sealed with another key. */
export async function openSnapshot(data: string, key: CryptoKey): Promise<string> {
    const { segment, iv, ct } = splitEnvelope(data);
    try {
        const plain = await subtle().decrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(segment) }, key, ct);
        return toB64(new Uint8Array(plain));
    } catch (err) {
        throw new MalformedEnvelopeError('The encrypted library could not be decrypted.', { cause: err });
    }
}
