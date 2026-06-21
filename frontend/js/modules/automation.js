import * as api from '../core/api.js';
import * as state from '../core/state.js';

let automationSteps = null;
let automationEnabled = null;
let cooldownHours = null;
let saveBtn = null;
let automationStepsData = [];

export function init() {
  automationSteps = document.getElementById('automationSteps');
  automationEnabled = document.getElementById('automationEnabled');
  cooldownHours = document.getElementById('cooldownHours');
  saveBtn = document.getElementById('saveAutomationBtn');

  document.getElementById('addTextStepBtn')?.addEventListener('click', () => addStep('text'));
  document.getElementById('addImageStepBtn')?.addEventListener('click', () => addStep('image'));
  document.getElementById('addAudioStepBtn')?.addEventListener('click', () => addStep('audio'));
  document.getElementById('addVideoStepBtn')?.addEventListener('click', () => addStep('video'));
  document.getElementById('addDelayStepBtn')?.addEventListener('click', () => addStep('delay'));

  if (saveBtn) {
    saveBtn.addEventListener('click', saveAutomation);
  }

  state.subscribe('workspaceChanged', () => loadAutomation());
  loadAutomation();
}

async function loadAutomation() {
  try {
    const res = await api.get('/api/automation');
    if (!res.success) return;
    state.setState('automation', res.automation);
    automationStepsData = res.automation?.steps || [];
    renderSteps();
  } catch (err) {
    console.error('loadAutomation failed:', err.message);
  }
}

async function saveAutomation() {
  const steps = automationStepsData.map(step => {
    if (step.type === 'text') return { type: 'text', text: step.text || '' };
    if (step.type === 'image' || step.type === 'video') return { type: step.type, media_id: step.media_id || '', caption: step.caption || '' };
    if (step.type === 'audio') return { type: 'audio', media_id: step.media_id || '' };
    if (step.type === 'delay') return { type: 'delay', seconds: step.seconds || 60 };
    return step;
  });

  const data = {
    enabled: automationEnabled?.checked ?? true,
    cooldown_hours: cooldownHours?.value || 24,
    steps,
    trigger_mode: document.querySelector('input[name="automationTriggerMode"]:checked')?.value || 'first_message'
  };

  try {
    await api.post('/api/automation', data);
    alert('تم حفظ الأتمتة');
  } catch (err) {
    console.error('saveAutomation failed:', err.message);
  }
}

function addStep(type) {
  if (type === 'text') automationStepsData.push({ type: 'text', text: '' });
  else if (type === 'image') automationStepsData.push({ type: 'image', media_id: '', caption: '' });
  else if (type === 'video') automationStepsData.push({ type: 'video', media_id: '', caption: '' });
  else if (type === 'audio') automationStepsData.push({ type: 'audio', media_id: '' });
  else if (type === 'delay') automationStepsData.push({ type: 'delay', seconds: 60 });
  renderSteps();
}

function renderSteps() {
  if (!automationSteps) return;
  automationSteps.innerHTML = '';
  automationStepsData.forEach((step, index) => {
    const card = document.createElement('div');
    card.className = 'card automation-step-card border-0 p-3 mb-3';
    card.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-2">
        <strong>${step.type === 'text' ? 'نص' : step.type === 'image' ? 'صورة' : step.type === 'video' ? 'فيديو' : step.type === 'audio' ? 'صوت' : 'مؤقت'}</strong>
        <button class="btn btn-sm btn-outline-light remove-step-btn" data-index="${index}">✕</button>
      </div>
      ${step.type === 'text' ? `<textarea class="form-control" data-step-index="${index}" rows="3">${escapeHtml(step.text || '')}</textarea>` : ''}
      ${step.type === 'image' || step.type === 'video' ? `
        <input type="file" class="form-control form-control-sm mb-2" data-upload-index="${index}" accept="${step.type}/*" />
        <textarea class="form-control" rows="2" placeholder="كابشن...">${escapeHtml(step.caption || '')}</textarea>
      ` : ''}
      ${step.type === 'audio' ? `<input type="file" class="form-control form-control-sm" data-upload-index="${index}" accept="audio/*" />` : ''}
      ${step.type === 'delay' ? `<input type="number" class="form-control" value="${step.seconds || 60}" min="1" data-delay-index="${index}" />` : ''}
    `;
    automationSteps.appendChild(card);
  });

  automationSteps.querySelectorAll('.remove-step-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      automationStepsData.splice(Number(btn.dataset.index), 1);
      renderSteps();
    });
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}
