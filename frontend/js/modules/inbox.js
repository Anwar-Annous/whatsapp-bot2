import * as api from '../core/api.js';
import * as state from '../core/state.js';

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

let conversationList = null;
let chatWindow = null;
let replyForm = null;
let replyInput = null;

export function init() {
  conversationList = document.getElementById('conversationList');
  chatWindow = document.getElementById('chatWindow');
  replyForm = document.getElementById('replyForm');
  replyInput = document.getElementById('replyInput');

  if (replyForm) {
    replyForm.addEventListener('submit', onReplySubmit);
  }

  state.subscribe('workspaceChanged', () => loadInbox());
  state.subscribe('new_message', onNewMessage);
  loadInbox();
}

async function loadInbox() {
  if (!conversationList) return;
  try {
    const res = await api.get('/api/conversations');
    if (!res.success) return;
    state.setState('conversations', res.conversations);
    renderConversationList(res.conversations);
  } catch (err) {
    console.error('loadInbox failed:', err.message);
  }
}

async function loadMessages(conversationId) {
  state.setState('selectedConversationId', conversationId);
  if (!chatWindow) return;
  try {
    const res = await api.get(`/api/conversations/${conversationId}/messages`);
    if (!res.success) return;
    renderMessages(res.messages, conversationId);
  } catch (err) {
    console.error('loadMessages failed:', err.message);
  }
}

async function onReplySubmit(e) {
  e.preventDefault();
  const text = replyInput?.value?.trim();
  if (!text) return;
  const conversationId = state.getState('selectedConversationId');
  if (!conversationId) return;
  try {
    await api.post(`/api/conversations/${conversationId}/reply`, { text });
    replyInput.value = '';
    loadMessages(conversationId);
  } catch (err) {
    console.error('Reply failed:', err.message);
  }
}

function onNewMessage(data) {
  const selectedId = state.getState('selectedConversationId');
  if (data.conversationId === selectedId) {
    loadMessages(selectedId);
  }
  loadInbox();
}

function renderConversationList(conversations) {
  if (!conversationList) return;
  conversationList.innerHTML = '';
  conversations.forEach((c) => {
    const item = document.createElement('div');
    item.className = 'list-group-item';
    item.style.cursor = 'pointer';
    item.innerHTML = `
      <div class="d-flex justify-content-between">
        <strong>${escapeHtml(c.contact_name || c.chat_id)}</strong>
        <span class="badge bg-${c.status === 'New' ? 'danger' : 'secondary'}">${c.status}</span>
      </div>
      <div class="small text-muted">${escapeHtml(c.last_message || '')}</div>
    `;
    item.addEventListener('click', () => loadMessages(c.id));
    conversationList.appendChild(item);
  });
}

function renderMessages(messages, conversationId) {
  if (!chatWindow) return;
  chatWindow.innerHTML = '';
  messages.forEach((msg) => {
    const row = document.createElement('div');
    row.className = `message-row ${msg.direction === 'out' ? 'message-out' : 'message-in'}`;
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    if (msg.type === 'image') {
      bubble.innerHTML = `<div><img src="/${msg.media_path}" class="img-fluid rounded" alt="صورة" /></div>`;
    } else if (msg.type === 'audio') {
      bubble.innerHTML = `<audio controls src="/${msg.media_path}" class="w-100"></audio>`;
    } else if (msg.type === 'video') {
      bubble.innerHTML = `<video controls src="/${msg.media_path}" class="w-100 rounded" style="max-height:300px;"></video>`;
    } else {
      bubble.textContent = msg.body;
    }
    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = formatDate(msg.timestamp);
    row.appendChild(bubble);
    row.appendChild(time);
    chatWindow.appendChild(row);
  });
}
