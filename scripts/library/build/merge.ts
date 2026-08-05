import { HermidataMigration } from "../../shared/migration/Hermidata";
import type { AnyNovelStatus, AnyNovelType, Bookmark, Hermidata, Settings } from "../../shared/types";
import type { HermidataMigrationConfiguration, MergeAnalysis, ScalarConflict } from "../../shared/types/rss";
import { HermidataModel } from "../../shared/utils/HermidataSelector";
import { RSSPageBuilder } from "../build";

export class HermidataMerge extends RSSPageBuilder {

    

    private get getAllItemWithSelectedCheckboxes(): NodeListOf<HTMLDivElement> | null {
        return document.querySelectorAll<HTMLDivElement>('.hermidata-item:has(.hermidata-item-checkbox:checked)');
    }
    private get getAllCheckboxes(): NodeListOf<HTMLInputElement> | null {
        return document.querySelectorAll<HTMLInputElement>('.hermidata-item-checkbox');
    }



    public build(): void {

        this.eventListener();
        
        this.checkProgress();


    }
    protected reload(): void {
        throw new Error("Method not implemented.");
    }

    constructor(AllHermidata: Record<string, Hermidata>, settings: Settings) {
        super(AllHermidata, settings)
    }
    private closeMergePanel() {
        const mergePanel = document.querySelector<HTMLDivElement>('#merger-dialog');
        if (!mergePanel) return;
        
        if (mergePanel.matches(':popover-open')) {
            mergePanel.hidePopover();
        }
    }
    private removeAllMergeElements(exceptionClass?: string): void {
        const container = document.querySelector('#merger-dialog');
        if (!container) return;

        const allElements = container.querySelectorAll('*');
        for (const element of allElements) {
            if (exceptionClass && element.closest(`${exceptionClass}`)) {
                continue;
            }
            element.remove();
        }
    }

    private eventListener(): void {
        this.getAllCheckboxes?.forEach(checkbox => {
            checkbox.addEventListener('change', () => this.checkProgress())
        })
    }
    private checkProgress(): void {
        if (!this.getAllItemWithSelectedCheckboxes) throw new Error("No items selected found");

        const amountOfSelectedItems = this.getAllItemWithSelectedCheckboxes?.length;
        
        switch(amountOfSelectedItems) {
            case 0:
                this.buildIncompleteMerger('nothing', amountOfSelectedItems);
                break;
                case 1:
                    const FirstTitleId = this.getAllItemWithSelectedCheckboxes[0].dataset.id;
                    const firstTitle = this.AllHermidata[FirstTitleId!].title;
                    this.buildIncompleteMerger('one', amountOfSelectedItems, firstTitle);
                    break;
            case 2:
                const records = this.getAllItemWithSelectedCheckboxes;
                this.buildFirstStepMerger(records);
                break;
            case undefined:
                console.error("No items selected found");
                break;
            default:
                this.buildIncompleteMerger('tooMany', amountOfSelectedItems);
                break;
        }
    }

