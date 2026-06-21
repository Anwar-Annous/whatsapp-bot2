const { ClientWrapper } = require('./client');
const workspaceModel = require('../../models/workspace');
const { logger } = require('../../utils/logger');

class WhatsAppEngine {
  constructor(io) {
    this.io = io;
    this.clients = new Map(); // workspaceId -> ClientWrapper
    this.logger = logger.child({ component: 'WhatsAppEngine' });
  }

  async loadAllWorkspaces() {
    const workspaces = await workspaceModel.findAll();
    for (const ws of workspaces) {
      await this.createClient(ws.id);
    }
    this.logger.info(`Loaded ${workspaces.length} workspace(s)`);
  }

  async createClient(workspaceId) {
    if (this.clients.has(workspaceId)) {
      this.logger.warn(`Workspace ${workspaceId} already has a client`);
      return this.clients.get(workspaceId);
    }
    // Migrate legacy session (old flat session/ to per-workspace session/)
    await this.migrateLegacySessionIfNeeded(workspaceId);
    const wrapper = new ClientWrapper(workspaceId, this.io);
    this.clients.set(workspaceId, wrapper);
    await wrapper.initialize();
    await workspaceModel.updateStatus(workspaceId, 'connecting');
    return wrapper;
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
    const wrapper = this.clients.get(workspaceId);
    if (wrapper) {
      await wrapper.destroy();
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
