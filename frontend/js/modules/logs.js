import * as api from '../core/api.js';
import * as state from '../core/state.js';

let logItems = null;

export function init() {
  logItems = document.getElementById('logItems');
  state.subscribe('workspaceChanged', () => loadLogs());
  loadLogs();
}

async function loadLogs() {
  if (!logItems) return;
  try {
    const res = await api.get('/api/logs');
    if (!res.success) return;
    state.setState('logs', res.logs);
    renderLogs(res.logs);
  } catch (err) {
    console.error('loadLogs failed:', err.message);
  }
}

function renderLogs(logs) {
  if (!logItems) return;
  logItems.innerHTML = '';
  logs.forEach((log) => {
    const item = document.createElement('div');
    item.className = 'list-group-item bg-secondary border-0';
    item.innerHTML = `<div><strong>${escapeHtml(log.event)}</strong></div><div class="small text-muted">${escapeHtml(log.created_at)} - ${escapeHtml(log.details)}</div>`;
    logItems.appendChild(item);
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}
