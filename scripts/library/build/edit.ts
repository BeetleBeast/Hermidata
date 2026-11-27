import { CONTENT_RATING, DEMOGRAPHIC_TAGS } from "../../shared/constants";
import { getAllTags } from "../../shared/db/Storage";
import type { CommitChange, CommitOptions, ContentRating, CoverSource, Hermidata, SaveState, Settings } from "../../shared/types";
import { ErrorMessage } from "../../shared/utils/ErrorMessage";
import type { HermidataModel } from "../../shared/utils/HermidataSelector";
import { generateHermidataHash, getFreeKey, openLink } from "../../shared/utils/StringOutput";
import { LibraryBuilder } from "../build";
import { applyPatch, type LookupPatch } from "../../shared/lookup/altTitleLookup";
import { AltTitleLookupPanel, type LookupApplied } from "./altLookup";
import { ChipList } from "./chips";
import { CoverCropper } from "./cropper";
import { TagPicker } from "./tags";

const TOAST_DURATION = 6000;
const NOTES_SAVE_DELAY = 800;
const MAX_SCORE = 10;

/**
 * Every field of the detail page is always editable in place: a change is saved as soon as the field is left
 * ( or picked, for selects and chips ), shown in the header as "Saved", and can be undone from the toast.
 */
export class EditDetail extends LibraryBuilder {

    private readonly title = document.querySelector<HTMLTextAreaElement>('#hermidata-title');
    private readonly altToggle = document.querySelector<HTMLButtonElement>('#hermidata-alternative-title-button');
    private readonly altPanel = document.querySelector<HTMLElement>('#hermidata-alternative-titles-panel');
    private readonly altCount = document.querySelector<HTMLElement>('#hermidata-alternative-title-count');
    private readonly novelType = document.querySelector<HTMLSelectElement>('#hermidata-novelType');
    private readonly novelStatus = document.querySelector<HTMLSelectElement>('#hermidata-novelStatus');
    private readonly contentRating = document.querySelector<HTMLSelectElement>('#hermidata-contentRating');
    private readonly releaseDate = document.querySelector<HTMLInputElement>('#hermidata-releaseDate');
    private readonly score = document.querySelector<HTMLElement>('#hermidata-starRating');
    private readonly author = document.querySelector<HTMLInputElement>('#hermidata-author');
    private readonly notes = document.querySelector<HTMLTextAreaElement>('#hermidata-notes-content');

    private readonly cover = document.querySelector<HTMLImageElement>('#hermidata-img');
    private readonly coverButton = document.querySelector<HTMLButtonElement>('#hermidata-cover-btn');
    private readonly coverDialog = document.querySelector<HTMLDialogElement>('#imageChanger-dialog');
    private readonly coverUrl = document.querySelector<HTMLInputElement>('#imageChanger-url');
    private readonly coverUrlConfirm = document.querySelector<HTMLButtonElement>('#imageChanger-url-confirm');
    private readonly coverFile = document.querySelector<HTMLInputElement>('#imageChanger-file');
    private readonly coverError = document.querySelector<HTMLElement>('#imageChanger-error');
    private readonly coverTitle = document.querySelector<HTMLElement>('#imageChanger-title');
    private readonly coverSourceStep = document.querySelector<HTMLElement>('#imageChanger-source');
    private readonly coverCropStep = document.querySelector<HTMLElement>('#imageChanger-crop');
    private readonly cropCurrentButton = document.querySelector<HTMLButtonElement>('#imageChanger-crop-current');
    private readonly cropFrame = document.querySelector<HTMLElement>('#imageChanger-crop-frame');
    private readonly cropBack = document.querySelector<HTMLButtonElement>('#imageChanger-crop-back');
    private readonly cropWhole = document.querySelector<HTMLButtonElement>('#imageChanger-crop-whole');
    private readonly cropSave = document.querySelector<HTMLButtonElement>('#imageChanger-crop-save');
    private readonly cropper = this.createCropper();

