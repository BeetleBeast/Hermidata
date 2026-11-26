import type { EnvelopeHeader, SyncBackendConfig } from "../../shared/types";
import { ext } from "../../shared/utils/BrowserCompat";
import { logConsoleError } from "../../shared/utils/ErrorMessage";
import { getElement } from "../../shared/utils/Selection";
import { WrongSecretError } from "../../shared/utils/dedicatedErrors";
import {
    createEncryption, isEnvelope, MIN_PASSPHRASE_LENGTH, openSnapshot, readEnvelopeHeader, rewrapHeader, toStorableKey,
    unlockWithPassphrase, unlockWithRecoveryKey,
} from "../../shared/sync/libraryCrypto";
import { IdbKeyStore } from "../../shared/sync/keyStore";
import { createBackend, loadSyncConfig, SYNC_SEAL_HEADER_KEY, SYNC_SEAL_PENDING_KEY } from "../../shared/sync/syncConfig";
import { Build } from "../build";

type Tone = 'info' | 'success' | 'warning' | 'error';
type View =
    | { kind: 'off'; config: SyncBackendConfig }
    | { kind: 'on'; config: SyncBackendConfig; header: EnvelopeHeader }
    | { kind: 'locked'; config: SyncBackendConfig; header: EnvelopeHeader }
    | { kind: 'damaged'; config: SyncBackendConfig }
    | { kind: 'unavailable'; config: SyncBackendConfig };      // this device does not sync, so there is nothing to encrypt
type Remote = { header: null } | { header: EnvelopeHeader; data: string } | 'damaged' | undefined;

const REASONS: Record<SyncBackendConfig['kind'], string> = {
    browser: 'Optional with browser sync: your browser already protects synced data. Firefox encrypts it end to end, and '
        + 'Chrome encrypts it with your Google account (or with your own sync passphrase, if you set one in Chrome). '
        + 'Turn this on if you want only your own devices to be able to read the library. It uses about 2 KB of the 100 KB space.',
    webdav: 'Recommended for a server you do not fully control: without it, anyone who can read files on the server '
        + '(its admin, or anyone with your account) can read your library.',
    local: 'Not available while this device is set to "This device only": nothing is published, so there is nothing to encrypt. '
        + 'Choose browser sync or your own server under Library sync to use encryption.',
};

/**
 * "Encryption" card: turn end-to-end encryption of the synced library on or off, unlock this device, recover
 * with a recovery key, change the passphrase, and create new recovery keys.
 * All key work happens here; the data key goes to the IndexedDB key store the background shares, and the
 * background is only told which header to publish with.
 */
export class LibraryEncryption extends Build {

    private readonly keys = new IdbKeyStore();

    private readonly reason = getElement<HTMLParagraphElement>("#encryptionReason");
    private readonly state = getElement<HTMLParagraphElement>("#encryptionState");
    private readonly status = getElement<HTMLParagraphElement>("#encryptionStatus");
    private readonly enablePanel = getElement<HTMLFormElement>("#encryptionEnable");
    private readonly unlockPanel = getElement<HTMLDivElement>("#encryptionUnlock");
    private readonly managePanel = getElement<HTMLDivElement>("#encryptionManage");
    private readonly replacePanel = getElement<HTMLDetailsElement>("#encryptionReplace");

    private readonly newPass = getElement<HTMLInputElement>("#encryptionNewPass");
    private readonly newPassConfirm = getElement<HTMLInputElement>("#encryptionNewPassConfirm");
    private readonly unlockPass = getElement<HTMLInputElement>("#encryptionUnlockPass");
    private readonly recoveryKey = getElement<HTMLInputElement>("#encryptionRecoveryKey");
    private readonly recoveryPass = getElement<HTMLInputElement>("#encryptionRecoveryPass");
    private readonly recoveryPassConfirm = getElement<HTMLInputElement>("#encryptionRecoveryPassConfirm");
    private readonly currentPass = getElement<HTMLInputElement>("#encryptionCurrentPass");
    private readonly changePass = getElement<HTMLInputElement>("#encryptionChangePass");
    private readonly changePassConfirm = getElement<HTMLInputElement>("#encryptionChangePassConfirm");
    private readonly keysPass = getElement<HTMLInputElement>("#encryptionKeysPass");
    private readonly replacePass = getElement<HTMLInputElement>("#encryptionReplacePass");
    private readonly replacePassConfirm = getElement<HTMLInputElement>("#encryptionReplacePassConfirm");

