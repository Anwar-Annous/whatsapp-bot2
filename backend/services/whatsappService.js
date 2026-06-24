const qrcodeTerminal = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const db = require('../database/db');
const logService = require('./logService');
const automationService = require('./automationService');
const config = require('../config');

let client;
let status = { state: 'disconnected', qr: null, connected: false };
const sockets = new Set();
const sessionDir = config.whatsapp.sessionDir;
const authClientId = 'whatsapp-crm';
let outgoingSendQueue = Promise.resolve();
const SEND_TIMEOUT_MS = 30000;
const AUDIO_SEND_TIMEOUT_MS = 45000;
const SCHEDULED_WORKER_INTERVAL_MS = 1000;

function emit(event, data) {
  sockets.forEach((socket) => socket.emit(event, data));
}

function emitUpdate() {
  emit('session_update', getSessionStatus());
}

function getSessionStatus() {
  return { ...status };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function enqueueOutgoingSend(task) {
  const run = outgoingSendQueue.then(task, task);
  outgoingSendQueue = run.catch(() => {});
  return run;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function sendClientMessage(chatId, content, options, label, timeoutMs = SEND_TIMEOUT_MS) {
  return withTimeout(client.sendMessage(chatId, content, options), timeoutMs, label);
}

function shouldSendAudioAsVoice(filePath, messageMedia) {
  const extension = path.extname(filePath).toLowerCase();
  const mimetype = (messageMedia.mimetype || '').toLowerCase();
  return ['.ogg', '.opus', '.oga', '.webm'].includes(extension) || mimetype.includes('ogg') || mimetype.includes('opus') || mimetype.includes('webm');
}

function getMediaSendOptions(mediaType, filePath, messageMedia, caption = '') {
  const options = { waitUntilMsgSent: true };
  const cleanCaption = typeof caption === 'string' ? caption.trim() : '';

  if (mediaType === 'audio' && shouldSendAudioAsVoice(filePath, messageMedia)) {
    options.sendAudioAsVoice = true;
  }

  if ((mediaType === 'image' || mediaType === 'video') && cleanCaption) {
    options.caption = cleanCaption;
  }

  return options;
}

async function createClient() {
  const baseOpts = Object.assign({}, config.whatsapp.puppeteer || {});
  let puppeteerOpts = baseOpts;
  if (puppeteerOpts.executablePath && typeof puppeteerOpts.executablePath.then === 'function') {
    try {
      const resolved = await puppeteerOpts.executablePath;
      puppeteerOpts = Object.assign({}, puppeteerOpts, { executablePath: resolved });
    } catch (e) {
      // leave executablePath unresolved — Client will fallback to bundled/installed Chrome
    }
  }

  return new Client({
    authStrategy: new LocalAuth({
      clientId: authClientId,
      dataPath: sessionDir
    }),
    puppeteer: puppeteerOpts
  });
}

function attachClientEvents(instance) {
  client = instance;

  client.on('qr', async (qr) => {
    qrcodeTerminal.generate(qr, { small: true });
    status = { state: 'qr', qr, connected: false };
    const qrData = await qrcode.toDataURL(qr);
    status.qr = qrData;
    emit('qr', status);
    logService.create('info', 'qr_generated', 'QR code generated').catch(() => {});
  });

  client.on('ready', () => {
    status = { state: 'connected', qr: null, connected: true };
    emitUpdate();
    logService.create('info', 'ready', 'WhatsApp ready').catch(() => {});
  });

  client.on('authenticated', () => {
    status = { state: 'connected', qr: null, connected: true };
    emitUpdate();
    logService.create('info', 'authenticated', 'WhatsApp authenticated').catch(() => {});
  });

  client.on('auth_failure', async (err) => {
    status = { state: 'disconnected', qr: null, connected: false };
    emit('auth_failure', { error: err.message });
    logService.create('error', 'auth_failure', err.message).catch(() => {});

    try {
      await client.logout();
    } catch (logoutError) {
      // ignore logout errors and try a fresh restart
    }

    setTimeout(() => restartClient(), 3000);
  });

  client.on('disconnected', async (reason) => {
    status = { state: 'disconnected', qr: null, connected: false };
    emit('disconnected', { reason });
    logService.create('warning', 'disconnected', reason).catch(() => {});
    setTimeout(() => restartClient(), 3000);
  });

  client.on('message', async (message) => {
    if (message.fromMe) return;
    try {
      await handleIncomingMessage(message);
    } catch (error) {
      await logService.create('error', 'message_handler', error.message);
    }
  });
}

let scheduledWorker = null;
let scheduledWorkerRunning = false;

function startScheduledMessageWorker() {
  if (scheduledWorker) return;
  scheduledWorker = setInterval(async () => {
    if (scheduledWorkerRunning) return;
    scheduledWorkerRunning = true;
    try {
      const sentCount = await automationService.processScheduledMessages(sendText, sendMediaById);
      if (sentCount) {
        emitUpdate();
      }
    } catch (err) {
      await logService.create('error', 'scheduled_worker', err.message).catch(() => {});
    } finally {
      scheduledWorkerRunning = false;
    }
  }, SCHEDULED_WORKER_INTERVAL_MS);
}

async function restartClient() {
  if (client) {
    try {
      await client.destroy();
    } catch (destroyError) {
      // ignore destroy errors
    }
  }

  const instance = await createClient();
  attachClientEvents(instance);
  instance.initialize().catch(async (err) => {
    await logService.create('error', 'whatsapp_init_error', err.message).catch(() => {});
    console.error('WhatsApp client initialize failed:', err.message);
    try {
      await instance.destroy();
    } catch (destroyErr) {
      // ignore cleanup errors
    }
    setTimeout(() => restartClient(), 3000);
  });
}

async function initialize(io) {
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  await restartClient();
  startScheduledMessageWorker();
}

function registerSocket(socket) {
  sockets.add(socket);
  socket.emit('session_update', getSessionStatus());
  socket.on('disconnect', () => sockets.delete(socket));
}

async function saveIncomingConversation(chatId, contactId, phone, contactName, lastMessage, workspaceId = 1) {
  const existing = await db.query('SELECT * FROM conversations WHERE chat_id = ? AND workspace_id = ?', [chatId, workspaceId]);
  if (existing.length) {
    const conv = existing[0];
    await db.query('UPDATE conversations SET unread_count = unread_count + 1, status = ?, last_message = ?, last_at = NOW() WHERE id = ? AND workspace_id = ?', ['New', lastMessage, conv.id, workspaceId]);
    return { conversation: conv, isNew: false };
  }
  try {
    const result = await db.query('INSERT INTO conversations (chat_id, contact_id, workspace_id, status, unread_count, last_message, last_at) VALUES (?, ?, ?, ?, ?, ?, NOW())', [
      chatId,
      contactId,
      workspaceId,
      'New',
      1,
      lastMessage
    ]);
    const rows = await db.query('SELECT * FROM conversations WHERE id = ? AND workspace_id = ?', [result.insertId, workspaceId]);
    return { conversation: rows[0], isNew: true };
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      const rows = await db.query('SELECT * FROM conversations WHERE chat_id = ? AND workspace_id = ?', [chatId, workspaceId]);
      if (rows.length) return { conversation: rows[0], isNew: false };
    }
    throw err;
  }
}

async function saveIncomingMessage(conversationId, body, type, mediaPath, workspaceId = 1) {
  await db.query('INSERT INTO messages (conversation_id, sender, body, type, media_path, direction, workspace_id, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())', [
    conversationId,
    'client',
    body,
    type,
    mediaPath,
    'in',
    workspaceId
  ]);
}

async function findOrCreateIncomingContact(phone, name, workspaceId = 1) {
  try {
    const existingContacts = await db.query('SELECT * FROM contacts WHERE phone = ? AND workspace_id = ? LIMIT 1', [phone, workspaceId]);
    if (existingContacts.length) {
      const contactId = existingContacts[0].id;
      await db.query('UPDATE contacts SET name = ?, last_interaction = NOW() WHERE id = ? AND workspace_id = ?', [name, contactId, workspaceId]);
      return contactId;
    }
    try {
      const c = await db.query('INSERT INTO contacts (name, phone, workspace_id, last_interaction) VALUES (?, ?, ?, NOW())', [name, phone, workspaceId]);
      return c.insertId;
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        const rows = await db.query('SELECT * FROM contacts WHERE phone = ? AND workspace_id = ? LIMIT 1', [phone, workspaceId]);
        if (rows.length) return rows[0].id;
      }
      throw err;
    }
  } catch (err) {
    await logService.create('error', 'contact_find_or_create_failed', `${phone}: ${err.message}`, workspaceId).catch(() => {});
    return null;
  }
}