    /** The image being cropped, while the crop step is open */
    private coverSource: CoverSource | null = null;

    private readonly entryMenu = document.querySelector<HTMLDetailsElement>('#ov-entry-menu');
    private readonly deleteButton = document.querySelector<HTMLButtonElement>('#delete-info-btn');
    private readonly deleteDialog = document.querySelector<HTMLDialogElement>('#delete-dialog');
    private readonly deleteLabel = document.querySelector<HTMLElement>('#delete-label');
    private readonly deleteCancel = document.querySelector<HTMLButtonElement>('#customPrompt-button-cancel');

    private readonly saveState = document.querySelector<HTMLElement>('#ov-save-state');
    private readonly toast = document.querySelector<HTMLElement>('#ov-toast');
    private readonly toastText = document.querySelector<HTMLElement>('#ov-toast-text');
    private readonly toastUndo = document.querySelector<HTMLButtonElement>('#ov-toast-undo');

    private readonly altTitles: ChipList | null;
    private readonly sources: ChipList | null;
    private readonly genres: TagPicker | null;
    private readonly demographics: TagPicker | null;

    /** The id the entry is stored under; it moves when the title or type change */
    private storedId: string;

    /** Changes are saved one after another so a quick second edit never overtakes the first */
    private queue: Promise<void> = Promise.resolve();

    private undoSnapshot: Hermidata | null = null;
    private toastTimer: number | undefined;
    private saveStateTimer: number | undefined;
    private notesTimer: number | undefined;

    /** Called after an undo replaced the item, so other parts of the page ( markers ) can redraw */
    public onRestore: () => void = () => {};

    private readonly hermidata: HermidataModel;

    constructor(AllHermidata: Record<string, Hermidata>, settings: Settings, hermidata: HermidataModel) {
        super(AllHermidata, settings);
        this.hermidata = hermidata;
        this.storedId = hermidata.id;

        const altList = document.querySelector<HTMLElement>('#hermidata-alternative-titles-list');
        const sourceList = document.querySelector<HTMLElement>('#hermidata-sources');
        const genreField = document.querySelector<HTMLElement>('#hermidata-genres');
        const demographicField = document.querySelector<HTMLElement>('#hermidata-demographics');

        this.altTitles = altList && new ChipList(altList, {
            itemName: 'alternative title',
            onChange: titles => void this.commit('Alternative titles updated', () => { this.hermidata.meta.altTitles = titles; }),
        });
        this.sources = sourceList && new ChipList(sourceList, {
            itemName: 'source',
            isLocked: source => source === this.hermidata.source,
            onChange: sources => void this.commit('Sources updated', () => {
                this.hermidata.meta.altSources = [...new Set([this.hermidata.source, ...sources])];
            }),
        });
        this.genres = genreField && new TagPicker(genreField, {
            itemName: 'genre',
            available: () => this.libraryTags().filter(tag => !DEMOGRAPHIC_TAGS.includes(tag)),
            onChange: tags => void this.commit('Genres updated', () => this.setTags(tags, false)),
        });
        this.demographics = demographicField && new TagPicker(demographicField, {
            itemName: 'demographic',
            available: () => [...new Set([...DEMOGRAPHIC_TAGS, ...this.libraryTags().filter(tag => DEMOGRAPHIC_TAGS.includes(tag))])],
            onChange: tags => void this.commit('Demographic updated', () => this.setTags(tags, true)),
        });
    }

    public build(): void {
        this.fillSelect(this.novelType, this.settings.ContentTypesAndStatuses.TYPE_OPTIONS);
        this.fillSelect(this.novelStatus, this.settings.ContentTypesAndStatuses.NOVEL_STATUS_OPTIONS);
        this.fillSelect(this.contentRating, CONTENT_RATING);
        this.buildScore();

        this.render();
        this.bindFields();
        this.bindCover();
        this.bindDelete();
        this.bindToast();

        new AltTitleLookupPanel(this.hermidata, this.settings, patch => this.applyLookup(patch), () => this.renderAltTitles()).init();
    }

