// The encryption primitives: envelope, passphrase, recovery keys, rewrapping, tampering.

import { describe, it, expect } from 'vitest';
import {
    createEncryption, ENVELOPE_PREFIX, formatRecoveryKey, headerRev, isEnvelope, normalizeRecoveryKey,
    openSnapshot, readEnvelopeHeader, RECOVERY_KEY_COUNT, rewrapHeader, sealSnapshot, unlockWithPassphrase,
    unlockWithRecoveryKey, DEFAULT_PBKDF2_ITERATIONS, assertHeader,
} from '../scripts/shared/sync/libraryCrypto';
import { MalformedEnvelopeError, WrongSecretError } from '../scripts/shared/utils/dedicatedErrors';

const FAST = { iterations: 1_000 };           // the real default is slow on purpose
const PASS = 'correct horse battery';
const packed = btoa('pretend this is gzip output '.repeat(40));   // what the engine hands over: base64

describe('createEncryption', () => {
    it('makes a header, a non-extractable key and 5 distinct, formatted recovery keys', async () => {
        const { header, key, recoveryKeys } = await createEncryption(PASS, FAST);

        expect(header).toMatchObject({ v: 1, pass: { iter: 1_000 } });
        expect(header.recovery).toHaveLength(RECOVERY_KEY_COUNT);
        expect(RECOVERY_KEY_COUNT).toBe(5);
        expect(new Set(recoveryKeys).size).toBe(5);
        for (const k of recoveryKeys) expect(k).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);

        expect(key.extractable).toBe(false);
        await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
    });

    it('defaults to 600k PBKDF2 iterations', () => {
        expect(DEFAULT_PBKDF2_ITERATIONS).toBe(600_000);
    });

    it('refuses a short passphrase', async () => {
        await expect(createEncryption('short', FAST)).rejects.toThrow(/at least 10/);
    });
});

describe('envelope', () => {
    it('round-trips, with a fresh IV every time', async () => {
        const { header, key } = await createEncryption(PASS, FAST);
        const a = await sealSnapshot(packed, header, key);
        const b = await sealSnapshot(packed, header, key);

        expect(a).not.toBe(b);
        expect(isEnvelope(a)).toBe(true);
        expect(isEnvelope(packed)).toBe(false);
        expect(await openSnapshot(a, key)).toBe(packed);
        expect(readEnvelopeHeader(a)).toEqual(header);
    });

    it('costs only the header plus a few bytes over the plain snapshot', async () => {
        const { header, key } = await createEncryption(PASS, FAST);
        const sealed = await sealSnapshot(packed, header, key);
        expect(sealed.length - packed.length).toBeLessThan(2_500);
    });

    it('a changed ciphertext does not decrypt', async () => {
        const { header, key } = await createEncryption(PASS, FAST);
        const sealed = await sealSnapshot(packed, header, key);
        const i = sealed.length - 10;
        const tampered = sealed.slice(0, i) + (sealed[i] === 'A' ? 'B' : 'A') + sealed.slice(i + 1);
        await expect(openSnapshot(tampered, key)).rejects.toBeInstanceOf(MalformedEnvelopeError);
    });

    it('a swapped header does not decrypt (the header is authenticated)', async () => {
        const { header, key } = await createEncryption(PASS, FAST);
        const sealed = await sealSnapshot(packed, header, key);
        const other = await sealSnapshot(packed, { ...header, rev: 'forged' }, key);
        const [, , iv, ct] = sealed.split('.');
        const [, segment] = other.split('.');
        await expect(openSnapshot(`${ENVELOPE_PREFIX}${segment}.${iv}.${ct}`, key)).rejects.toBeInstanceOf(MalformedEnvelopeError);
    });

    it('another key does not decrypt', async () => {
        const a = await createEncryption(PASS, FAST);
        const b = await createEncryption(PASS, FAST);
        const sealed = await sealSnapshot(packed, a.header, a.key);
        await expect(openSnapshot(sealed, b.key)).rejects.toBeInstanceOf(MalformedEnvelopeError);
    });

    it('a garbled envelope is malformed, not a crash', () => {
        expect(() => readEnvelopeHeader(`${ENVELOPE_PREFIX}nope`)).toThrow(MalformedEnvelopeError);
        expect(() => readEnvelopeHeader(`${ENVELOPE_PREFIX}e30.AAAA.AAAA`)).toThrow(MalformedEnvelopeError);   // "{}"
        expect(() => assertHeader({ v: 1 })).toThrow(MalformedEnvelopeError);
    });
});

