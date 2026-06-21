const workspaceModel = require('../models/workspace');
const { logger } = require('../utils/logger');

async function list(req, res) {
  try {
    const workspaces = await workspaceModel.findAll();
    res.json({ success: true, workspaces });
  } catch (err) {
    logger.error('workspace.list failed', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to list workspaces' });
  }
}

async function create(req, res) {
  try {
    const workspace = await workspaceModel.create(req.body);
    // Auto-start the WhatsApp client for this workspace
    const engine = req.app.locals.engine;
    if (engine) {
      await engine.createClient(workspace.id);
    }
    res.json({ success: true, workspace });
  } catch (err) {
    logger.error('workspace.create failed', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to create workspace' });
  }
}

async function get(req, res) {
  try {
    const workspace = await workspaceModel.findById(req.params.id);
    if (!workspace) return res.status(404).json({ success: false, message: 'Workspace not found' });
    const engine = req.app.locals.engine;
    const status = engine ? engine.getStatus(workspace.id) : { state: 'unknown' };
    res.json({ success: true, workspace, status });
  } catch (err) {
    logger.error('workspace.get failed', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to get workspace' });
  }
}

async function update(req, res) {
  try {
    const workspace = await workspaceModel.update(req.params.id, req.body);
    res.json({ success: true, workspace });
  } catch (err) {
    logger.error('workspace.update failed', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to update workspace' });
  }
}

async function remove(req, res) {
  try {
    const engine = req.app.locals.engine;
    if (engine) {
      await engine.destroyClient(req.params.id);
    }
    await workspaceModel.remove(req.params.id);
    res.json({ success: true, message: 'Workspace deleted' });
  } catch (err) {
    logger.error('workspace.remove failed', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to delete workspace' });
  }
}

async function getStatus(req, res) {
  try {
    const engine = req.app.locals.engine;
    const status = engine ? engine.getStatus(req.params.id) : { state: 'unknown' };
    res.json({ success: true, status });
  } catch (err) {
    logger.error('workspace.status failed', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to get status' });
  }
}

async function connect(req, res) {
  try {
    const engine = req.app.locals.engine;
    if (!engine) return res.status(500).json({ success: false, message: 'Engine not available' });
    const wrapper = await engine.createClient(req.params.id);
    res.json({ success: true, status: wrapper.getStatus() });
  } catch (err) {
    logger.error('workspace.connect failed', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to connect' });
  }
}

async function disconnect(req, res) {
  try {
    const engine = req.app.locals.engine;
    if (!engine) return res.status(500).json({ success: false, message: 'Engine not available' });
    await engine.destroyClient(req.params.id);
    res.json({ success: true, message: 'Disconnected' });
  } catch (err) {
    logger.error('workspace.disconnect failed', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to disconnect' });
  }
}

module.exports = {
  list, create, get, update, remove, getStatus, connect, disconnect
};
