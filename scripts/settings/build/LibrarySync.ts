import type { ConnectionTest, SyncBackendConfig, SyncStatus, SyncSwitchMode, WebDavProblem } from "../../shared/types";
import { ext } from "../../shared/utils/BrowserCompat";
import { logConsoleError } from "../../shared/utils/ErrorMessage";
import { getElement } from "../../shared/utils/Selection";
import {
    createBackend, createWebDavBackend, DEFAULT_SYNC_CONFIG, describeTarget, loadSyncConfig, originPattern,
    sameConfig, sameTarget, SYNC_STATUS_KEY, validateWebDavUrl,
} from "../../shared/sync/syncConfig";
import { Build } from "../build";

type Tone = 'info' | 'success' | 'warning' | 'error';
type FormResult = { config: SyncBackendConfig } | { error: string };
type WebDavTarget = Extract<SyncBackendConfig, { kind: 'webdav' }>;
type Choice = SyncSwitchMode | 'cancel';

const PROBLEM_HINTS: Record<WebDavProblem, string> = {
    auth: 'Check the username and password. Nextcloud and ownCloud with two-factor sign-in need an app password.',
    forbidden: 'Your account may not write to this folder. Pick a folder you own.',
    folder: 'Create the folder on the server first, or check the path in the URL.',
    server: 'The server reported a problem. Check that it has free space and that the URL is a WebDAV address.',
    network: 'Check the address, that the server is running, and that this browser can reach it.',
};

/**
 * "Library sync" card: where this device syncs (browser storage, a WebDAV file, or nowhere), the WebDAV credentials,
 * a connection test, and the first-run choice when switching to a place that already holds a library.
 * The config lives in storage.local (per device); the background script owns the switch itself.
 */
export class LibrarySync extends Build {

    private readonly browserRadio = getElement<HTMLInputElement>("#syncBackendBrowser");
    private readonly webdavRadio = getElement<HTMLInputElement>("#syncBackendWebdav");
    private readonly localRadio = getElement<HTMLInputElement>("#syncBackendLocal");
    private readonly webdavSetup = getElement<HTMLDivElement>("#webdavSetup");
    private readonly urlInput = getElement<HTMLInputElement>("#webdavUrl");
    private readonly urlCheck = getElement<HTMLParagraphElement>("#webdavUrlCheck");
    private readonly userInput = getElement<HTMLInputElement>("#webdavUser");
    private readonly passInput = getElement<HTMLInputElement>("#webdavPass");
    private readonly testBtn = getElement<HTMLButtonElement>("#testWebdav");
    private readonly applyBtn = getElement<HTMLButtonElement>("#applySyncBackend");
    private readonly status = getElement<HTMLParagraphElement>("#syncStatus");
    private readonly currentTarget = getElement<HTMLParagraphElement>("#syncCurrentTarget");
    private readonly health = getElement<HTMLParagraphElement>("#syncHealth");
    private readonly choiceDialog = getElement<HTMLDialogElement>("#syncChoiceDialog");

    private saved: SyncBackendConfig = DEFAULT_SYNC_CONFIG;
    private busy = false;

