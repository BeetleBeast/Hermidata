/*
    
1. **Bulk actions** — mark multiple novels as read, open multiple links, etc.
    
2. **Chapter history / log** — track past read chapters per novel.
    
3. **Customizable notifications** — email, badge count, or desktop notifications.
    
4. **Site-specific RSS selectors** — allow user to define selectors for non-standard sites.
    
5. edit obj in detail - allow user to edit the selected hermidata's content 


*/

import { returnHashedTitle } from "../shared/StringOutput";
import { getAllHermidata, getSettings, removeHermidataV3, saveHermidataV3 } from "../shared/db/Storage";
import { type AnyNovelType, type Hermidata, type AnyReadStatus, type Settings } from "../shared/types/index";
import { getElement, setElement } from "../utils/Selection";

// Minimal interactive template — wire into your extension back-end as needed

globalThis.addEventListener("DOMContentLoaded", () => { 
    const rssClass = new RssPage()
    rssClass.init()
});



class RssPage {

    private readonly entriesEl = getElement('#entries');
    private readonly searchEl = getElement<HTMLInputElement>('#search');
    private readonly filterType = getElement<HTMLSelectElement>('#filterType');
    private readonly filterStatus = getElement<HTMLSelectElement>('#filterStatus');
    private readonly detailType = getElement<HTMLSelectElement>('#detailType');
    private readonly detailStatus = getElement<HTMLSelectElement>('#detailStatus');
    private readonly toast = getElement('#toast');

    private DATA: Map<string, Hermidata> = new Map();

    constructor() {
        this.eventListeners();
    }

    private showToast(msg: string, t: number =2000){
        if(!this.toast) return;
        this.toast.textContent = msg;
        this.toast.classList.add('show');
        setTimeout(()=> setElement('#toast', el => el.classList.remove('show')), t);
    }
    // persistence helpers (local only for template)
    private async loadData(): Promise<Map<string, Hermidata>> {
        const raw = await getAllHermidata();
        const keys = Object.keys(raw);
        const values = Object.values(raw);
        this.DATA = new Map(keys.map((key, index) => [key, values[index]]));
        return this.DATA;
    }
    private async saveData(entry: Hermidata): Promise<void> {
        const key = entry.id || returnHashedTitle(entry.title, entry.type);
        await saveHermidataV3(key, entry);
    }
    private async removeData(id: string): Promise<void> {
        await removeHermidataV3(id);
    }
    // rendering
    private renderFilters(settings: Settings): void {
        if(!this.filterType || !this.filterStatus) return;
        this.filterType.innerHTML = '<option value="">All types</option>';
        
        

        settings.TYPE_OPTIONS.forEach(t=> setElement('#filterType', el => el.appendChild(new Option(t,t))));
        this.filterStatus.innerHTML = '<option value="">All status</option>';
        settings.STATUS_OPTIONS.forEach(s=> setElement('#filterStatus', el => el.appendChild(new Option(s,s))));
        if (!this.detailType || !this.detailStatus) return;
        this.detailType.innerHTML = '';
        this.detailStatus.innerHTML = '';
        settings.TYPE_OPTIONS.forEach(t=> setElement('#detailType', el => el.appendChild(new Option(t,t))));
        settings.STATUS_OPTIONS.forEach(s=>setElement('#detailStatus', el => el.appendChild(new Option(s,s))));
    }
    private async renderList(filterQuery: string =''){
        if(!this.entriesEl) return;
        this.entriesEl.innerHTML = '';
        const q = filterQuery.trim().toLowerCase();
        this.DATA.forEach(item => {
            if (q && !(item.title.toLowerCase().includes(q) || (item.meta?.tags||[]).join(' ').toLowerCase().includes(q))) return;
            const li = document.createElement('li');
            li.className = 'entry';
            li.dataset.id = item.id;

            const cb = document.createElement('input');
            cb.type = 'checkbox'; cb.className='checkbox';
            cb.dataset.id = item.id;

            const meta = document.createElement('div'); meta.className='entry-meta';
            const title = document.createElement('div'); title.className='entry-title'; title.textContent = item.title;
            const sub = document.createElement('div'); sub.className='entry-sub'; sub.textContent = `${item.type} • ${item.status} • ch ${item.chapter.current}`;
            meta.append(title, sub);

            const actions = document.createElement('div'); actions.className='entry-actions';
            const openBtn = document.createElement('button'); openBtn.className='Btn'; openBtn.textContent='Open';
            openBtn.onclick = () => window.open(item.url, '_blank');
            const editBtn = document.createElement('button'); editBtn.textContent='Edit';
            editBtn.onclick = () => this.openDetails(item.id);

            actions.append(openBtn, editBtn);

            li.append(cb, meta, actions);
            if (!this.entriesEl) throw new Error('Element not found');
            this.entriesEl.appendChild(li);
        });
    }
    // details editing
    private openDetails(id: string){
        const item = this.DATA.get(id);
        if(!item) return;
        
        setElement<HTMLInputElement>('#detailTitle', el => el.value = item.title);
        setElement<HTMLInputElement>('#detailUrl', el => el.value = item.url);
        setElement<HTMLInputElement>('#detailCurrent', el => el.value = String(item.chapter.current));
        setElement<HTMLInputElement>('#detailNotes', el => el.value = item.meta?.notes || '');
        if (!this.detailType || !this.detailStatus) return;
        this.detailType.value = item.type;
        this.detailStatus.value = item.status;

        // history
        const hist = getElement('#chapterHistory');
        if (!hist) return;
        hist.innerHTML = '';
        (item.chapter.history || []).slice().reverse().forEach(h=>{
            const li = document.createElement('li');
            li.textContent = `ch ${h}`;
            hist.appendChild(li);
        });
        // store editing id
        setElement('#editForm', el => el.dataset.editing = id);
        this.showToast('Opened details', 900);
    }

