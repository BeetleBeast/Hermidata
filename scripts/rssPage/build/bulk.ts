import { customPrompt } from "../../popup/frontend/confirm";
import { getSettings, setAllHermidata } from "../../shared/db/Storage";
import { HermidataMigration } from "../../shared/migration/Hermidata";
import type { Settings } from "../../shared/types";
import { getElement, setElement } from "../../shared/utils/Selection";
import { RSSPageBuilder } from "../build";

export class Bulk extends RSSPageBuilder {


    private readonly bulkEditButton = getElement<HTMLButtonElement>("#bulkEditButton");
    private readonly bulkOpenBtn = getElement<HTMLButtonElement>("#bulkOpen");


    private readonly bulkDelete = getElement<HTMLButtonElement>("#bulkDelete");

    private readonly allEntriesContainer = getElement<HTMLDivElement>('.all-entries-container');

    private readonly bulkEditPanel = getElement<HTMLDivElement>("#bulkEditPanel");
    private readonly bulkEditStatus = getElement<HTMLSelectElement>("#bulkEditStatus");
    private readonly bulkEditType = getElement<HTMLSelectElement>("#bulkEditType");

    private readonly bulkEditTags = getElement<HTMLInputElement>("#bulkEditTags");


    private readonly saveBulkEditButton = getElement<HTMLButtonElement>("#saveBulkEditButton");
    private readonly CancelBulkEdit = getElement<HTMLButtonElement>(".CancelBulkEditButton");


    private readonly mergeTwoHermidatas = getElement<HTMLButtonElement>("#mergeTwoHermidatas");


    private latestExtraInput: Record<string, number> = {};


    public async build(): Promise<void> {
        const settings = await getSettings();
        
        this.populateSelect(settings);

        this.addEventListener();

    }
    public async reload(): Promise<void> {
        this.removeEventListener();
        await this.build();
    }
    private removeEventListener() {
        this.bulkEditButton!.removeEventListener('click', () => this.openBulkEdit());
        this.bulkOpenBtn!.removeEventListener('click', () => this.bulkOpen());

        this.saveBulkEditButton!.removeEventListener('click', () => this.saveBulkEdit());
        this.CancelBulkEdit!.removeEventListener('click', () => this.closeBulkEditPanel());

        this.bulkEditTags!.removeEventListener('input', () => this.getLatestExtraInput());

        this.mergeTwoHermidatas!.removeEventListener('click', () => this.mergeHermidatas());
    }


    private populateSelect(settings: Settings) {
        const { TYPE_OPTIONS: novelTypes, NOVEL_STATUS_OPTIONS: novelStatuses } = settings!.ContentTypesAndStatuses;
        for (const novelType of novelTypes) {
            const option = document.createElement('option');
            option.value = novelType;
            option.textContent = novelType;
            this.bulkEditType?.appendChild(option);
        }
        for (const novelStatus of novelStatuses) {
            const option = document.createElement('option');
            option.value = novelStatus;
            option.textContent = novelStatus;
            this.bulkEditStatus?.appendChild(option);
        }
    }


