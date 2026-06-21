import * as api from '../core/api.js';
import * as state from '../core/state.js';

let container = null;
let selectEl = null;
let statusBadge = null;

function render() {
  if (!container) return;
  container.innerHTML = `
    <div class="mb-3">
      <label class="form-label small text-muted">Workspace</label>
      <select id="workspaceSelect" class="form-control form-control-sm">
        <option value="">Loading...</option>
      </select>
      <div id="workspaceStatus" class="small mt-1">
        <span class="badge bg-secondary">Unknown</span>
      </div>
    </div>
  `;
  selectEl = document.getElementById('workspaceSelect');
  statusBadge = document.getElementById('workspaceStatus');
  if (selectEl) {
    selectEl.addEventListener('change', onWorkspaceChange);
  }
}

async function loadWorkspaces() {
  try {
    const res = await api.get('/api/v1/workspaces');
    if (!res.success) return;
    state.setState('workspaces', res.workspaces);
    populateSelect();
    const currentId = api.getWorkspaceId();
    const ws = res.workspaces.find(w => String(w.id) === currentId);
    if (ws) updateStatusBadge(ws);
  } catch (err) {
    console.error('Failed to load workspaces:', err.message);
  }
}

function populateSelect() {
  if (!selectEl) return;
  const workspaces = state.getState('workspaces');
  const currentId = api.getWorkspaceId();
  selectEl.innerHTML = workspaces.map(w =>
    `<option value="${w.id}" ${String(w.id) === currentId ? 'selected' : ''}>${escapeHtml(w.name)}</option>`
  ).join('');
}

function updateStatusBadge(workspace) {
  if (!statusBadge || !workspace) return;
  const statusMap = {
    active: '<span class="badge bg-success">Connected</span>',
    paused: '<span class="badge bg-warning">Paused</span>',
    disconnected: '<span class="badge bg-secondary">Disconnected</span>',
    connecting: '<span class="badge bg-info">Connecting</span>'
  };
  statusBadge.innerHTML = statusMap[workspace.status] || statusMap.disconnected;
}

function onWorkspaceChange(e) {
  const newId = e.target.value;
  if (!newId) return;
  const oldId = api.getWorkspaceId();
  api.setWorkspaceId(newId);
  import('../core/socket.js').then(socket => socket.setWorkspace(Number(newId)));
  state.setState('currentWorkspace', Number(newId));
  const ws = state.getState('workspaces').find(w => String(w.id) === newId);
  if (ws) updateStatusBadge(ws);
  state.emit('workspaceChanged', { oldId, newId });
}

export function init(selector) {
  container = document.querySelector(selector);
  render();
  loadWorkspaces();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
}
