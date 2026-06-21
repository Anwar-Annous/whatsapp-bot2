const { logger } = require('../utils/logger');

function extractWorkspace(req, res, next) {
  const workspaceId = req.headers['x-workspace-id'] || req.body?.workspace_id || 1;
  req.workspaceId = Number(workspaceId) || 1;
  next();
}

function requireWorkspace(req, res, next) {
  if (!req.workspaceId) {
    return res.status(400).json({ success: false, message: 'Workspace ID required' });
  }
  next();
}

module.exports = { extractWorkspace, requireWorkspace };
