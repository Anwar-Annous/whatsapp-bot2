import * as api from '../core/api.js';
import * as state from '../core/state.js';

let contactsList = null;
let campaignMessage = null;
let sendCampaignBtn = null;
let selectedCampaignIds = new Set();

export function init() {
  contactsList = document.getElementById('contactsList');
  campaignMessage = document.getElementById('campaignMessage');
  sendCampaignBtn = document.getElementById('sendCampaignBtn');

  if (sendCampaignBtn) {
    sendCampaignBtn.addEventListener('click', sendCampaign);
  }

  state.subscribe('workspaceChanged', () => loadContacts());
  loadContacts();
}

async function loadContacts() {
  if (!contactsList) return;
  try {
    const res = await api.get('/api/contacts');
    if (!res.success) return;
    state.setState('contacts', res.contacts);
    renderContacts(res.contacts);
  } catch (err) {
    console.error('loadContacts failed:', err.message);
  }
}

function renderContacts(contacts) {
  if (!contactsList) return;
  contactsList.innerHTML = '';
  contacts.forEach((c) => {
    const item = document.createElement('div');
    item.className = 'list-group-item';
    item.innerHTML = `
      <div class="d-flex justify-content-between align-items-center">
        <div>
          <strong>${escapeHtml(c.name || c.phone)}</strong>
          <div class="small text-muted">${escapeHtml(c.phone)}</div>
        </div>
        <input type="checkbox" class="form-check-input" data-contact-id="${c.id}" />
      </div>
    `;
    const checkbox = item.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', () => toggleContact(c.id, checkbox.checked));
    contactsList.appendChild(item);
  });
}

function toggleContact(id, checked) {
  if (checked) selectedCampaignIds.add(id);
  else selectedCampaignIds.delete(id);
  const countBadge = document.getElementById('selectedContactsCount');
  if (countBadge) countBadge.textContent = `${selectedCampaignIds.size} مختار`;
}

async function sendCampaign() {
  const text = campaignMessage?.value?.trim();
  if (!text || selectedCampaignIds.size === 0) {
    alert('اختر جهات اتصال واكتب رسالة');
    return;
  }
  try {
    await api.post('/api/campaign', {
      contact_ids: Array.from(selectedCampaignIds),
      text
    });
    alert('تم إرسال الحملة');
    selectedCampaignIds.clear();
    document.querySelectorAll('input[data-contact-id]').forEach(cb => cb.checked = false);
    const countBadge = document.getElementById('selectedContactsCount');
    if (countBadge) countBadge.textContent = '0 مختار';
  } catch (err) {
    console.error('sendCampaign failed:', err.message);
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}
