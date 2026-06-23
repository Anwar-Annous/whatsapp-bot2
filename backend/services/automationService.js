const db = require('../database/db');
const logService = require('./logService');

const TRIGGER_MODES = new Set(['first_message', 'every_message', 'cooldown']);

function normalizeTriggerMode(mode) {
  return TRIGGER_MODES.has(mode) ? mode : 'first_message';
}

async function getAutomation(workspaceId) {
  const rows = await db.query('SELECT * FROM automations WHERE workspace_id = ? ORDER BY id DESC LIMIT 1', [workspaceId]);
  console.log('[DEBUG] automationService.getAutomation - sql rows:', rows, 'workspaceId:', workspaceId);
  if (!rows.length) return null;
  const automation = rows[0];
  automation.steps = JSON.parse(automation.steps_json || '[]');
  automation.trigger_mode = normalizeTriggerMode(automation.trigger_mode);
  console.log('[DEBUG] automationService.getAutomation - parsed automation:', automation);
  return automation;
}

function normalizeStep(step) {
  if (!step || typeof step !== 'object') return null;
  if (step.type === 'text') return { type: 'text', text: step.text || '' };
  if (step.type === 'delay') return { type: 'delay', seconds: normalizeDelaySeconds(step.seconds || 60) || 60 };
  if (['image', 'video', 'audio', 'file'].includes(step.type)) {
    const mediaId = Number(step.media_id);
    if (!Number.isInteger(mediaId) || mediaId <= 0) {
      throw new Error(`${step.type} automation step is missing media_id`);
    }
    const normalized = { type: step.type, media_id: mediaId };
    if (['image', 'video', 'file'].includes(step.type)) normalized.caption = step.caption || '';
    return normalized;
  }
  return null;
}

async function saveAutomation(data, workspaceId) {
  const rawSteps = Array.isArray(data.steps) ? data.steps : [];
  console.log('[DEBUG] automationService.saveAutomation.received', { workspaceId, steps: rawSteps, enabled: data.enabled, trigger_mode: data.trigger_mode });
  const steps = rawSteps.map(normalizeStep).filter(Boolean);
  const mediaSteps = steps.filter(step => ['image', 'video', 'audio', 'file'].includes(step.type));
  for (const step of mediaSteps) {
    const rows = await db.query('SELECT id, type, path, workspace_id FROM media WHERE id = ? AND workspace_id = ?', [step.media_id, workspaceId]);
    console.log('[DEBUG] automationService.saveAutomation.mediaCheck', { workspaceId, step, rows });
    if (!rows.length) throw new Error(`${step.type} media ${step.media_id} not found in workspace ${workspaceId}`);
    if (rows[0].type !== step.type) {
      throw new Error(`media ${step.media_id} is ${rows[0].type}, not ${step.type}`);
    }
  }
  const stepsJson = JSON.stringify(steps);
  const triggerMode = normalizeTriggerMode(data.trigger_mode);
  const existing = await getAutomation(workspaceId);
  if (existing) {
    await db.query('UPDATE automations SET enabled = ?, steps_json = ?, cooldown_hours = ?, trigger_mode = ? WHERE id = ? AND workspace_id = ?', [
      data.enabled ? 1 : 0, stepsJson, data.cooldown_hours || 24, triggerMode, existing.id, workspaceId
    ]);
    console.log('[DEBUG] automationService.saveAutomation.updated', { workspaceId, automationId: existing.id, steps });
    return existing.id;
  }
  const result = await db.query('INSERT INTO automations (enabled, steps_json, cooldown_hours, trigger_mode, workspace_id) VALUES (?, ?, ?, ?, ?)', [
    data.enabled ? 1 : 0, stepsJson, data.cooldown_hours || 24, triggerMode, workspaceId
  ]);
  console.log('[DEBUG] automationService.saveAutomation.inserted', { workspaceId, automationId: result.insertId, steps });
  return result.insertId;
}

