import { type AnyNovelType, type AnyReadStatus, type Settings, type FolderMapping as FolderMappingType, type FolderRule, defaultSettings } from "../../shared/types";
import { getElement } from "../../utils/Selection";
import { Build } from "../build";

export class FolderMapping extends Build {

    // explaination of folder mapping; the formula
    private readonly formulaOfFolderMapping = getElement<HTMLParagraphElement>("#formulaOfFolderMapping");
    private readonly formulaOfErrorFolderMapping = getElement<HTMLParagraphElement>("#formulaOfErrorFolderMapping");
    // ---
    // Renaming root path
    private readonly rootPath = getElement<HTMLInputElement>("#rootPath");
    private readonly saveRootPathBtn = getElement<HTMLButtonElement>("#saveRootPathBtn");
    private readonly rootPathStatus = getElement<HTMLSpanElement>("#rootPathStatus");
    // Renaming unsorted path
    private readonly unsortedPath = getElement<HTMLInputElement>("#unsortedPath");
    private readonly saveUnsortedPathBtn = getElement<HTMLButtonElement>("#saveUnsortedPathBtn");
    private readonly unsortedPathStatus = getElement<HTMLSpanElement>("#unsortedPathStatus");
    // ---
    // Adding Aliases
    private readonly addNovelTypeAliasToSelect = getElement<HTMLSelectElement>("#addNovelTypeAliasToSelect");
    private readonly addNovelTypeAlias = getElement<HTMLInputElement>("#addNovelTypeAlias");
    private readonly addNovelTypeAliasBtn = getElement<HTMLButtonElement>("#addNovelTypeAliasBtn");

    private readonly addReadStatusAliasToSelect = getElement<HTMLSelectElement>("#addReadStatusAliasToSelect");
    private readonly addReadStatusAlias = getElement<HTMLInputElement>("#addReadStatusAlias");
    private readonly addReadStatusAliasBtn = getElement<HTMLButtonElement>("#addReadStatusAliasBtn");

    private readonly saveStatusFolderMapping_newAliases = getElement<HTMLParagraphElement>("#saveStatus-folderMapping-new-aliases");
    // ---
    // Active Aliases
    private readonly activeTypeAliases = getElement<HTMLDivElement>("#activeTypeAliases");
    private readonly activeReadStatuses = getElement<HTMLDivElement>("#activeReadStatuses");
    private readonly saveStatusFolderMapping_aliases = getElement<HTMLButtonElement>("#saveStatus-folderMapping-aliases");

    // Active Custom Rules
    private readonly activeCustomRules = getElement<HTMLDivElement>("#activeCustomRules");
    private readonly saveStatusFolderMapping_overides = getElement<HTMLParagraphElement>("#saveStatus-folderMapping-overides");
    // ---
    // Advanced Options Btn
    private readonly advancedOptionsBtn = getElement<HTMLButtonElement>("#advancedOptionsBtn");
    private readonly advancedOptions = getElement<HTMLDivElement>(".FolderMapping_advancedOptions");
    // ---
    // Add sub-folder to novel types
    private readonly add_NovelTypes_Subfolder_To_Select = getElement<HTMLSelectElement>("#add_NovelTypes_Subfolder_To_Select");
    private readonly add_NovelTypes_Subfolder_Prefix = getElement<HTMLInputElement>("#add_NovelTypes_Subfolder_Prefix");
    private readonly add_NovelTypes_Subfolder_Word = getElement<HTMLSpanElement>("#add_NovelTypes_Subfolder_Word");
    private readonly add_NovelTypes_Subfolder_Suffix = getElement<HTMLInputElement>("#add_NovelTypes_Subfolder_Suffix");
    private readonly add_NovelTypes_Subfolder_Btn = getElement<HTMLButtonElement>("#add_NovelTypes_Subfolder_Btn");
    // Add sub-folder to read statuses
    private readonly add_ReadStatuses_Subfolder_To_Select = getElement<HTMLSelectElement>("#add_ReadStatuses_Subfolder_To_Select");
    private readonly add_ReadStatuses_Subfolder_Prefix = getElement<HTMLInputElement>("#add_ReadStatuses_Subfolder_Prefix");
    private readonly add_ReadStatuses_Subfolder_Word = getElement<HTMLSpanElement>("#add_ReadStatuses_Subfolder_Word");
    private readonly add_ReadStatuses_Subfolder_Suffix = getElement<HTMLInputElement>("#add_ReadStatuses_Subfolder_Suffix");
    private readonly add_ReadStatuses_Subfolder_Btn = getElement<HTMLButtonElement>("#add_ReadStatuses_Subfolder_Btn");
    // ---
    // Add Custom Rules
    private readonly addCustomRuleToSelect_NovelType = getElement<HTMLSelectElement>("#addCustomRuleToSelect_NovelType");
    private readonly addCustomRuleToSelect_ReadStatus = getElement<HTMLSelectElement>("#addCustomRuleToSelect_ReadStatus");
    private readonly addCustomRule = getElement<HTMLInputElement>("#addCustomRule");
    private readonly addCustomRuleBtn = getElement<HTMLButtonElement>("#addCustomRuleBtn");
    private readonly saveStatusFolderMapping_newOverides = getElement<HTMLParagraphElement>("#saveStatus-folderMapping-new-overides");