    private async saveDetails(){
        const id = getElement('#editForm')?.dataset.editing;
        if(!id) return;

        const item = this.DATA.get(id);
        if(!item) return;
        
        const prev = item.chapter.current;
        const newCurrent = Number(getElement<HTMLInputElement>('#detailCurrent')?.value) || 0;
        if(newCurrent > prev){
        item.chapter.history = [...(item.chapter.history||[]), prev];
        }
        const title = getElement<HTMLInputElement>('#detailTitle')?.value.trim();
        const url = getElement<HTMLInputElement>('#detailUrl')?.value.trim();
        if (title) item.title = title;
        if (url) item.url = url;
    
        if (!this.detailType || !this.detailStatus) return;
        item.type = this.detailType.value as AnyNovelType;
        item.status = this.detailStatus.value as AnyReadStatus;
        item.chapter.current = newCurrent;
        item.meta = item.meta || {};
        const notes = getElement<HTMLInputElement>('#detailNotes')?.value;
        if (notes) item.meta.notes = notes;
        await this.saveData(item);
        if (!this.searchEl) return;
        await this.renderList(this.searchEl.value);
        this.showToast('Saved', 900);
    }

    private deleteDetails(): void {
        const id = getElement('#editForm')?.dataset.editing;
        if(!id) return;
        this.DATA.delete(id);
        this.removeData(id);
        if (!this.searchEl) return;
        this.renderList(this.searchEl.value);
        this.showToast('Deleted', 1000);
    }
    // bulk actions
    private getSelectedIds(): (string | undefined)[] {
        return Array.from(document.querySelectorAll<HTMLInputElement>('.checkbox:checked')).map(i=>i.dataset.id);
    }

