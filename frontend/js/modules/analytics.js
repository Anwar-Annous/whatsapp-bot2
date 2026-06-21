import * as api from '../core/api.js';
import * as state from '../core/state.js';

export async function loadMetrics() {
  try {
    const res = await api.get('/api/metrics');
    if (!res.success) return;
    state.setState('metrics', res.metrics);
    renderMetrics(res.metrics);
  } catch (err) {
    console.error('loadMetrics failed:', err.message);
  }
}

export function renderMetrics(metrics) {
  const countEl = document.getElementById('countConversations');
  const activeEl = document.getElementById('activeChats');
  const rateEl = document.getElementById('responseRate');
  const hitsEl = document.getElementById('automationHits');
  const lastSyncEl = document.getElementById('lastSync');

  if (countEl) countEl.textContent = metrics.total || 0;
  if (activeEl) activeEl.textContent = metrics.active || 0;
  if (rateEl) rateEl.textContent = `${metrics.responseRate || 0}%`;
  if (hitsEl) hitsEl.textContent = metrics.automationHits || 0;
  if (lastSyncEl) lastSyncEl.textContent = new Date().toLocaleTimeString('en-GB');
}