    private readonly dialog = getElement<HTMLDialogElement>("#recoveryKeysDialog");

    private busy = false;

    public async init() {
        this.bindEvents();
        await this.render();
    }

    public async resetValues() {
        this.clearInputs();
        this.setStatus('');
    }

    private bindEvents() {
        // Real form submits (click or Enter), with a username field each, so password managers can fill and save the passphrase.
        const onSubmit = (selector: string, action: () => Promise<void>) =>
            getElement<HTMLFormElement>(selector)?.addEventListener('submit', e => { e.preventDefault(); void this.run(action); });

        onSubmit("#encryptionEnable", () => this.enable());
        onSubmit("#encryptionUnlockForm", () => this.unlock());
        onSubmit("#encryptionRecoverForm", () => this.recover());
        onSubmit("#encryptionChangeForm", () => this.changePassphrase());
        onSubmit("#encryptionKeysForm", () => this.newRecoveryKeys());
        onSubmit("#encryptionReplaceForm", () => this.replace());
        getElement<HTMLButtonElement>("#encryptionDisableBtn")?.addEventListener('click', () => void this.run(() => this.disable()));
        document.addEventListener('hermidata:sync-target-changed', () => void this.render());
    }

    /** One action at a time; any failure ends up in the status line. */
    private async run(action: () => Promise<void>) {
        if (this.busy) return;
        this.busy = true;
        this.card()?.querySelectorAll('button').forEach(b => { b.disabled = true; });
        try {
            await action();
        } catch (err) {
            if (!(err instanceof WrongSecretError)) logConsoleError('[Sync] encryption action failed', err);
            this.setStatus(err instanceof Error ? err.message : String(err), 'error');
        } finally {
            this.busy = false;
            this.card()?.querySelectorAll('button').forEach(b => { b.disabled = false; });
        }
    }

    /** Greys the card out when there is nothing to encrypt; the reason stays readable. */
    private setAvailable(available: boolean) {
        const card = this.card();
        if (!card) return;
        if (available) card.removeAttribute('aria-disabled');
        else card.setAttribute('aria-disabled', 'true');
        card.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input').forEach(el => { el.disabled = !available; });
    }

    private card() {
        return this.state?.closest<HTMLElement>('.library-encryption-card') ?? null;
    }

    // --------------------------------------------------------------- state

    /**
     * Encrypted or not, as this device will publish it: a choice not published yet wins, then what is on the
     * server, then the last thing this device saw (when the server cannot be reached or is empty).
     */
    private async readView(): Promise<View> {
        const config = await loadSyncConfig(ext.storage.local);
        if (config.kind === 'local') return { kind: 'unavailable', config };
        const local = await ext.storage.local.get([SYNC_SEAL_PENDING_KEY, SYNC_SEAL_HEADER_KEY]);
        const pending = local[SYNC_SEAL_PENDING_KEY] as { header: EnvelopeHeader | null } | false | undefined;
        const last = (local[SYNC_SEAL_HEADER_KEY] as EnvelopeHeader | null | undefined) ?? null;

        const remote = pending ? undefined : await this.readRemote(config);
        if (remote === 'damaged') return { kind: 'damaged', config };

        const header = pending ? pending.header : remote ? remote.header : last;
        if (!header) return { kind: 'off', config };

        const key = await this.keys.get(header.kid);
        if (!key) return { kind: 'locked', config, header };
        if (remote && 'data' in remote && !await openSnapshot(remote.data, key).then(() => true, () => false)) {
            return { kind: 'damaged', config };                         // our key, but the file does not decrypt
        }
        return { kind: 'on', config, header };
    }

