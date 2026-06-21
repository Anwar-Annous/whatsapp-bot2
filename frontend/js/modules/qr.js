import * as api from '../core/api.js';
import * as state from '../core/state.js';

let qrArea = null;
let refreshQrBtn = null;

export function init() {
  qrArea = document.getElementById('qrArea');
  refreshQrBtn = document.getElementById('refreshQr');

  if (refreshQrBtn) {
    refreshQrBtn.addEventListener('click', loadQr);
  }

  state.subscribe('workspaceChanged', () => loadQr());
  loadQr();
}

async function loadQr() {
  if (!qrArea) return;
  try {
    const res = await api.get('/api/qr');
    if (!res.success) {
      qrArea.innerHTML = '<p class="text-muted">لا توجد بيانات</p>';
      return;
    }
    state.setState('sessionStatus', { state: res.state, qr: res.qr });
    if (res.qr) {
      qrArea.innerHTML = `<img src="${res.qr}" class="img-fluid" alt="QR" />`;
    } else {
      qrArea.innerHTML = `<p class="text-muted">الحالة: ${res.state}</p>`;
    }
  } catch (err) {
    console.error('loadQr failed:', err.message);
  }
}
