import { logConsoleError } from "../shared/utils/ErrorMessage";
import { ImportsAndExports } from "./build/ImportsAndExports";
import { ExtensionBehavior } from "./build/ExtensionBehavior";
import { DefaultBookmarkInputs } from "./build/DefaultBookmarkInputs";
import { Account_Connection } from "./build/Account_Connection";
import { ContentTypesAndStatuses } from "./build/ContentTypesAndStatuses";
import { TagManagement } from "./build/TagManagement";
import { FolderMapping } from "./build/FolderMapping";
import { getElement } from "../shared/utils/Selection";
import { customConfirm } from "../popup/frontend/confirm";

export class BuildController {
    private currentSection: string = 'extension-behavior';
    private readonly initializedSections = new Set<string>();
    private readonly sectionInitializationPromises = new Map<string, Promise<void>>();

    private readonly accountConnection = new Account_Connection();
    
    private readonly extensionBehavior = new ExtensionBehavior();
    
    private readonly defaultBookmarkInputs = new DefaultBookmarkInputs();
    
    private readonly contentTypesAndStatuses = new ContentTypesAndStatuses();
    
    private readonly tagManagement = new TagManagement();
    
    private readonly folderMapping = new FolderMapping();
    
    private readonly importAndExport;
    
    private readonly navigations: Map<string, string> = new Map([
        ['account-connection', 'Account_Connection'],
        ['extension-behavior', 'Extension_Behavior'],
        ['default-bookmarks', 'DefaultBookmarkSettings'],
        ['content-types', 'ContentTypes_Statuses'],
        ['tag-management', 'TagManagement'],
        ['folder-mapping', 'FolderMapping'],
        ['import-export', 'Import_Export'],
        ['browser-bookmark-import', 'BrowserBookmarkImport']
    ]);

    private readonly resetBtn = getElement<HTMLButtonElement>("#reset-dialog-confirm");
    private readonly cancelResetDialog = getElement<HTMLButtonElement>("#reset-dialog-cancel");


    private readonly openAccount_Connection = getElement<HTMLButtonElement>(`#open${this.navigations.get('account-connection')}`);
    private readonly openExtension_Behavior = getElement<HTMLButtonElement>(`#open${this.navigations.get('extension-behavior')}`);
    private readonly openDefaultBookmarkSettings = getElement<HTMLButtonElement>(`#open${this.navigations.get('default-bookmarks')}`);
    private readonly openContentTypes_Statuses = getElement<HTMLButtonElement>(`#open${this.navigations.get('content-types')}`);
    private readonly openTagManagement = getElement<HTMLButtonElement>(`#open${this.navigations.get('tag-management')}`);
    private readonly openFolderMapping = getElement<HTMLButtonElement>(`#open${this.navigations.get('folder-mapping')}`);
    private readonly openImport_Export = getElement<HTMLButtonElement>(`#open${this.navigations.get('import-export')}`);
    private readonly openBrowserBookmarkImport = getElement<HTMLButtonElement>("#openBrowserBookmarkImport");
    private readonly goToExtensionSettings = getElement<HTMLButtonElement>("#goToExtensionSettings");
    private spreadsheetHighlightTimeout: ReturnType<typeof setTimeout> | null = null;

    constructor(devMode = false) {
        this.importAndExport = new ImportsAndExports(devMode);
    }

    public async init() {
        this.bindEvents();
        this.initializeSelectIndicators();
        await this.navigateTo(this.openExtension_Behavior!, this.currentSection);
    }
    
    private bindEvents() {
        this.openAccount_Connection?.addEventListener('click', (e) => this.navigateTo(e, 'account-connection'));
        this.openExtension_Behavior?.addEventListener('click', (e) => this.navigateTo(e, 'extension-behavior'));
        this.openDefaultBookmarkSettings?.addEventListener('click', (e) => this.navigateTo(e, 'default-bookmarks'));
        this.openContentTypes_Statuses?.addEventListener('click', (e) => this.navigateTo(e, 'content-types'));
        this.openTagManagement?.addEventListener('click', (e) => this.navigateTo(e, 'tag-management'));
        this.openFolderMapping?.addEventListener('click', (e) => this.navigateTo(e, 'folder-mapping'));
        this.openImport_Export?.addEventListener('click', (e) => this.navigateTo(e, 'import-export'));
        this.openBrowserBookmarkImport?.addEventListener('click', (e) => this.navigateTo(e, 'browser-bookmark-import'));
        this.goToExtensionSettings?.addEventListener('click', () => this.openSpreadsheetSaveSettings());

        this.cancelResetDialog?.addEventListener('click', () => this.closeResetDialog());
        this.resetBtn?.addEventListener('click', () => this.resetPage(this.currentSection));
    }
    private async navigateTo(e: Event | HTMLButtonElement, sectionId: string) {
        const target = e instanceof HTMLButtonElement ? e : e.currentTarget as HTMLButtonElement;
        if (target.dataset.active === "true" && this.initializedSections.has(sectionId)) return;
        // Update current section
        this.currentSection = sectionId;
        
        // Update button active states
        document.querySelectorAll<HTMLButtonElement>('.nav-item').forEach(btn => btn.dataset.active = "false" );
        
        // Hide all content sections
        document.querySelectorAll<HTMLElement>('.section-content').forEach(section => section.dataset.active = "false" );
        
        // Show and initialize selected section
        const activeElementClassName = this.navigations.get(sectionId);
        const container = getElement<HTMLElement>(`.${activeElementClassName}`);
        if (container) container.dataset.active = "true";
        target.dataset.active = "true";
        
        // Initialize section on first visit
        if (!this.initializedSections.has(sectionId)) {
            let initialization = this.sectionInitializationPromises.get(sectionId);
            if (!initialization) {
                initialization = this.initializeSection(sectionId);
                this.sectionInitializationPromises.set(sectionId, initialization);
            }

            try {
                await initialization;
                if (this.sectionInitializationPromises.get(sectionId) === initialization) {
                    this.sectionInitializationPromises.delete(sectionId);
                }
                this.initializedSections.add(sectionId);
                container?.querySelector(".section-load-error")?.remove();
            } catch (error) {
                if (this.sectionInitializationPromises.get(sectionId) === initialization) {
                    this.sectionInitializationPromises.delete(sectionId);
                }
                logConsoleError(`Failed to initialize settings section "${sectionId}":`, error);
                if (container) {
                    let errorMessage = container.querySelector<HTMLParagraphElement>(".section-load-error");
                    if (!errorMessage) {
                        errorMessage = document.createElement("p");
                        errorMessage.className = "section-load-error";
                        errorMessage.setAttribute("role", "alert");
                        container.prepend(errorMessage);
                    }
                    errorMessage.textContent = "Could not load this section. Click its navigation item to retry.";
                }
            }
        }
    }