function getMediaExtension(mime) {
  if (mime.includes('image')) return 'jpg';
  if (mime.includes('video')) return 'mp4';
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('ogg') || mime.includes('opus')) return 'ogg';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('audio')) return 'ogg';
  return 'bin';
}

function normalizeMessageType(type) {
  if (type === 'chat') return 'text';
  if (type === 'image') return 'image';
  if (type === 'video') return 'video';
  if (type === 'audio' || type === 'ptt') return 'audio';
  return 'file';
}

async function handleIncomingMessage(message) {
  const workspaceId = 1;
  const contact = await message.getContact();
  const phone = contact.number || message.from.replace('@c.us', '');
  const name = contact.pushname || contact.name || phone;
  const chatId = message.from;
  const type = message.hasMedia ? normalizeMessageType(message.type) : 'text';
  let mediaPath = null;
  let body = message.body || '';

  if (message.hasMedia) {
    const media = await message.downloadMedia();
    const ext = getMediaExtension(media.mimetype);
    const filename = `${Date.now()}-${phone}.${ext}`;
    let folder = 'uploads/audio';
    if (media.mimetype.startsWith('image/')) folder = 'uploads/images';
    else if (media.mimetype.startsWith('video/')) folder = 'uploads/video';
    const fullPath = path.join(__dirname, '..', '..', folder, filename);
    if (!fs.existsSync(path.join(__dirname, '..', '..', folder))) {
      fs.mkdirSync(path.join(__dirname, '..', '..', folder), { recursive: true });
    }
    const buffer = Buffer.from(media.data, 'base64');
    fs.writeFileSync(fullPath, buffer);
    mediaPath = path.relative(path.join(__dirname, '..', '..'), fullPath).replace(/\\/g, '/');
    body = `ملف ${type}`;
  }

  const contactId = await findOrCreateIncomingContact(phone, name, workspaceId);
  const { conversation, isNew } = await saveIncomingConversation(chatId, contactId, phone, name, body, workspaceId);
  await saveIncomingMessage(conversation.id, body, type, mediaPath, workspaceId);
  emit('new_message', { chatId, body, type, conversationId: conversation.id });
  await logService.create('info', 'incoming_message', `message from ${phone}`);

  const autoSent = await automationService.runAutomation(sendText, sendMediaById, chatId, conversation.id, {
    isNew,
    conversation,
    workspaceId
  });
  if (autoSent) {
    emit('automation_triggered', { chatId, conversationId: conversation.id });
  }

  emitUpdate();
}

