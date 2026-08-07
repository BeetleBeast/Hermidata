import { RSSPageBuilder } from "../build";


interface TagMap {
    input: HTMLInputElement;
    div: HTMLDivElement;
    textarea: HTMLTextAreaElement;
    select: HTMLSelectElement;
    img: HTMLImageElement;
    button: HTMLButtonElement;
    date: HTMLInputElement;
}

interface SwitchConfig {
    element: HTMLDivElement | HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLImageElement | HTMLButtonElement | null;
    switchTo: keyof TagMap;
    inputType?: 'text' | 'number' | 'image' | 'date';
}

export class EditDetail extends RSSPageBuilder {

    private readonly cancelBtn = document.querySelector<HTMLDivElement>('#cancel-edit-btn')
    private readonly saveBtn = document.querySelector<HTMLDivElement>('#edit-info-btn')

    private saveButtonCurrentMode: 'Edit' | 'Save' = 'Edit'

    public build(): void {

        this.eventListener();

    }
    public reload(): void {
        // force page reload
        window.location.reload();
    }
    public activate(): void {

        // 1. set cancel button
        if (!this.cancelBtn) throw new Error('Cancel button not found');
        this.cancelBtn.style.display = 'flex';

        // 2. set all inputs to editable
        this.changeAllInputsToEditable();

        this.hideButtons();
    }


    public deactivate(mode: 'cancel' | 'save'): void {
        // 1. set cancel button
        if (!this.cancelBtn) throw new Error('Cancel button not found');
        this.cancelBtn.style.display = 'none';
        
        // 2. set all inputs to editable
        this.changeAllInputsBack();
        
        this.showButtons();

        throw new Error("Method not implemented.");

    }
    private eventListener(): void {

        // cancel button
        this.cancelBtn?.addEventListener('click', () => {
            this.changeEditButton('Edit');
            this.deactivate('cancel');
        })

        // save button
        this.saveBtn?.addEventListener('click', () => {
            if (this.saveButtonCurrentMode === 'Edit') {
                this.changeEditButton('Save');
                this.activate();
            } else {
                this.changeEditButton('Edit');
                this.deactivate('save');
            }
        });

    }
    private changeEditButton(changeTo: 'Save' | 'Edit'): void {
        const button = this.saveBtn!;
        button.classList.toggle('edit', changeTo === 'Edit');
        button.textContent = changeTo;

        this.saveButtonCurrentMode = changeTo;
    }
    private showButtons() {
        // show edit star rating button
        const starRatingEditButton = document.querySelector<HTMLDivElement>('#hermidata-starRating-edit');
        if (!starRatingEditButton) throw new Error('Star rating edit button not found');
        starRatingEditButton.style.display = 'block';
    }
    private hideButtons() {
        // hide edit star rating button
        const starRatingEditButton = document.querySelector<HTMLDivElement>('#hermidata-starRating-edit');
        if (!starRatingEditButton) throw new Error('Star rating edit button not found');
        starRatingEditButton.style.display = 'none';
    }
    private changeAllInputsBack() {
        const allInputs = new Map<HTMLElement | null, [keyof TagMap, 'text' | 'number' | 'image' | 'date' | undefined]>([
            [document.querySelector<HTMLInputElement>('#hermidata-img'), ['img', undefined]], // image

            [document.querySelector<HTMLInputElement>('#hermidata-title'), ['div', undefined]], // main title
            // [document.querySelector<HTMLTextAreaElement>('#hermidata-alternative-titles-list'), ['div', undefined]], // alternative titles container

            [document.querySelector<HTMLSelectElement>('#hermidata-novelType'), ['div', undefined]], // novel type
            [document.querySelector<HTMLSelectElement>('#hermidata-contentRating'), ['div', undefined]], // content Rating
            [document.querySelector<HTMLInputElement>('#hermidata-contentRating'), ['div', undefined]], // hermidata-releaseDate
            [document.querySelector<HTMLSelectElement>('#hermidata-novelStatus'), ['div', undefined]], // novel Status

            [document.querySelector<HTMLInputElement>('#hermidata-starRating'), ['div', undefined]], // star Rating

            // genres | special case handled separately
            // demographics | special case handled separately
            [document.querySelector<HTMLInputElement>('#hermidata-sources'), ['div', undefined]], // hermidata Sources
            [document.querySelector<HTMLInputElement>('#hermidata-latestRelease'), ['div', undefined]], // latest Release

        ]);

        for (const [element, [switchTo, inputType]] of allInputs) {
            if (element) {
                if (inputType && switchTo === 'input') this.switchElement(element, switchTo, inputType, true);
                else if (switchTo !== 'input') this.switchElement(element, switchTo, true);
                else throw new Error("Element not found.");
            }
        }

        ///notes Content | set read only
        document.querySelector<HTMLTextAreaElement>('#hermidata-notes-content')?.setAttribute('readonly', '');
    }