    private async openSpreadsheetSaveSettings() {
        if (!this.openExtension_Behavior) return;
        await this.navigateTo(this.openExtension_Behavior, 'extension-behavior');

        const target = getElement<HTMLInputElement>("#SaveToGoogleSpreadsheet");
        const targetRow = target?.closest<HTMLElement>(".setting");
        const setup = getElement<HTMLElement>("#spreadsheetSetup");
        if (!target || !targetRow) return;

        const highlightTargets = [targetRow, ...(target.checked && setup ? [setup] : [])];
        highlightTargets.forEach(element => element.classList.add("settings-target-highlight"));
        target.focus({ preventScroll: true });
        targetRow.scrollIntoView({
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
            block: "center"
        });

        if (this.spreadsheetHighlightTimeout) clearTimeout(this.spreadsheetHighlightTimeout);
        this.spreadsheetHighlightTimeout = setTimeout(() => {
            highlightTargets.forEach(element => element.classList.remove("settings-target-highlight"));
            this.spreadsheetHighlightTimeout = null;
        }, 2400);
    }
    
    private async initializeSection(sectionId: string) {
        switch (sectionId) {
            case 'account-connection':
                await this.accountConnection.init();
                break;
            case 'extension-behavior':
                await this.extensionBehavior.init();
                break;
            case 'default-bookmarks':
                await this.defaultBookmarkInputs.init();
                break;
            case 'content-types':
                await this.contentTypesAndStatuses.init();
                break;
            case 'tag-management':
                await this.tagManagement.init();
                break;
            case 'folder-mapping':
                await this.folderMapping.init();
                break;
            case 'import-export':
                await this.importAndExport.init();
                break;
            case 'browser-bookmark-import':
                await this.importAndExport.init();
                break;
        }
    }

    private initializeSelectIndicators() {
        const enhanceSelect = (select: HTMLSelectElement) => {
            if (select.parentElement?.classList.contains('select-wrap')) return;
            const wrapper = document.createElement('span');
            wrapper.className = 'select-wrap';
            select.parentNode?.insertBefore(wrapper, select);
            wrapper.appendChild(select);
        };

        document.querySelectorAll<HTMLSelectElement>('select').forEach(enhanceSelect);
        new MutationObserver((records) => {
            records.forEach(record => record.addedNodes.forEach(node => {
                if (!(node instanceof HTMLElement)) return;
                if (node instanceof HTMLSelectElement) enhanceSelect(node);
                node.querySelectorAll<HTMLSelectElement>('select').forEach(enhanceSelect);
            }));
        }).observe(document.body, { childList: true, subtree: true });
    }
    private closeResetDialog() {
        const resetDialog = document.querySelector<HTMLDivElement>('#reset-dialog');
        if (!resetDialog) return;

        if (resetDialog.matches(':popover-open')) {
            resetDialog.hidePopover();
        }
    }
    private async resetPage(sectionId: string) {
        // confirm reset
        // const elements = {
        //     container: getElement<HTMLDivElement>(".promptSection"),
        //     label: getElement<HTMLDivElement>(".promptLabel"),
        //     btn1: getElement<HTMLDivElement>(".genericButton1"),
        //     btn2: getElement<HTMLDivElement>(".genericButton2"),
        // }
        // const Confirmation = await customConfirm("Are you sure you want to reset all settings?", {
        //     accept: "Reset",
        //     reject: "Cancel",
        //     elements,
        // });
        
        // reset page values to current settings
        switch (sectionId) {
            case 'account-connection':
                await this.accountConnection.resetValues();
                break;
            case 'extension-behavior':
                await this.extensionBehavior.resetValues();
                break;
            case 'default-bookmarks':
                await this.defaultBookmarkInputs.resetValues();
                break;
            case 'content-types':
                await this.contentTypesAndStatuses.resetValues();
                break;
            case 'tag-management':
                await this.tagManagement.resetValues();
                break;
            case 'folder-mapping':
                await this.folderMapping.resetValues();
                break;
            case 'import-export':
                await this.importAndExport.resetValues();
                break;
        }
    }
    
    public static toggleSidebar() {
        document.getElementById('sidebar')?.classList.toggle('active');
    }
}