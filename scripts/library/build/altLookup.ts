import type { Hermidata, Settings } from "../../shared/types";
import { applyPatch, isLookupEnabled, lookupCandidate, lookupManual, type ManualOutcome } from "../../shared/lookup/altTitleLookup";
import type { LookupCandidate } from "../../shared/lookup/matching";
import type { HermidataModel } from "../../shared/utils/HermidataSelector";

const SOURCE_NAME = { anilist: 'AniList', mangaupdates: 'MangaUpdates' } as const;

/**
 * The "online lookup" part of the alt titles section of the item detail view.
 * - never looked up, or the last request failed: one click asks again with the item's title
 * - otherwise the same title would give the same answer, so the user types a title or pastes a MangaUpdates / AniList link
 */
export class AltTitleLookupPanel {
    private readonly panel = document.querySelector<HTMLElement>('#hermidata-alt-lookup');
    private readonly status = document.querySelector<HTMLElement>('#hermidata-alt-lookup-status');
    private readonly button = document.querySelector<HTMLButtonElement>('#hermidata-alt-lookup-btn');
    private readonly form = document.querySelector<HTMLFormElement>('#hermidata-alt-lookup-form');
    private readonly input = document.querySelector<HTMLInputElement>('#hermidata-alt-lookup-input');
    private readonly submit = document.querySelector<HTMLButtonElement>('#hermidata-alt-lookup-submit');
    private readonly candidates = document.querySelector<HTMLUListElement>('#hermidata-alt-lookup-candidates');

    private readonly hermidata: HermidataModel;
    private readonly settings: Settings;
    private readonly save: (item: Hermidata) => Promise<void>;
    private readonly onApplied: () => void;

    /** `onApplied` runs after new alt titles were saved, so the page can show them */
    constructor(hermidata: HermidataModel, settings: Settings, save: (item: Hermidata) => Promise<void>, onApplied: () => void) {
        this.hermidata = hermidata;
        this.settings = settings;
        this.save = save;
        this.onApplied = onApplied;
    }

    public init(): void {
        // off by default: the panel stays hidden and nothing is ever sent
        if (!this.panel || !this.button || !this.form || !this.input || !isLookupEnabled(this.settings)) return;

        this.panel.hidden = false;
        this.renderStatus();

        this.button.addEventListener('click', () => this.onButton());
        this.form.addEventListener('submit', event => {
            event.preventDefault();
            void this.run(() => lookupManual(this.hermidata.toJSON(), this.input!.value));
        });
    }

    private onButton(): void {
        const status = this.hermidata.meta.external?.status;
        if (!status || status === 'error') {
            // nothing was decided yet, so asking again with the same title can simply succeed
            void this.run(() => lookupManual(this.hermidata.toJSON(), ''));
            return;
        }
        this.form!.hidden = !this.form!.hidden;
        if (this.form!.hidden) return;
        this.input!.value = this.hermidata.title;
        this.input!.focus();
        this.input!.select();
    }

    private async run(request: () => Promise<ManualOutcome>): Promise<void> {
        this.setBusy(true);
        this.clearCandidates();
        this.setStatus('Looking up…');
        try {
            await this.handle(await request());
        } catch (error) {
            this.setStatus(`Something went wrong: ${error instanceof Error ? error.message : String(error)}`, true);
        } finally {
            this.setBusy(false);
        }
    }

    private async handle(outcome: ManualOutcome): Promise<void> {
        switch (outcome.status) {
            case 'applied': return this.apply(outcome.patch);
            case 'pick': return this.showCandidates(outcome.candidates);
            case 'none':
                this.setStatus("No match. Try the series' MangaUpdates or AniList link instead.", true);
                return;
            case 'error':
                this.setStatus(`The server did not answer (${outcome.message}). Try again later.`, true);
                return;
        }
    }

    private async apply(patch: Parameters<typeof applyPatch>[1]): Promise<void> {
        const before = this.hermidata.meta.external;
        const { item, added } = applyPatch(this.hermidata.toJSON(), patch);
        await this.save(item);

        // the page keeps showing the item it has: bring it in step with what was saved
        this.hermidata.meta.altTitles = item.meta.altTitles;
        this.hermidata.meta.external = item.meta.external;
        this.onApplied();
        this.form!.hidden = true;

        const same = before?.status === 'matched' && patch.external.status === 'matched' && before.id === patch.external.id && before.source === patch.external.source;
        const found = added.length ? `Added ${added.length} alt title${added.length === 1 ? '' : 's'}.` : 'No new alt titles.';
        this.renderStatus(same ? `Same series as before. ${found}` : found);
    }

    private showCandidates(candidates: LookupCandidate[]): void {
        this.setStatus('Several works match. Pick the right one:');
        const list = this.candidates!;
        list.hidden = false;
        for (const candidate of candidates.slice(0, 5)) {
            const row = document.createElement('li');
            const pick = document.createElement('button');
            pick.type = 'button';
            pick.className = 'Btn';
            const kind = candidate.kind === 'novel' ? 'Novel' : 'Comic';
            pick.textContent = `${candidate.title} · ${kind} · ${candidate.year ?? 'year unknown'} · ${SOURCE_NAME[candidate.source]}`;
            pick.addEventListener('click', () => void this.run(() => lookupCandidate(candidate)));
            row.appendChild(pick);
            list.appendChild(row);
        }
    }

    private renderStatus(extra = ''): void {
        const external = this.hermidata.meta.external;
        const when = external ? new Date(external.checkedAt).toLocaleDateString() : '';
        let text: string;
        if (!external) text = 'Not looked up yet.';
        else if (external.status === 'matched') text = `Matched on ${SOURCE_NAME[external.source]} (${when}).`;
        else if (external.status === 'none') text = `No match found (${when}).`;
        else if (external.status === 'ambiguous') text = `Several works matched, none picked (${when}).`;
        else text = 'The last lookup could not reach the server.';
        this.setStatus(extra ? `${extra} ${text}` : text);

        const asksAgain = !external || external.status === 'error';
        this.button!.textContent = asksAgain ? 'Look up' : 'Look up again';
    }

    private clearCandidates(): void {
        if (!this.candidates) return;
        this.candidates.hidden = true;
        this.candidates.replaceChildren();
    }

    private setStatus(message: string, isError = false): void {
        if (!this.status) return;
        this.status.textContent = message;
        this.status.dataset.error = String(isError);
    }

    private setBusy(busy: boolean): void {
        if (this.button) this.button.disabled = busy;
        if (this.submit) this.submit.disabled = busy;
    }
}