    private changeAllInputsToEditable() {
        const allInputs: SwitchConfig[] = [
            { element: document.querySelector<HTMLImageElement>('#hermidata-img'), switchTo: 'input', inputType: 'image' }, // image

            { element: document.querySelector<HTMLHeadingElement>('#hermidata-title'), switchTo: 'input', inputType: 'text' }, // main title
            // [document.querySelector<HTMLDivElement>('#hermidata-alternative-titles-list'), ['textarea', undefined]], // alternative titles container

            { element: document.querySelector<HTMLDivElement>('#hermidata-novelType'), switchTo: 'select',inputType:  undefined }, // novel type
            { element: document.querySelector<HTMLDivElement>('#hermidata-contentRating'), switchTo: 'select', inputType: undefined }, // content Rating
            { element: document.querySelector<HTMLDivElement>('#hermidata-contentRating'), switchTo: 'input', inputType: 'text' }, // hermidata-releaseDate
            { element: document.querySelector<HTMLDivElement>('#hermidata-novelStatus'), switchTo: 'select', inputType: undefined }, // novel Status

            { element: document.querySelector<HTMLDivElement>('#hermidata-starRating'), switchTo: 'input', inputType: 'number' }, // star Rating

            // genres | special case handled separately
            // demographics | special case handled separately
            { element: document.querySelector<HTMLDivElement>('#hermidata-sources'), switchTo: 'input', inputType: 'text' }, // hermidata Sources
            { element: document.querySelector<HTMLDivElement>('#hermidata-latestRelease'), switchTo: 'input', inputType: 'text' }, // latest Release

        ];

        for (const { element, switchTo, inputType } of allInputs) {
            if (element) {
                if (inputType && switchTo === 'input') this.switchElement(element, switchTo, inputType, true);
                else if (switchTo !== 'input') this.switchElement(element, switchTo, true);
                else throw new Error("Element not found.");
            }
        }


        // notes Content | remove read only
        document.querySelector<HTMLTextAreaElement>('#hermidata-notes-content')?.removeAttribute('readonly');
    }

    // overload: switching to 'input' — inputType required
    private switchElement<K extends 'input'>( element: HTMLElement, switchTo: K, inputType: 'text' | 'number' | 'image' | 'date', transferContent?: boolean ): TagMap[K];

    // overload: switching to anything else — no inputType
    private switchElement<K extends Exclude<keyof TagMap, 'input'>>( element: HTMLElement, switchTo: K, transferContent?: boolean ): TagMap[K];

    // implementation signature — must be compatible with BOTH overloads above
    private switchElement( element: HTMLElement, switchTo: keyof TagMap, inputTypeOrTransferContent?: 'text' | 'number' | 'image' | 'date' | boolean, transferContent = false ): HTMLElement {

        // disambiguate which overload was actually called
        let inputType: 'text' | 'number' | 'date' | 'image' = 'text';
        let doTransfer = transferContent;

        if (switchTo === 'input') {
            inputType = (inputTypeOrTransferContent as 'text' | 'number' | 'image' | 'date') ?? 'text';
            doTransfer = transferContent;
        } else {
            doTransfer = (inputTypeOrTransferContent as boolean) ?? false;
        }

        // 1. create new element
        const newElement = document.createElement(switchTo);
        if (switchTo === 'input') {
            (newElement as HTMLInputElement).type = inputType;
        }

        // 2. copy attributes
        for (const attr of element.attributes) {
            newElement.setAttribute(attr.name, attr.value);
        }
        newElement.dataset.editing = 'true';

        // 3. transfer content
        if (doTransfer) {
            const value = this.getElementContent(element);
            this.setElementContent(newElement, value);
        }

        // 4. replace element
        element.replaceWith(newElement);

        // 5. return new element
        return newElement;
    }
    private isValueElement(element: HTMLElement): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
        return element instanceof HTMLInputElement
            || element instanceof HTMLTextAreaElement
            || element instanceof HTMLSelectElement;
    }

    private getElementContent(element: HTMLElement): string {
        return this.isValueElement(element)
            ? element.value
            : (element.textContent ?? '');
    }

    private setElementContent(element: HTMLElement, value: string): void {
        if (this.isValueElement(element)) {
            element.value = value;
        } else {
            element.textContent = value;
        }
    }
}