import { ImportsAndExports } from "./build/ImportsAndExports";
import { ExtensionBehaviour } from "./build/ExtensionBehaviour";
import { DefaultBookmarkInputs } from "./build/DefaultBookmarkInputs";
import { Account_Connection } from "./build/Account_Connection";
import { ContentTypesAndStatuses } from "./build/ContentTypesAndStatuses";
import { TagManagement } from "./build/TagManagement";
import { SideBar } from "./SideBar";
import { FolderMapping } from "./build/FolderMapping";

export class BuildController {
    private readonly sidebar: SideBar = new SideBar();
    
    private readonly accountConnection = new Account_Connection();
    
    private readonly extensionBehaviour = new ExtensionBehaviour();
    
    private readonly defaultBookmarkInputs = new DefaultBookmarkInputs();
    
    private readonly contentTypesAndStatuses = new ContentTypesAndStatuses();
    
    private readonly tagManagement = new TagManagement();
    
    private readonly folderMapping = new FolderMapping();
    
    private readonly importAndExport = new ImportsAndExports();
    
    // Track which sections are initialized
    private readonly initializedSections = new Set<string>();
    
    public async init() {
        await this.sidebar.init();
        
        // Register callback for section changes
        this.sidebar.onSectionChange((section) => {
            this.showSection(section);
        });
        
        // Show initial section
        await this.showSection('account-connection');
    }
    
    private async showSection(sectionId: string) {
        // Hide all containers
        this.hideAllSections();
        
        // Show and initialize the selected section
        switch (sectionId) {
            case 'account-connection':
                this.showContainer('account-connection-content');
                await this.initIfNeeded('account-connection', () => this.accountConnection.init());
                break;
                
            case 'extension-behaviour':
                this.showContainer('extension-behaviour-content');
                await this.initIfNeeded('extension-behaviour', () => this.extensionBehaviour.init());
                break;
                
            case 'default-bookmarks':
                this.showContainer('default-bookmarks-content');
                await this.initIfNeeded('default-bookmarks', () => this.defaultBookmarkInputs.init());
                break;
                
            case 'content-types':
                this.showContainer('content-types-content');
                await this.initIfNeeded('content-types', () => this.contentTypesAndStatuses.init());
                break;
                
            case 'tag-management':
                this.showContainer('tag-management-content');
                await this.initIfNeeded('tag-management', () => this.tagManagement.init());
                break;
                
            case 'folder-mapping':
                this.showContainer('folder-mapping-content');
                await this.initIfNeeded('folder-mapping', () => this.folderMapping.init());
                break;
                
            case 'import-export':
                this.showContainer('import-export-content');
                await this.initIfNeeded('import-export', () => this.importAndExport.init());
                break;
        }
    }
    
    private hideAllSections() {
        const containers = [
            'account-connection-content',
            'extension-behaviour-content',
            'default-bookmarks-content',
            'content-types-content',
            'tag-management-content',
            'folder-mapping-content',
            'import-export-content'
        ];
        
        containers.forEach(id => {
            const element = document.getElementById(id);
            if (element) element.style.display = 'none';
        });
    }
    
    private showContainer(containerId: string) {
        const element = document.getElementById(containerId);
        if (element) element.style.display = 'block';
    }
    
    private async initIfNeeded(sectionId: string, initFn: () => Promise<void>) {
        if (!this.initializedSections.has(sectionId)) {
            await initFn();
            this.initializedSections.add(sectionId);
        }
    }
}