    public reload(): void {
        window.location.reload();
    }

    /** Apply a change, save it and offer an undo. Exposed so the markers card saves the same way */
    public commit: CommitChange = (message, change, options) => {
        const settings: CommitOptions = { undoable: true, ...options };
        const run = async (): Promise<boolean> => {
            const before = structuredClone(this.hermidata.toJSON());
            try {
                change();
                this.setSaveState('saving');
                await this.persist();
                this.setSaveState('saved');
                if (settings.undoable) this.showToast(message, before);
                return true;
            } catch (error) {
                this.restore(before);
                this.setSaveState('failed');
                new ErrorMessage(`Could not save: ${message.toLowerCase()}. The previous value is back.`, undefined, { details: [error] }).sendMessage();
                return false;
            }
        };
        const saved = this.queue.then(run);
        this.queue = saved.then(() => undefined);
        return saved;
    };

    /**
     * What an online lookup found. The patch is applied to the item as it is when this change gets its turn
     * ( not to a copy made earlier ), and saved like every other edit: same queue, same save, same sync.
     */
    private applyLookup(patch: LookupPatch): Promise<LookupApplied> {
        let added: string[] = [];
        const saved = this.commit('Alt titles looked up', () => {
            const result = applyPatch(this.hermidata.toJSON(), patch);
            added = result.added;
            this.hermidata.meta.altTitles = result.item.meta.altTitles;
            this.hermidata.meta.external = result.item.meta.external;
        }, { undoable: false }); // an undo would leave the panel's status line describing the lookup that was undone
        return saved.then(isSaved => ({ saved: isSaved, added }));
    }

    // -- render --

    /** Show the model in every field. Used on load and after an undo */
    private render(): void {
        const meta = this.hermidata.meta;
        if (this.title) {
            this.title.value = this.hermidata.title;
            this.autosize(this.title);
        }
        document.title = `Hermidata — ${this.hermidata.title}`;
        this.renderAltTitles();
        this.setSelect(this.novelType, this.hermidata.novelType);
        this.setSelect(this.novelStatus, meta.novelStatus);
        this.setSelect(this.contentRating, meta.contentRating ?? this.guessContentRating());
        if (this.releaseDate) this.releaseDate.value = this.toDateInput(meta.originalRelease ?? meta.added);
        this.renderScore();
        if (this.author) this.author.value = meta.author ?? '';
        this.sources?.render(meta.altSources.length ? meta.altSources : [this.hermidata.source]);
        this.genres?.render(meta.tags.filter(tag => !DEMOGRAPHIC_TAGS.includes(tag)));
        this.demographics?.render(meta.tags.filter(tag => DEMOGRAPHIC_TAGS.includes(tag)));
        if (this.notes && document.activeElement !== this.notes) this.notes.value = meta.notes ?? '';
        if (this.deleteLabel) this.deleteLabel.textContent = `Delete "${this.hermidata.title}"?`;
    }

    private renderAltTitles(): void {
        const titles = this.hermidata.meta.altTitles;
        this.altTitles?.render(titles);
        if (this.altCount) this.altCount.textContent = titles.length ? String(titles.length) : '';
    }

    private fillSelect(select: HTMLSelectElement | null, options: readonly string[]): void {
        select?.replaceChildren(...options.map(option => new Option(option, option)));
    }

    /** Select the value, adding it first when the settings no longer list it ( so it is never silently changed ) */
    private setSelect(select: HTMLSelectElement | null, value: string): void {
        if (!select) return;
        if (![...select.options].some(option => option.value === value)) select.prepend(new Option(value, value));
        select.value = value;
    }

