import { ImportsAndExports } from "./build/ImportsAndExports";
import { ExtensionBehaviour } from "./build/ExtensionBehaviour";
import { DefaultBookmarkInputs } from "./build/DefaultBookmarkInputs";
import { Account_Connection } from "./build/Account_Connection";
import { ContentTypesAndStatuses } from "./build/ContentTypesAndStatuses";
import { TagManagement } from "./build/TagManagement";
import { FolderMapping } from "./build/FolderMapping";
import { getElement } from "../utils/Selection";

export class BuildController {
    private currentSection: string = 'account-connection';
    private readonly initializedSections = new Set<string>();

    private readonly accountConnection = new Account_Connection();
    
    private readonly extensionBehaviour = new ExtensionBehaviour();
    
    private readonly defaultBookmarkInputs = new DefaultBookmarkInputs();
    
    private readonly contentTypesAndStatuses = new ContentTypesAndStatuses();
    
    private readonly tagManagement = new TagManagement();
    
    private readonly folderMapping = new FolderMapping();
    
    private readonly importAndExport = new ImportsAndExports();
    
    private readonly openAccount_Connection = getElement<HTMLButtonElement>('#openAccount_Connection');
    private readonly openExtension_Behaviour = getElement<HTMLButtonElement>('#openExtension_Behaviour');
    private readonly openDefaultBookmarkSettings = getElement<HTMLButtonElement>('#openDefaultBookmarkSettings');
    private readonly openContentTypes_Statuses = getElement<HTMLButtonElement>('#openContentTypes_Statuses');
    private readonly openTagManagement = getElement<HTMLButtonElement>('#openTagManagement');
    private readonly openFolderMapping = getElement<HTMLButtonElement>('#openFolderMapping');
    private readonly openImport_Export = getElement<HTMLButtonElement>('#openImport_Export');
    
    public async init() {
        this.bindEvents();
        await this.navigateTo('account-connection');
    }
    
    private bindEvents() {
        this.openAccount_Connection?.addEventListener('click', () => this.navigateTo('account-connection'));
        this.openExtension_Behaviour?.addEventListener('click', () => this.navigateTo('extension-behaviour'));
        this.openDefaultBookmarkSettings?.addEventListener('click', () => this.navigateTo('default-bookmarks'));
        this.openContentTypes_Statuses?.addEventListener('click', () => this.navigateTo('content-types'));
        this.openTagManagement?.addEventListener('click', () => this.navigateTo('tag-management'));
        this.openFolderMapping?.addEventListener('click', () => this.navigateTo('folder-mapping'));
        this.openImport_Export?.addEventListener('click', () => this.navigateTo('import-export'));
    }
    
    private async navigateTo(sectionId: string) {
        // Update current section
        this.currentSection = sectionId;
        
        // Update button active states
        document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active') );
        
        // Hide all content sections
        document.querySelectorAll<HTMLElement>('.section-content').forEach(section => section.style.display = 'none' );
        
        // Show and initialize selected section
        const container = getElement<HTMLElement>(`#${sectionId}-content`);
        if (container) container.style.display = 'block';
        
        // Initialize section on first visit
        if (!this.initializedSections.has(sectionId)) {
            await this.initializeSection(sectionId);
            this.initializedSections.add(sectionId);
        }
    }
    
    private async initializeSection(sectionId: string) {
        switch (sectionId) {
            case 'account-connection':
                await this.accountConnection.init();
                break;
            case 'extension-behaviour':
                await this.extensionBehaviour.init();
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
        }
    }
    
    public static toggleSidebar() {
        document.getElementById('sidebar')?.classList.toggle('active');
    }
}