    public async init() {
        this.saved = await loadSyncConfig(ext.storage.local);
        this.fill(this.saved);
        this.showCurrent();
        this.bindEvents();
        await this.showHealth();
        ext.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && SYNC_STATUS_KEY in changes) this.renderHealth(changes[SYNC_STATUS_KEY].newValue as SyncStatus | undefined);
        });
    }

    /** Discards unsaved edits in the form. Never switches the backend. */
    public async resetValues() {
        this.fill(this.saved);
        this.setStatus('');
    }

    private bindEvents() {
        this.browserRadio?.addEventListener('change', () => this.toggleWebdavFields());
        this.webdavRadio?.addEventListener('change', () => this.toggleWebdavFields());
        this.localRadio?.addEventListener('change', () => this.toggleWebdavFields());
        this.urlInput?.addEventListener('input', () => this.showUrlCheck());
        // editing the URL or the credentials makes the form differ from what is saved (autofill fires these too)
        for (const input of [this.urlInput, this.userInput, this.passInput]) {
            input?.addEventListener('input', () => this.toggleSaveButton());
            input?.addEventListener('change', () => this.toggleSaveButton());
        }
        // both handlers request the host permission before their first await: it needs the click's user gesture
        this.testBtn?.addEventListener('click', () => this.onTest());
        // a real form submit (click or Enter), so password managers see the credentials being used and can save them
        getElement<HTMLFormElement>("#syncForm")?.addEventListener('submit', e => { e.preventDefault(); this.onApply(); });
    }

    // --------------------------------------------------------------- form

    private fill(config: SyncBackendConfig) {
        if (this.browserRadio) this.browserRadio.checked = config.kind === 'browser';
        if (this.webdavRadio) this.webdavRadio.checked = config.kind === 'webdav';
        if (this.localRadio) this.localRadio.checked = config.kind === 'local';
        if (config.kind === 'webdav') {
            if (this.urlInput) this.urlInput.value = config.url;
            if (this.userInput) this.userInput.value = config.username ?? '';
            if (this.passInput) this.passInput.value = config.password ?? '';
        }
        this.toggleWebdavFields();
        this.showUrlCheck();
    }

    private selectedKind(): SyncBackendConfig['kind'] {
        if (this.webdavRadio?.checked) return 'webdav';
        return this.localRadio?.checked ? 'local' : 'browser';
    }

    private toggleWebdavFields() {
        const webdav = this.selectedKind() === 'webdav';
        if (this.webdavSetup) this.webdavSetup.hidden = !webdav;
        if (this.testBtn) this.testBtn.hidden = !webdav;

        this.toggleSaveButton();
    }

    private readForm(): FormResult {
        const kind = this.selectedKind();
        if (kind !== 'webdav') return { config: { kind } };

        const check = validateWebDavUrl(this.urlInput?.value ?? '');
        if (!check.ok) return { error: check.error };

        const keepPoll = this.saved.kind === 'webdav' && this.saved.url === check.url ? this.saved.pollMinutes : undefined;
        const config: WebDavTarget = { kind: 'webdav', url: check.url };
        const username = this.userInput?.value.trim();
        const password = this.passInput?.value;
        if (username) config.username = username;
        if (password) config.password = password;
        if (keepPoll !== undefined) config.pollMinutes = keepPoll;
        return { config };
    }

    private showUrlCheck() {
        if (!this.urlCheck) return;
        const raw = this.urlInput?.value ?? '';
        const check = raw.trim() ? validateWebDavUrl(raw) : null;
        const message = !check ? '' : check.ok ? check.warning ?? '' : check.error;

        this.urlCheck.hidden = !message;
        this.urlCheck.textContent = message;
        this.urlCheck.dataset.tone = check && !check.ok ? 'error' : 'warning';
    }
    /** What the form says right now, without validating: only used to tell whether saving would change anything. */
    private formConfig(): SyncBackendConfig {
        const kind = this.selectedKind();
        if (kind !== 'webdav') return { kind };
        const raw = this.urlInput?.value ?? '';
        const check = validateWebDavUrl(raw);
        return {
            kind: 'webdav',
            url: check.ok ? check.url : raw.trim(),
            username: this.userInput?.value.trim() || undefined,
            password: this.passInput?.value || undefined,
        };
    }

    /** "Already Saved" only when the form matches what this device already uses: same place AND same credentials. */
    private toggleSaveButton() {
        if (this.busy) return;                                          // setBusy(false) calls this again

        const alreadySaved = sameConfig(this.saved, this.formConfig());

        if (this.applyBtn) {
            this.applyBtn.textContent = alreadySaved ? 'Already Saved' : 'Save and switch';
            this.applyBtn.title = alreadySaved ? 'This device has already been configured to sync with this storage location.' : 'Save and switch';
            this.applyBtn.disabled = alreadySaved;
        }
    }

    private showCurrent() {
        if (!this.currentTarget) return;
        this.currentTarget.textContent = this.saved.kind === 'local'
            ? 'This device does not sync. Your library and settings stay on this device.'
            : `This device syncs through: ${describeTarget(this.saved)}.`;
    }

    private async showHealth() {
        const got = await ext.storage.local.get(SYNC_STATUS_KEY);
        this.renderHealth(got[SYNC_STATUS_KEY] as SyncStatus | undefined);
    }

    /** The outcome of the last sync attempt: failures say it will retry, successes say when. Hidden until there is one. */
    private renderHealth(status: SyncStatus | undefined) {
        if (!this.health) return;
        const when = status?.lastSyncAt ? `Last successful sync: ${new Date(status.lastSyncAt).toLocaleString()}.` : 'No successful sync yet.';
        this.health.hidden = !status;
        this.health.textContent = status?.ok === false ? `Server unreachable, will retry. ${when}` : when;
        this.health.dataset.state = status?.ok === false ? 'signed-out' : 'connected';
    }

    private setStatus(text: string, tone: Tone = 'info') {
        if (!this.status) return;
        this.status.textContent = text;
        this.status.dataset.tone = tone;
        this.status.hidden = !text;
    }

    private setBusy(busy: boolean) {
        this.busy = busy;
        if (this.testBtn) this.testBtn.disabled = busy;
        if (busy) { if (this.applyBtn) this.applyBtn.disabled = true; }
        else this.toggleSaveButton();                                   // not simply re-enabled: it may be "Already Saved"
    }

    // --------------------------------------------------------- permission

    /** Starts the host permission request. Call synchronously from a click handler. */
    private requestAccess(config: SyncBackendConfig): Promise<boolean> {
        if (config.kind !== 'webdav') return Promise.resolve(true);
        const permissions = ext.permissions;
        if (!permissions?.request) return Promise.resolve(true);
        return Promise.resolve(permissions.request({ origins: [originPattern(config.url)] })).catch(err => {
            logConsoleError('[Sync] permission request failed', err);
            return false;
        });
    }

    private accessDenied(config: WebDavTarget) {
        this.setStatus(`Hermidata needs your permission to contact ${new URL(config.url).host}. Nothing was changed.`, 'error');
    }

    // --------------------------------------------------------------- test

    private onTest() {
        if (this.busy) return;
        const form = this.readForm();
        if ('error' in form) { this.setStatus(form.error, 'error'); return; }
        if (form.config.kind !== 'webdav') return;

        const access = this.requestAccess(form.config);
        void this.runTest(form.config, access);
    }

    private async runTest(config: WebDavTarget, access: Promise<boolean>) {
        this.setBusy(true);
        try {
            if (!await access) { this.accessDenied(config); return; }
            this.setStatus('Testing the connection…');
            this.showTestResult(await this.testConnection(config));
        } finally {
            this.setBusy(false);
        }
    }

    private testConnection(config: WebDavTarget): Promise<ConnectionTest> {
        return createWebDavBackend(config).testConnection();
    }

    private showTestResult(result: ConnectionTest) {
        if (!result.ok) { this.setStatus(`${result.message} ${PROBLEM_HINTS[result.problem]}`, 'error'); return; }
        if (!result.conditionalWrite) { this.setStatus(`Connected. ${result.note ?? ''}`.trim(), 'warning'); return; }
        this.setStatus('Connected. The server protects against two devices overwriting each other.', 'success');
    }

    // -------------------------------------------------------------- apply

    private onApply() {
        if (this.busy) return;
        const form = this.readForm();
        if ('error' in form) { this.setStatus(form.error, 'error'); return; }

        const access = this.requestAccess(form.config);
        void this.apply(form.config, access);
    }

    private async apply(config: SyncBackendConfig, access: Promise<boolean>) {
        this.setBusy(true);
        try {
            if (config.kind === 'webdav') {
                if (!await access) { this.accessDenied(config); return; }
                this.setStatus('Checking the server…');
                const test = await this.testConnection(config);
                if (!test.ok) { this.showTestResult(test); return; }
            }

            const mode = sameTarget(config, this.saved) ? 'merge' : await this.firstRunChoice(config);
            if (mode === 'cancel') { this.setStatus('Nothing was changed.'); return; }

            this.setStatus('Switching…');
            await this.sendSwitch(config, mode);

            this.saved = config;
            this.showCurrent();
            document.dispatchEvent(new CustomEvent('hermidata:sync-target-changed'));   // the encryption card re-reads
            this.setStatus(this.switchedMessage(config, mode), 'success');
        } catch (err) {
            logConsoleError('[Sync] switching backend failed', err);
            this.setStatus(`Could not switch: ${err instanceof Error ? err.message : String(err)}`, 'error');
        } finally {
            this.setBusy(false);
        }
    }

    private switchedMessage(config: SyncBackendConfig, mode: SyncSwitchMode): string {
        const where = describeTarget(config);
        if (config.kind === 'local') return 'This device no longer syncs. Your library and settings now stay on this device. Copies already stored in browser sync or on a server are left as they are.';
        if (mode === 'adopt') return `This device now syncs through ${where} and is taking over the library stored there.`;
        return `This device now syncs through ${where}. Use the same setting on your other devices.`;
    }

    private async sendSwitch(config: SyncBackendConfig, mode: SyncSwitchMode): Promise<void> {
        const res = await ext.runtime.sendMessage({ type: 'SYNC_SET_BACKEND', config, mode }) as
            { success?: boolean; error?: string } | undefined;
        if (!res?.success) throw new Error(res?.error ?? 'the background script did not answer');
    }

    // ---------------------------------------------------- first-run choice

    /**
     * An empty target gets this device's library and an empty device gets the target's, with no question.
     * When both hold one, the user decides: merge, or replace this device's library with the target's.
     */
    private async firstRunChoice(config: SyncBackendConfig): Promise<Choice> {
        this.setStatus('Looking for an existing library…');
        const [remote, local] = await Promise.all([this.targetHasLibrary(config), this.deviceHasLibrary()]);
        if (!remote || !local) return 'merge';
        return this.askChoice(config);
    }

    private async targetHasLibrary(config: SyncBackendConfig): Promise<boolean> {
        const backend = createBackend(config, { api: ext, getDeviceId: async () => 'settings-page' });
        return await backend.read() !== null;   // 'incomplete' counts: something is there
    }

    private async deviceHasLibrary(): Promise<boolean> {
        return Object.keys(await this.db.getAllHermidata()).length > 0;
    }

    private askChoice(config: SyncBackendConfig): Promise<Choice> {
        const dialog = this.choiceDialog;
        if (!dialog) return Promise.resolve('cancel');

        const where = describeTarget(config);
        const adoptLabel = dialog.querySelector<HTMLElement>('button[value="adopt"] strong');
        const text = dialog.querySelector<HTMLElement>('#syncChoiceText');
        if (adoptLabel) adoptLabel.textContent = `Use the copy in ${where}`;
        if (text) text.textContent = `This device and ${where} both already hold a library. How should they be combined?`;

        dialog.returnValue = '';
        dialog.showModal();
        return new Promise(resolve => {
            dialog.addEventListener('close', () => {
                const value = dialog.returnValue;
                resolve(value === 'merge' || value === 'adopt' ? value : 'cancel');   // Esc counts as cancel
            }, { once: true });
        });
    }
}
