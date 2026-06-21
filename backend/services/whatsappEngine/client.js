const path = require('path');
const fs = require('fs');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const db = require('../../database/db');
const logService = require('../logService');
const automationService = require('../automationService');
const config = require('../../config');
const { logger } = require('../../utils/logger');

const SEND_TIMEOUT_MS = 30000;
const AUDIO_SEND_TIMEOUT_MS = 45000;
const RECONNECT_DELAY_MS = 5000;

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

function shouldSendAudioAsVoice(filePath, messageMedia) {
  const ext = path.extname(filePath).toLowerCase();
  const mimetype = (messageMedia.mimetype || '').toLowerCase();
  return ['.ogg', '.opus', '.oga', '.webm'].includes(ext) || mimetype.includes('ogg') || mimetype.includes('opus') || mimetype.includes('webm');
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

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

class ClientWrapper {
  constructor(workspaceId, io) {
    this.workspaceId = workspaceId;
    this.io = io;
    this.client = null;
    this.status = { state: 'disconnected', qr: null, connected: false };
    this.outgoingQueue = Promise.resolve();
    this.sessionDir = path.join(config.whatsapp.sessionDir, `workspace-${workspaceId}`);
    this.authClientId = `whatsapp-crm-ws-${workspaceId}`;
    this.reconnectTimer = null;
    this.initializeAttempts = 0;
    this.logger = logger.child({ workspaceId, component: 'whatsappClient' });
  }

  getStatus() {
    return { ...this.status, workspaceId: this.workspaceId };
  }

  async ensureSessionDir() {
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
  }

  cleanupOldProfileLockFiles() {
    const lockFiles = [
      'SingletonLock',
      'SingletonSocket',
      'lock',
      'DevToolsActivePort',
      'Local State'
    ];

    for (const filename of lockFiles) {
      const rootPath = path.join(this.sessionDir, filename);
      const defaultPath = path.join(this.sessionDir, 'Default', filename);
      [rootPath, defaultPath].forEach((filepath) => {
        try {
          if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            this.logger.info('Removed stale Chrome lock file', { filepath });
          }
        } catch (err) {
          this.logger.debug('Failed to remove stale lock file', { filepath, error: err.message });
        }
      });
    }
  }

  async createClient() {
    await this.ensureSessionDir();
    this.cleanupOldProfileLockFiles();
    const baseOpts = Object.assign({}, config.whatsapp.puppeteer || {});
    let puppeteerOpts = baseOpts;
    if (puppeteerOpts.executablePath && typeof puppeteerOpts.executablePath.then === 'function') {
      try {
        const resolved = await puppeteerOpts.executablePath;
        puppeteerOpts = Object.assign({}, puppeteerOpts, { executablePath: resolved });
      } catch (e) {
        this.logger.debug('Failed to resolve puppeteer.executablePath promise', { error: e.message });
      }
    }

    return new Client({
      authStrategy: new LocalAuth({ clientId: this.authClientId, dataPath: this.sessionDir }),
      puppeteer: puppeteerOpts
    });
  }

  emit(event, data) {
    if (this.io) {
      this.io.to(`workspace:${this.workspaceId}`).emit(event, { ...data, workspaceId: this.workspaceId });
    }
  }

  emitUpdate() {
    this.emit('session_update', this.getStatus());
  }

  async enqueueOutgoing(task) {
    const run = this.outgoingQueue.then(task, task);
    this.outgoingQueue = run.catch(() => {});
    return run;
  }

  async sendClientMessage(chatId, content, options, label, timeoutMs = SEND_TIMEOUT_MS) {
    return withTimeout(this.client.sendMessage(chatId, content, options), timeoutMs, label);
  }

  async sendText(chatId, text) {
    if (!this.client) throw new Error('Client not initialized');
    await this.enqueueOutgoing(async () => {
      await this.sendClientMessage(chatId, text, undefined, `text to ${chatId}`);
      await new Promise(r => setTimeout(r, 650));
    });
  }

  async sendMediaById(chatId, mediaId, type, caption = '') {
    if (!this.client) throw new Error('Client not initialized');
    const rows = await db.query('SELECT * FROM media WHERE id = ? AND workspace_id = ?', [mediaId, this.workspaceId]);
    if (!rows.length) throw new Error('Media not found');
    const media = rows[0];
    const filePath = path.join(process.cwd(), media.path);
    if (!fs.existsSync(filePath)) throw new Error(`Media file not found: ${media.path}`);
    const messageMedia = MessageMedia.fromFilePath(filePath);
    const mediaType = type || media.type;
    const options = getMediaSendOptions(mediaType, filePath, messageMedia, caption);
    const timeoutMs = (mediaType === 'audio' || mediaType === 'video') ? AUDIO_SEND_TIMEOUT_MS : SEND_TIMEOUT_MS;
    await this.enqueueOutgoing(async () => {
      await this.sendClientMessage(chatId, messageMedia, options, `${mediaType} to ${chatId}`, timeoutMs);
      await new Promise(r => setTimeout(r, (mediaType === 'audio' || mediaType === 'video') ? 1400 : 900));
    });
  }

  async handleIncomingMessage(message) {
    if (message.fromMe) return;
    try {
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
        const fullPath = path.join(process.cwd(), folder, filename);
        if (!fs.existsSync(path.join(process.cwd(), folder))) {
          fs.mkdirSync(path.join(process.cwd(), folder), { recursive: true });
        }
        fs.writeFileSync(fullPath, Buffer.from(media.data, 'base64'));
        mediaPath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
        body = `ملف ${type}`;
      }

      const existingContacts = await db.query('SELECT * FROM contacts WHERE phone = ? AND workspace_id = ?', [phone, this.workspaceId]);
      let contactId;
      if (existingContacts.length) {
        contactId = existingContacts[0].id;
        await db.query('UPDATE contacts SET name = ?, last_interaction = NOW() WHERE id = ?', [name, contactId]);
      } else {
        const c = await db.query('INSERT INTO contacts (name, phone, workspace_id, last_interaction) VALUES (?, ?, ?, NOW())', [name, phone, this.workspaceId]);
        contactId = c.insertId;
      }

      const existingConv = await db.query('SELECT * FROM conversations WHERE chat_id = ? AND workspace_id = ?', [chatId, this.workspaceId]);
      let conversation;
      let isNew = false;
      if (existingConv.length) {
        conversation = existingConv[0];
        await db.query('UPDATE conversations SET unread_count = unread_count + 1, status = ?, last_message = ?, last_at = NOW() WHERE id = ?', ['New', body, conversation.id]);
      } else {
        const result = await db.query('INSERT INTO conversations (chat_id, contact_id, workspace_id, status, unread_count, last_message, last_at) VALUES (?, ?, ?, ?, ?, ?, NOW())', [chatId, contactId, this.workspaceId, 'New', 1, body]);
        const rows = await db.query('SELECT * FROM conversations WHERE id = ?', [result.insertId]);
        conversation = rows[0];
        isNew = true;
      }

      await db.query('INSERT INTO messages (conversation_id, sender, body, type, media_path, direction, workspace_id, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())', [conversation.id, 'client', body, type, mediaPath, 'in', this.workspaceId]);
      this.emit('new_message', { chatId, body, type, conversationId: conversation.id });
      await logService.create('info', 'incoming_message', `from ${phone}`, this.workspaceId);

      const autoSent = await automationService.runAutomation(
        (cid, text) => this.sendText(cid, text),
        (cid, mid, t, cap) => this.sendMediaById(cid, mid, t, cap),
        chatId, conversation.id, { isNew, conversation, workspaceId: this.workspaceId }
      );
      if (autoSent) {
        this.emit('automation_triggered', { chatId, conversationId: conversation.id });
      }
      this.emitUpdate();
    } catch (error) {
      this.logger.error('handleIncomingMessage failed', { error: error.message });
      await logService.create('error', 'message_handler', error.message, this.workspaceId);
    }
  }

  attachEvents() {
    this.client.on('qr', async (qr) => {
      this.status = { state: 'qr', qr, connected: false };
      const qrData = await qrcode.toDataURL(qr);
      this.status.qr = qrData;
      this.emit('qr', this.status);
      this.logger.info('QR generated');
    });

    this.client.on('ready', () => {
      this.status = { state: 'connected', qr: null, connected: true };
      this.emitUpdate();
      this.logger.info('Client ready');
    });

    this.client.on('authenticated', () => {
      this.status = { state: 'connected', qr: null, connected: true };
      this.emitUpdate();
      this.logger.info('Client authenticated');
    });

    this.client.on('auth_failure', async (err) => {
      this.status = { state: 'disconnected', qr: null, connected: false };
      this.emit('auth_failure', { error: err.message });
      this.logger.error('Auth failure', { error: err.message });
      try { await this.client.logout(); } catch (e) {}
      this.scheduleReconnect();
    });

    this.client.on('disconnected', async (reason) => {
      this.status = { state: 'disconnected', qr: null, connected: false };
      this.emit('disconnected', { reason });
      this.logger.warn('Disconnected', { reason });
      this.scheduleReconnect();
    });

    this.client.on('message', async (message) => {
      await this.handleIncomingMessage(message);
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    if (this.initializeAttempts >= 3) {
      this.logger.error('Reconnect aborted because initialize failed too many times', { attempts: this.initializeAttempts });
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.initialize().catch(err => this.logger.error('Reconnect failed', { error: err.message }));
    }, RECONNECT_DELAY_MS);
  }

  async initialize() {
    if (this.client) {
      try { await this.client.destroy(); } catch (e) {}
      this.client = null;
    }
    this.client = await this.createClient();
    this.attachEvents();
    this.status = { state: 'connecting', qr: null, connected: false };
    this.emitUpdate();
    try {
      await this.client.initialize();
      this.initializeAttempts = 0;
    } catch (err) {
      this.initializeAttempts += 1;
      this.logger.error('Initialize failed', { error: err.message, attempt: this.initializeAttempts });
      try { await this.client.destroy(); } catch (destroyErr) {}
      this.client = null;
      this.scheduleReconnect();
    }
  }

  async destroy() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.client) {
      try { await this.client.destroy(); } catch (e) {}
      this.client = null;
    }
    this.status = { state: 'disconnected', qr: null, connected: false };
    this.emitUpdate();
  }
}

module.exports = { ClientWrapper };