    private buildIncompleteMerger(completionLevel: 'nothing', amountOfSelectedItems: number): void;
    private buildIncompleteMerger(completionLevel: 'tooMany', amountOfSelectedItems: number): void;
    private buildIncompleteMerger(completionLevel: 'one', amountOfSelectedItems: number, record1Title: string): void;
    private buildIncompleteMerger(completionLevel: 'one' | 'tooMany' | 'nothing', amountOfSelectedItems: number, record1Title?: string): void {
        const container = document.querySelector<HTMLDivElement>('#merger-dialog');

        if (!container) return;

        this.removeAllMergeElements(".merger-dialog-progression-container");
        container.dataset.step = 'incomplete';

        // mini functions
        const textTitle = () => {
            switch (completionLevel) {
                case 'nothing':
                    return 'Nothing selected';
                case 'one':
                    return 'One more to go';
                case 'tooMany':
                    return 'Two many selected';
            }
        }
        const subText = () => {
            switch (completionLevel) {
                case 'nothing':
                    return 'Select 2 records to merge.';
                case 'one':
                    if (!record1Title) throw new Error("No record title given");
                    return `Select a second record to merge "${record1Title}" with.`;
                case 'tooMany':
                    const numberToDeselect = amountOfSelectedItems - 2;
                    return `Merge works on exactly two records. Deselect ${numberToDeselect} to continue.`;
            }
        }
        
        // counter
        const counter = document.createElement('p');
        counter.className = 'merger-dialog-counter';
        const amount = this.getAllItemWithSelectedCheckboxes?.length || 0;
        counter.textContent = `${amount} selected`;
        

        // exit button ( x )
        const exitButton = document.createElement('button');
        exitButton.className = 'merger-dialog-exit';
        exitButton.textContent = 'x';
        exitButton.addEventListener('click', this.closeMergePanel);

        // text
        const text = document.createElement('p');
        text.className = 'merger-dialog-text';
        
        text.textContent = textTitle();
        
        

        // sub text
        const subtext = document.createElement('p');
        subtext.className = 'merger-dialog-subtext';
        
        subtext.textContent = subText();

        // button ( disabled )
        const button = document.createElement('button');
        button.className = 'merger-dialog-button';
        button.disabled = true;
        button.textContent = 'Merge';


        container.append(counter, exitButton, text, subtext, button);
    }