async function sendText(chatId, text) {
  if (!client) throw new Error('WhatsApp client not initialized');
  await enqueueOutgoingSend(async () => {
    await sendClientMessage(chatId, text, undefined, `text send to ${chatId}`);
    await wait(650);
  });
}

async function sendMediaById(chatId, mediaId, type, caption = '') {
  if (!client) throw new Error('WhatsApp client not initialized');
  const rows = await db.query('SELECT * FROM media WHERE id = ?', [mediaId]);
  if (!rows.length) throw new Error('Media not found');
  const media = rows[0];
  const filePath = path.join(__dirname, '..', '..', media.path);
  if (!fs.existsSync(filePath)) throw new Error(`Media file not found: ${media.path}`);

  const messageMedia = MessageMedia.fromFilePath(filePath);
  const mediaType = type || media.type;
  const options = getMediaSendOptions(mediaType, filePath, messageMedia, caption);
  const timeoutMs = (mediaType === 'audio' || mediaType === 'video') ? AUDIO_SEND_TIMEOUT_MS : SEND_TIMEOUT_MS;

  await enqueueOutgoingSend(async () => {
    await sendClientMessage(chatId, messageMedia, options, `${mediaType} media send to ${chatId}`, timeoutMs);
    await wait((mediaType === 'audio' || mediaType === 'video') ? 1400 : 900);
  });
}

module.exports = {
  initialize,
  registerSocket,
  getSessionStatus,
  emitUpdate,
  sendText,
  sendMediaById
};
