import { getElement } from "../utils/Selection";


export class SideBar {
    private activeSection: string = 'account-connection';
    private onSectionChangeCallback?: (section: string) => void;
    
    // Get all navigation buttons
    private readonly navButtons: Map<string, HTMLButtonElement> = new Map([
        ['account-connection', document.getElementById('openAccount_Connection') as HTMLButtonElement],
        ['extension-behaviour', document.getElementById('openExtension_Behaviour') as HTMLButtonElement],
        ['default-bookmarks', document.getElementById('openDefaultBookmarkSettings') as HTMLButtonElement],
        ['content-types', document.getElementById('openContentTypes_Statuses') as HTMLButtonElement],
        ['tag-management', document.getElementById('openTagManagement') as HTMLButtonElement],
        ['folder-mapping', document.getElementById('openFolderMapping') as HTMLButtonElement],
        ['import-export', document.getElementById('openImport_Export') as HTMLButtonElement],
    ]);
    
    public async init() {
        this.bindEvents();
        this.setActiveSection('account-connection'); // Set initial active section
    }
    
    private bindEvents() {
        this.navButtons.forEach((button, sectionId) => {
            button?.addEventListener('click', () => {
                this.setActiveSection(sectionId);
            });
        });
    }

    // Allow controller to register a callback
    public onSectionChange(callback: (section: string) => void) {
        this.onSectionChangeCallback = callback;
    }
    
    private setActiveSection(sectionId: string) {
        this.activeSection = sectionId;
        
        // Update button states
        this.navButtons.forEach((button, id) => {
            button?.classList.toggle('active', id === sectionId);
        });
        
        // Notify controller
        this.onSectionChangeCallback?.(sectionId);
    }
    
    public getActiveSection(): string {
        return this.activeSection;
    }
    
    public static toggle() {
        document.getElementById('sidebar')?.classList.toggle('active');
    }
}