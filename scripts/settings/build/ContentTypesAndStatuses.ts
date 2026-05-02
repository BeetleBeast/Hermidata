import { it } from "vitest";
import type { AnyNovelStatus, AnyNovelType, AnyReadStatus, Settings } from "../../shared/types";
import { getElement } from "../../utils/Selection";
import { Build } from "../build";

export class ContentTypesAndStatuses extends Build {

    private readonly newNovelType = getElement<HTMLSelectElement>("#newNovelType");
    private readonly newNovelStatus = getElement<HTMLSelectElement>("#newNovelStatus");
    private readonly newReadStatus = getElement<HTMLSelectElement>("#newReadStatus");

    private readonly newNovelTypeBtn = getElement<HTMLButtonElement>("#newNovelTypeBtn");
    private readonly newNovelStatusBtn = getElement<HTMLButtonElement>("#newNovelStatusBtn");
    private readonly newReadStatusBtn = getElement<HTMLButtonElement>("#newReadStatusBtn");

    private readonly EditNovelType = getElement<HTMLDivElement>("#EditNovelType");
    private readonly EditNovelStatuses = getElement<HTMLDivElement>("#EditNovelStatuses");
    private readonly EditReadStatuses = getElement<HTMLDivElement>("#EditReadStatuses");

    private settings: Settings | null = null;

    public async init() {

        await this.populateSelects();

        this.bindEvents();
    }

    private bindEvents() {
        this.newNovelTypeBtn?.addEventListener("click", () => this.saveNewNovelType());
        this.newNovelStatusBtn?.addEventListener("click", () => this.saveNewNovelStatus());
        this.newReadStatusBtn?.addEventListener("click", () => this.saveNewReadStatus());


    }

    private async populateSelects() {
        this.settings = await this.getSettings();

        const AllNovelTypes = this.settings.ContentTypesAndStatuses.TYPE_OPTIONS;
        const AllNovelStatuses = this.settings.ContentTypesAndStatuses.NOVEL_STATUS_OPTIONS;
        const AllReadStatuses = this.settings.ContentTypesAndStatuses.STATUS_OPTIONS;

        if (!this.EditNovelType || !this.EditNovelStatuses || !this.EditReadStatuses) return;

        for (const novelType of AllNovelTypes) this.CreateEditAndRemoveDiv(this.EditNovelType, novelType);
        
        for (const NovelStatus of AllNovelStatuses) this.CreateEditAndRemoveDiv(this.EditNovelStatuses, NovelStatus);
        
        for (const ReadStatus of AllReadStatuses) this.CreateEditAndRemoveDiv(this.EditReadStatuses, ReadStatus);
    };
    private CreateEditAndRemoveDiv(container: HTMLDivElement, input: AnyNovelType | AnyNovelStatus | AnyReadStatus ): HTMLDivElement {
        if (!container) return container;

        const item = document.createElement("div");
        item.classList = "EditORemoveItem";

        const inputElement = document.createElement("input");
        inputElement.type = "text";
        inputElement.classList = "EditORemoveItem-input";
        inputElement.value = input;

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.classList = "EditORemoveItem-removeBtn";
        removeBtn.textContent = "Remove";
        removeBtn.addEventListener("click", () => {
            const settings = this.settings;
            if (!settings) return;
            // cannot remove last
            if (
                settings.ContentTypesAndStatuses.TYPE_OPTIONS.length === 1 || 
                settings.ContentTypesAndStatuses.NOVEL_STATUS_OPTIONS.length === 1 || 
                settings.ContentTypesAndStatuses.STATUS_OPTIONS.length === 1 ) return;

            item.remove(); // remove front-end
            settings.ContentTypesAndStatuses.TYPE_OPTIONS = settings.ContentTypesAndStatuses.TYPE_OPTIONS.filter((novelType) => novelType !== input);
            settings.ContentTypesAndStatuses.NOVEL_STATUS_OPTIONS = settings.ContentTypesAndStatuses.NOVEL_STATUS_OPTIONS.filter((novelStatus) => novelStatus !== input);
            settings.ContentTypesAndStatuses.STATUS_OPTIONS = settings.ContentTypesAndStatuses.STATUS_OPTIONS.filter((readStatus) => readStatus !== input);
            this.setSettings(settings);
        });

        item.append(inputElement, removeBtn);
        container.appendChild(item);
        return container;
    }



    private async saveNewNovelType() {
        const settings = await this.getSettings();
        const newNovelType = this.newNovelType?.value as AnyNovelType | undefined;

        if (!newNovelType) return;

        settings.ContentTypesAndStatuses.TYPE_OPTIONS.push(newNovelType);

        this.setSettings(settings);
    }
    private async saveNewNovelStatus() {
        const settings = await this.getSettings();
        const newNovelStatus = this.newNovelStatus?.value as AnyNovelType | undefined;

        if (!newNovelStatus) return;
        
        settings.ContentTypesAndStatuses.NOVEL_STATUS_OPTIONS.push(newNovelStatus);

        this.setSettings(settings);
    }
    private async saveNewReadStatus() {
        const settings = await this.getSettings();
        const newReadStatus = this.newReadStatus?.value as AnyNovelType | undefined;

        if (!newReadStatus) return;
        
        settings.ContentTypesAndStatuses.STATUS_OPTIONS.push(newReadStatus);

        this.setSettings(settings);
    }

}