    private addEventListener(): void {
        this.removeEventListener();
        this.bulkEditButton!.addEventListener('click', () => this.openBulkEdit());
        this.bulkOpenBtn!.addEventListener('click', () => this.bulkOpen());

        this.saveBulkEditButton!.addEventListener('click', () => this.saveBulkEdit());
        this.CancelBulkEdit!.addEventListener('click', () => this.closeBulkEditPanel());

        // add new latest empty input if needed
        this.bulkEditTags!.addEventListener('input', () => this.getLatestExtraInput());

        this.mergeTwoHermidatas!.addEventListener('click', () => this.mergeHermidatas());

    }
    private getLatestExtraInput(): void {
        if ((this.bulkEditTags!.children[this.bulkEditTags!.children.length - 1] as HTMLInputElement).value?.length > 0) this.buildExtraCase('tags', this.bulkEditTags);
    }
    private closeBulkEditPanel() {
        this.bulkEditPanel!.style.right = '-100%';
        this.bulkEditPanel!.dataset.open = 'false';
        setTimeout(() => this.bulkEditPanel!.style.display = 'none', 100);
    }
    private saveBulkEdit() {
        const selected = this.allEntriesContainer?.querySelectorAll('.checkbox:checked');
        if (!selected) return;
        const selectedIds = Array.from(selected).map(el => (el as HTMLInputElement).dataset.id!);

        const allSelectedHermidata = selectedIds.flatMap(id => this.AllHermidata[id]);
        for (const hermidata of allSelectedHermidata) {
            hermidata.novelType = this.bulkEditType!.value;
            hermidata.meta.novelStatus = this.bulkEditStatus!.value;
            hermidata.meta.tags = this.getAllTags(hermidata.meta.tags);
        }
        setAllHermidata(allSelectedHermidata);
        this.closeBulkEditPanel();
    }
    private getAllTags(alreadyInside: string[]): string[] {
        const tags: string[] = [];
        for (const child of this.bulkEditTags!.children) {
            const input = child as HTMLInputElement;
            if (input.value && !tags.includes(input.value) && input.value !== '' && !alreadyInside.includes(input.value)) {
                // force fist letter to uppercase
                const firstLetter = input.value.charAt(0).toUpperCase();
                const restOfWord = input.value.slice(1);
                const inputValue = firstLetter + restOfWord;
                tags.push(inputValue);
            }
        }
        return tags;
    }
    private async buildExtraCase(name: string, container: HTMLDivElement | null) {
        const extraInput = document.createElement('input');
        extraInput.classList.add('detail-option', name);
        this.latestExtraInput[name]++;
        container!.appendChild(extraInput);
    }
    private openBulkEdit() {
        // all entries that are selected
        if (!this.bulkEditPanel) return;
        const selected = this.allEntriesContainer?.querySelectorAll('.checkbox:checked');
        if (!selected) return;
        const selectedIds = Array.from(selected).map(el => (el as HTMLInputElement).dataset.id!);
        

        if (selectedIds.length <= 1) return;

        // if already open, close it
        if (this.bulkEditPanel.dataset.open === 'open') {
            this.closeBulkEditPanel();
            return;
        }
        

        this.openBulkEditPanel(selectedIds);
    }
    private openBulkEditPanel(selectedIds: string[]) {
        if (selectedIds.length === 0) return;
        
        this.bulkEditPanel!.style.display = 'flex';
        this.bulkEditPanel!.style.right = '25px';
        this.bulkEditPanel!.dataset.open = 'open';

        // Populate the bulk edit fields with the first selected item's data
        const firstItemOfList = selectedIds[0];
        if (!firstItemOfList) return;
        const firstItem = this.AllHermidata[firstItemOfList];
        if (!firstItem) return;

        const allTags = Array.from(new Set(Object.values(this.AllHermidata || {}).flatMap(item => item.meta?.tags).filter(tag => tag !== '')));


        setElement<HTMLSelectElement>('#bulkEditType', el => el.value = firstItem.novelType);
        setElement<HTMLSelectElement>('#bulkEditStatus', el => el.value = firstItem.meta.novelStatus);
        this.buildMultipleCases('tags', this.bulkEditTags, allTags, true);

    }

    private buildMultipleCases(name: string, container: HTMLDivElement | null, options: string[], makeExtraInput: boolean) {
        if (!container) return;
        container.innerHTML = '';
        for ( const option of options) {
            const optionEl = document.createElement('input');
            optionEl.classList.add('detail-option', name);
            optionEl.textContent = option;
            optionEl.value = option;
            container.appendChild(optionEl);
        }
        if (makeExtraInput) {
            const extraInput = document.createElement('input');
            extraInput.classList.add('detail-option', name);
            this.latestExtraInput[name]++;
            container.appendChild(extraInput);
        }
    }
    private bulkOpen() {
        const selected = this.allEntriesContainer?.querySelectorAll('.checkbox:checked');
        if (!selected) return;
        const selectedIds = Array.from(selected).map(el => (el as HTMLInputElement).dataset.id!);
        const allHermidata = Array.from(selectedIds).map(id => this.AllHermidata[id]);

        for (const hermidata of allHermidata) window.open(hermidata.url, '_blank');
    }


