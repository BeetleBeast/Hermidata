import type { AnyNovelType, AnyReadStatus, Settings, FolderMapping as FolderMappingType, FolderRule } from "../../shared/types/index";
import { getElement } from "../../utils/Selection";
import { Build } from "../build";



export class FolderMapping extends Build {

    private readonly FinishedMappingContainer = getElement('#folderMappingContainer');
    
    private readonly SelectNovelType = getElement<HTMLSelectElement>('#newFolderMappingSelectType');
    private readonly SelectReadSatus = getElement<HTMLSelectElement>('#newFolderMappingSelectStatus');
    private readonly PathInput = getElement<HTMLInputElement>('#newFolderMappingPath');
    
    private readonly SaveStatus = getElement<HTMLParagraphElement>('#saveStatus-folderMapping');

    private readonly SaveBtn = getElement<HTMLButtonElement>('#addFolderMapping');

    private readonly Rootpath = getElement<HTMLInputElement>('#editRootpath');
    private readonly DefaultPath = getElement<HTMLInputElement>('#editDefaultPath');
    private readonly SaveDefaultPath = getElement<HTMLButtonElement>('#saveDefaultPathBtn');
    private readonly SaveRootPath = getElement<HTMLButtonElement>('#saveRootpathBtn');

    private readonly AddNovelType = getElement<HTMLButtonElement>('#addNovelType');
    private readonly AddNovelStatus = getElement<HTMLButtonElement>('#addNovelStatus');
    private readonly AddNovelTypeInput = getElement<HTMLInputElement>('#addNovelTypeInput');
    private readonly AddNovelStatusInput = getElement<HTMLInputElement>('#addNovelStatusInput');

    // private readonly ResetBtn = getElement<HTMLButtonElement>('#resetFolderMapping'); // doesn't exist yet

    constructor() {
        super();

        this.SaveBtn?.addEventListener('click', async () => this.saveFolderMapping());

        this.AddNovelType?.addEventListener('click', () => this.addNovelTypeFolder(this.AddNovelTypeInput?.value));
        this.AddNovelStatus?.addEventListener('click', () => this.addNovelStatusFolder(this.AddNovelStatusInput?.value));

        this.SaveDefaultPath?.addEventListener('click', async () => this.setDefaultPath());
        this.SaveRootPath?.addEventListener('click', async () => this.setRootPath());
    }

    async init() {
        // get current OR a default settings
        try {
            const settings = await this.dbRequest<Settings>('settings', 'get', { id: 'Settings', data: null });
            
            this.loadExistingRules(settings);
            this.buildFolderMappingForm(settings);
        } catch (error: any) {
            console.error("Full error object:", error);
            console.error("Error message:", error?.message);
            console.error("Error stack:", error?.stack);
            console.error("Error name:", error?.name);
            
            // If it's a custom error, it might have other properties
            console.error("Raw error:", JSON.stringify(error, null, 2));
            console.error(error);
        }
        
    }

    public static resolveFolder( type: string, status: string, mapping: FolderMappingType ): string {
        // 1. Check overrides first — most specific wins
        if (mapping.overrides?.length) {
            const scored = mapping.overrides
                .map(rule => {
                    const typeMatch   = !rule.type   || rule.type   === type
                    const statusMatch = !rule.status || rule.status === status
                    if (!typeMatch || !statusMatch) return null
                    const score = (rule.type ? 1 : 0) + (rule.status ? 1 : 0)
                    return { path: rule.path, score }
                })
                .filter(Boolean)
                .sort((a, b) => b!.score - a!.score)

            if (scored.length) return scored[0]!.path
        }

        // 2. Apply type alias to consolidate folders
        const folderType = mapping.typeAliases?.[type] ?? type;

        // 3. Build path from root + type + statusFolder
        const statusFolder = mapping.statusFolders[status]
        if (statusFolder) return `${mapping.root}/${folderType}/${statusFolder}`

        // 4. Nothing matched
        return `${mapping.root}/${mapping.defaultPath}`;
    }

    private loadExistingRules(settings: Settings) {
        if (!this.FinishedMappingContainer) return
        this.FinishedMappingContainer.innerHTML = ''

        const mapping = settings.FolderMapping
        mapping.overrides?.forEach(rule => {
            const row = this.buildRuleRow(
                rule.type   ?? 'any',
                rule.status ?? 'any',
                rule.path
            )
            this.FinishedMappingContainer!.appendChild(row)
        })
    }

    private buildFolderMappingForm(settings: Settings) {
        // build select
        const novelTypes = settings.TYPE_OPTIONS;
        const readStatus = settings.STATUS_OPTIONS;
        // const novelStatus = settings.NOVEL_STATUS_OPTIONS;

        this.populateSelect(this.SelectNovelType, novelTypes);
        this.populateSelect(this.SelectReadSatus, readStatus);
    }