function getRunDecision(automation, context = {}) {
  console.log('[TRACE] getRunDecision called', { automationId: automation && automation.id, enabled: automation && automation.enabled, context });
  if (!automation) return { allowed: false, reason: 'missing_automation' };
  if (!automation.enabled) return { allowed: false, reason: 'disabled' };
  const triggerMode = normalizeTriggerMode(automation.trigger_mode);

  if (triggerMode === 'every_message') return { allowed: true, reason: 'every_message' };
  if (triggerMode === 'first_message') {
    return context.isNew
      ? { allowed: true, reason: 'first_message_new_conversation' }
      : { allowed: false, reason: 'first_message_existing_conversation' };
  }

  const cooldownHours = Number(automation.cooldown_hours) || 24;
  const lastRunAt = context.conversation?.automation_last_run_at;
  if (!lastRunAt) return { allowed: true, reason: 'cooldown_no_previous_run' };

  const lastRunTime = new Date(lastRunAt).getTime();
  if (Number.isNaN(lastRunTime)) return { allowed: true, reason: 'cooldown_invalid_previous_run' };

  const allowed = Date.now() - lastRunTime >= cooldownHours * 60 * 60 * 1000;
  return { allowed, reason: allowed ? 'cooldown_elapsed' : 'cooldown_waiting' };
}

