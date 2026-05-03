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
    
    private readonly importAndExport;
    
    private readonly navigations: Map<string, string> = new Map([
        ['account-connection', 'Account_Connection'],
        ['extension-behaviour', 'Extension_Behaviour'],
        ['default-bookmarks', 'DefaultBookmarkSettings'],
        ['content-types', 'ContentTypes_Statuses'],
        ['tag-management', 'TagManagement'],
        ['folder-mapping', 'FolderMapping'],
        ['import-export', 'Import_Export']
    ]);

    private readonly openAccount_Connection = getElement<HTMLButtonElement>(`#open${this.navigations.get('account-connection')}`);
    private readonly openExtension_Behaviour = getElement<HTMLButtonElement>(`#open${this.navigations.get('extension-behaviour')}`);
    private readonly openDefaultBookmarkSettings = getElement<HTMLButtonElement>(`#open${this.navigations.get('default-bookmarks')}`);
    private readonly openContentTypes_Statuses = getElement<HTMLButtonElement>(`#open${this.navigations.get('content-types')}`);
    private readonly openTagManagement = getElement<HTMLButtonElement>(`#open${this.navigations.get('tag-management')}`);
    private readonly openFolderMapping = getElement<HTMLButtonElement>(`#open${this.navigations.get('folder-mapping')}`);
    private readonly openImport_Export = getElement<HTMLButtonElement>(`#open${this.navigations.get('import-export')}`);

    constructor(devMode = false) {
        this.importAndExport = new ImportsAndExports(devMode);
    }

    public async init() {
        this.bindEvents();
        await this.navigateTo(this.openAccount_Connection!, Array.from(this.navigations.keys())[0]);
    }
    
    private bindEvents() {
        const navStrings = Array.from(this.navigations.keys());
        this.openAccount_Connection?.addEventListener('click', (e) => this.navigateTo(e, navStrings[0]));
        this.openExtension_Behaviour?.addEventListener('click', (e) => this.navigateTo(e, navStrings[1]));
        this.openDefaultBookmarkSettings?.addEventListener('click', (e) => this.navigateTo(e, navStrings[2]));
        this.openContentTypes_Statuses?.addEventListener('click', (e) => this.navigateTo(e, navStrings[3]));
        this.openTagManagement?.addEventListener('click', (e) => this.navigateTo(e, navStrings[4]));
        this.openFolderMapping?.addEventListener('click', (e) => this.navigateTo(e, navStrings[5]));
        this.openImport_Export?.addEventListener('click', (e) => this.navigateTo(e, navStrings[6]));
    }
    
    private async navigateTo(e: PointerEvent | HTMLButtonElement, sectionId: string) {
        const target = e instanceof PointerEvent ? e.target as HTMLButtonElement : e;
        if (target.dataset.active === "true") return; // already active, do nothing
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