    private populateSelect(selectEl: HTMLSelectElement | null, options: string[]) {
        if (!selectEl) throw new Error("Element not found");
        selectEl.innerHTML = "";
        selectEl.appendChild(this.createEmptyOption());
        options.forEach(value => {
            const opt = document.createElement("option");
            opt.value = value;
            opt.textContent = value;
            selectEl.appendChild(opt);
        });
    }
    private createEmptyOption() {
        const opt = document.createElement("option");
        opt.value = '';
        opt.textContent = '---';
        return opt;
    }
    

    private async saveFolderMapping() {
        // save folder mapping
        if (!(this.SelectNovelType?.value && this.SelectReadSatus?.value) || !this.PathInput?.value) return;


        // add it to settings
        await this.saveToSettings(this.PathInput);

        // reset form
        this.resetInput();
        
    }
    private buildRuleRow(type: string, status: string, path: string): HTMLElement {
        const row = document.createElement('div')
        row.className = 'folder-mapping-row'
        row.dataset.type = type
        row.dataset.status = status

        const label = document.createElement('span')
        label.textContent = `${type} + ${status} → ${path}`

        const removeBtn = document.createElement('button')
        removeBtn.textContent = 'Remove'
        removeBtn.addEventListener('click', async () => {
            await this.removeFolderMappingRule(type, status)
            row.remove()
        })

        row.append(label, removeBtn)
        return row
    }
    private resetInput() {
        this.SelectNovelType!.options[0].selected = true;
        this.SelectReadSatus!.options[0].selected = true;
        this.PathInput!.value = '';
    }
    private resetForm(newNovelType: string[], newNovelStatus: string[]) {
        this.AddNovelTypeInput!.value = ""
        this.AddNovelStatusInput!.value = ""
        // repopulate
        this.populateSelect(this.SelectNovelType, newNovelType);
        this.populateSelect(this.SelectReadSatus, newNovelStatus);
    }

