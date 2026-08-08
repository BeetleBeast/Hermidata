import type { AnyNovelStatus, AnyNovelType } from "../../shared/types";
import { HermidataModel } from "../../shared/utils/HermidataSelector";
import { RSSPageBuilder } from "../build";


interface TagMap {
    input: HTMLInputElement;
    div: HTMLDivElement;
    textarea: HTMLTextAreaElement;
    img: HTMLImageElement;
    date: HTMLInputElement;
    option: HTMLOptionElement;
    select: HTMLSelectElement;
    h2: HTMLHeadingElement;
}
/** @constant content rating */
type ContentRating = 'Safe' | 'Pornographic' | 'Explicit';

const CONTENT_RATING_OPTIONS: ContentRating[] = ['Safe', 'Pornographic', 'Explicit'];

type SwitchConfig = MainConfig | InputConfig | divConfig;
interface MainConfig {
    element: HTMLDivElement | HTMLInputElement | HTMLTextAreaElement | HTMLImageElement | HTMLButtonElement | null;
    switchTo: Exclude<keyof TagMap, 'input'>
}
interface InputConfig {
    element: HTMLDivElement | HTMLInputElement | HTMLTextAreaElement | HTMLImageElement | HTMLButtonElement | null;
    switchTo: 'input';
    inputType: 'text' | 'number' | 'image' | 'date';
}
interface divConfig {
    element: HTMLDivElement | HTMLInputElement | HTMLTextAreaElement | HTMLImageElement | HTMLButtonElement | null;
    switchTo: 'div';
    rules: {
        allUpperCase: boolean;
    }
}

type SetMode = 'reset' | 'set';

export class EditDetail extends RSSPageBuilder {

    private readonly hermidata: HermidataModel = this.getCurrentHermidata();

    private readonly cancelBtn = document.querySelector<HTMLDivElement>('#cancel-edit-btn');
    private readonly saveBtn = document.querySelector<HTMLDivElement>('#edit-info-btn');

    private getAllDivToInputs(): SwitchConfig[] {
        return [
            { element: document.querySelector<HTMLImageElement>('#hermidata-img'), switchTo: 'input', inputType: 'image' }, // image

            { element: document.querySelector<HTMLHeadingElement>('#hermidata-title'), switchTo: 'input', inputType: 'text' }, // main title
            // alternative titles container | special case handled separately

            { element: document.querySelector<HTMLDivElement>('#hermidata-contentRating'), switchTo: 'input', inputType: 'text' }, // content rating
            { element: document.querySelector<HTMLDivElement>('#hermidata-releaseDate'), switchTo: 'input', inputType: 'date' }, // release Date

            { element: document.querySelector<HTMLDivElement>('#hermidata-starRating'), switchTo: 'input', inputType: 'number' }, // star Rating

            // genres | special case handled separately
            // demographics | special case handled separately
            { element: document.querySelector<HTMLDivElement>('#hermidata-sources'), switchTo: 'input', inputType: 'text' }, // hermidata Sources
            { element: document.querySelector<HTMLDivElement>('#hermidata-latestRelease'), switchTo: 'input', inputType: 'text' }, // latest Release
        ];
    }
    private getAllInputsBackToDiv(): SwitchConfig[] {
        return [
            { element: document.querySelector<HTMLInputElement>('#hermidata-img'), switchTo: 'img'}, // image

            { element: document.querySelector<HTMLInputElement>('#hermidata-title'), switchTo: 'h2'}, // main title
            // alternative titles container | special case handled separately

            { element: document.querySelector<HTMLInputElement>('#hermidata-contentRating'), switchTo: 'div'}, // // content rating
            { element: document.querySelector<HTMLInputElement>('#hermidata-releaseDate'), switchTo: 'div'}, // release Date

            { element: document.querySelector<HTMLInputElement>('#hermidata-starRating'), switchTo: 'div'}, // star Rating

            // genres | special case handled separately
            // demographics | special case handled separately
            { element: document.querySelector<HTMLInputElement>('#hermidata-sources'), switchTo: 'div'}, // hermidata Sources
            { element: document.querySelector<HTMLInputElement>('#hermidata-latestRelease'), switchTo: 'div'}, // latest Release
        ];
    }

    private saveButtonCurrentMode: 'Edit' | 'Save' = 'Edit'

    public build(): void {

        this.eventListener();

    }
    public reload(): void {
        // force page reload
        window.location.reload();
    }