    private buildScore(): void {
        if (!this.score) return;
        const stars = Array.from({ length: MAX_SCORE }, (_, index) => {
            const value = index + 1;
            const star = document.createElement('button');
            star.type = 'button';
            star.className = 'ov-star';
            star.setAttribute('role', 'radio');
            star.setAttribute('aria-label', `${value} out of ${MAX_SCORE}`);
            star.dataset.value = String(value);
            star.textContent = '★';
            star.addEventListener('click', () => {
                // picking the current score again clears it
                const next = this.hermidata.meta.starRating === value ? 0 : value;
                void this.commit(next ? `Score set to ${next}` : 'Score cleared', () => { this.hermidata.meta.starRating = next; })
                    .then(() => this.renderScore());
            });
            return star;
        });
        const readout = document.createElement('span');
        readout.className = 'ov-score-value';
        readout.setAttribute('aria-hidden', 'true');
        this.score.append(...stars, readout);

        this.score.addEventListener('keydown', (event) => {
            const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
            if (!step) return;
            event.preventDefault();
            const next = Math.min(MAX_SCORE, Math.max(1, (this.hermidata.meta.starRating || 0) + step));
            this.score?.querySelector<HTMLButtonElement>(`[data-value="${next}"]`)?.click();
            this.score?.querySelector<HTMLButtonElement>(`[data-value="${next}"]`)?.focus();
        });
    }

    private renderScore(): void {
        if (!this.score) return;
        const current = Math.round(this.hermidata.meta.starRating || 0);
        for (const star of this.score.querySelectorAll<HTMLButtonElement>('.ov-star')) {
            const value = Number(star.dataset.value);
            star.dataset.filled = String(value <= current);
            star.setAttribute('aria-checked', String(value === current));
            // one tab stop for the whole group: the picked star, or the first one when there is no score
            star.tabIndex = value === (current || 1) ? 0 : -1;
        }
        const readout = this.score.querySelector('.ov-score-value');
        if (readout) readout.textContent = current ? `${current}/${MAX_SCORE}` : 'No score';
    }

    // -- field events --