    private async addNovelTypeFolder(newType: string | undefined) {
        if (!newType) {
            this.SaveStatus!.textContent = 'Error: Invalid input';
            setTimeout(() => this.SaveStatus!.textContent = '', 3000); // slightly longer for errors
            return;
        };
        // if pressed on create new novel type
        const settings = await this.dbRequest<Settings>('settings', 'get', { id: 'Settings', data: null });
        settings.TYPE_OPTIONS.push(newType);
        await this.dbRequest<Settings>('settings', 'put', { id: 'Settings', data: settings});
        this.resetForm(settings.TYPE_OPTIONS, settings.STATUS_OPTIONS);
    }
    private async addNovelStatusFolder(newStatus: string | undefined) {
        if (!newStatus) {
            this.SaveStatus!.textContent = 'Error: Invalid input';
            setTimeout(() => this.SaveStatus!.textContent = '', 3000); // slightly longer for errors
            return;
        };
        // if pressed on create new novel Status type
        const settings = await this.dbRequest<Settings>('settings', 'get', { id: 'Settings', data: null });
        settings.FolderMapping.statusFolders[newStatus] = newStatus;
        settings.STATUS_OPTIONS.push(newStatus);
        await this.dbRequest<Settings>('settings', 'put', { id: 'Settings', data: settings});
        this.resetForm(settings.TYPE_OPTIONS, settings.STATUS_OPTIONS);

    }
    private async saveToSettings(input: HTMLInputElement) { //NOTE! 0 is empty it starts at 1
        const novelTypeIndex = this.SelectNovelType!.selectedIndex;
        const novelStatusIndex = this.SelectReadSatus!.selectedIndex
        if ((novelTypeIndex === 0 || novelTypeIndex === -1) || (novelStatusIndex === 0 || novelStatusIndex === -1) || !input.value.trim()) {
            this.SaveStatus!.textContent = 'Error: Invalid input';
            setTimeout(() => this.SaveStatus!.textContent = '', 3000); // slightly longer for errors
            return;
        };
        // save to settings
        const novelType = this.SelectNovelType!.options[novelTypeIndex].value;
        const novelStatus = this.SelectReadSatus!.options[novelStatusIndex].value;
        const path = this.PathInput!.value.trim()


        await this.addFolderMappingRule(novelType, novelStatus, path);

        const row = this.buildRuleRow(novelType, novelStatus, path)
        this.FinishedMappingContainer!.appendChild(row)
    }
    private async addFolderMappingRule( type: AnyNovelType | undefined, status: AnyReadStatus | undefined, path: string ): Promise<void> {
        try {
            if (!path.trim()) throw new Error('Path cannot be empty')
            if (!type && !status) throw new Error('At least one of type or status must be set')

            const settings = await this.dbRequest<Settings>('settings', 'get', { id: 'Settings', data: null })
            const mapping = settings.FolderMapping

            // Check if an identical rule already exists
            const duplicate = mapping.overrides?.find(r => r.type === type && r.status === status)
            if (duplicate) throw new Error(`Rule for ${type ?? 'any'} + ${status ?? 'any'} already exists`)

            const newRule: FolderRule = {
                ...(type   && { type }),
                ...(status && { status }),
                path: path.trim()
            }

            const updatedMapping: FolderMappingType = {
                ...mapping,
                overrides: [...(mapping.overrides ?? []), newRule]
            }

            await this.dbRequest<Settings>('settings', 'put', { id: 'Settings', data: { ...settings, FolderMapping: updatedMapping }});

            if (this.SaveStatus) {
                this.SaveStatus.textContent = `Rule added: ${type ?? 'any'} + ${status ?? 'any'} → ${path}`
                setTimeout(() => this.SaveStatus!.textContent = '', 2000)
            }

            console.log(`[FolderMapping] Added rule: ${type ?? 'any'} + ${status ?? 'any'} → ${path}`)

        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            console.error('[FolderMapping] addFolderMappingRule:', message)
            if (this.SaveStatus) {
                this.SaveStatus.textContent = `Error: ${message}`
                setTimeout(() => this.SaveStatus!.textContent = '', 3000)
            }
        }
    }
    private async removeFolderMappingRule( type: AnyNovelType | undefined, status: AnyReadStatus | undefined ): Promise<void> {
        try {
            const settings = await this.dbRequest<Settings>('settings', 'get', { id: 'Settings', data: null })
            const mapping = settings.FolderMapping

            const before = mapping.overrides?.length ?? 0
            const filtered = mapping.overrides?.filter(
                r => !(r.type === type && r.status === status)
            ) ?? []

            if (filtered.length === before) throw new Error(`No rule found for ${type ?? 'any'} + ${status ?? 'any'}`)

            await this.dbRequest<Settings>('settings', 'put', { id: 'Settings', data: { ...settings, FolderMapping: { ...mapping, overrides: filtered } }});

            if (this.SaveStatus) {
                this.SaveStatus.textContent = `Rule removed`
                setTimeout(() => this.SaveStatus!.textContent = '', 2000)
            }

            console.log(`[FolderMapping] Removed rule: ${type ?? 'any'} + ${status ?? 'any'}`)

        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            console.error('[FolderMapping] removeFolderMappingRule:', message)
            if (this.SaveStatus) {
                this.SaveStatus.textContent = `Error: ${message}`
                setTimeout(() => this.SaveStatus!.textContent = '', 3000)
            }
        }
    }
    /* TODO: implement
    private async setStatusFolder( status: AnyReadStatus, folderName: string ): Promise<void> {
        try {
            if (!folderName.trim()) throw new Error('Folder name cannot be empty')

            const settings = await this.dbRequest<Settings>('settings', 'get', { id: 'Settings', data: null })
            await await this.dbRequest<Settings>('settings', 'put', { id: 'Settings', data: mergedData});{
                ...settings,
                FolderMapping: {
                    ...settings.FolderMapping,
                    statusFolders: { ...settings.FolderMapping.statusFolders, [status]: folderName.trim() }
                }
            })

            if (this.SaveStatus) {
                this.SaveStatus.textContent = `Saved: ${status} → ${folderName}`
                setTimeout(() => this.SaveStatus!.textContent = '', 2000)
            }

        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            console.error('[FolderMapping] setStatusFolder:', message)
            if (this.SaveStatus) {
                this.SaveStatus.textContent = `Error: ${message}`
                setTimeout(() => this.SaveStatus!.textContent = '', 3000)
            }
        }
    }
    */
    private async setDefaultPath(): Promise<void> {
        try {
            const path = this.DefaultPath?.value.trim()
            if (!path) throw new Error('Path cannot be empty')

            const settings = await this.dbRequest<Settings>('settings', 'get', { id: 'Settings', data: null })
            await this.dbRequest<Settings>('settings', 'put', { id: 'Settings', data: { ...settings, FolderMapping: { ...settings.FolderMapping, defaultPath: path.trim() } }});

            if (this.SaveStatus) {
                this.SaveStatus.textContent = `Saved: ${path}`
                setTimeout(() => this.SaveStatus!.textContent = '', 2000)
            }

        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            console.error('[FolderMapping] setDefaultPath:', message)
            if (this.SaveStatus) {
                this.SaveStatus.textContent = `Error: ${message}`
                setTimeout(() => this.SaveStatus!.textContent = '', 3000)
            }
        }
    }
    private async setRootPath(): Promise<void> {
        try {
            const path = this.Rootpath?.value.trim()
            if (!path) throw new Error('Path cannot be empty')

            const settings = await this.dbRequest<Settings>('settings', 'get', { id: 'Settings', data: null })
            await this.dbRequest<Settings>('settings', 'put', { id: 'Settings', data: {
                ...settings,
                FolderMapping: { ...settings.FolderMapping, root: path.trim() }
            }});

            if (this.SaveStatus) {
                this.SaveStatus.textContent = `Saved: ${path}`
                setTimeout(() => this.SaveStatus!.textContent = '', 2000)
            }

        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            console.error('[FolderMapping] setRootPath:', message)
            if (this.SaveStatus) {
                this.SaveStatus.textContent = `Error: ${message}`
                setTimeout(() => this.SaveStatus!.textContent = '', 3000)
            }
        }
    }
}