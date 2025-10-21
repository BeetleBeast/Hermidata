/*
    
1. **Bulk actions** — mark multiple novels as read, open multiple links, etc.
    
2. **Chapter history / log** — track past read chapters per novel.
    
3. **Customizable notifications** — email, badge count, or desktop notifications.
    
4. **Site-specific RSS selectors** — allow user to define selectors for non-standard sites.
	
5. edit obj in detail - allow user to edit the selected hermidata's content 


*/

// Minimal interactive template — wire into your extension back-end as needed
(async () => {
  const browserAPI = typeof browser !== "undefined" ? browser : chrome;
  const novelType = ['Manga','Manhwa','Manhua','Novel','Webnovel','Anime','TV-Series'];
  const novelStatus = ['Viewing','Finished','On-hold','Dropped','Planned'];

  // sample store (replace with chrome.storage.sync / extension messaging)
  const STORE_KEY = 'hermidata_demo';
  const sample = [
    { id:'1', title:'The Wandering Fairy', type:'Novel', status:'Viewing', url:'https://site.example/series/1', chapter:{current:12, history:[10,11]}, meta:{tags:['fantasy'],notes:'Good read'} },
    { id:'2', title:'Moonlight Manhwa', type:'Manhwa', status:'Ongoing', url:'https://othersite/series/abc', chapter:{current:42, history:[40,41]}, meta:{tags:['romance'],notes:''} },
  ];

  // DOM
  const entriesEl = document.getElementById('entries');
  const searchEl = document.getElementById('search');
  const filterType = document.getElementById('filterType');
  const filterStatus = document.getElementById('filterStatus');
  const detailType = document.getElementById('detailType');
  const detailStatus = document.getElementById('detailStatus');
  const toast = document.getElementById('toast');

  let DATA = [];

  function showToast(msg, t=2000){
    toast.textContent = msg; toast.classList.add('show');
    setTimeout(()=>toast.classList.remove('show'), t);
  }

  // persistence helpers (local only for template)
  async function loadData(){
    const raw = await getAllHermidata();
    // DATA = raw || sample;
    Object.values(raw).forEach(item => {
      DATA.push(item)
    });
    return DATA;
  }
  async function saveData(entry){
    const key = entry.id || returnHashedTitle(entry.title, entry.type);
    await browser.storage.sync.set({ [key]: entry });
    console.log(`[HermidataV3] Saved ${entry.title}`);
  }
  async function getAllHermidata() {
    const allData = await new Promise((resolve, reject) => {
        browserAPI.storage.sync.get(null, (result) => {
            if (browserAPI.runtime.lastError) reject(new Error(browserAPI.runtime.lastError));
            else resolve(result || {});
        });
    });

    let allHermidata = {};
    let Count = 0;
    for (const [key, value] of Object.entries(allData)) {
        // Ensure the value is a valid Hermidata entry
        if (!value || typeof value !== "object" ||  ( !value.title && !value.Title )|| ( typeof value.title !== "string" && typeof value.Title !== "string" ) ) continue;

        allHermidata[key] = value;
        Count++;
    }
    // Nothing to do
    if (Count === 0) console.log("No entries detected.");
    console.log(`Total entries: ${Count}`);
    return allHermidata;
}

  // rendering
  function renderFilters(){
    filterType.innerHTML = '<option value="">All types</option>';
    novelType.forEach(t=>filterType.appendChild(new Option(t,t)));
    filterStatus.innerHTML = '<option value="">All status</option>';
    novelStatus.forEach(s=>filterStatus.appendChild(new Option(s,s)));
    detailType.innerHTML = '';
    detailStatus.innerHTML = '';
    novelType.forEach(t=>detailType.appendChild(new Option(t,t)));
    novelStatus.forEach(s=>detailStatus.appendChild(new Option(s,s)));
  }

  async function renderList(filterQuery=''){
    entriesEl.innerHTML = '';
    const q = filterQuery.trim().toLowerCase();
    DATA.forEach(item => {
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
      editBtn.onclick = () => openDetails(item.id);

      actions.append(openBtn, editBtn);

      li.append(cb, meta, actions);
      entriesEl.appendChild(li);
    });
  }

  // details editing
  function openDetails(id){
    const item = DATA.find(d=>d.id==id);
    if(!item) return;
    document.getElementById('detailTitle').value = item.title;
    document.getElementById('detailUrl').value = item.url;
    document.getElementById('detailCurrent').value = item.chapter.current;
    document.getElementById('detailNotes').value = item.meta?.notes || '';
    detailType.value = item.type;
    detailStatus.value = item.status;
    // history
    const hist = document.getElementById('chapterHistory'); hist.innerHTML='';
    (item.chapter.history||[]).slice().reverse().forEach(h=>{
      const li = document.createElement('li'); li.textContent = `ch ${h}`;
      hist.appendChild(li);
    });
    // store editing id
    document.getElementById('editForm').dataset.editing = id;
    showToast('Opened details', 900);
  }

  async function saveDetails(){
    const id = document.getElementById('editForm').dataset.editing;
    if(!id) return;
    const item = DATA.find(d=>d.id==id);
    if(!item) return;
    const prev = item.chapter.current;
    const newCurrent = Number(document.getElementById('detailCurrent').value) || 0;
    if(newCurrent > prev){
      item.chapter.history = [...(item.chapter.history||[]), prev];
    }
    item.title = document.getElementById('detailTitle').value.trim();
    item.url = document.getElementById('detailUrl').value.trim();
    item.type = detailType.value;
    item.status = detailStatus.value;
    item.chapter.current = newCurrent;
    item.meta = item.meta || {};
    item.meta.notes = document.getElementById('detailNotes').value;
    await saveData(item);
    await renderList(searchEl.value);
    showToast('Saved', 900);
  }

  function deleteDetails(){
    /*
    const id = document.getElementById('editForm').dataset.editing;
    if(!id) return;
    DATA = DATA.filter(d=>d.id!=id);
    saveData(); renderList(searchEl.value);
    showToast('Deleted', 1000);
    */
  }

  // bulk actions
  function getSelectedIds(){
    return Array.from(document.querySelectorAll('.checkbox:checked')).map(i=>i.dataset.id);
  }
  async function bulkMarkRead(){
    const ids = getSelectedIds();
    ids.forEach(async id=>{
        const item = DATA.find(d=>d.id==id); if(!item) return;
        item.status = 'Finished';
        if(!item.chapter.history) item.chapter.history = [];
        item.chapter.history.push(item.chapter.current);
        item.chapter.current = item.chapter.latest || item.chapter.current; // simple heuristic
        await saveData(item);
    });
    await renderList(searchEl.value);
    showToast(`${ids.length} marked as read`);
  }
  function bulkOpen(){
    const ids = getSelectedIds();
    ids.forEach(id=>{
      const item = DATA.find(d=>d.id==id);
      if(item) window.open(item.url, '_blank');
    });
  }
  function openBulkEditPanel() {
    const selectedIds = getSelectedIds();
    if (selectedIds.length === 0) {
        showToast("No items selected for bulk edit.");
        return;
    }

    // Populate the bulk edit fields with the first selected item's data
    const firstItem = DATA.find(d => d.id === selectedIds[0]);
    document.getElementById('bulkEditType').value = firstItem.type;
    document.getElementById('bulkEditStatus').value = firstItem.status;
    document.getElementById('bulkEditTags').value = firstItem.meta?.tags.join(', ') || '';
    document.getElementById('bulkEditPanel').style.display = 'block';
}

async function saveBulkEdit() {
    const newType = document.getElementById('bulkEditType').value;
    const newStatus = document.getElementById('bulkEditStatus').value;
    const newTags = document.getElementById('bulkEditTags').value.split(',').map(tag => tag.trim());

    const selectedIds = getSelectedIds();
    for (const id of selectedIds) {
        const item = DATA.find(d => d.id === id);
        if (item) {
            item.type = newType;
            item.status = newStatus;
            item.meta.tags = newTags;
            await saveData(item);
        }
    }
    await renderList(searchEl.value);
    showToast(`${selectedIds.length} items updated.`);
}

  // selector save (site-specific RSS selectors)
  function saveSelectors(){
    const domain = document.getElementById('siteDomain').value.trim();
    const rssSel = document.getElementById('rssSelector').value.trim();
    const itemSel = document.getElementById('itemSelector').value.trim();
    if(!domain || !rssSel) return showToast('Domain & RSS selector required',1200);
    const all = JSON.parse(localStorage.getItem('site_selectors')||'{}');
    all[domain] = { rss: rssSel, items: itemSel };
    localStorage.setItem('site_selectors', JSON.stringify(all));
    showToast('Selectors saved');
  }

  // notifications (simple preview)
  function updateNotificationPreview(){
    const desktop = document.getElementById('desktopNotify').checked;
    const email = document.getElementById('emailNotify').checked;
    const p = document.getElementById('notificationPreview');
    p.textContent = `Desktop: ${desktop ? 'ON':'OFF'} • Email: ${email ? 'ON':'OFF'}`;
  }

  // wire events
  document.getElementById('bulkMarkRead').addEventListener('click', bulkMarkRead);
  document.getElementById('bulkOpen').addEventListener('click', bulkOpen);
  document.getElementById('bulkEditButton').addEventListener('click', openBulkEditPanel);
  document.getElementById('saveBulkEditButton').addEventListener('click', saveBulkEdit);
  document.querySelector('.CancelBulkEdit').addEventListener('click',() => document.getElementById('bulkEditPanel').style.display='none')
  document.getElementById('reloadData').addEventListener('click', async ()=>{ await loadData(); await renderList(searchEl.value); showToast('Reloaded'); });
  searchEl.addEventListener('input', e=> renderList(e.target.value));
  document.getElementById('saveDetail').addEventListener('click', saveDetails);
  document.getElementById('deleteDetail').addEventListener('click', deleteDetails);
  document.getElementById('saveSelectors').addEventListener('click', saveSelectors);
  document.getElementById('siteDomain').addEventListener('change', ()=>{/* optionally prefill */});
  document.getElementById('desktopNotify').addEventListener('change', updateNotificationPreview);
  document.getElementById('emailNotify').addEventListener('change', updateNotificationPreview);

  // init
  renderFilters();
  await loadData();
  await renderList();
  updateNotificationPreview();

  // expose small API for integration
  window.HermidataPage = {
    reload: async ()=>{ await loadData(); await renderList(); },
    addEntry: async (entry)=>{ entry.id = entry.id || String(Date.now()); DATA.push(entry); saveData(entry); await renderList(); }
  };

})();