    private getIdFromUrl(): string | null {
        const hash = window.location.hash; // "#/id/someID"
        const match = hash.match(/^#\/id\/(.+)$/);
        return match ? match[1] : null;
    }

    /** Get the current hermidata from the id parameter inside the url */
    private getCurrentHermidata(): HermidataModel {
        const id = this.getIdFromUrl();
        if (!id) throw new Error("No id found in url");

        const hermidata = this.AllHermidata[id];
        if (!hermidata) throw new Error(`No hermidata found for id ${id}`);

        return new HermidataModel(hermidata);
    }
    public activate(): void {

        // 1. set cancel button
        if (!this.cancelBtn) return;
        this.cancelBtn.style.display = 'flex';

        // 2. set all inputs to editable
        this.changeAllInputsToEditable();

        this.hideButtons();
    }


    public deactivate(mode: 'cancel' | 'save'): void {
        // 1. set cancel button
        if (!this.cancelBtn) return;
        this.cancelBtn.style.display = 'none';
        
        // 2. set all inputs to editable
        this.changeAllInputsBack();
        
        this.showButtons();

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

        for (const {element, switchTo} of this.getAllInputsBackToDiv()) {
            if (!element) continue;
            
            if (switchTo !== 'input') this.switchElement(element, switchTo, true, 'reset');
            else throw new Error("Element not found.");
            
        }

        // notes Content | set read only
        document.querySelector<HTMLTextAreaElement>('#hermidata-notes-content')?.setAttribute('readonly', '');

        // alt titles
        this.changeAltTitleBackToDiv();

        // data group 1 | set select back to div
        this.changeGroup1BackToDiv();

        // data group 2 | set input back to div
        this.changeGroup2BackToDiv();
    }
    private changeGroup1BackToDiv() {
        const group1 = [
            { element: document.querySelector<HTMLSelectElement>('#hermidata-novelType'), switchTo: 'div'}, // novel type
            { element: document.querySelector<HTMLSelectElement>('#hermidata-contentRating'), switchTo: 'div'}, // content Rating
            { element: document.querySelector<HTMLSelectElement>('#hermidata-novelStatus'), switchTo: 'div'}, // novel Status
        ];

        for (const {element, switchTo} of group1) {
            if (!element) continue;
            
            // 1. create new element
            const newElement = document.createElement(switchTo);

            // 2. copy attributes
            for (const attr of element.attributes) newElement.setAttribute(attr.name, attr.value);
            newElement.dataset.editing = 'false';

            // 3. transfer content
            const value = this.getElementContent(element);
            this.setElementContent(newElement, value.toUpperCase());
            
            // 4. replace element
            element.replaceWith(newElement);
        }
    }
    private changeGroup2BackToDiv() {
        const group2: { element: NodeListOf<HTMLInputElement> | null, switchTo: 'div' }[] = [
            { element: document.querySelectorAll<HTMLInputElement>('.hermidata-genre'), switchTo: 'div'}, // genres
            { element: document.querySelectorAll<HTMLInputElement>('.hermidata-demographic'), switchTo: 'div'}, // demographics
        ]

        for (const {element, switchTo} of group2) {
            // if all elements are null, make a empty div
            if ( element !== null && Array.from(element).every(el => el.value === '')) {
                // get parent element
                const parent = element?.[0].parentElement;
                if (!parent) return;
                parent.textContent = '--None--';
                continue;
            }
            if (!element) continue;
            for (const el of element) {
                // if input is empty, do not switch but remove
                if (el.value === '') {
                    el.remove();
                    continue;
                }
                this.switchElement(el, switchTo, true, 'reset');
            }
        }
    }
    private changeAltTitleBackToDiv() {
        const altTitlesContainer = document.querySelector<HTMLTextAreaElement>('#hermidata-alternative-titles-list');

        if (!altTitlesContainer) throw new Error('Alt titles container not found');
        // get the content
        const altTitlesContent = this.hermidata.meta.altTitles;

        const altTitles = this.switchElement(altTitlesContainer, 'div', false, 'reset');

        for (const title of altTitlesContent) {

            // 1. create new element
            const newElement = document.createElement('div');
            newElement.classList.add('hermidata-alternative-title');
            // 3. transfer content
            this.setElementContent(newElement, title);
            
            // 4. append element
            altTitles.appendChild(newElement);
        }

        // re-Attach event listener of alt titles
        const altTitleButton = document.querySelector<HTMLDivElement>('#hermidata-alternative-title-button-text');
        if (!altTitleButton) throw new Error("Alternative title button does not exist");
        altTitleButton?.addEventListener('click', () => {
            altTitles!.dataset.closed = altTitles!.dataset.closed === 'true' ? 'false' : 'true';
            document.querySelector<SVGElement>('.hermidata-alternative-title-button-arrow')!.dataset.closed = altTitles!.dataset.closed;
        });
        
    }
    private changeAltTitleToInput() {
        const altTitlesContainer = document.querySelector<HTMLDivElement>('#hermidata-alternative-titles-list');
        const altTitles = document.querySelectorAll<HTMLDivElement>('.hermidata-alternative-title');
        if (!altTitlesContainer || !altTitles) throw new Error('Alt titles container not found');
        // get the content
        const altTitlesContent = Array.from(altTitles).map(title => title.textContent).join('\n');
        // 1. create new element
        const newElement = document.createElement('textarea');

        // 2. copy attributes
        for (const attr of altTitlesContainer.attributes) newElement.setAttribute(attr.name, attr.value);
        newElement.dataset.editing = 'true';

        // 3. transfer content
        this.setElementContent(newElement, altTitlesContent);
        
        // 4. replace element
        altTitlesContainer.replaceWith(newElement);
    }

    private changeAllInputsToEditable() {

        for (const config of this.getAllDivToInputs()) {
            if (!config.element) continue;

            if (config.switchTo === 'input') this.switchElement(config.element, config.switchTo, config.inputType, true, 'set');
            else this.switchElement(config.element, config.switchTo, true, 'set');
        }


        // notes Content | remove read only
        document.querySelector<HTMLTextAreaElement>('#hermidata-notes-content')?.removeAttribute('readonly');

        // alt titles 
        this.changeAltTitleToInput();

        // data group 1 | set div to select
        this.setGroup1ToSelect();
        
        // data group 2 | set div to input
        this.setGroup2ToInput();
    }
    private setGroup2ToInput() {
        const group2: { element: NodeListOf<HTMLDivElement> | null, switchTo: 'input', inputType: 'text' }[] = [
            { element: document.querySelectorAll<HTMLDivElement>('.hermidata-genre'), switchTo: 'input', inputType: 'text'}, // genres
            { element: document.querySelectorAll<HTMLDivElement>('.hermidata-demographic'), switchTo: 'input', inputType: 'text'}, // demographics
        ];

        for (const {element, switchTo, inputType} of group2) {
            if (!element) continue;
            for (const el of element) this.switchElement(el, switchTo, inputType, true, 'set');
        }
        // if no genres/demographics remove the container text
        if (document.querySelectorAll<HTMLDivElement>('.hermidata-genre').length === 0) {
            const container = document.querySelector<HTMLDivElement>('#hermidata-genres');
            if (!container) return;
            container.textContent = '';
        }
        if (document.querySelectorAll<HTMLDivElement>('.hermidata-demographic').length === 0) {
            const container = document.querySelector<HTMLDivElement>('#hermidata-demographics');
            if (!container) return;
            container.textContent = '';
        }

        // auto new input
        // add new input every time the last empty input is filled
        const container = document.querySelector<HTMLDivElement>('#hermidata-genres');
        if (!container) return;
        this.addNewInput('hermidata-genre', container, 'genre');

        const container2 = document.querySelector<HTMLDivElement>('#hermidata-demographics');
        if (!container2) return;
        this.addNewInput('hermidata-demographic', container2, 'demographic');
    }
    private addNewInput(className: string, container: HTMLDivElement, type: 'genre' | 'demographic'): void {
        const newInput = document.createElement('input');
        newInput.classList.add(className, 'emptyInput', type);
        newInput.setAttribute('is_empty', '');
        newInput.setAttribute('data-editing', 'true');

        const handleInput = () => {
            newInput.removeAttribute('is_empty');
            newInput.removeEventListener('input', handleInput);
            this.addNewInput(className, container, type);
        };

        newInput.addEventListener('input', handleInput);

        container.appendChild(newInput);
    }
    private setGroup1ToSelect() {
        const group1: { element: HTMLDivElement | null, switchTo: 'select', content: AnyNovelType[] | AnyNovelStatus[] | ContentRating[] }[] = [
            { 
                element: document.querySelector<HTMLDivElement>('#hermidata-novelType'), 
                switchTo: 'select', 
                content: this.settings.ContentTypesAndStatuses.TYPE_OPTIONS
            }, // novel type
            { 
                element: document.querySelector<HTMLDivElement>('#hermidata-contentRating'), 
                switchTo: 'select', 
                content: CONTENT_RATING_OPTIONS
            }, // content Rating
            { 
                element: document.querySelector<HTMLDivElement>('#hermidata-novelStatus'), 
                switchTo: 'select', 
                content: this.settings.ContentTypesAndStatuses.NOVEL_STATUS_OPTIONS
            }, // novel Status
        ]

        for (const {element, switchTo, content} of group1) {
            if (!element) continue;
            
            // 1. create new element
            const newElement = document.createElement(switchTo);

            // 2. copy attributes
            for (const attr of element.attributes) newElement.setAttribute(attr.name, attr.value);
            newElement.dataset.editing = 'false';

            // 3. transfer content
            const value = this.getElementContent(element);
            
            // 3.1 get first option from content
            const option = this.getOptionFromValue(value, switchTo);
            // 3.2 get all options from const
            const options = this.getAllOptions(content);

            // 3.3 add option to select
            if (option) newElement.append(option, ...options);

            
            // 4. replace element
            element.replaceWith(newElement);
        }
    }

    // overload: switching to 'input' — inputType required
    private switchElement<K extends 'input'>( element: HTMLElement, switchTo: K, inputType: 'text' | 'number' | 'image' | 'date', transferContent?: boolean, set?: 'reset' | 'set' ): TagMap[K];

    // overload: switching to anything else — no inputType
    private switchElement<K extends Exclude<keyof TagMap, 'input'>>( element: HTMLElement, switchTo: K, transferContent?: boolean, set?: 'reset' | 'set' ): TagMap[K];

    // implementation signature — must be compatible with BOTH overloads above
    private switchElement( element: HTMLElement, switchTo: keyof TagMap, arg3?: 'text' | 'number' | 'image' | 'date' | boolean, arg4?: boolean | 'reset' | 'set', arg5?: 'reset' | 'set'): HTMLElement {

        // disambiguate which overload was actually called
        let inputType: 'text' | 'number' | 'date' | 'image' = 'text';
        let transferContent = false;
        let set: SetMode = 'set';

        if (switchTo === 'input') {
            inputType = (arg3 as typeof inputType) ?? 'text';
            transferContent = (arg4 as boolean) ?? false;
            set = (arg5 as SetMode) ?? 'set';
        } else {
            transferContent = (arg3 as boolean) ?? false;
            set = (arg4 as SetMode) ?? 'set';
        }

        // 1. create new element
        const newElement = document.createElement(switchTo);
        if (switchTo === 'input') {
            (newElement as HTMLInputElement).type = inputType;
        }

        // 2. copy attributes
        for (const attr of element.attributes) {
            if (attr.name === 'style' && element instanceof HTMLTextAreaElement && switchTo === 'div') {
                const strippedStyle = this.removeStyleProperty(attr.value, 'height');
                if (strippedStyle) newElement.setAttribute('style', strippedStyle);
                continue;
            }
            else newElement.setAttribute(attr.name, attr.value);
        }
        newElement.dataset.editing = set === 'reset' ? 'false' : 'true';

        // 3. transfer content
        if (transferContent) {
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
    private removeStyleProperty(styleValue: string, property: string): string {
        return styleValue
            .split(';')
            .map(rule => rule.trim())
            .filter(rule => rule && !rule.toLowerCase().startsWith(`${property.toLowerCase()}:`))
            .join('; ');
    }

    private getElementContent(element: HTMLElement): string {
        if (element instanceof HTMLInputElement && element.type === 'date') return this.isoDateToFrench(element.value)
        return this.isValueElement(element)
            ? element.value
            : (element.textContent ?? '');
    }

    private setElementContent(element: HTMLElement, value: string): void {
        if (!this.isValueElement(element)) element.textContent = value;
        else { 
            if (element instanceof HTMLInputElement && element.type === 'date') element.value = this.frenchDateToISO(value);
            else element.value = value;
        }
    }
    private getOptionFromValue(value: string, element: 'option' | 'select' ): HTMLOptionElement | HTMLSelectElement {
        const opt = document.createElement(element);
        opt.classList.add('select-option');
        opt.value = value;
        opt.textContent = value;
        return opt;
    }
    private getAllOptions(content: string[]): HTMLOptionElement[] {
        return content.map(value => this.getOptionFromValue(value, 'option') as HTMLOptionElement);
    }
}