    private buildFirstStepMerger(recordElements: NodeListOf<HTMLDivElement>): void {
        const recordList = Array.from(recordElements.values())
        const selectedItems = recordList.map(record => this.AllHermidata[this.GetHashItem(record)]);

        // reset container
        const container = document.querySelector<HTMLDivElement>('#merger-dialog');
        if (!container) return;

        
        this.removeAllMergeElements(".merger-dialog-progression-container");
        container.dataset.step = 'firstStep';


        // progression
        this.updateProgression(1);
        // const progression = this.createProgression(1);

        // steps
        const steps = document.createElement('div');
        steps.classList.add('merger-dialog-steps');
        steps.textContent = `step 1 of 2`;

        // text
        const text = document.createElement('p');
        text.className = 'merger-dialog-text';
        text.textContent = 'Compare them, then choose which to keep.';

        // blue suggestion text
        const blueSuggestion = document.createElement('p');
        blueSuggestion.className = 'merger-dialog-suggestion';
        const infoIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="info-icon" x="0px" y="0px" width="100" height="100" viewBox="0 0 48 48">
            <path class="cls-1" fill="#2196f3" d="M44,24c0,11.045-8.955,20-20,20S4,35.045,4,24S12.955,4,24,4S44,12.955,44,24z"></path>
            <path class="cls-2" fill="#fff" d="M22 22h4v11h-4V22zM26.5 16.5c0 1.379-1.121 2.5-2.5 2.5s-2.5-1.121-2.5-2.5S22.621 14 24 14 26.5 15.121 26.5 16.5z"></path>
            </svg>`;
        const suggestion = this.calculateSuggestion(selectedItems);
        blueSuggestion.innerHTML = `${infoIcon} Suggested: ${suggestion.finalString}`;

        // record A
        const hermiData_A = new HermidataModel(selectedItems[0]);
        const recordA = this.buildRecord(hermiData_A, 'A', suggestion.recordToKeep);
        
        // record B
        const hermiData_B = new HermidataModel(selectedItems[1]);
        const recordB = this.buildRecord(hermiData_B, 'B',  suggestion.recordToKeep);

        // merge button
        const mergeButton_A = recordA.querySelector<HTMLButtonElement>('.merger-dialog-record-continue-button');
        const mergeButton_B = recordB.querySelector<HTMLButtonElement>('.merger-dialog-record-continue-button');
        if (!mergeButton_A || !mergeButton_B) return;
        const bothButtons = [mergeButton_A, mergeButton_B];
        bothButtons.forEach(button => button.addEventListener('click', () => {
            const recordToKeepLetter = button.dataset.record as 'A' | 'B';
            const keepingRecord = recordToKeepLetter === 'A' ? recordA : recordB;
            const removingRecord = recordToKeepLetter === 'A' ? recordB : recordA;
            const hermidata_keepingRecord = this.AllHermidata[keepingRecord.dataset.hash as string];
            const hermidata_removingRecord = this.AllHermidata[removingRecord.dataset.hash as string];
            this.buildSecondStepMerger(hermidata_keepingRecord, hermidata_removingRecord, recordToKeepLetter)
        }));
        

        // cancel button
        const cancelButton = document.createElement('button');
        cancelButton.className = 'merger-dialog-button';
        cancelButton.textContent = 'Cancel';
        cancelButton.addEventListener('click', this.closeMergePanel);


        container.append( steps, text, blueSuggestion, recordA, recordB, cancelButton);

    }
    private buildSecondStepMerger(recordToKeep: Hermidata, recordToRemove: Hermidata, recordToKeepLetter: 'A' | 'B'): void {
        // reset container
        const container = document.querySelector<HTMLDivElement>('#merger-dialog');
        if (!container) return;

        const merging = this.mergeRecord(recordToKeep, recordToRemove);

        // container.innerHTML = "";
        this.removeAllMergeElements(".merger-dialog-progression-container");
        container.dataset.step = 'secondStep';

        // progression
        this.updateProgression(2, recordToKeepLetter);
        // const progression = this.createProgression(2, recordToKeepLetter);

        // steps
        const steps = document.createElement('div');
        steps.classList.add('merger-dialog-steps');
        steps.textContent = `step 2 of 2`;

        // green field
        const greenField = document.createElement('div');
        greenField.classList.add('merger-dialog-green-field');
        
        // green field text 1
        const greenFieldText1 = document.createElement('p');
        greenFieldText1.classList.add('merger-dialog-green-field-text-1');
        greenFieldText1.textContent = `✓ ${merging.automaticallyMergedFieldsAmount} fields merged automatically.`;
        
        // green field text 2
        const greenFieldText2 = document.createElement('p');
        greenFieldText2.classList.add('merger-dialog-green-field-text-2');
        const greenFieldText2Content = merging.automaticallyMergedFields.flatMap(field => {
            const fieldText = field.split('.')[1];
            const allLetters = fieldText.toLowerCase();
            const firstLetter = fieldText.toLowerCase().at(0);
            if (!firstLetter) return '';
            return allLetters.replace(firstLetter.toLowerCase(), firstLetter.toUpperCase());
        }).join(', ');
        greenFieldText2.textContent = greenFieldText2Content;

        // warning field
        const warningField = document.createElement('div');
        warningField.classList.add('merger-dialog-warning-field');
        
        // warning field text 1
        const warningFieldText1 = document.createElement('p');
        warningFieldText1.classList.add('merger-dialog-warning-field-text');
        warningFieldText1.textContent = `⚠️ ${merging.manuallyMergedFieldsAmount} needs your input.`;
        
        // warning fields
        const waringFieldElements = this.createWarningFields(merging.manuallyMergedFields, recordToKeepLetter);

        // back button
        const cancelButton = document.createElement('button');
        cancelButton.className = 'merger-dialog-button-back';
        cancelButton.textContent = 'Back';
        const recordsElements = this.getAllItemWithSelectedCheckboxes;
        if (!recordsElements) throw new Error('No records found');
        cancelButton.addEventListener('click', () => this.buildFirstStepMerger(recordsElements));

        // merge button
        const mergeButton = document.createElement('button');
        mergeButton.className = 'merger-dialog-button-merge';
        mergeButton.textContent = 'Merge';
        mergeButton.addEventListener('click', async () => this.mergeRecordsAndClosePanel(recordToKeep, recordToRemove, merging));

        // append
        // green field
        greenField.append(greenFieldText1, greenFieldText2);
        // waring field
        warningField.append(warningFieldText1, waringFieldElements);
        
        container.append( steps, greenField, warningField, cancelButton, mergeButton);
    }
    private async mergeRecordsAndClosePanel(recordToKeep: Hermidata, recordToRemove: Hermidata, merging: MergeAnalysis): Promise<void> {
        this.getAllMergedFields(merging);

        const merged = await HermidataMigration.mergeTwoHermidataWithConfiguration(recordToKeep, recordToRemove, merging.configuration);

        console.log("merged", merged);

        this.closeMergePanel();
    }
    private getAllMergedFields(merging: MergeAnalysis): MergeAnalysis {
        const allCheckedRadioButtons = document.querySelectorAll<HTMLInputElement>('.merger-dialog-warning-field-value-input:checked');
        const mergedFields = Array.from(allCheckedRadioButtons.values()).map(input => ({ field: input.dataset.field, value: input.dataset.value, record: input.dataset.record as 'A' | 'B'}));
            for (const mergedField of mergedFields) {
                if ( mergedField.field === undefined || mergedField.value === undefined || mergedField.record === undefined) throw new Error('No field found');
                merging.configuration.resolutions[mergedField.field] = mergedField.record;
            }
        return merging;
    }
    private updateProgression(progression: 1): void;
    private updateProgression(progression: 2, keptRecord: 'A' | 'B'): void;
    private updateProgression(progression: 1 | 2, keptRecord?: 'A' | 'B'): void {
        const step1 = document.querySelector<HTMLDivElement>('.merger-dialog-progression.merger-dialog-progression-1');
        if (!step1) return;
        step1.dataset.progression = String(progression);

        const step1Text = document.querySelector<HTMLParagraphElement>('.merger-dialog-progression-1-text');
        if (!step1Text) return;
        step1Text.textContent = progression === 1 ? '1' : '✓';

        const step1MainText = document.querySelector<HTMLParagraphElement>('.merger-dialog-progression-1-main-text');
        if (!step1MainText) return;
        step1MainText.dataset.progression = String(progression);
        step1MainText.textContent = progression === 1 ? 'Choose which to keep' : `Keep record ${keptRecord}`;

        const step2 = document.querySelector<HTMLDivElement>('.merger-dialog-progression.merger-dialog-progression-2');
        if (!step2) return;
        step2.dataset.progression = String(progression);

        const step2Text = document.querySelector<HTMLParagraphElement>('.merger-dialog-progression-2-text');
        if (!step2Text) return;
        step2Text.dataset.progression = String(progression);

        const step2MainText = document.querySelector<HTMLParagraphElement>('.merger-dialog-progression-2-main-text');
        if (!step2MainText) return;
        step2MainText.dataset.progression = String(progression);
    }
    private createProgression(progression: 1): HTMLDivElement;
    private createProgression(progression: 2, keptRecord: 'A' | 'B'): HTMLDivElement
    private createProgression(progression: 1 | 2, keptRecord?: 'A' | 'B'): HTMLDivElement {
        const container = document.createElement('div');
        container.classList.add('merger-dialog-progression-container');

        // progression 1 circle
        const step1 = document.createElement('div');
        step1.classList.add('merger-dialog-progression', 'merger-dialog-progression-1');
        step1.dataset.progression = String(progression);

        // text in progression 1 circle
        const step1Text = document.createElement('p');
        step1Text.classList.add('merger-dialog-progression-1-text');
        step1Text.textContent = progression === 1 ? '1' : '✓';

        // progression 1 text
        const step1MainText = document.createElement('p');
        step1MainText.classList.add('merger-dialog-progression-1-main-text');
        step1MainText.dataset.progression = String(progression);
        step1MainText.textContent = progression === 1 ? 'Choose which to keep' : `Keep record ${keptRecord}`;

        // svg line
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('merger-dialog-progression-line');
        svg.innerHTML = `<line x1="0" y1="25" x2="100%" y2="25" stroke="var(--border)" stroke-width="1"></line>`;

        // progression 2 circle
        const step2 = document.createElement('div');
        step2.classList.add('merger-dialog-progression', 'merger-dialog-progression-2');
        step2.dataset.progression = String(progression);

        // text in progression 2 circle
        const step2Text = document.createElement('p');
        step2Text.classList.add('merger-dialog-progression-2-text');
        step2Text.dataset.progression = String(progression);
        step2Text.textContent = '2';

        // progression 2 text
        const step2MainText = document.createElement('p');
        step2MainText.classList.add('merger-dialog-progression-2-main-text');
        step2MainText.dataset.progression = String(progression);
        step2MainText.textContent = 'Resolve conflict';



        // append to progression circle
        step1.appendChild(step1Text);
        step2.appendChild(step2Text);
        // append to container
        container.append(step1, step1MainText, svg, step2, step2MainText);

        return container;
    }
    /* returns the record to keep and the reason why */
    private calculateSuggestion(selectedItems: Hermidata[]): { recordToKeep: 'A' | 'B', record: Hermidata, reason: string, finalString: string } {
        // letter to keep
        const itemOne = selectedItems[0];
        const itemTwo = selectedItems[1];
        // TODO: make this better
        // temporary
        const letterToKeep = itemOne.title.length > itemTwo.title.length ? 'B' : 'A';
        const recordToKeep = letterToKeep === 'A' ? itemOne : itemTwo;
        const amountOfFields = Object.keys(recordToKeep).filter(k => {
            const key = k as keyof Hermidata;
            const attribute = recordToKeep[key];
            if (typeof attribute === "number") return attribute > 0;
            else if (typeof attribute === "string") return attribute.length > 0;
            else if (typeof attribute === "boolean") return attribute;
        }).length;


        return {
            recordToKeep: letterToKeep,
            record: itemOne,
            reason: `it has ${amountOfFields} more field${amountOfFields > 1 ? 's' : ''} filled in`,
            finalString: `keep record ${letterToKeep}, it has ${amountOfFields} more field${amountOfFields > 1 ? 's' : ''} filled in`
        }
    }
    private buildRecord(record: HermidataModel, recordLetter: 'A' | 'B', suggestedLetterToKeep: 'A' | 'B'): HTMLDivElement {
        const container = document.createElement('div');
        container.classList.add('merger-dialog-record');
        container.id = `merger-dialog-record-${recordLetter}`;
        container.dataset.record = recordLetter;
        container.dataset.hash = record.id;

        // record letter
        const letter = document.createElement('p');
        letter.classList.add('merger-dialog-record-letter');
        letter.textContent = `Record ${recordLetter}`;
        letter.dataset.suggested = recordLetter === suggestedLetterToKeep ? 'true' : 'false';

        // record title
        const title = document.createElement('p');
        title.classList.add('merger-dialog-record-title');
        title.textContent = `Title: ${record.title ?? 'Unknown'}`;

        // novel Type
        const novelType = document.createElement('p');
        novelType.classList.add('merger-dialog-record-novel-type');
        novelType.textContent = `Novel Type: ${record.novelType ?? 'Unknown'}`;

        // site
        const site = document.createElement('p');
        site.classList.add('merger-dialog-record-site');
        site.textContent = `Site: ${record.source ?? record.meta.altSources[0] ?? 'Unknown'}`;

        // latest chapter
        const latestChapter = document.createElement('p');
        latestChapter.classList.add('merger-dialog-record-latest-chapter');
        latestChapter.textContent = `Latest read Chapter: ${String(record.GetChapter()) ?? 'Unknown'}`;

        // TODO: think of more attributes to add
        // Other??

        // tag label
        const tagLabel = document.createElement('p');
        tagLabel.classList.add('merger-dialog-record-tag-label');
        tagLabel.textContent = 'Tags:';

        // tag container
        const tagContainer = document.createElement('div');
        tagContainer.classList.add('merger-dialog-record-tags-container');
        // tags
        const allTagsUsed = Array.from(new Set(record.meta.tags));
        for (const tag of allTagsUsed) {
            const tags = document.createElement('p');
            tags.classList.add('merger-dialog-record-tag');
            tags.textContent = tag ?? 'Unknown';

            tagContainer.appendChild(tags);
        }

        // last updated
        const lastUpdated = document.createElement('p');
        lastUpdated.classList.add('merger-dialog-record-last-updated');
        lastUpdated.textContent = `Last Updated: ${this.setToFrenchDate(record.meta.updated) ?? 'Unknown'}`;

        // first created
        const firstCreated = document.createElement('p');
        firstCreated.classList.add('merger-dialog-record-first-created');
        firstCreated.textContent = `Created at: ${this.setToFrenchDate(record.meta.added) ?? 'Unknown'}`;

        // continuation button
        const continueButton = document.createElement('button');
        continueButton.classList.add('merger-dialog-record-continue-button');
        continueButton.textContent = `Keep Record ${recordLetter}`;
        continueButton.dataset.record = recordLetter;
        continueButton.dataset.suggested = recordLetter === suggestedLetterToKeep ? 'true' : 'false';



        // append to container
        container.append(letter, title, novelType, site, latestChapter, tagLabel, tagContainer, lastUpdated, firstCreated, continueButton);
        return container;
    }
    private mergeRecord(recordToKeep: Hermidata, recordToRemove: Hermidata): MergeAnalysis {
        const { conflicts, autoResolved } = HermidataMigration.mergeHermidata(recordToKeep, recordToRemove);

        const manuallyMergedFields: Record<string, { A: unknown; B: unknown }> = {};
        const resolutions: Record<string, 'A' | 'B'> = {};
    
        for (const conflict of conflicts) {
        manuallyMergedFields[conflict.path] = { A: conflict.valueA, B: conflict.valueB };
        resolutions[conflict.path] = "A"; // default suggestion: keep recordToKeep's value
        }
    
        return {
            automaticallyMergedFields: autoResolved,
            automaticallyMergedFieldsAmount: autoResolved.length,
            manuallyMergedFieldsAmount: conflicts.length,
            manuallyMergedFields,
            configuration: {
                keepId: recordToKeep.id,
                removeId: recordToRemove.id,
                resolutions,
            },
        };

    }
    private createWarningFields(automaticallyMergedFields: MergeAnalysis['manuallyMergedFields'], suggestedLetterToKeep: 'A' | 'B' ): HTMLDivElement {

        const parent = document.createElement('div');
        parent.classList.add('merger-dialog-warning-fields-container');
        

        for (const [field, value] of Object.entries(automaticallyMergedFields)) {
            // container
            const container = document.createElement('div');
            container.classList.add('merger-dialog-warning-field-container');
            container.dataset.field = field;
            container.id = `merger-dialog-warning-field-${field}`;

            // field
            const fieldElement = document.createElement('p');
            fieldElement.classList.add('merger-dialog-warning-field-title');
            fieldElement.textContent = field;

            // value A container
            const value_A_Container = this.createWarningValue(value.A, field, 'A', suggestedLetterToKeep);

            // value B container
            const valueBContainer = this.createWarningValue(value.B, field, 'B', suggestedLetterToKeep);



            container.append(fieldElement, value_A_Container, valueBContainer);
            parent.appendChild(container);
        }
        return parent;
    }
    private createWarningValue(value: any, field: string, recordLetter: 'A' | 'B', suggestedLetterToKeep?: 'A' | 'B'): HTMLDivElement {
        // container
        const container = document.createElement('div');
        container.classList.add('merger-dialog-warning-field-value-container', `merger-dialog-warning-field-value-container-${recordLetter.toLowerCase()}`);
        container.dataset.value = recordLetter;

        // input
        const input = document.createElement('input');
        input.classList.add('merger-dialog-warning-field-value-input');
        input.value = String(value);
        input.type = "radio";
        input.name = field;
        input.dataset.field = field;
        input.dataset.value = value;
        input.dataset.record = recordLetter;
        input.checked = recordLetter === suggestedLetterToKeep;

        // value
        const valueElement = document.createElement('p');
        valueElement.classList.add('merger-dialog-warning-field-value');
        valueElement.textContent = `"${value}"`;

        // text ( from which record )
        const text = document.createElement('p');
        text.classList.add('merger-dialog-warning-field-value-text');
        text.textContent = `- From record ${recordLetter}`;



        container.append(input, valueElement, text);
        return container;
    }



}