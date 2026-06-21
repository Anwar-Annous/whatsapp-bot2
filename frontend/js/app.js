(() => {
  // ================= WORKSPACE SUPPORT =================
  const WORKSPACE_KEY = 'workspaceId';
  let currentWorkspace = Number(localStorage.getItem(WORKSPACE_KEY)) || 1;

  function getWorkspaceId() { return currentWorkspace; }
  function setWorkspaceId(id) {
    currentWorkspace = Number(id);
    localStorage.setItem(WORKSPACE_KEY, String(currentWorkspace));
  }

  async function loadWorkspaces() {
    const container = document.getElementById('workspaceSwitcherContainer');
    if (!container) return;
    try {
      const res = await fetch('/api/v1/workspaces', { credentials: 'same-origin' });
      const data = await res.json();
      if (!data.success) return;
      const ws = data.workspaces;
      const html = `
        <div class="mb-3">
          <label class="form-label small text-muted">Workspace</label>
          <select id="workspaceSelect" class="form-control form-control-sm">
            ${ws.map(w => `<option value="${w.id}" ${w.id === currentWorkspace ? 'selected' : ''}>${escapeHtml(w.name)}</option>`).join('')}
          </select>
          <div class="small mt-1">
            <span class="badge bg-${ws.find(w => w.id === currentWorkspace)?.status === 'active' ? 'success' : 'secondary'}">
              ${ws.find(w => w.id === currentWorkspace)?.status || 'disconnected'}
            </span>
          </div>
        </div>
      `;
      container.innerHTML = html;
      document.getElementById('workspaceSelect')?.addEventListener('change', (e) => {
        const oldId = getWorkspaceId();
        const newId = Number(e.target.value);
        setWorkspaceId(newId);
        socket.emit('leave_workspace', oldId);
        socket.emit('join_workspace', newId);
        reloadAllData();
      });
    } catch (err) { console.error('loadWorkspaces:', err); }
  }

  function reloadAllData() {
    loadInbox(); loadContacts(); loadAutomation(); loadMedia(); loadLogs(); loadMetrics(); loadQR();
  }

  // ================= API HELPERS =================
  async function apiGet(path) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'X-Workspace-Id': String(currentWorkspace) }
    });
    return res.json();
  }
  async function apiPost(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-Id': String(currentWorkspace)
      },
      body: JSON.stringify(body)
    });
    return res.json();
  }
  async function apiDelete(path) {
    const res = await fetch(path, { method: 'DELETE', credentials: 'same-origin' });
    return res.json();
  }

  // ================= UTILS =================
  const latinDateTimeFormatter = new Intl.DateTimeFormat('en-GB-u-nu-latin', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  function formatDate(value) { const d = value instanceof Date ? value : new Date(value); return Number.isNaN(d.getTime()) ? '' : latinDateTimeFormatter.format(d); }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ================= SECTION SWITCHING =================
  const sectionIds = ['inboxSection','contactsSection','automationSection','mediaSection','logsSection','analyticsSection','workspacesSection','qrSection'];
  function showSection(id) {
    sectionIds.forEach(sid => { const el = document.getElementById(sid); if (el) el.classList.add('d-none'); });
    const el = document.getElementById(id); if (el) el.classList.remove('d-none');
    document.querySelectorAll('#sectionMenu button').forEach(btn => { btn.classList.remove('active'); if (btn.dataset.section === id.replace('Section','')) btn.classList.add('active'); });
    if (id === 'contactsSection') loadContacts(); if (id === 'automationSection') loadAutomation(); if (id === 'mediaSection') loadMedia(); if (id === 'logsSection') loadLogs(); if (id === 'analyticsSection') loadMetrics(); if (id === 'qrSection') loadQR(); if (id === 'workspacesSection') loadWorkspacesTable();
  }

  // ================= INBOX =================
  let selectedConversationId = null;
  async function loadInbox() {
    const list = document.getElementById('conversationList'); if (!list) return;
    try { const res = await apiGet('/api/conversations');
      if (!res.success) return; list.innerHTML = '';
      res.conversations.forEach(c => {
        const item = document.createElement('div'); item.className = 'list-group-item'; item.style.cursor = 'pointer';
        item.innerHTML = `<div class="d-flex justify-content-between"><strong>${escapeHtml(c.contact_name || c.chat_id)}</strong><span class="badge bg-${c.status === 'New' ? 'danger' : 'secondary'}">${c.status}</span></div><div class="small text-muted">${escapeHtml(c.last_message || '')}</div>`;
        item.addEventListener('click', () => loadMessages(c.id)); list.appendChild(item);
      });
    } catch (e) { console.error('loadInbox:', e); }
  }
  async function loadMessages(cid) {
    selectedConversationId = cid; const chat = document.getElementById('chatWindow'); if (!chat) return;
    try { const res = await apiGet(`/api/conversations/${cid}/messages`); if (!res.success) return; chat.innerHTML = '';
      res.messages.forEach(msg => {
        const row = document.createElement('div'); row.className = `message-row ${msg.direction === 'out' ? 'message-out' : 'message-in'}`;
        const bubble = document.createElement('div'); bubble.className = 'message-bubble';
        if (msg.type === 'image') { bubble.innerHTML = `<div><img src="/${msg.media_path}" class="img-fluid rounded" alt="صورة" /></div>`; }
        else if (msg.type === 'audio') { bubble.innerHTML = `<audio controls src="/${msg.media_path}" class="w-100"></audio>`; }
        else if (msg.type === 'video') { bubble.innerHTML = `<video controls src="/${msg.media_path}" class="w-100 rounded" style="max-height:300px;"></video>`; }
        else { bubble.textContent = msg.body; }
        const time = document.createElement('div'); time.className = 'message-time'; time.textContent = formatDate(msg.timestamp);
        row.appendChild(bubble); row.appendChild(time); chat.appendChild(row);
      });
    } catch (e) { console.error('loadMessages:', e); }
  }
  async function onReply(e) { e.preventDefault(); const inp = document.getElementById('replyInput'); const text = inp?.value?.trim(); if (!text || !selectedConversationId) return;
    try { await apiPost(`/api/conversations/${selectedConversationId}/reply`, { text }); inp.value = ''; loadMessages(selectedConversationId); } catch (e) { console.error('reply:', e); }
  }

  // ================= CONTACTS =================
  const selectedCampaignIds = new Set();
  async function loadContacts() {
    const list = document.getElementById('contactsList'); if (!list) return;
    try { const res = await apiGet('/api/contacts'); if (!res.success) return; list.innerHTML = '';
      res.contacts.forEach(c => {
        const item = document.createElement('div'); item.className = 'list-group-item';
        item.innerHTML = `<div class="d-flex justify-content-between align-items-center"><div><strong>${escapeHtml(c.name || c.phone)}</strong><div class="small text-muted">${escapeHtml(c.phone)}</div></div><input type="checkbox" class="form-check-input" data-contact-id="${c.id}" ${selectedCampaignIds.has(c.id) ? 'checked' : ''}/></div>`;
        const cb = item.querySelector('input'); cb.addEventListener('change', () => { if (cb.checked) selectedCampaignIds.add(c.id); else selectedCampaignIds.delete(c.id); const badge = document.getElementById('selectedContactsCount'); if (badge) badge.textContent = `${selectedCampaignIds.size} مختار`; });
        list.appendChild(item);
      });
    } catch (e) { console.error('loadContacts:', e); }
  }
  async function sendCampaign() {
    const text = document.getElementById('campaignMessage')?.value?.trim(); if (!text || selectedCampaignIds.size === 0) { alert('اختر جهات اتصال واكتب رسالة'); return; }
    try { await apiPost('/api/campaign', { contact_ids: Array.from(selectedCampaignIds), text }); alert('تم إرسال الحملة'); selectedCampaignIds.clear(); document.querySelectorAll('input[data-contact-id]').forEach(cb => cb.checked = false); const badge = document.getElementById('selectedContactsCount'); if (badge) badge.textContent = '0 مختار'; } catch (e) { console.error('campaign:', e); }
  }

  // ================= AUTOMATION =================
  let automationSteps = [];
  async function loadAutomation() {
    try { const res = await apiGet('/api/automation'); if (!res.success) return; const a = res.automation; document.getElementById('automationEnabled').checked = a?.enabled ?? true; document.getElementById('cooldownHours').value = a?.cooldown_hours || 24;
      document.querySelectorAll('input[name="automationTriggerMode"]').forEach(r => r.checked = r.value === (a?.trigger_mode || 'first_message'));
      automationSteps = a?.steps || []; renderAutomationSteps();
    } catch (e) { console.error('loadAutomation:', e); }
  }
  function renderAutomationSteps() {
    const container = document.getElementById('automationSteps'); if (!container) return; container.innerHTML = '';
    automationSteps.forEach((step, index) => {
      const card = document.createElement('div'); card.className = 'card automation-step-card border-0 p-3 mb-3';
      const label = step.type === 'text' ? 'نص' : step.type === 'image' ? 'صورة' : step.type === 'video' ? 'فيديو' : step.type === 'audio' ? 'صوت' : 'مؤقت';
      let inner = '';
      if (step.type === 'text') inner = `<textarea class="form-control step-text" data-index="${index}" rows="3">${escapeHtml(step.text || '')}</textarea>`;
      else if (step.type === 'image' || step.type === 'video') {
        const mediaLabel = step.media_id ? (step.filename || 'تم رفع ملف') : 'لم يتم اختيار ملف بعد';
        inner = `<div class="mb-2"><strong>${mediaLabel}</strong></div><input type="file" class="form-control form-control-sm mb-2 step-upload" data-index="${index}" accept="${step.type}/*" /><textarea class="form-control step-caption" data-index="${index}" rows="2" placeholder="كابشن">${escapeHtml(step.caption || '')}</textarea>`;
      } else if (step.type === 'audio') {
        const mediaLabel = step.media_id ? (step.filename || 'تم رفع ملف') : 'لم يتم اختيار ملف بعد';
        inner = `<div class="mb-2"><strong>${mediaLabel}</strong></div><input type="file" class="form-control form-control-sm step-upload" data-index="${index}" accept="audio/*" />`;
      } else if (step.type === 'delay') inner = `<input type="number" class="form-control step-delay" data-index="${index}" value="${step.seconds || 60}" min="1" />`;
      card.innerHTML = `<div class="d-flex justify-content-between align-items-center mb-2"><strong>${label}</strong><button class="btn btn-sm btn-outline-light remove-step" data-index="${index}">✕</button></div>${inner}`;
      container.appendChild(card);
    });
    container.querySelectorAll('.remove-step').forEach(btn => btn.addEventListener('click', () => { automationSteps.splice(Number(btn.dataset.index), 1); renderAutomationSteps(); }));
    container.querySelectorAll('.step-upload').forEach(inp => inp.addEventListener('change', async (e) => { const idx = Number(e.target.dataset.index); const file = e.target.files[0]; if (!file) return; const fd = new FormData(); fd.append('media', file); const res = await fetch('/api/media/upload', { method: 'POST', body: fd, credentials: 'same-origin' }); const data = await res.json(); if (data.success) { automationSteps[idx].media_id = data.id; automationSteps[idx].filename = data.filename; renderAutomationSteps(); } }));
  }
  async function saveAutomation() {
    const steps = automationSteps.map(s => { if (s.type === 'text') return { type: 'text', text: s.text || '' }; if (s.type === 'image' || s.type === 'video') return { type: s.type, media_id: s.media_id || '', caption: s.caption || '' }; if (s.type === 'audio') return { type: 'audio', media_id: s.media_id || '' }; if (s.type === 'delay') return { type: 'delay', seconds: Number(s.seconds) || 60 }; return s; });
    const data = { enabled: document.getElementById('automationEnabled')?.checked ?? true, cooldown_hours: document.getElementById('cooldownHours')?.value || 24, steps, trigger_mode: document.querySelector('input[name="automationTriggerMode"]:checked')?.value || 'first_message' };
    try { await apiPost('/api/automation', data); alert('تم حفظ الأتمتة'); } catch (e) { console.error('saveAutomation:', e); }
  }
  function addAutomationStep(type) { if (type === 'text') automationSteps.push({ type: 'text', text: '' }); else if (type === 'image') automationSteps.push({ type: 'image', media_id: '', caption: '' }); else if (type === 'video') automationSteps.push({ type: 'video', media_id: '', caption: '' }); else if (type === 'audio') automationSteps.push({ type: 'audio', media_id: '' }); else if (type === 'delay') automationSteps.push({ type: 'delay', seconds: 60 }); renderAutomationSteps(); }

  // ================= MEDIA =================
  async function loadMedia() {
    const gallery = document.getElementById('mediaGallery'); if (!gallery) return;
    try { const res = await apiGet('/api/media'); if (!res.success) return; gallery.innerHTML = '';
      res.media.forEach(item => {
        const card = document.createElement('div'); card.className = 'col-12 col-md-6';
        const preview = item.type === 'image' ? `<img src="/${item.path}" class="img-fluid rounded mb-2" alt="صورة" />` : item.type === 'video' ? `<video controls src="/${item.path}" class="w-100 rounded mb-2" style="max-height:200px;"></video>` : `<audio controls src="/${item.path}" class="w-100 mb-2"></audio>`;
        card.innerHTML = `<div class="card bg-secondary border-0 p-3 h-100"><div class="d-flex justify-content-between align-items-start mb-2"><span class="badge bg-info">ID ${item.id}</span><button class="btn btn-sm btn-danger del-media" data-id="${item.id}">حذف</button></div>${preview}<div class="small text-muted">${escapeHtml(item.original_name)}</div></div>`;
        gallery.appendChild(card);
      });
      gallery.querySelectorAll('.del-media').forEach(btn => btn.addEventListener('click', async () => { await apiDelete(`/api/media/${btn.dataset.id}`); loadMedia(); }));
    } catch (e) { console.error('loadMedia:', e); }
  }
  async function onUpload(e) { e.preventDefault(); const inp = e.target.querySelector('input[name="media"]'); if (!inp?.files?.length) return; const fd = new FormData(); fd.append('media', inp.files[0]); try { await fetch('/api/media/upload', { method: 'POST', body: fd, credentials: 'same-origin' }); inp.value = ''; loadMedia(); } catch (e) { console.error('upload:', e); } }

  // ================= LOGS =================
  async function loadLogs() { const list = document.getElementById('logItems'); if (!list) return; try { const res = await apiGet('/api/logs'); if (!res.success) return; list.innerHTML = ''; res.logs.forEach(l => { const item = document.createElement('div'); item.className = 'list-group-item bg-secondary border-0'; item.innerHTML = `<div><strong>${escapeHtml(l.event)}</strong></div><div class="small text-muted">${escapeHtml(formatDate(l.created_at))} - ${escapeHtml(l.details)}</div>`; list.appendChild(item); }); } catch (e) { console.error('loadLogs:', e); } }

  // ================= QR =================
  async function loadQR() { const area = document.getElementById('qrArea'); if (!area) return; try { const res = await apiGet('/api/qr'); if (!res.success || !res.qr) { area.innerHTML = `<p class="text-muted">الحالة: ${res.state}</p>`; return; } area.innerHTML = `<img src="${res.qr}" class="img-fluid" alt="QR" />`; } catch (e) { console.error('loadQR:', e); } }

  // ================= METRICS =================
  async function loadMetrics() { try { const res = await apiGet('/api/metrics'); if (!res.success) return; const m = res.metrics; const el = (id) => document.getElementById(id); if (el('countConversations')) el('countConversations').textContent = m.total || 0; if (el('activeChats')) el('activeChats').textContent = m.active || 0; if (el('responseRate')) el('responseRate').textContent = `${m.responseRate || 0}%`; if (el('automationHits')) el('automationHits').textContent = m.automationHits || 0; if (el('lastSync')) el('lastSync').textContent = new Date().toLocaleTimeString('en-GB'); } catch (e) { console.error('metrics:', e); } }

  // ================= SEARCH =================
  function onSearch() { const term = document.getElementById('searchInput')?.value?.toLowerCase() || ''; document.querySelectorAll('#conversationList .list-group-item').forEach(item => { item.style.display = item.textContent.toLowerCase().includes(term) ? '' : 'none'; }); }

  // ================= TEMPLATES =================
  const TEMPLATES = {
    welcome: [{ type: 'text', text: 'مرحباً بك! شكراً لتواصلك معنا. كيف يمكننا مساعدتك اليوم؟' }],
    store: [{ type: 'text', text: 'أهلاً وسهلاً في متجرنا! 🛍️' }, { type: 'delay', seconds: 3 }, { type: 'text', text: 'نقدم لك أفضل المنتجات بأسعار تنافسية. يمكنك تصفح القائمة أو طرح أي سؤال.' }],
    support: [{ type: 'text', text: 'مرحباً بك في الدعم الفني! 🛠️' }, { type: 'delay', seconds: 2 }, { type: 'text', text: 'وصف المشكلة التي تواجهك وسنساعدك في حلها بأسرع وقت.' }],
    away: [{ type: 'text', text: 'أهلاً بك! نعتذر، لكننا خارج أوقات العمل حالياً. ⏰' }, { type: 'delay', seconds: 2 }, { type: 'text', text: 'سنرد عليك خلال ساعات العمل القادمة. شكراً لتفهمك!' }]
  };

  // ================= SOCKET =================
  const socket = io();
  socket.on('connect', () => socket.emit('join_workspace', currentWorkspace));
  socket.on('new_message', (data) => { loadInbox(); if (selectedConversationId === data.conversationId) loadMessages(selectedConversationId); });
  socket.on('session_update', (data) => { const badge = document.getElementById('sessionStatus'); if (badge) badge.textContent = data.connected ? 'متصل' : 'غير متصل'; });

  // ================= WORKSPACE MANAGEMENT =================
  async function loadWorkspacesTable() {
    const tbody = document.getElementById('workspacesTableBody');
    if (!tbody) return;
    try {
      const res = await fetch('/api/v1/workspaces', { credentials: 'same-origin' });
      const data = await res.json();
      if (!data.success) { tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">فشل التحميل</td></tr>'; return; }
      const ws = data.workspaces;
      if (!ws.length) { tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">لا توجد workspaces</td></tr>'; return; }
      tbody.innerHTML = ws.map(w => `
        <tr>
          <td>${w.id}</td>
          <td><strong>${escapeHtml(w.name)}</strong></td>
          <td>${escapeHtml(w.phone_number || '—')}</td>
          <td><span class="badge bg-${w.status === 'active' ? 'success' : w.status === 'connecting' ? 'info' : 'secondary'}">${w.status}</span></td>
          <td>${formatDate(w.created_at)}</td>
          <td>
            <div class="d-flex gap-1">
              ${w.status === 'disconnected' ? `<button class="btn btn-sm btn-success ws-connect" data-id="${w.id}">Connect</button>` : `<button class="btn btn-sm btn-warning ws-disconnect" data-id="${w.id}">Disconnect</button>`}
              <button class="btn btn-sm btn-outline-light ws-switch" data-id="${w.id}">Switch</button>
              ${w.id !== 1 ? `<button class="btn btn-sm btn-danger ws-delete" data-id="${w.id}">Delete</button>` : ''}
            </div>
          </td>
        </tr>
      `).join('');
      // Bind action buttons
      tbody.querySelectorAll('.ws-connect').forEach(btn => btn.addEventListener('click', () => workspaceAction(btn.dataset.id, 'connect')));
      tbody.querySelectorAll('.ws-disconnect').forEach(btn => btn.addEventListener('click', () => workspaceAction(btn.dataset.id, 'disconnect')));
      tbody.querySelectorAll('.ws-switch').forEach(btn => btn.addEventListener('click', () => { setWorkspaceId(Number(btn.dataset.id)); socket.emit('leave_workspace', currentWorkspace); currentWorkspace = Number(btn.dataset.id); socket.emit('join_workspace', currentWorkspace); reloadAllData(); alert('تم تغيير Workspace'); }));
      tbody.querySelectorAll('.ws-delete').forEach(btn => btn.addEventListener('click', () => workspaceAction(btn.dataset.id, 'delete')));
    } catch (err) { console.error('loadWorkspacesTable:', err); tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">خطأ في التحميل</td></tr>'; }
  }

  async function workspaceAction(id, action) {
    if (action === 'delete' && !confirm('هل أنت متأكد من حذف هذا Workspace؟')) return;
    try {
      const url = action === 'delete' ? `/api/v1/workspaces/${id}` : `/api/v1/workspaces/${id}/${action}`;
      const method = action === 'delete' ? 'DELETE' : 'POST';
      await fetch(url, { method, credentials: 'same-origin' });
      loadWorkspacesTable();
      loadWorkspaces(); // refresh sidebar dropdown too
    } catch (err) { console.error('workspaceAction:', err); }
  }

  async function createWorkspace() {
    const name = document.getElementById('newWorkspaceName')?.value?.trim();
    const phone = document.getElementById('newWorkspacePhone')?.value?.trim();
    if (!name) { alert('أدخل اسم الـ Workspace'); return; }
    try {
      const res = await fetch('/api/v1/workspaces', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone_number: phone })
      });
      const data = await res.json();
      if (data.success) {
        alert('تم إنشاء Workspace بنجاح');
        document.getElementById('newWorkspaceName').value = '';
        document.getElementById('newWorkspacePhone').value = '';
        document.getElementById('createWorkspaceForm').classList.add('d-none');
        loadWorkspacesTable();
        loadWorkspaces(); // refresh sidebar
      } else {
        alert(data.message || 'فشل الإنشاء');
      }
    } catch (err) { console.error('createWorkspace:', err); alert('حدث خطأ'); }
  }

  // ================= DOM READY =================
  document.addEventListener('DOMContentLoaded', () => {
    loadWorkspaces();
    loadInbox(); loadMetrics(); loadQR();

    document.querySelectorAll('#sectionMenu button').forEach(btn => btn.addEventListener('click', () => showSection(`${btn.dataset.section}Section`)));
    document.getElementById('replyForm')?.addEventListener('submit', onReply);
    document.getElementById('sendCampaignBtn')?.addEventListener('click', sendCampaign);
    document.getElementById('clearSelectionBtn')?.addEventListener('click', () => { selectedCampaignIds.clear(); document.querySelectorAll('input[data-contact-id]').forEach(cb => cb.checked = false); const badge = document.getElementById('selectedContactsCount'); if (badge) badge.textContent = '0 مختار'; });
    document.getElementById('addTextStepBtn')?.addEventListener('click', () => addAutomationStep('text'));
    document.getElementById('addImageStepBtn')?.addEventListener('click', () => addAutomationStep('image'));
    document.getElementById('addAudioStepBtn')?.addEventListener('click', () => addAutomationStep('audio'));
    document.getElementById('addVideoStepBtn')?.addEventListener('click', () => addAutomationStep('video'));
    document.getElementById('addDelayStepBtn')?.addEventListener('click', () => addAutomationStep('delay'));
    document.getElementById('saveAutomationBtn')?.addEventListener('click', saveAutomation);
    document.getElementById('cancelDraftBtn')?.addEventListener('click', () => { automationSteps = []; renderAutomationSteps(); });
    document.getElementById('templateWelcome')?.addEventListener('click', () => { automationSteps = [...TEMPLATES.welcome]; renderAutomationSteps(); });
    document.getElementById('templateStore')?.addEventListener('click', () => { automationSteps = [...TEMPLATES.store]; renderAutomationSteps(); });
    document.getElementById('templateSupport')?.addEventListener('click', () => { automationSteps = [...TEMPLATES.support]; renderAutomationSteps(); });
    document.getElementById('templateAway')?.addEventListener('click', () => { automationSteps = [...TEMPLATES.away]; renderAutomationSteps(); });
    document.getElementById('uploadForm')?.addEventListener('submit', onUpload);
    document.getElementById('refreshQr')?.addEventListener('click', loadQR);
    document.getElementById('searchInput')?.addEventListener('input', onSearch);
    document.getElementById('logoutBtn')?.addEventListener('click', () => { fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).then(() => window.location.href = '/login'); });
    
    // Workspace management
    document.getElementById('openCreateWorkspaceBtn')?.addEventListener('click', () => {
      const form = document.getElementById('createWorkspaceForm');
      if (form) form.classList.remove('d-none');
    });
    document.getElementById('cancelCreateWorkspaceBtn')?.addEventListener('click', () => {
      const form = document.getElementById('createWorkspaceForm');
      if (form) form.classList.add('d-none');
    });
    document.getElementById('createWorkspaceBtn')?.addEventListener('click', createWorkspace);
  });
})();