    private bindFields(): void {
        this.altToggle?.addEventListener('click', () => {
            const open = this.altToggle!.getAttribute('aria-expanded') !== 'true';
            this.altToggle!.setAttribute('aria-expanded', String(open));
            if (this.altPanel) this.altPanel.hidden = !open;
        });

        if (this.title) {
            const title = this.title;
            title.addEventListener('input', () => this.autosize(title));
            title.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') { event.preventDefault(); title.blur(); }
                if (event.key === 'Escape') { title.value = this.hermidata.title; title.blur(); }
            });
            title.addEventListener('change', () => {
                const value = title.value.replace(/\s+/g, ' ').trim();
                if (!value) { title.value = this.hermidata.title; this.autosize(title); return; }
                void this.commit('Title updated', () => { this.hermidata.title = value; }).then(() => this.render());
            });
        }

        this.novelType?.addEventListener('change', () => {
            const value = this.novelType!.value;
            void this.commit(`Type set to ${value}`, () => { this.hermidata.novelType = value; });
        });
        this.novelStatus?.addEventListener('change', () => {
            const value = this.novelStatus!.value;
            void this.commit(`Status set to ${value}`, () => { this.hermidata.meta.novelStatus = value; });
        });
        this.contentRating?.addEventListener('change', () => {
            const value = this.contentRating!.value as ContentRating;
            void this.commit(`Content rating set to ${value}`, () => { this.hermidata.meta.contentRating = value; });
        });
        this.releaseDate?.addEventListener('change', () => {
            const value = this.releaseDate!.value;
            void this.commit(value ? 'Release date updated' : 'Release date cleared', () => {
                this.hermidata.meta.originalRelease = value ? new Date(`${value}T00:00:00`).toISOString() : null;
            }).then(() => this.render());
        });

        if (this.author) {
            const author = this.author;
            author.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') { event.preventDefault(); author.blur(); }
                if (event.key === 'Escape') { author.value = this.hermidata.meta.author ?? ''; author.blur(); }
            });
            author.addEventListener('change', () => {
                const value = author.value.trim();
                void this.commit(value ? 'Author updated' : 'Author cleared', () => { this.hermidata.meta.author = value || undefined; });
            });
        }

        // notes save while typing ( after a short pause ) and when left; the textarea keeps its own undo
        if (this.notes) {
            const notes = this.notes;
            const saveNotes = () => {
                window.clearTimeout(this.notesTimer);
                if (notes.value === (this.hermidata.meta.notes ?? '')) return;
                void this.commit('Notes saved', () => { this.hermidata.meta.notes = notes.value; }, { undoable: false });
            };
            notes.addEventListener('input', () => {
                window.clearTimeout(this.notesTimer);
                this.notesTimer = window.setTimeout(saveNotes, NOTES_SAVE_DELAY);
            });
            notes.addEventListener('blur', saveNotes);
        }
    }

    // -- cover --

    private bindCover(): void {
        if (!this.coverDialog) return;
        const dialog = this.coverDialog;

        this.coverButton?.addEventListener('click', () => {
            const image = this.hermidata.meta.image;
            // prefill a real link only, not the app icon that stands in for a missing cover
            const link = image.kind === 'url' && image.url !== this.hermidata.GetImageDefaultPath() ? image.url : '';
            if (this.coverUrl) this.coverUrl.value = link;
            if (this.cropCurrentButton) this.cropCurrentButton.hidden = this.cover?.dataset.placeholder === 'true';
            this.showCoverStep('source');
            dialog.showModal();
            this.coverUrl?.select();
        });
        dialog.addEventListener('close', () => {
            this.cropper?.dispose();
            this.coverSource = null;
            this.showCoverStep('source');
        });

        const useLink = () => {
            const url = this.coverUrl?.value.trim();
            if (url) void this.openCrop(async () => ({ blob: await this.fetchImage(url), url }));
        };
        this.coverUrlConfirm?.addEventListener('click', useLink);
        this.coverUrl?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') { event.preventDefault(); useLink(); }
        });

        this.coverFile?.addEventListener('change', () => {
            const file = this.coverFile?.files?.[0];
            if (file) void this.openCrop(async () => ({ blob: file, url: null }));
            this.coverFile!.value = '';
        });

        this.cropCurrentButton?.addEventListener('click', () => void this.openCrop(() => this.currentCoverSource()));

        this.cropBack?.addEventListener('click', () => {
            this.showCoverStep('source');
            this.coverUrl?.focus();
        });
        this.cropWhole?.addEventListener('click', () => {
            const source = this.coverSource;
            if (source) void this.withCoverBusy(() => this.changeCover(source, source.blob));
        });
        this.cropSave?.addEventListener('click', () => {
            const source = this.coverSource;
            const cropper = this.cropper;
            if (source && cropper) void this.withCoverBusy(async () => this.changeCover(source, await cropper.export()));
        });
    }

    /** Load the picked image into the crop step */
    private async openCrop(getSource: () => Promise<CoverSource>): Promise<void> {
        await this.withCoverBusy(async () => {
            const source = await getSource();
            if (!source.blob.type.startsWith('image/')) throw new Error('The file is not an image');
            this.coverSource = source;
            this.showCoverStep('crop'); // shown before loading: the cropper measures its frame
            await this.cropper?.load(source.blob);
            this.cropFrame?.focus();
        }, () => this.showCoverStep('source'));
    }

    /**
     * The cover that is shown now. A linked cover is fetched from its link again, so re-cropping starts from
     * the full original rather than from the previous crop; when the link no longer works the shown image is used.
     */
    private async currentCoverSource(): Promise<CoverSource> {
        const image = this.hermidata.meta.image;
        const url = image.kind === 'url' && image.url !== this.hermidata.GetImageDefaultPath() ? image.url : null;
        if (url) {
            try {
                return { blob: await this.fetchImage(url), url };
            } catch (error) {
                console.warn('[Hermidata] Cover link failed, cropping the shown image instead.', error);
            }
        }
        const shown = await this.hermidata.getDisplayImageUrl();
        const blob = await (await fetch(shown)).blob();
        if (shown.startsWith('blob:')) URL.revokeObjectURL(shown);
        return { blob, url };
    }

    private async fetchImage(url: string): Promise<Blob> {
        // fetch follows redirects and gives the real image bytes; don't store the typed url's response unchecked
        const response = await fetch(url);
        if (!response.ok) throw new Error(`The link answered ${response.status} ${response.statusText}`);
        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) throw new Error('The link is not an image');
        return blob;
    }

    /** Store the new cover. A linked cover keeps its link, with the ( cropped ) image cached on this device */
    private async changeCover(source: CoverSource, image: Blob): Promise<void> {
        if (source.url) await this.hermidata.SetImage(source.url, image);
        else await this.hermidata.SetImage(image);
        await this.commit('Cover updated', () => {}, { undoable: false });
        if (this.cover) {
            if (this.cover.src.startsWith('blob:')) URL.revokeObjectURL(this.cover.src);
            this.cover.src = await this.hermidata.getDisplayImageUrl();
        }
        this.coverDialog?.close();
    }

    /** Run a cover step with the dialog's buttons disabled, showing any error in the dialog */
    private async withCoverBusy(task: () => Promise<void>, onError?: () => void): Promise<void> {
        const buttons = this.coverDialog?.querySelectorAll<HTMLButtonElement>('button') ?? [];
        for (const button of buttons) button.disabled = true;
        this.showCoverError('');
        try {
            await task();
        } catch (error) {
            onError?.();
            this.showCoverError(error instanceof Error ? error.message : String(error));
        } finally {
            for (const button of buttons) button.disabled = false;
        }
    }

    private showCoverStep(step: 'source' | 'crop'): void {
        if (this.coverSourceStep) this.coverSourceStep.hidden = step !== 'source';
        if (this.coverCropStep) this.coverCropStep.hidden = step !== 'crop';
        if (this.coverTitle) this.coverTitle.textContent = step === 'crop' ? 'Crop cover' : 'Change cover';
    }

    private createCropper(): CoverCropper | null {
        const image = document.querySelector<HTMLImageElement>('#imageChanger-crop-img');
        const zoom = document.querySelector<HTMLInputElement>('#imageChanger-zoom');
        return this.cropFrame && image && zoom ? new CoverCropper(this.cropFrame, image, zoom) : null;
    }

    private showCoverError(message: string): void {
        if (!this.coverError) return;
        this.coverError.textContent = message ? `Could not use this image: ${message}` : '';
        this.coverError.hidden = !message;
    }

    // -- delete --

    private bindDelete(): void {
        this.deleteButton?.addEventListener('click', () => {
            if (this.entryMenu) this.entryMenu.open = false;
            if (!this.deleteDialog) return;
            this.deleteDialog.returnValue = ''; // only the Delete button may confirm, never a value left from last time
            this.deleteDialog.showModal();
            this.deleteCancel?.focus(); // the safe choice has focus
        });
        this.deleteDialog?.addEventListener('close', () => {
            if (this.deleteDialog?.returnValue === 'delete') void this.deleteEntry();
        });
        document.addEventListener('click', (event) => {
            if (this.entryMenu?.open && !this.entryMenu.contains(event.target as Node)) this.entryMenu.open = false;
        });
    }

    private async deleteEntry(): Promise<void> {
        const id = this.storedId;
        await this.queue; // let a pending save finish first, so it can't write the entry back
        try {
            await this.db.removeHermidata(id);
            delete this.AllHermidata[id];
            console.log(`[Hermidata] %cRemoved Hermidata%c \nDeleted at ${new Date().toLocaleString()} | id: ${id} | title: ${this.hermidata.title} `,
                'color: red; font-weight: bold;', 'color: inherit; font-weight: normal;'
            );
            openLink('./Library.html', 'sameTab');
        } catch (error) {
            new ErrorMessage('Could not delete this entry.', undefined, { details: [error] }).sendMessage();
        }
    }

    // -- saving --

    /** Write the model. A changed title or type gives the entry a new id, which the url follows */
    private async persist(): Promise<void> {
        const oldId = this.storedId;
        const hash = generateHermidataHash(this.hermidata.title, this.hermidata.novelType, this.hermidata.GetUrl());
        const newId = getFreeKey(oldId, hash, this.AllHermidata);

        if (newId === oldId) {
            const entry = this.hermidata.toJSON();
            await this.db.saveHermidata(oldId, entry);
            this.AllHermidata[oldId] = entry;
            return;
        }

        const image = this.hermidata.meta.image;
        if (image.kind === 'stored' && image.id === oldId) this.hermidata.meta.image = { ...image, id: newId };
        this.hermidata.id = newId;
        const entry = this.hermidata.toJSON();
        await this.db.moveHermidata(oldId, newId, entry);

        delete this.AllHermidata[oldId];
        this.AllHermidata[newId] = entry;
        this.storedId = newId;
        history.replaceState(null, '', `#/id/${newId}`);
    }

    /** Put a saved copy back into the model, keeping the id the entry is stored under */
    private restore(snapshot: Hermidata): void {
        const copy = structuredClone(snapshot);
        Object.assign(this.hermidata, copy, { id: this.storedId });
        this.render();
        this.onRestore();
    }

    private undo = async (): Promise<void> => {
        const snapshot = this.undoSnapshot;
        if (!snapshot) return;
        this.hideToast();
        await this.commit('Change undone', () => this.restore(snapshot), { undoable: false });
    };

    // -- feedback --

    private bindToast(): void {
        this.toastUndo?.addEventListener('click', () => void this.undo());
        document.addEventListener('keydown', (event) => {
            const isUndo = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z';
            const inTextField = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
            if (!isUndo || inTextField || !this.undoSnapshot) return;
            event.preventDefault();
            void this.undo();
        });
    }

    private showToast(message: string, snapshot: Hermidata): void {
        if (!this.toast || !this.toastText) return;
        this.undoSnapshot = snapshot;
        this.toastText.textContent = message;
        this.toast.hidden = false;
        window.clearTimeout(this.toastTimer);
        this.toastTimer = window.setTimeout(() => this.hideToast(), TOAST_DURATION);
    }

    private hideToast(): void {
        window.clearTimeout(this.toastTimer);
        this.undoSnapshot = null;
        if (this.toast) this.toast.hidden = true;
    }

    private setSaveState(state: SaveState): void {
        if (!this.saveState) return;
        window.clearTimeout(this.saveStateTimer);
        this.saveState.dataset.state = state;
        this.saveState.textContent = { saving: 'Saving…', saved: 'Saved', failed: 'Not saved' }[state];
        if (state === 'saved') this.saveStateTimer = window.setTimeout(() => { this.saveState!.textContent = ''; }, 2000);
    }

    // -- helpers --

    private setTags(tags: string[], demographic: boolean): void {
        const others = this.hermidata.meta.tags.filter(tag => DEMOGRAPHIC_TAGS.includes(tag) !== demographic);
        this.hermidata.meta.tags = [...new Set([...others, ...tags].filter(tag => tag.trim() !== ''))];
    }

    private libraryTags(): string[] {
        return Array.from(getAllTags(this.AllHermidata).keys());
    }

    /** The content rating older entries never had, guessed from their tags */
    private guessContentRating(): string {
        const tags = this.hermidata.meta.tags;
        if (tags.includes('Hentai')) return 'Pornographic';
        if (tags.includes('Ecchi')) return 'Suggestive';
        return 'Safe';
    }

    /** yyyy-mm-dd in local time, as `<input type="date">` wants it */
    private toDateInput(iso: string | null | undefined): string {
        if (!iso) return '';
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return '';
        const pad = (value: number) => String(value).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    private autosize(textarea: HTMLTextAreaElement): void {
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
    }
}
