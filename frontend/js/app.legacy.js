import * as state from './core/state.js';
import * as socket from './core/socket.js';
import * as api from './core/api.js';
import * as workspaceSwitcher from './modules/workspaceSwitcher.js';
import * as inbox from './modules/inbox.js';
import * as contacts from './modules/contacts.js';
import * as automation from './modules/automation.js';
import * as media from './modules/media.js';
import * as logs from './modules/logs.js';
import * as qr from './modules/qr.js';
import * as analytics from './modules/analytics.js';

const latinDateTimeFormatter = new Intl.DateTimeFormat('en-GB-u-nu-latin', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
});

function formatDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? '' : latinDateTimeFormatter.format(d);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}

// ================= SECTION SWITCHING =================

const sectionIds = ['inboxSection', 'contactsSection', 'automationSection', 'mediaSection', 'logsSection', 'analyticsSection', 'qrSection'];

function showSection(id) {
  sectionIds.forEach(sid => {
    const el = document.getElementById(sid);
    if (el) el.classList.add('d-none');
  });
  const el = document.getElementById(id);
  if (el) el.classList.remove('d-none');

  document.querySelectorAll('.menu button').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.section === id.replace('Section', '')) btn.classList.add('active');
  });

  state.setState('section', id.replace('Section', ''));
}

function hideSection() {
  sectionIds.forEach(sid => {
    const el = document.getElementById(sid);
    if (el) el.classList.add('d-none');
  });
  document.querySelectorAll('.menu button').forEach(btn => btn.classList.remove('active'));
  state.setState('section', null);
}

// ================= LOGIN / LOGOUT =================

async function login(email, password) {
  try {
    const res = await api.post('/api/auth/login', { email, password });
    if (!res.success) return false;
    state.setState('user', res.user);
    return true;
  } catch (err) {
    console.error('Login failed:', err.message);
    return false;
  }
}

async function logout() {
  try {
    await api.post('/api/auth/logout', {});
  } catch (err) {}
  state.setState('user', null);
  window.location.href = '/login';
}

// ================= INITIALIZATION =================

async function init() {
  // Workspace switcher
  workspaceSwitcher.init('#workspaceSwitcherContainer');

  // Socket listeners
  socket.init();
  socket.on('session_update', (data) => {
    state.setState('sessionStatus', data);
    workspaceSwitcher.updateStatusBadge?.(
      state.getState('workspaces').find(w => w.id === data.workspaceId)
    );
  });
  socket.on('new_message', (data) => {
    state.emit('new_message', data);
  });

  // Menu navigation
  document.querySelectorAll('.menu button[data-section]').forEach(btn => {
    btn.addEventListener('click', () => showSection(`${btn.dataset.section}Section`));
  });

  // Initialize modules
  inbox.init();
  contacts.init();
  automation.init();
  media.init();
  logs.init();
  qr.init();
  analytics.loadMetrics();

  // Show default section
  showSection('inboxSection');

  // Workspace change handler
  state.subscribe('workspaceChanged', () => {
    inbox.loadInbox();
    contacts.loadContacts();
    automation.loadAutomation();
    media.loadMedia();
    logs.loadLogs();
    qr.loadQr();
    analytics.loadMetrics();
  });

  // Logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);
}

// ================= DOM READY =================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Global helpers for backward compatibility
window.showSection = showSection;
window.hideSection = hideSection;
window.formatDate = formatDate;
window.escapeHtml = escapeHtml;
