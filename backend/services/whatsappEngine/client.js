const path = require('path');
const fs = require('fs');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const db = require('../../database/db');
const logService = require('../logService');
const automationService = require('../automationService');
const config = require('../../config');
const { logger } = require('../../utils/logger');
const mediaStorage = require('../../utils/mediaStorage');

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
  if (mediaType === 'file') {
    options.sendMediaAsDocument = true;
    if (cleanCaption) options.caption = cleanCaption;
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
    this.initializationPromise = null;
    this.destroyPromise = null;
    this.shutdownRequested = false;
    this.logoutDetected = false;
    this.eventHandlers = {};
    this.logger = logger.child({ workspaceId, component: 'whatsappClient' });
  }

  getStatus() {
    return { ...this.status, workspaceId: this.workspaceId };
  }

  updateStatus(state, qr = null, connected = false) {
    this.status = { state, qr, connected };
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
    this.logger.info('sendClientMessage.start', { label, chatId, workspaceId: this.workspaceId, options });
    try {
      const res = await withTimeout(this.client.sendMessage(chatId, content, options), timeoutMs, label);
      this.logger.info('sendClientMessage.success', { label, chatId, workspaceId: this.workspaceId });
      return res;
    } catch (err) {
      this.logger.error('sendClientMessage.error', { label, chatId, error: err.message, workspaceId: this.workspaceId });
      throw err;
    }
  }

  async sendText(chatId, text) {
    if (!this.client) throw new Error('Client not initialized');
    this.logger.info('sendText.called', { chatId, workspaceId: this.workspaceId, length: String(text || '').length });
    await this.enqueueOutgoing(async () => {
      try {
        await this.sendClientMessage(chatId, text, undefined, `text to ${chatId}`);
        this.logger.info('sendText.sent', { chatId, workspaceId: this.workspaceId });
      } catch (err) {
        this.logger.error('sendText.error', { chatId, error: err.message, workspaceId: this.workspaceId });
        throw err;
      }
      await new Promise(r => setTimeout(r, 650));
    });
  }

  async sendMediaById(chatId, mediaId, type, caption = '') {
    if (!this.client) throw new Error('Client not initialized');
    this.logger.info('sendMediaById.called', { chatId, mediaId, requestedType: type, workspaceId: this.workspaceId });
    const rows = await db.query('SELECT * FROM media WHERE id = ? AND workspace_id = ?', [mediaId, this.workspaceId]);
    this.logger.info('sendMediaById.dbResult', { mediaId, rowCount: rows.length, rows, workspaceId: this.workspaceId });
    if (!rows.length) throw new Error(`Media not found: ${mediaId}`);
    const media = rows[0];
    const filePath = mediaStorage.resolveStoredPath(media.path);
    const fileExists = fs.existsSync(filePath);
    this.logger.info('sendMediaById.resolvedPath', {
      mediaId,
      requestedType: type,
      mediaRow: media,
      storedPath: media.path,
      filePath,
      fileExists,
      workspaceId: this.workspaceId
    });
    if (!fileExists) {
      this.logger.error('sendMediaById.missingFile', { mediaId, filePath, storedPath: media.path, workspaceId: this.workspaceId });
      throw new Error(`Media file not found: ${media.path}`);
    }
    const messageMedia = MessageMedia.fromFilePath(filePath);
    const mediaType = type || media.type;
    const options = getMediaSendOptions(mediaType, filePath, messageMedia, caption);
    const timeoutMs = (mediaType === 'audio' || mediaType === 'video') ? AUDIO_SEND_TIMEOUT_MS : SEND_TIMEOUT_MS;
    this.logger.info('sendMediaById.prepared', {
      chatId,
      mediaId,
      mediaType,
      mimetype: messageMedia.mimetype,
      filename: messageMedia.filename,
      options,
      timeoutMs,
      workspaceId: this.workspaceId
    });
    await this.enqueueOutgoing(async () => {
      try {
        await this.sendClientMessage(chatId, messageMedia, options, `${mediaType} to ${chatId}`, timeoutMs);
        this.logger.info('sendMediaById.sent', { chatId, mediaId, mediaType, filePath, workspaceId: this.workspaceId });
      } catch (err) {
        this.logger.error('sendMediaById.error', { chatId, mediaId, mediaType, filePath, error: err.message, workspaceId: this.workspaceId });
        throw err;
      }
      await new Promise(r => setTimeout(r, (mediaType === 'audio' || mediaType === 'video') ? 1400 : 900));
    });
  }

  detachEvents() {
    if (!this.client || !this.eventHandlers) return;
    Object.entries(this.eventHandlers).forEach(([event, handler]) => {
      try {
        this.client.off(event, handler);
      } catch (err) {
        this.logger.debug('Failed to remove event handler', { event, error: err.message });
      }
    });
    this.eventHandlers = {};
  }

  async safeDestroyClient() {
    if (!this.client) return;
    if (this.destroyPromise) return this.destroyPromise;

    this.destroyPromise = (async () => {
      try {
        this.detachEvents();
        await this.client.destroy();
        this.logger.info('Client destroyed successfully');
      } catch (err) {
        this.logger.warn('Client destruction failed', { error: err.message });
      } finally {
        this.destroyPromise = null;
      }
    })();

    return this.destroyPromise;
  }

  handleDisconnect(reason) {
    const normalizedReason = String(reason || '').toLowerCase();
    const isLogout = ['logout', 'session_revoked', 'remote_session_close', 'change_session'].some((token) => normalizedReason.includes(token));

    if (isLogout) {
      this.logoutDetected = true;
      this.updateStatus('logout', null, false);
      this.emit('logout', { reason });
      this.emitUpdate();
      this.logger.warn('Permanent logout detected', { reason });
      return;
    }

    this.updateStatus('disconnected', null, false);
    this.emit('disconnected', { reason });
    this.emitUpdate();
    this.logger.warn('Disconnected', { reason });
    this.scheduleReconnect();
  }

  async handleIncomingMessage(message) {
    if (message.fromMe) return;
    try {
      this.logger.info('incoming_message.received', { from: message.from, type: message.type, workspaceId: this.workspaceId });
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
        const folder = mediaStorage.getUploadDir(media.mimetype);
        mediaStorage.ensureDir(folder);
        const fullPath = path.join(folder, filename);
        fs.writeFileSync(fullPath, Buffer.from(media.data, 'base64'));
        mediaPath = mediaStorage.toStoredPath(fullPath);
        body = `ملف ${type}`;
      }

      const existingContacts = await db.query('SELECT * FROM contacts WHERE phone = ? AND workspace_id = ?', [phone, this.workspaceId]);
      this.logger.info('db.query', { sql: 'SELECT * FROM contacts WHERE phone = ? AND workspace_id = ?', params: [phone, this.workspaceId], workspaceId: this.workspaceId });
      this.logger.info('db.result.contacts', { count: existingContacts.length, workspaceId: this.workspaceId });
      let contactId;
      if (existingContacts.length) {
        contactId = existingContacts[0].id;
        this.logger.info('db.query', { sql: 'UPDATE contacts SET name = ?, last_interaction = NOW() WHERE id = ?', params: [name, contactId], workspaceId: this.workspaceId });
        const updateRes = await db.query('UPDATE contacts SET name = ?, last_interaction = NOW() WHERE id = ?', [name, contactId]);
        this.logger.info('db.result.updateContact', { updateRes, contactId, workspaceId: this.workspaceId });
      } else {
        this.logger.info('db.query', { sql: 'INSERT INTO contacts (name, phone, workspace_id, last_interaction) VALUES (?, ?, ?, NOW())', params: [name, phone, this.workspaceId], workspaceId: this.workspaceId });
        const c = await db.query('INSERT INTO contacts (name, phone, workspace_id, last_interaction) VALUES (?, ?, ?, NOW())', [name, phone, this.workspaceId]);
        this.logger.info('db.result.insertContact', { result: c, workspaceId: this.workspaceId });
        contactId = c.insertId;
      }

      this.logger.info('db.query', { sql: 'SELECT * FROM conversations WHERE chat_id = ? AND workspace_id = ?', params: [chatId, this.workspaceId], workspaceId: this.workspaceId });
      const existingConv = await db.query('SELECT * FROM conversations WHERE chat_id = ? AND workspace_id = ?', [chatId, this.workspaceId]);
      this.logger.info('db.result.conversations', { count: existingConv.length, workspaceId: this.workspaceId });
      let conversation;
      let isNew = false;
      if (existingConv.length) {
        conversation = existingConv[0];
        this.logger.info('db.query', { sql: 'UPDATE conversations SET unread_count = unread_count + 1, status = ?, last_message = ?, last_at = NOW() WHERE id = ?', params: ['New', body, conversation.id], workspaceId: this.workspaceId });
        const u = await db.query('UPDATE conversations SET unread_count = unread_count + 1, status = ?, last_message = ?, last_at = NOW() WHERE id = ?', ['New', body, conversation.id]);
        this.logger.info('db.result.updateConversation', { result: u, conversationId: conversation.id, workspaceId: this.workspaceId });
      } else {
        this.logger.info('db.query', { sql: 'INSERT INTO conversations (chat_id, contact_id, workspace_id, status, unread_count, last_message, last_at) VALUES (?, ?, ?, ?, ?, ?, NOW())', params: [chatId, contactId, this.workspaceId, 'New', 1, body], workspaceId: this.workspaceId });
        const result = await db.query('INSERT INTO conversations (chat_id, contact_id, workspace_id, status, unread_count, last_message, last_at) VALUES (?, ?, ?, ?, ?, ?, NOW())', [chatId, contactId, this.workspaceId, 'New', 1, body]);
        this.logger.info('db.result.insertConversation', { result, workspaceId: this.workspaceId });
        this.logger.info('db.query', { sql: 'SELECT * FROM conversations WHERE id = ?', params: [result.insertId], workspaceId: this.workspaceId });
        const rows = await db.query('SELECT * FROM conversations WHERE id = ?', [result.insertId]);
        this.logger.info('db.result.selectConversationById', { rows, workspaceId: this.workspaceId });
        conversation = rows[0];
        isNew = true;
      }

      this.logger.info('db.query', { sql: 'INSERT INTO messages (conversation_id, sender, body, type, media_path, direction, workspace_id, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())', params: [conversation.id, 'client', body, type, mediaPath, 'in', this.workspaceId], workspaceId: this.workspaceId });
      const msgRes = await db.query('INSERT INTO messages (conversation_id, sender, body, type, media_path, direction, workspace_id, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())', [conversation.id, 'client', body, type, mediaPath, 'in', this.workspaceId]);
      this.logger.info('db.result.insertMessage', { result: msgRes, conversationId: conversation.id, workspaceId: this.workspaceId });
      this.emit('new_message', { chatId, body, type, conversationId: conversation.id });
      await logService.create('info', 'incoming_message', `from ${phone}`, this.workspaceId);

      this.logger.info('automation.invoking', { chatId, conversationId: conversation.id, workspaceId: this.workspaceId });
      console.log('[TRACE] handleIncomingMessage automation.invoking', { chatId, conversationId: conversation.id, workspaceId: this.workspaceId, isNew });
      const autoSent = await automationService.runAutomation(
        (cid, text) => this.sendText(cid, text),
        (cid, mid, t, cap) => this.sendMediaById(cid, mid, t, cap),
        chatId, conversation.id, { isNew, conversation, workspaceId: this.workspaceId }
      );
      console.log('[TRACE] handleIncomingMessage automation result', { chatId, conversationId: conversation.id, autoSent, workspaceId: this.workspaceId });
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
    if (!this.client) return;

    this.detachEvents();

    this.logger.info('attachEvents.start', { workspaceId: this.workspaceId });

    this.eventHandlers.qr = async (qr) => {
      this.updateStatus('qr', await qrcode.toDataURL(qr), false);
      this.emit('qr', this.status);
      this.emitUpdate();
      this.logger.info('QR generated');
    };

    this.eventHandlers.ready = () => {
      this.updateStatus('connected', null, true);
      this.emitUpdate();
      this.logger.info('Client ready');
    };

    this.eventHandlers.authenticated = () => {
      this.updateStatus('connected', null, true);
      this.emitUpdate();
      this.logger.info('Client authenticated');
    };

    this.eventHandlers.auth_failure = async (err) => {
      this.updateStatus('disconnected', null, false);
      this.emit('auth_failure', { error: err?.message });
      this.emitUpdate();
      this.logger.error('Auth failure', { error: err?.message });
      try {
        await this.client.logout();
      } catch (e) {
        this.logger.debug('Logout after auth failure failed', { error: e.message });
      }
      this.scheduleReconnect();
    };

    this.eventHandlers.disconnected = async (reason) => {
      this.handleDisconnect(reason);
    };

    this.eventHandlers.message = async (message) => {
      this.logger.info('event.message.received', { from: message.from, type: message.type, workspaceId: this.workspaceId });
      await this.handleIncomingMessage(message);
    };

    this.client.on('qr', this.eventHandlers.qr);
    this.client.on('ready', this.eventHandlers.ready);
    this.client.on('authenticated', this.eventHandlers.authenticated);
    this.client.on('auth_failure', this.eventHandlers.auth_failure);
    this.client.on('disconnected', this.eventHandlers.disconnected);
    this.client.on('message', this.eventHandlers.message);
    this.logger.info('attachEvents.complete', { workspaceId: this.workspaceId, events: Object.keys(this.eventHandlers) });
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
    if (this.shutdownRequested) {
      this.logger.info('Initialization skipped because shutdown requested');
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      try {
        if (this.client) {
          await this.safeDestroyClient();
          this.client = null;
        }

        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }

        this.logoutDetected = false;
        this.client = await this.createClient();
        this.attachEvents();
        this.updateStatus('connecting', null, false);
        this.emitUpdate();

        await this.client.initialize();
        this.initializeAttempts = 0;
      } catch (err) {
        this.initializeAttempts += 1;
        this.logger.error('Initialize failed', { error: err.message, attempt: this.initializeAttempts });
        try {
          await this.safeDestroyClient();
        } catch (destroyErr) {
          this.logger.warn('Error destroying failed client after init failure', { error: destroyErr.message });
        }
        this.client = null;
        if (!this.shutdownRequested && !this.logoutDetected) {
          this.scheduleReconnect();
        }
      }
    })();

    try {
      return await this.initializationPromise;
    } finally {
      this.initializationPromise = null;
    }
  }

  async destroy() {
    this.shutdownRequested = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.initializationPromise) {
      await this.initializationPromise.catch(() => {});
    }

    await this.safeDestroyClient();
    this.client = null;
    this.logoutDetected = false;
    this.updateStatus('disconnected', null, false);
    this.emitUpdate();
    this.shutdownRequested = false;
  }
}

module.exports = { ClientWrapper };