    private async bulkMarkRead(){
        const ids = this.getSelectedIds();
        for (const id of ids) {
            if(!id) continue;
            const item = this.DATA.get(id);
            if(!item) return;

            item.status = 'Finished';
            if(!item.chapter.history) item.chapter.history = [];
            item.chapter.history.push(item.chapter.current);
            item.chapter.current = item.chapter.latest || item.chapter.current; // simple heuristic
            await this.saveData(item);
        }
        if (!this.searchEl) return;
        await this.renderList(this.searchEl.value);
        this.showToast(`${ids.length} marked as read`);
    }
    private bulkOpen(){
        const ids = this.getSelectedIds();
        for (const id of ids) {
            if(!id) continue;
            const item = this.DATA.get(id);
            if(item) window.open(item.url, '_blank');
        }
    }
    private openBulkEditPanel() {
        const selectedIds = this.getSelectedIds();
        if (selectedIds.length === 0) {
            this.showToast("No items selected for bulk edit.");
            return;
        }

        // Populate the bulk edit fields with the first selected item's data
        const firstItemOfList = selectedIds[0];
        if (!firstItemOfList) return;
        const firstItem = this.DATA.get(firstItemOfList);
        if (!firstItem) return;
        setElement<HTMLSelectElement>('#bulkEditType', el => el.value = firstItem.type);
        setElement<HTMLSelectElement>('#bulkEditStatus', el => el.value = firstItem.status);
        setElement<HTMLInputElement>('#bulkEditTags', el => el.value = firstItem.meta?.tags.join(', ') || '');
        setElement('#bulkEditPanel', el => el.style.display = 'block');
    }
    private isdifferent(newItem: AnyNovelType | AnyReadStatus | string[], OldItem: AnyNovelType | AnyReadStatus | string[]): boolean {
        return !!(newItem !== OldItem && newItem !== undefined);
    }
    private async saveBulkEdit() {
        // selector save (site-specific RSS selectors)
        const newType = getElement<HTMLSelectElement>('#bulkEditType')?.value as AnyNovelType;
        const newStatus = getElement<HTMLSelectElement>('#bulkEditStatus')?.value as AnyReadStatus;
        const newTags = getElement<HTMLInputElement>('#bulkEditTags')?.value.split(',').map(tag => tag.trim()) as string[];

        
        const selectedIds = this.getSelectedIds();
        for (const id of selectedIds) {
            if (!id) continue;
            const item = this.DATA.get(id);
            if (item) {
                item.type = this.isdifferent(newType, item.type) ? newType : item.type;
                item.status = this.isdifferent(newStatus, item.status) ? newStatus : item.status;
                item.meta.tags = this.isdifferent(newTags, item.meta.tags) ? newTags : item.meta.tags;
                await this.saveData(item);
            }
        }
        if (!this.searchEl) return;
        await this.renderList(this.searchEl.value);
        this.showToast(`${selectedIds.length} items updated.`);
    }
    private saveSelectors(){
        const domain = getElement<HTMLInputElement>('#siteDomain')?.value.trim();
        const rssSel = getElement<HTMLInputElement>('#rssSelector')?.value.trim();
        const itemSel = getElement<HTMLInputElement>('#itemSelector')?.value.trim();
        if(!domain || !rssSel) return this.showToast('Domain & RSS selector required',1200);
        const all = JSON.parse(localStorage.getItem('site_selectors')||'{}');
        all[domain] = { rss: rssSel, items: itemSel };
        localStorage.setItem('site_selectors', JSON.stringify(all));
        this.showToast('Selectors saved');
    }
    // notifications (simple preview)
    private updateNotificationPreview(){
        const desktop = getElement<HTMLInputElement>('#desktopNotify')?.checked;
        const email = getElement<HTMLInputElement>('#emailNotify')?.checked;
        const p = getElement('#notificationPreview');
        if(!p) return;
        p.textContent = `Desktop: ${desktop ? 'ON':'OFF'} • Email: ${email ? 'ON':'OFF'}`;
    }

    private eventListeners() {
        // wire events
        getElement('#bulkMarkRead')?.addEventListener('click', this.bulkMarkRead);
        getElement('#bulkOpen')?.addEventListener('click', this.bulkOpen);
        getElement('#bulkEditButton')?.addEventListener('click', this.openBulkEditPanel);
        getElement('#saveBulkEditButton')?.addEventListener('click', this.saveBulkEdit);
        getElement('.CancelBulkEdit')?.addEventListener('click',() => setElement('#bulkEditPanel', el => el.style.display='none'));
        getElement('#reloadData')?.addEventListener('click', async ()=> { 
            if (!this.searchEl) return;
            await this.loadData();
            await this.renderList(this.searchEl.value);
            this.showToast('Reloaded');
        });
        if (!this.searchEl) return;
        this.searchEl.addEventListener('input', e=> this.renderList((e.target as HTMLInputElement).value));
        getElement('#saveDetail')?.addEventListener('click', this.saveDetails);
        // getElement('#deleteDetail')?.addEventListener('click', this.deleteDetails); // TEMP: disabled deletion for safety
        getElement('#saveSelectors')?.addEventListener('click', this.saveSelectors);
        getElement('#siteDomain')?.addEventListener('change', ()=>{/* optionally prefill */});
        getElement('#desktopNotify')?.addEventListener('change', this.updateNotificationPreview);
        getElement('#emailNotify')?.addEventListener('change', this.updateNotificationPreview);
    }
    public async init() {
        const settings = await getSettings();
        this.renderFilters(settings);
        await this.loadData();
        await this.renderList();
        this.updateNotificationPreview();

        interface HermidataPage {
            reload: () => Promise<void>;
            addEntry: (entry: Hermidata) => Promise<void>;
        }
        const HermidataPage: HermidataPage = {
            reload: async ()=>{ await this.loadData(); await this.renderList(); },
            addEntry: async (entry: Hermidata)=>{ 
                entry.id = entry.id || String(Date.now());
                this.DATA.set(entry.id, entry);
                this.saveData(entry);
                await this.renderList();
            },
        };

        // FIXME: this is a hack
        // expose small API for integration
        // globalThis.HermidataPage = HermidataPage
    }


}