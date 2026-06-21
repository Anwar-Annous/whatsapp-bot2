import * as api from '../core/api.js';
import * as state from '../core/state.js';

let mediaGallery = null;
let uploadForm = null;

export function init() {
  mediaGallery = document.getElementById('mediaGallery');
  uploadForm = document.getElementById('uploadForm');

  if (uploadForm) {
    uploadForm.addEventListener('submit', onUploadSubmit);
  }

  state.subscribe('workspaceChanged', () => loadMedia());
  loadMedia();
}

async function loadMedia() {
  if (!mediaGallery) return;
  try {
    const res = await api.get('/api/media');
    if (!res.success) return;
    state.setState('media', res.media);
    renderGallery(res.media);
  } catch (err) {
    console.error('loadMedia failed:', err.message);
  }
}

async function onUploadSubmit(e) {
  e.preventDefault();
  const fileInput = e.target.querySelector('input[name="media"]');
  if (!fileInput?.files?.length) return;
  const formData = new FormData();
  formData.append('media', fileInput.files[0]);
  try {
    await api.api('/api/media/upload', { method: 'POST', body: formData, headers: {} });
    fileInput.value = '';
    loadMedia();
  } catch (err) {
    console.error('Upload failed:', err.message);
  }
}

function renderGallery(media) {
  if (!mediaGallery) return;
  mediaGallery.innerHTML = '';
  media.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'col-12 col-md-6';
    card.innerHTML = `
      <div class="card bg-secondary border-0 p-3 h-100">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <span class="badge bg-info">ID ${item.id}</span>
          <button class="btn btn-sm btn-danger" data-delete-id="${item.id}">حذف</button>
        </div>
        ${item.type === 'image' ? `<img src="/${item.path}" class="img-fluid rounded mb-2" alt="صورة" />` : item.type === 'video' ? `<video controls src="/${item.path}" class="w-100 rounded mb-2" style="max-height:200px;"></video>` : `<audio controls src="/${item.path}" class="w-100 mb-2"></audio>`}
        <div class="small text-muted">${escapeHtml(item.original_name)}</div>
      </div>
    `;
    mediaGallery.appendChild(card);
  });

  mediaGallery.querySelectorAll('[data-delete-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api.del(`/api/media/${btn.dataset.deleteId}`);
      loadMedia();
    });
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}