    private mergeHermidatas() {
        const selected = this.allEntriesContainer?.querySelectorAll('.checkbox:checked');
        if (!selected) return;
        const selectedIds = Array.from(selected).map(el => (el as HTMLInputElement).dataset.id!);

        if (selectedIds.length !== 2) return;
        // force selected IDs to be a tuple of two instead of an array
        const selectedIdsTuple = [selectedIds[0], selectedIds[1]] as [string, string];
        this.openMergePanel(selectedIdsTuple);
    }
    private closeMergePanel() {
        const mergePanel = document.querySelector('.merge-panel');
        if (!mergePanel) return;
        mergePanel.remove();
    }
    private openMergePanel(selectedIds: [string, string]) {
        // force other panels to close
        this.closeBulkEditPanel();
        this.closeMergePanel();

        const parentContainer = getElement('.fullpage-RSS');
        if (!parentContainer) return;
        const mergePanel = document.createElement('div');
        mergePanel.classList.add('merge-panel');
        mergePanel.dataset.open = 'open';
        mergePanel.dataset.ids = selectedIds.join(',');
        parentContainer.appendChild(mergePanel);

        // choose what to merge

        const label = document.createElement('label');
        label.textContent = 'Replace this Hermidata: ';
        mergePanel.appendChild(label);

        const mergingSelect = document.createElement('select');
        mergingSelect.classList.add('merge-select');
        
        mergePanel.appendChild(mergingSelect);

        const label2 = document.createElement('label');
        label2.textContent = 'with this Hermidata: ';
        mergePanel.appendChild(label2);

        const mergingSelect2 = document.createElement('select');
        mergingSelect2.classList.add('merge-select');
        
        mergePanel.appendChild(mergingSelect2);

        const mergeTitle1 = document.createElement('option');
        mergeTitle1.classList.add('merge-detail-1', 'merge-detail-select');
        mergeTitle1.value = 'Hermidata-1';
        mergeTitle1.textContent = 'Hermidata-1';
        mergeTitle1.dataset.id = selectedIds[0];
        
        const mergeTitle2 = document.createElement('option');
        mergeTitle2.classList.add('merge-detail-2', 'merge-detail-select');
        mergeTitle2.value = 'Hermidata-2';
        mergeTitle2.textContent = 'Hermidata-2';
        mergeTitle2.dataset.id = selectedIds[1];
        
        const mergeDetail1 = document.createElement('div');
        mergeDetail1.classList.add('merge-detail-1', 'merge-detail');
        mergeDetail1.dataset.id = selectedIds[0];
        mergePanel.appendChild(mergeDetail1);
        
        const mergeDetail2 = document.createElement('div');
        mergeDetail2.classList.add('merge-detail-2', 'merge-detail');
        mergeDetail2.dataset.id = selectedIds[1];
        mergePanel.appendChild(mergeDetail2);

        this.setMergeDetails(mergeDetail1, selectedIds[0], 'remove');
        this.setMergeDetails(mergeDetail2, selectedIds[1], 'merge');

        mergingSelect.appendChild(mergeTitle1.cloneNode(true));
        mergingSelect.appendChild(mergeTitle2.cloneNode(true));

        mergingSelect2.appendChild(mergeTitle2.cloneNode(true));
        mergingSelect2.appendChild(mergeTitle1.cloneNode(true));


        // buttons
        const mergeBtn = document.createElement('button');
        mergeBtn.textContent = 'Merge';
        mergeBtn.onclick = () => this.mergeHermidata(mergingSelect, mergingSelect2, selectedIds);
        mergePanel.appendChild(mergeBtn);

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.onclick = () => this.closeMergePanel();
        mergePanel.appendChild(closeBtn);
    }
    private setMergeDetails(mergeDetail: HTMLDivElement, selectedId: string, order: 'remove' | 'merge') {
        const hermidata = this.AllHermidata[selectedId];

        const replaceOrder = document.createElement('div');
        replaceOrder.textContent = order === 'remove' ? 'Hermidata-2' : 'Hermidata-1';
        mergeDetail.appendChild(replaceOrder);

        const title = document.createElement('h2');
        title.textContent = hermidata.title;
        mergeDetail.appendChild(title);

        const urlLabel = document.createElement('label');
        urlLabel.textContent = 'URL: ';
        urlLabel.setAttribute('for', `url-${selectedId}`);
        mergeDetail.appendChild(urlLabel);

        const url = document.createElement('a');
        url.href = hermidata.url;
        url.id = `url-${selectedId}`;
        url.textContent = hermidata.url;
        mergeDetail.appendChild(url);

        const currentChapterLabel = document.createElement('label');
        currentChapterLabel.textContent = 'Current chapter: ';
        currentChapterLabel.setAttribute('for', `currentChapter-${selectedId}`);
        mergeDetail.appendChild(currentChapterLabel);

        const currentChapter = document.createElement('div');
        currentChapter.textContent = String(hermidata.chapter.bookmarks[hermidata.chapter.bookmarkInUse].current);
        currentChapter.id = `currentChapter-${selectedId}`;
        mergeDetail.appendChild(currentChapter);

        const latestChapterLabel = document.createElement('label');
        latestChapterLabel.textContent = 'Latest chapter: ';
        latestChapterLabel.setAttribute('for', `latestChapter-${selectedId}`);
        mergeDetail.appendChild(latestChapterLabel);

        const lastUpdated = document.createElement('div');
        lastUpdated.textContent = String(new Date(hermidata.meta.updated).toLocaleString().split(',')[0]);
        lastUpdated.id = `latestChapter-${selectedId}`;
        mergeDetail.appendChild(lastUpdated);

        const tagsLabel = document.createElement('label');
        tagsLabel.textContent = 'Tags: ';
        tagsLabel.setAttribute('for', `tags-${selectedId}`);
        mergeDetail.appendChild(tagsLabel);

        const tagsContainer = document.createElement('div');
        tagsContainer.classList.add('tags-container');
        tagsContainer.id = `tags-${selectedId}`;
        for (const tag of hermidata.meta.tags) {
            const tagEl = document.createElement('div');
            tagEl.classList.add('tag');
            tagEl.textContent = tag;
            tagsContainer.appendChild(tagEl);
        }
        mergeDetail.appendChild(tagsContainer);

        const idLabel = document.createElement('label');
        idLabel.textContent = 'ID: ';
        idLabel.setAttribute('for', `id-${selectedId}`);
        mergeDetail.appendChild(idLabel);

        const id = document.createElement('div');
        id.textContent = selectedId;
        id.id = `id-${selectedId}`;
        mergeDetail.appendChild(id);
    }
    private async mergeHermidata(RemovedSelect: HTMLSelectElement, MergedSelect: HTMLSelectElement, selectedIds: [string, string]) {

        const allHermidata = Array.from(selectedIds).map(id => this.AllHermidata[id]);
        const olderKey = RemovedSelect.selectedOptions[0].dataset.id!;
        const newerKey = MergedSelect.selectedOptions[0].dataset.id!;

        if (olderKey === newerKey) return;

        const older = allHermidata.find(item => item.id === olderKey)!;
        const newer = allHermidata.find(item => item.id === newerKey)!;
        const mergedHermidata = await HermidataMigration.mergeTwoHermidata(newer, older);
        if (mergedHermidata) {
            console.log(`Merged "${older.title}" into "${newer.title}"`);
        }
    }
}