describe('unlocking', () => {
    it('the passphrase unlocks; a wrong one is WrongSecretError', async () => {
        const { header, key } = await createEncryption(PASS, FAST);
        const sealed = await sealSnapshot(packed, header, key);

        const unlocked = await unlockWithPassphrase(header, PASS);
        expect(unlocked.extractable).toBe(false);
        expect(await openSnapshot(sealed, unlocked)).toBe(packed);

        await expect(unlockWithPassphrase(header, 'wrong horse battery')).rejects.toBeInstanceOf(WrongSecretError);
    });

    it('every recovery key unlocks, typed sloppily too', async () => {
        const { header, key, recoveryKeys } = await createEncryption(PASS, FAST);
        const sealed = await sealSnapshot(packed, header, key);

        for (const [i, rk] of recoveryKeys.entries()) {
            const sloppy = i === 0 ? rk.toLowerCase().replace(/-/g, ' ') : rk;
            const { key: k, slotId } = await unlockWithRecoveryKey(header, sloppy);
            expect(slotId).toBe(header.recovery[i].id);
            expect(await openSnapshot(sealed, k)).toBe(packed);
        }
    });

    it('a wrong or malformed recovery key is WrongSecretError', async () => {
        const a = await createEncryption(PASS, FAST);
        const b = await createEncryption(PASS, FAST);
        await expect(unlockWithRecoveryKey(a.header, b.recoveryKeys[0])).rejects.toBeInstanceOf(WrongSecretError);
        await expect(unlockWithRecoveryKey(a.header, 'not-a-key')).rejects.toThrow(/32 letters/);
    });

    it('refuses absurd iteration counts from a hostile header', async () => {
        const { header } = await createEncryption(PASS, FAST);
        await expect(unlockWithPassphrase({ ...header, pass: { ...header.pass, iter: 1e12 } }, PASS))
            .rejects.toBeInstanceOf(MalformedEnvelopeError);
    });

    it('slots cannot be moved into another header', async () => {
        const a = await createEncryption(PASS, FAST);
        const b = await createEncryption(PASS, FAST);
        const mixed = { ...b.header, pass: a.header.pass };            // a's passphrase slot under b's key id
        await expect(unlockWithPassphrase(mixed, PASS)).rejects.toBeInstanceOf(WrongSecretError);
    });
});

describe('normalizeRecoveryKey', () => {
    it('maps look-alikes and rejects the wrong length or alphabet', () => {
        const key = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
        expect(normalizeRecoveryKey(formatRecoveryKey(key))).toBe(key);
        expect(normalizeRecoveryKey('o123456789abcdefghjkmnpqrstvwxyz')).toBe(key);   // O -> 0
        expect(normalizeRecoveryKey('Ol23456789ABCDEFGHJKMNPQRSTVWXYZ')).toBe(key);   // l -> 1
        expect(normalizeRecoveryKey(key.slice(1))).toBeNull();
        expect(normalizeRecoveryKey(key.slice(1) + 'U')).toBeNull();
    });
});

describe('rewrapHeader', () => {
    it('a new passphrase: same data key, the old passphrase stops working, stored keys keep working', async () => {
        const { header, key } = await createEncryption(PASS, FAST);
        const dek = await unlockWithPassphrase(header, PASS, true);
        const { header: next } = await rewrapHeader(header, dek, { passphrase: 'a brand new passphrase' });

        expect(next.kid).toBe(header.kid);
        expect(headerRev(next)).not.toBe(headerRev(header));
        await expect(unlockWithPassphrase(next, PASS)).rejects.toBeInstanceOf(WrongSecretError);

        const sealed = await sealSnapshot(packed, next, key);               // the key stored before the change
        expect(await openSnapshot(sealed, await unlockWithPassphrase(next, 'a brand new passphrase'))).toBe(packed);
    });

    it('a used recovery key is dropped; the others still work', async () => {
        const { header, recoveryKeys } = await createEncryption(PASS, FAST);
        const { key: dek, slotId } = await unlockWithRecoveryKey(header, recoveryKeys[2], true);
        const { header: next } = await rewrapHeader(header, dek, { passphrase: 'after recovery 123', dropRecoveryId: slotId });

        expect(next.recovery).toHaveLength(4);
        await expect(unlockWithRecoveryKey(next, recoveryKeys[2])).rejects.toBeInstanceOf(WrongSecretError);
        await expect(unlockWithRecoveryKey(next, recoveryKeys[3])).resolves.toBeTruthy();
    });

    it('new recovery keys replace all old ones', async () => {
        const { header, recoveryKeys } = await createEncryption(PASS, FAST);
        const dek = await unlockWithPassphrase(header, PASS, true);
        const { header: next, recoveryKeys: fresh } = await rewrapHeader(header, dek, { newRecoveryKeys: true });

        expect(fresh).toHaveLength(5);
        expect(next.recovery).toHaveLength(5);
        await expect(unlockWithRecoveryKey(next, recoveryKeys[0])).rejects.toBeInstanceOf(WrongSecretError);
        await expect(unlockWithRecoveryKey(next, fresh![0])).resolves.toBeTruthy();
        await expect(unlockWithPassphrase(next, PASS)).resolves.toBeTruthy();   // passphrase untouched
    });

    it('needs an extractable data key', async () => {
        const { header, key } = await createEncryption(PASS, FAST);
        await expect(rewrapHeader(header, key, { newRecoveryKeys: true })).rejects.toThrow();
    });
});