    /** What the server holds: a plain library, an envelope, a damaged envelope, or unknown (empty, unreachable). */
    private async readRemote(config: SyncBackendConfig): Promise<Remote> {
        let blob;
        try {
            blob = await createBackend(config, { api: ext, getDeviceId: async () => 'settings-page' }).read();
        } catch (err) {
            logConsoleError('[Sync] could not read the sync location for the encryption status', err);
            return undefined;
        }
        if (!blob || typeof blob !== 'object') return undefined;
        if (!isEnvelope(blob.data)) return { header: null };
        try {
            return { header: readEnvelopeHeader(blob.data), data: blob.data };
        } catch {
            return 'damaged';
        }
    }

    private async render(view?: View) {
        view ??= await this.readView();
        if (this.reason) this.reason.textContent = REASONS[view.config.kind];
        this.setAvailable(view.kind !== 'unavailable');
        if (this.enablePanel) this.enablePanel.hidden = view.kind !== 'off';
        if (this.unlockPanel) this.unlockPanel.hidden = view.kind !== 'locked';
        if (this.managePanel) this.managePanel.hidden = view.kind !== 'on';
        if (this.replacePanel) {
            this.replacePanel.hidden = view.kind !== 'locked' && view.kind !== 'damaged';
            this.replacePanel.open = view.kind === 'damaged';
        }
        if (!this.state) return;

        if (view.kind === 'unavailable') {
            this.state.dataset.state = 'signed-out';
            this.state.textContent = 'Not available: this device does not sync.';
        } else if (view.kind === 'off') {
            this.state.dataset.state = 'signed-out';
            this.state.textContent = 'Off: the synced library is stored readable.';
        } else if (view.kind === 'damaged') {
            this.state.dataset.state = 'signed-out';
            this.state.textContent = 'The synced copy is damaged and cannot be decrypted, so syncing is paused. '
                + 'Restore it from a backup on your server, or replace it with this device\'s library below.';
        } else if (view.kind === 'locked') {
            this.state.dataset.state = 'signed-out';
            this.state.textContent = 'The synced library is encrypted. Enter the passphrase to unlock this device; until then it does not sync.';
        } else {
            const left = view.header.recovery.length;
            this.state.dataset.state = 'connected';
            this.state.textContent = `On: only your devices can read the synced library. ${left} of 5 recovery keys left.`;
        }
    }

    private async current(kind: View['kind']): Promise<View & { header: EnvelopeHeader }> {
        const view = await this.readView();
        if (view.kind !== kind || !('header' in view)) {
            await this.render(view);
            throw new Error('The encryption state changed meanwhile. Please check and try again.');
        }
        return view;
    }

    // ------------------------------------------------------------- actions

    private async enable() {
        const passphrase = this.newPassphrase(this.newPass, this.newPassConfirm);
        if ((await this.readView()).kind !== 'off') throw new Error('Encryption is already on. Reload this page.');

        this.setStatus('Creating the keys…');
        const created = await createEncryption(passphrase);
        if (!await this.showRecoveryKeys(created.recoveryKeys)) { this.setStatus('Nothing was changed.'); return; }

        await this.keys.set(created.header.kid, created.key);
        const published = await this.publish(created.header);
        this.clearInputs();
        await this.done(published, 'Encryption is on. On your other devices, open these settings and enter the passphrase.');
    }

    private async unlock() {
        const view = await this.current('locked');
        this.setStatus('Unlocking…');
        const key = await unlockWithPassphrase(view.header, this.value(this.unlockPass));
        await this.keys.set(view.header.kid, key);
        await ext.runtime.sendMessage({ type: 'SYNC_REFRESH' }).catch(() => undefined);
        this.clearInputs();
        await this.render();
        this.setStatus('Unlocked. This device syncs again.', 'success');
    }