    async init() {
        // get current OR a default settings
        try {
            const settings = await this.getSettings();
            

            // set formula
            this.setFormulaOfFolderMapping();
            
            // set current values to inputs
            this.setRootPathValue(settings.FolderMapping.root);
            this.setDefaultPathValue(settings.FolderMapping.defaultPath);
            
            // populate add aliases
            this.populateAddAliases(settings);

            // load existing aliases
            this.loadExistingAliases(settings);
            // load existing overide rules
            this.loadExistingRules(settings);

            // -- advanced settings --

            // populate sub-folders
            this.populateSubFolders(settings);
            // populate folder mappings custom rules ( overides )
            this.populateFolderMappingsCustomRules(settings);

            this.bindEvents();
            
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
    private bindEvents() {
        // set root path
        this.saveRootPathBtn?.addEventListener('click', async () => this.setRootPath());
        // set default path ( unsorted )
        this.saveUnsortedPathBtn?.addEventListener('click', async () => this.setDefaultPath());

        // Add new alias
        this.addNovelTypeAliasBtn?.addEventListener('click', () => this.addNovelTypeNewAlias());
        this.addReadStatusAliasBtn?.addEventListener('click', () => this.addReadStatusNewAlias());
        
        // populate sub-folder middle word
        this.add_NovelTypes_Subfolder_To_Select?.addEventListener('change', () => this.populateSubFolderMiddleWord(true))
        this.add_ReadStatuses_Subfolder_To_Select?.addEventListener('change', () => this.populateSubFolderMiddleWord(false))
        // Add sub-folder
        this.add_NovelTypes_Subfolder_Btn?.addEventListener('click', () => this.addSubFolder(true))
        this.add_ReadStatuses_Subfolder_Btn?.addEventListener('click', () => this.addSubFolder(false))
        
        // Add new rule
        this.addCustomRuleBtn?.addEventListener('click', () => this.addNewRule());
        
        // toggle advanced options
        this.advancedOptionsBtn?.addEventListener('click', () => {
            const value = this.advancedOptions?.style.display === 'flex' ? 'none' : 'flex';
            this.advancedOptions!.style.display = value;
        });
    }
    public async resetValues() {
        // reset settings in IndexedDB
        const settings = await this.getSettings();
        settings.FolderMapping = defaultSettings.FolderMapping;
        await this.setSettings(settings);
    }
    public async cancelValues() {
        // reset page values to current settings
        const settings = await this.getSettings();
        this.loadExistingRules(settings);
    }
    public async saveValues() {
        // TODO: implement if needed, currently values are saved immediately on change
        // values are saved on input change, so no need to do anything here
    }
    private setRootPathValue(value: string) {
        if (!this.rootPath) return;
        this.rootPath.value = value;
    }
    private setDefaultPathValue(value: string) {
        if (!this.unsortedPath) return;
        this.unsortedPath.value = value;
    }
    private populateSubFolderMiddleWord(isNovelType: boolean) {
        if (isNovelType) {
            const NovelType = this.add_NovelTypes_Subfolder_To_Select?.value;
            if (!this.add_NovelTypes_Subfolder_Word) return;
            this.add_NovelTypes_Subfolder_Word.textContent = `/${NovelType}/`;
        } else {
            const ReadStatus = this.add_ReadStatuses_Subfolder_To_Select?.value;
            if (!this.add_ReadStatuses_Subfolder_Word) return;
            this.add_ReadStatuses_Subfolder_Word.textContent = `/${ReadStatus}/`;
        }
    }
    private addSubFolder(isNovelType: boolean) {
        if (isNovelType) {
            const NovelType = this.add_NovelTypes_Subfolder_To_Select?.value as AnyNovelType;
            const preffix = this.add_NovelTypes_Subfolder_Prefix?.value;
            const suffix = this.add_NovelTypes_Subfolder_Suffix?.value;
            if (!NovelType || (!preffix && !suffix)) return;
            
            let value;
            if (!preffix && suffix) value = `${NovelType}/${suffix}`;
            if (preffix && !suffix) value = `${preffix}/${NovelType}`;
            if (preffix && suffix) value = `${preffix}/${NovelType}/${suffix}`;
            else return;
            this.setTypeAliases(NovelType, value);
        } else {
            const ReadStatus = this.add_ReadStatuses_Subfolder_Prefix?.value as AnyReadStatus;
            const preffix = this.add_NovelTypes_Subfolder_Prefix?.value || null;
            const suffix = this.add_ReadStatuses_Subfolder_Suffix?.value || null;
            if (!ReadStatus || (!preffix && !suffix)) return;
            
            let value;
            if (!preffix && suffix) value = `${ReadStatus}/${suffix}`;
            if (preffix && !suffix) value = `${preffix}/${ReadStatus}`;
            if (preffix && suffix) value = `${preffix}/${ReadStatus}/${suffix}`;
            else return;
            this.setStatusFolder(ReadStatus, value);
        }
    }
    private addNewRule() {
        const rule = this.addCustomRule?.value.trim();
        const status = this.addCustomRuleToSelect_NovelType?.value.trim() as AnyReadStatus;
        const type = this.addCustomRuleToSelect_ReadStatus?.value.trim() as AnyNovelType;
        if (!rule) return;
        this.addFolderMappingRule(type, status, rule);
        this.temporaryStatus(`Saved: ${rule}`, this.saveStatusFolderMapping_newOverides)
    }
    private async addNovelTypeNewAlias() {
        // get the select value
        const originalName = this.addNovelTypeAliasToSelect?.value as AnyNovelType
        // get the input value
        const newRawAlias = this.addNovelTypeAlias?.value;

        const newAlias = this.parseStringToAlias(newRawAlias);

        if (!originalName || !newAlias) return
        // add new alias

        await this.addNewAliasToFolderMapping(originalName, newAlias, true);
        this.temporaryStatus(`Saved: ${originalName} → ${newAlias}`, this.saveStatusFolderMapping_newAliases)
    }
    private async addReadStatusNewAlias() {
        // get the select value
        const originalName = this.addReadStatusAliasToSelect?.value as AnyReadStatus
        // get the input value
        const newRawAlias = this.addReadStatusAlias?.value;

        const newAlias = this.parseStringToAlias(newRawAlias);

        if (!originalName || !newAlias) return
        
        await this.addNewAliasToFolderMapping(originalName, newAlias, false);
        this.temporaryStatus(`Saved: ${originalName} → ${newAlias}`, this.saveStatusFolderMapping_newAliases)
    }
    private parseStringToAlias(newRawAlias: string | undefined): string | null {

        if (!newRawAlias || typeof newRawAlias !== 'string') return null;
        
        const trimmed = newRawAlias.trim();
        
        // Length validation
        if (trimmed.length === 0 || trimmed.length > 255) return null;
        
        // Whitelist approach: only allow safe characters
        const safePattern = /^[a-zA-Z0-9 _.\-()[\]',]+$/;
        if (!safePattern.test(trimmed)) return null;
        
        return trimmed;
    }
    private async addNewAliasToFolderMapping(originalName: AnyNovelType | AnyReadStatus, newAlias: string, isANovelType: boolean): Promise<void> {
        const settings = await this.getSettings();

        // ckeck if already exists
        const existAlready = isANovelType ? settings.FolderMapping.typeAliases?.[originalName] : settings.FolderMapping.statusFolders?.[originalName]
        if (existAlready === newAlias) return

        // add new alias
        if (isANovelType && settings.FolderMapping.typeAliases) settings.FolderMapping.typeAliases.originalName = newAlias
        else if (isANovelType && !settings.FolderMapping.typeAliases) settings.FolderMapping.typeAliases = { [originalName]: newAlias }

        if (!isANovelType) settings.FolderMapping.statusFolders[originalName] = newAlias;


        this.setSettings(settings);
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

    private setFormulaOfFolderMapping(): void {
        if (!this.formulaOfFolderMapping || !this.formulaOfErrorFolderMapping) return
        this.formulaOfFolderMapping.textContent = "<Root>/<Novel Type>/<Read Status>/<page>";
        this.formulaOfErrorFolderMapping.textContent = "<Root>/Unsorted/<page>";
    }
    private loadExistingAliases(settings: Settings) {
        if (!this.activeReadStatuses || !this.activeTypeAliases) return

        // if no aliases, return
        if (!settings.FolderMapping.statusFolders || !settings.FolderMapping.typeAliases) return
        this.activeReadStatuses.innerHTML = ''
        this.activeTypeAliases.innerHTML = ''
        
        const statuses = Object.entries(settings.FolderMapping.statusFolders);
        const types =  Object.entries(settings.FolderMapping.typeAliases);

        if (statuses.length === 0) getElement("#activeReadStatuses")!.style.display = 'none';
        if (types.length === 0) getElement("#activeTypeAliases")!.style.display = 'none';
        if (statuses.length === 0 && types.length === 0) getElement(".FolderMapping_ActiveAliases")!.style.display = 'none';

        for (const [key, value] of statuses) { 
            const row = this.buildAliasRow(key, value, false)
            this.activeReadStatuses.appendChild(row)
        }
        for (const [key, value] of types) {
            const row = this.buildAliasRow(key, value, true)
            this.activeTypeAliases.appendChild(row)
        }
    }

    private loadExistingRules(settings: Settings) {
        if (!this.activeCustomRules) return
        this.activeCustomRules.innerHTML = ''

        const mapping = settings.FolderMapping
        if (!mapping.overrides || mapping.overrides.length === 0) {
            getElement("#CustomRulesContainer")!.style.display = 'none';
            return
        }
        for (const rule of mapping.overrides) {
            const row = this.buildRuleRow(
                rule.type   ?? 'any',
                rule.status ?? 'any',
                rule.path
            )
            this.activeCustomRules!.appendChild(row)
        }
    }
    private buildAliasRow(OriginalName: string, newAlias: string, isNovelType: boolean = false): HTMLElement {
        const row = document.createElement('div')
        row.className = 'folder-mapping-row'
        row.dataset.OriginalName = OriginalName
        row.dataset.newAlias = newAlias

        const label = document.createElement('span')
        label.textContent = `${OriginalName} → `

        const eddit = document.createElement('input');
        eddit.type = 'text';
        eddit.className = 'folder-mapping-edit-alias';
        eddit.value = newAlias;
        eddit.addEventListener('change', async () => {
            const updatedAlias = eddit.value.trim();
            if (!updatedAlias) {
                eddit.value = newAlias;
                return;
            }
        });
        const edditBtn = document.createElement('button');
        edditBtn.textContent = 'Save';
        edditBtn.addEventListener('click', async () => {
            const updatedAlias = eddit.value.trim();
            if (!updatedAlias) return;
            await this.addNewAliasToFolderMapping(OriginalName, updatedAlias, isNovelType);
            this.temporaryStatus(`Saved: ${OriginalName} → ${updatedAlias}`, this.saveStatusFolderMapping_newAliases)
        })

        const removeBtn = document.createElement('button')
        removeBtn.textContent = 'Remove'
        removeBtn.addEventListener('click', async () => {
            // TODO: Redo this 
            // await this.removeFolderMappingRule(OriginalName, newAlias)
            row.remove()
        })

        row.append(label, eddit, edditBtn, removeBtn)
        return row
    }
    private buildRuleRow(type: string, status: string, path: string): HTMLElement {
        const row = document.createElement('div')
        row.className = 'folder-mapping-row'
        row.dataset.type = type
        row.dataset.status = status

        const label = document.createElement('span')
        label.textContent = `${type} + ${status} →`
        // TODO: be able to edit path

        const eddit = document.createElement('input');
        eddit.className = 'folder-mapping-edit-overide';
        eddit.type = 'text';
        eddit.value = path;
        eddit.addEventListener('change', async () => {
            const updatedAlias = eddit.value.trim();
            if (!updatedAlias) {
                eddit.value = path;
                return;
            }
        });
        const edditBtn = document.createElement('button');
        edditBtn.textContent = 'Save';
        edditBtn.addEventListener('click', async () => {
            const updatedAlias = eddit.value.trim();
            if (!updatedAlias) return;
            await this.addFolderMappingRule(type, status, updatedAlias);
            this.temporaryStatus(`Saved: ${type} + ${status} → ${updatedAlias}`, this.saveStatusFolderMapping_newAliases)
        })

        const removeBtn = document.createElement('button')
        removeBtn.textContent = 'Remove'
        removeBtn.addEventListener('click', async () => {
            await this.removeFolderMappingRule(type, status)
            row.remove()
        })

        row.append(label, eddit, edditBtn, removeBtn)
        return row
    }

    private populateAddAliases(settings: Settings) {
        const allNovelTypes = [...settings.ContentTypesAndStatuses.TYPE_OPTIONS];
        const AllReadStatuses = [...settings.ContentTypesAndStatuses.STATUS_OPTIONS]
        // populate addAliasToSelect
        // remove those who are already added as aliases
        const NovelTypes = allNovelTypes.filter((NovelType) => !settings.FolderMapping.typeAliases?.[NovelType])
        const ReadStatuses = AllReadStatuses.filter((ReadStatus) => !settings.FolderMapping.statusFolders?.[ReadStatus]);

        if (NovelTypes.length === 0) getElement("#AddAliasToNovelTypeContainer")!.style.display = 'none';
        if (ReadStatuses.length === 0) getElement("#AddAliasToReadStatusContainer")!.style.display = 'none';
        if (NovelTypes.length === 0 && ReadStatuses.length === 0) getElement("#AddAliasContainer")!.style.display = 'none';
        this.populateSelect(this.addNovelTypeAliasToSelect, NovelTypes);
        this.populateSelect(this.addReadStatusAliasToSelect, ReadStatuses);
    }


    private populateSelect(selectEl: HTMLSelectElement | null, options: string[]): HTMLSelectElement {
        if (!selectEl) throw new Error("Element not found");
        selectEl.innerHTML = "";
        options.forEach(value => {
            const opt = document.createElement("option");
            opt.value = value;
            opt.textContent = value;
            selectEl.appendChild(opt);
        });
        return selectEl;
    }

    private populateSubFolders(settings: Settings) {
        const allNovelTypes = [...settings.ContentTypesAndStatuses.TYPE_OPTIONS];
        const AllReadStatuses = [...settings.ContentTypesAndStatuses.STATUS_OPTIONS]
        // add_NovelTypes_Subfolder_To_Select
        this.populateSelect(this.add_NovelTypes_Subfolder_To_Select, allNovelTypes);
        // add_ReadStatuses_Subfolder_To_Select
        this.populateSelect(this.add_ReadStatuses_Subfolder_To_Select, AllReadStatuses);
        // populate middle word
        const NovelType = this.add_NovelTypes_Subfolder_To_Select?.value;
        this.add_NovelTypes_Subfolder_Word!.textContent = `/${NovelType}/`;
        const ReadStatus = this.add_ReadStatuses_Subfolder_To_Select?.value;
        this.add_ReadStatuses_Subfolder_Word!.textContent = `/${ReadStatus}/`;
    }

    private populateFolderMappingsCustomRules(settings: Settings) {
        const allNovelTypes = [...settings.ContentTypesAndStatuses.TYPE_OPTIONS];
        const AllReadStatuses = [...settings.ContentTypesAndStatuses.STATUS_OPTIONS]
        // addCustomRuleToSelect_NovelType
        this.populateSelect(this.addCustomRuleToSelect_NovelType, allNovelTypes);
        // addCustomRuleToSelect_ReadStatus
        this.populateSelect(this.addCustomRuleToSelect_ReadStatus, AllReadStatuses);
    }
    private async addFolderMappingRule( type: AnyNovelType | undefined, status: AnyReadStatus | undefined, path: string ): Promise<void> {
        try {
            if (!path.trim()) throw new Error('Path cannot be empty')
            if (!type && !status) throw new Error('At least one of type or status must be set')

            const settings = await this.getSettings();
            const mapping = settings.FolderMapping

            // Check if an identical rule already exists
            const duplicate = mapping.overrides?.find(r => r.type === type && r.status === status)
            if (duplicate) throw new Error(`Rule for ${type ?? 'any'} + ${status ?? 'any'} already exists`)

            const newRule: FolderRule = {
                ...(type   && { type }),
                ...(status && { status }),
                path: path.trim()
            }

            const updatedMapping: FolderMappingType = { ...mapping, overrides: [...(mapping.overrides ?? []), newRule] }

            this.setSettings({ ...settings, FolderMapping: updatedMapping });

            this.temporaryStatus( `Rule added: ${type ?? 'any'} + ${status ?? 'any'} → ${path}`, this.saveStatusFolderMapping_newOverides)
            console.log(`[FolderMapping] Added rule: ${type ?? 'any'} + ${status ?? 'any'} → ${path}`)
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            console.error('[FolderMapping] addFolderMappingRule:', message)
            this.temporaryStatus(  `Error: ${message}`, this.saveStatusFolderMapping_newOverides, 3000)
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

            this.temporaryStatus(`Rule removed`, this.saveStatusFolderMapping_overides)

            console.log(`[FolderMapping] Removed rule: ${type ?? 'any'} + ${status ?? 'any'}`)

        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            console.error('[FolderMapping] removeFolderMappingRule:', message)
            this.temporaryStatus(`Error: ${message}`, this.saveStatusFolderMapping_overides, 3000)
        }
    }
    private async setTypeAliases( folderName: AnyNovelType, Alias: string ): Promise<void> {
        try {
            if (!Alias.trim() || !folderName.trim()) throw new Error('Folder Alias cannot be empty')
            if (folderName === Alias) throw new Error('Folder name and Alias cannot be the same')


            const settings = await this.getSettings();
            const mergedData = { ...settings, FolderMapping: { ...settings.FolderMapping, typeAliases: { ...settings.FolderMapping.typeAliases, [folderName]: Alias.trim() }}};
            this.setSettings(mergedData);

            this.temporaryStatus(`Saved: ${folderName} → ${Alias}`, this.saveStatusFolderMapping_newAliases)
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            console.error('[FolderMapping] setTypeAliases:', message)
            this.temporaryStatus(`Error: ${message}`, this.saveStatusFolderMapping_newAliases, 3000)
        }
    }
    private async setStatusFolder( folderName: AnyReadStatus, Alias: string ): Promise<void> {
        try {
            if (!Alias.trim() || !folderName.trim()) throw new Error('Folder Alias cannot be empty')
            if (folderName === Alias) throw new Error('Folder name and Alias cannot be the same')


            const settings = await this.getSettings();
            const mergedData = { ...settings, FolderMapping: { ...settings.FolderMapping, statusFolders: { ...settings.FolderMapping.statusFolders, [folderName]: Alias.trim() }}};
            this.setSettings(mergedData);

            this.temporaryStatus(`Saved: ${folderName} → ${Alias}`, this.saveStatusFolderMapping_newAliases)
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            console.error('[FolderMapping] setStatusFolder:', message)
            this.temporaryStatus(`Error: ${message}`, this.saveStatusFolderMapping_newAliases, 3000)
        }
    }
    private async setDefaultPath(): Promise<void> {
        try {
            const path = this.unsortedPath?.value.trim()
            if (!path) throw new Error('Path cannot be empty')

            const settings = await this.getSettings();
            const mergedData = { ...settings, FolderMapping: { ...settings.FolderMapping, defaultPath: path.trim() } };
            this.setSettings(mergedData);

            this.temporaryStatus(`Saved: ${path}`, this.unsortedPathStatus)

        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            console.error('[FolderMapping] setDefaultPath:', message)
            this.temporaryStatus(`Error: ${message}`, this.unsortedPathStatus, 3000)
        }
    }
    private async setRootPath(): Promise<void> {
        try {
            const path = this.rootPath?.value.trim()
            if (!path) throw new Error('Path cannot be empty')

            const settings = await this.getSettings();
            const mergedData = { ...settings, FolderMapping: { ...settings.FolderMapping, root: path.trim() } };
            this.setSettings(mergedData);

            this.temporaryStatus(`Saved: ${path}`, this.rootPathStatus)
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            console.error('[FolderMapping] setRootPath:', message)
            this.temporaryStatus( `Error: ${message}`, this.rootPathStatus, 3000)
        }
    }
}