const { ClientWrapper } = require('./client');
const workspaceModel = require('../../models/workspace');
const { logger } = require('../../utils/logger');

class WhatsAppEngine {
  constructor(io) {
    this.io = io;
    this.clients = new Map(); // workspaceId -> ClientWrapper
    this.createPromises = new Map();
    this.logger = logger.child({ component: 'WhatsAppEngine' });
  }

  async loadAllWorkspaces() {
    const workspaces = await workspaceModel.findAll();
    for (const ws of workspaces) {
      try {
        await this.createClient(ws.id);
      } catch (err) {
        this.logger.error('Failed to initialize workspace on startup', { workspaceId: ws.id, error: err.message });
      }
    }
    this.logger.info(`Loaded ${workspaces.length} workspace(s)`);
  }

  async createClient(workspaceId) {
    if (this.clients.has(workspaceId)) {
      this.logger.debug(`Workspace ${workspaceId} client already exists`);
      return this.clients.get(workspaceId);
    }

    if (this.createPromises.has(workspaceId)) {
      this.logger.debug(`Workspace ${workspaceId} create already in progress`);
      return this.createPromises.get(workspaceId);
    }

    const promise = (async () => {
      await this.migrateLegacySessionIfNeeded(workspaceId);

      if (this.clients.has(workspaceId)) {
        return this.clients.get(workspaceId);
      }

      const wrapper = new ClientWrapper(workspaceId, this.io);
      this.clients.set(workspaceId, wrapper);
      try {
        await wrapper.initialize();
        await workspaceModel.updateStatus(workspaceId, 'connecting');
        return wrapper;
      } catch (err) {
        this.logger.error('Workspace client initialization failed', { workspaceId, error: err.message });
        try {
          await wrapper.destroy();
        } catch (destroyErr) {
          this.logger.warn('Failed to destroy failed workspace client', { workspaceId, error: destroyErr.message });
        }
        this.clients.delete(workspaceId);
        throw err;
      }
    })();

    this.createPromises.set(workspaceId, promise);
    try {
      return await promise;
    } finally {
      this.createPromises.delete(workspaceId);
    }
  }

  async migrateLegacySessionIfNeeded(workspaceId) {
    const fs = require('fs');
    const path = require('path');
    const config = require('../../config');
    const oldSessionDir = config.whatsapp.sessionDir;
    const newSessionDir = path.join(oldSessionDir, `workspace-${workspaceId}`);
    if (fs.existsSync(newSessionDir)) return; // Already migrated
    const oldAuthDir = path.join(oldSessionDir, 'Default');
    const oldSessionFile = path.join(oldSessionDir, 'session-whatsapp-crm.json');
    if (!fs.existsSync(oldAuthDir) && !fs.existsSync(oldSessionFile)) return; // No legacy session
    this.logger.info(`Migrating legacy session to workspace-${workspaceId}`);
    fs.mkdirSync(newSessionDir, { recursive: true });
    // Copy all files from old session dir to new
    const copyRecursive = (src, dest) => {
      if (!fs.existsSync(src)) return;
      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(child => copyRecursive(path.join(src, child), path.join(dest, child)));
      } else {
        fs.copyFileSync(src, dest);
      }
    };
    copyRecursive(oldSessionDir, newSessionDir);
    this.logger.info(`Legacy session migrated to ${newSessionDir}`);
  }

  async destroyClient(workspaceId) {
    if (this.createPromises.has(workspaceId)) {
      await this.createPromises.get(workspaceId).catch(() => {});
    }

    const wrapper = this.clients.get(workspaceId);
    if (wrapper) {
      try {
        await wrapper.destroy();
      } catch (err) {
        this.logger.warn('Workspace client destroy failed', { workspaceId, error: err.message });
      }
      this.clients.delete(workspaceId);
    }
    await workspaceModel.updateStatus(workspaceId, 'disconnected');
  }

  getStatus(workspaceId) {
    const wrapper = this.clients.get(workspaceId);
    return wrapper ? wrapper.getStatus() : { state: 'disconnected', workspaceId };
  }

  getAllStatuses() {
    const result = {};
    for (const [id, wrapper] of this.clients) {
      result[id] = wrapper.getStatus();
    }
    return result;
  }

  getClient(workspaceId) {
    return this.clients.get(workspaceId) || null;
  }

  async sendText(workspaceId, chatId, text) {
    const wrapper = this.clients.get(workspaceId);
    if (!wrapper) throw new Error(`Workspace ${workspaceId} not connected`);
    await wrapper.sendText(chatId, text);
  }

  async sendMediaById(workspaceId, chatId, mediaId, type, caption) {
    const wrapper = this.clients.get(workspaceId);
    if (!wrapper) throw new Error(`Workspace ${workspaceId} not connected`);
    await wrapper.sendMediaById(chatId, mediaId, type, caption);
  }

  async destroyAll() {
    const ids = Array.from(this.clients.keys());
    for (const id of ids) {
      await this.destroyClient(id);
    }
  }
}

module.exports = { WhatsAppEngine };