    private async recover() {
        const passphrase = this.newPassphrase(this.recoveryPass, this.recoveryPassConfirm);
        const view = await this.current('locked');
        this.setStatus('Checking the recovery key…');
        const { key: dek, slotId } = await unlockWithRecoveryKey(view.header, this.value(this.recoveryKey), true);
        const { header } = await rewrapHeader(view.header, dek, { passphrase, dropRecoveryId: slotId });

        await this.keys.set(header.kid, await toStorableKey(dek));
        const published = await this.publish(header);
        this.clearInputs();
        const left = header.recovery.length;
        const advice = left <= 1 ? ' Create new recovery keys soon.' : '';
        await this.done(published, `Unlocked with a recovery key and the new passphrase is set. ${left} recovery keys left.${advice}`);
    }

    private async changePassphrase() {
        const passphrase = this.newPassphrase(this.changePass, this.changePassConfirm);
        const view = await this.current('on');
        this.setStatus('Changing the passphrase…');
        const dek = await unlockWithPassphrase(view.header, this.value(this.currentPass), true);
        const { header } = await rewrapHeader(view.header, dek, { passphrase });

        const published = await this.publish(header);
        this.clearInputs();
        await this.done(published, 'The passphrase is changed. Devices that are already unlocked keep working; new devices need the new passphrase.');
    }

    private async newRecoveryKeys() {
        const view = await this.current('on');
        this.setStatus('Creating new recovery keys…');
        const dek = await unlockWithPassphrase(view.header, this.value(this.keysPass), true);
        const { header, recoveryKeys } = await rewrapHeader(view.header, dek, { newRecoveryKeys: true });
        if (!await this.showRecoveryKeys(recoveryKeys!)) { this.setStatus('Nothing was changed. The old recovery keys still work.'); return; }

        const published = await this.publish(header);
        this.clearInputs();
        await this.done(published, 'New recovery keys are active. The old ones no longer work.');
    }

    /** Last resort: the synced copy cannot be opened by anyone, so publish this device's library over it. */
    private async replace() {
        const passphrase = this.newPassphrase(this.replacePass, this.replacePassConfirm);
        const view = await this.readView();
        if (view.kind !== 'locked' && view.kind !== 'damaged') {
            await this.render(view);
            throw new Error('The synced copy can be read now, so there is nothing to replace.');
        }
        const ok = window.confirm('Replace the synced copy with this device\'s library? Whatever only exists in the unreadable copy is lost.');
        if (!ok) return;

        this.setStatus('Creating the keys…');
        const created = await createEncryption(passphrase);
        if (!await this.showRecoveryKeys(created.recoveryKeys)) { this.setStatus('Nothing was changed.'); return; }

        await this.keys.set(created.header.kid, created.key);
        const published = await this.publish(created.header, { replace: true });
        this.clearInputs();
        await this.done(published, 'The synced copy now holds this device\'s library, encrypted with the new passphrase. Unlock your other devices with it.');
    }

    private async disable() {
        const view = await this.current('on');
        const ok = window.confirm('Turn off encryption? The synced library will be stored readable again, for every device that syncs with it.');
        if (!ok) return;

        const published = await this.publish(null);
        if (published) await this.keys.delete(view.header.kid);
        await this.done(published, 'Encryption is off. The synced library is stored readable again.');
    }

    // ------------------------------------------------------------- helpers

    /** Tells the background which header to publish with; true when it went out right away. */
    private async publish(header: EnvelopeHeader | null, opts: { replace?: boolean } = {}): Promise<boolean> {
        const res = await ext.runtime.sendMessage({ type: 'SYNC_SET_ENCRYPTION', header, replace: opts.replace === true }) as
            { success?: boolean; published?: boolean; error?: string } | undefined;
        if (!res?.success) throw new Error(`Could not apply the change: ${res?.error ?? 'the background script did not answer'}`);
        return res.published === true;
    }