function normalizeDelaySeconds(value) {
  const seconds = Math.round(Number(value));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

function getStepDelaySeconds(step) {
  if (!step || step.type !== 'delay') return 0;
  if (step.seconds !== undefined && step.seconds !== null && step.seconds !== '') {
    return normalizeDelaySeconds(step.seconds);
  }
  if (step.minutes !== undefined && step.minutes !== null && step.minutes !== '') {
    return normalizeDelaySeconds(Number(step.minutes) * 60);
  }
  return 0;
}

function getStepText(step) {
  if (step.type === 'text') return step.text;
  if (step.type === 'image' || step.type === 'video') return (step.caption || '').trim() || null;
  return null;
}

async function scheduleAutomationSteps(chatId, conversationId, steps, workspaceId, initialDelaySeconds = 0) {
  let delaySeconds = normalizeDelaySeconds(initialDelaySeconds);
  let scheduledCount = 0;

  for (const step of steps || []) {
    if (!step || !step.type) continue;
    if (step.type === 'delay') {
      delaySeconds += getStepDelaySeconds(step);
      continue;
    }
    if (!['text', 'image', 'audio', 'video', 'file'].includes(step.type)) continue;
    if (step.type === 'text' && !step.text) continue;
    if ((['image', 'audio', 'video', 'file'].includes(step.type)) && !step.media_id) continue;

    const scheduledAt = new Date(Date.now() + (delaySeconds * 1000));
    await db.query(
      'INSERT INTO scheduled_messages (conversation_id, chat_id, type, text, media_id, scheduled_at, status, workspace_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
      [conversationId, chatId, step.type, getStepText(step), step.media_id || null, scheduledAt, 'pending', workspaceId]
    );
    scheduledCount += 1;
  }

  if (scheduledCount) {
    await logService.create('info', 'automation_scheduled', `scheduled ${scheduledCount} steps for ${chatId}`, workspaceId);
  }
}

async function markRun(automationId, conversationId) {
  await db.query('UPDATE automations SET last_run_at = NOW() WHERE id = ?', [automationId]);
  if (conversationId) {
    await db.query('UPDATE conversations SET automation_last_run_at = NOW() WHERE id = ?', [conversationId]);
  }
}

async function processScheduledMessages(sendText, sendMediaById) {
  const rows = await db.query("SELECT * FROM scheduled_messages WHERE status = 'pending' AND scheduled_at <= NOW() ORDER BY scheduled_at ASC, id ASC");
  for (const row of rows) {
    try {
      if (row.type === 'text' && row.text) {
        await sendText(row.chat_id, row.text);
      }
      if ((['image', 'audio', 'video', 'file'].includes(row.type)) && row.media_id) {
        await sendMediaById(row.chat_id, row.media_id, row.type, (row.type === 'image' || row.type === 'video' || row.type === 'file') ? row.text : null);
      }
      await db.query('UPDATE scheduled_messages SET status = ?, updated_at = NOW() WHERE id = ?', ['sent', row.id]);
      await logService.create('info', 'scheduled_sent', `scheduled ${row.type} sent to ${row.chat_id}`, row.workspace_id);
    } catch (error) {
      await db.query('UPDATE scheduled_messages SET status = ?, updated_at = NOW() WHERE id = ?', ['failed', row.id]);
      await logService.create('error', 'scheduled_send_failed', `failed ${row.type} to ${row.chat_id}: ${error.message}`, row.workspace_id);
    }
  }
  return rows.length;
}

async function runAutomation(sendText, sendMediaById, chat, conversationId, context = {}) {
  const workspaceId = context.workspaceId || 1;
  const automation = await getAutomation(workspaceId);
  console.log('[TRACE] runAutomation called', { chat, conversationId, workspaceId });
  console.log('[TRACE] automation loaded', { automationId: automation && automation.id, enabled: automation && automation.enabled });
  if (!automation || !automation.enabled) {
    console.log('[TRACE] runAutomation stopping', { chat, workspaceId, automationLoaded: !!automation, enabled: automation?.enabled });
    return false;
  }
  const decision = getRunDecision(automation, context);
  console.log('[TRACE] getRunDecision result', decision);
  if (!decision.allowed) {
    console.log('[TRACE] runAutomation skipped', { chat, workspaceId, decision });
    await logService.create('info', 'automation_skipped', `${decision.reason} for ${chat}`, workspaceId);
    return false;
  }

  await logService.create('info', 'automation_started', `${decision.reason} for ${chat}`, workspaceId);

  for (let index = 0; index < automation.steps.length; index += 1) {
    const step = automation.steps[index];
    if (!step || !step.type) continue;

    console.log('[TRACE] executing automation step', { index, step });
    const delaySeconds = getStepDelaySeconds(step);
    if (step.type === 'delay' && delaySeconds > 0) {
      const pendingSteps = automation.steps.slice(index + 1);
      await scheduleAutomationSteps(chat, conversationId, pendingSteps, workspaceId, delaySeconds);
      await logService.create('info', 'automation_delay', `scheduled follow-up for ${chat} after ${delaySeconds}s`, workspaceId);
      break;
    }

    try {
      let sent = false;
      if (step.type === 'text' && step.text) {
        console.log('[TRACE] automation step text -> sendText', { chat, step, workspaceId });
        await sendText(chat, step.text);
        sent = true;
      }
      if (step.type === 'image' && step.media_id) {
        console.log('[TRACE] automation step image -> sendMediaById', { chat, step, workspaceId });
        await sendMediaById(chat, step.media_id, 'image', (step.caption || '').trim() || null);
        sent = true;
      }
      if (step.type === 'video' && step.media_id) {
        console.log('[TRACE] automation step video -> sendMediaById', { chat, step, workspaceId });
        await sendMediaById(chat, step.media_id, 'video', (step.caption || '').trim() || null);
        sent = true;
      }
      if (step.type === 'audio' && step.media_id) {
        console.log('[TRACE] automation step audio -> sendMediaById', { chat, step, workspaceId });
        await sendMediaById(chat, step.media_id, 'audio');
        sent = true;
      }
      if (step.type === 'file' && step.media_id) {
        console.log('[TRACE] automation step file -> sendMediaById', { chat, step, workspaceId });
        await sendMediaById(chat, step.media_id, 'file', (step.caption || '').trim() || null);
        sent = true;
      }
      if (sent) {
        await logService.create('info', 'automation_step', `sent ${step.type} to ${chat}`, workspaceId);
      }
    } catch (err) {
      const stepLabel = step.media_id ? `${step.type} media ${step.media_id}` : step.type;
      console.error('[ERROR] automation step failed', { stepLabel, error: err.message, workspaceId, chat });
      await logService.create('error', 'automation_error', `${stepLabel}: ${err.message || String(err)}`, workspaceId);
    }
  }

  await markRun(automation.id, conversationId);
  await db.query('UPDATE conversations SET status = ? WHERE id = ?', ['Seen', conversationId]);
  return true;
}

module.exports = {
  getAutomation,
  saveAutomation,
  runAutomation,
  processScheduledMessages
};