    private async done(published: boolean, message: string) {
        await this.render();
        if (published) this.setStatus(message, 'success');
        else this.setStatus(`${message} It is saved on this device and will be published with the next successful sync.`, 'warning');
    }

    private newPassphrase(input: HTMLInputElement | null, confirm: HTMLInputElement | null): string {
        const passphrase = this.value(input);
        if (passphrase.length < MIN_PASSPHRASE_LENGTH) throw new Error(`The passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters long.`);
        if (passphrase !== this.value(confirm)) throw new Error('The two passphrases do not match.');
        return passphrase;
    }

    private value(input: HTMLInputElement | null): string {
        return input?.value ?? '';
    }

    private clearInputs() {
        // the hidden username that password managers pair with the passphrase must keep its value
        this.card()?.querySelectorAll<HTMLInputElement>('input:not(.pm-username)').forEach(i => { i.value = ''; });
    }

    private setStatus(text: string, tone: Tone = 'info') {
        if (!this.status) return;
        this.status.textContent = text;
        this.status.dataset.tone = tone;
    }

    // ------------------------------------------------------- recovery keys

    /** Shows the keys until the user confirms they saved them. True on Continue, false on Cancel or Esc. */
    private showRecoveryKeys(keys: string[]): Promise<boolean> {
        const dialog = this.dialog;
        if (!dialog) return Promise.resolve(false);

        const list = dialog.querySelector<HTMLOListElement>('#recoveryKeysList');
        const saved = dialog.querySelector<HTMLInputElement>('#recoveryKeysSaved');
        const doneBtn = dialog.querySelector<HTMLButtonElement>('#recoveryKeysDone');
        const cancelBtn = dialog.querySelector<HTMLButtonElement>('#recoveryKeysCancel');
        const download = dialog.querySelector<HTMLButtonElement>('#recoveryKeysDownload');
        const copy = dialog.querySelector<HTMLButtonElement>('#recoveryKeysCopy');

        list?.replaceChildren(...keys.map(k => Object.assign(document.createElement('li'), { textContent: k })));
        if (saved) saved.checked = false;
        if (doneBtn) doneBtn.disabled = true;

        const text = this.recoveryKeysText(keys);
        const controller = new AbortController();
        const { signal } = controller;
        saved?.addEventListener('change', () => { if (doneBtn) doneBtn.disabled = !saved.checked; }, { signal });
        download?.addEventListener('click', () => this.download(text), { signal });
        copy?.addEventListener('click', () => {
            void navigator.clipboard.writeText(text).then(() => { copy.textContent = 'Copied'; }).catch(() => { copy.textContent = 'Copy failed'; });
        }, { signal });
        doneBtn?.addEventListener('click', () => dialog.close('continue'), { signal });
        cancelBtn?.addEventListener('click', () => dialog.close('cancel'), { signal });

        dialog.returnValue = '';
        dialog.showModal();
        return new Promise(resolve => {
            dialog.addEventListener('close', () => {
                controller.abort();
                if (copy) copy.textContent = 'Copy';
                list?.replaceChildren();                                     // do not leave the keys in the page
                resolve(dialog.returnValue === 'continue');
            }, { once: true });
        });
    }

    private recoveryKeysText(keys: string[]): string {
        return [
            'Hermidata library sync - recovery keys',
            `Created: ${new Date().toLocaleString()}`,
            '',
            'Each key unlocks the encrypted library once if you forget the passphrase.',
            'Use one in Settings > Account & Connection > Encryption > "Forgot the passphrase?".',
            '',
            ...keys.map((k, i) => `${i + 1}. ${k}`),
            '',
        ].join('\n');
    }

    private download(text: string) {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
        const a = Object.assign(document.createElement('a'), { href: url, download: 'hermidata-recovery-keys.txt' });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1_000);
    }
}
