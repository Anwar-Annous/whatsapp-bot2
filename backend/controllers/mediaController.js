const fs = require('fs');
const db = require('../database/db');
const logService = require('../services/logService');
const mediaStorage = require('../utils/mediaStorage');

async function uploadMedia(req, res) {
  const workspaceId = req.workspaceId || 1;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File is required' });
    }

    const type = mediaStorage.getMediaType(req.file.mimetype);
    const mediaPath = mediaStorage.toStoredPath(req.file.path);

    console.log('[DEBUG] uploadMedia.start', {
      workspaceId,
      type,
      mimetype: req.file.mimetype,
      originalName: req.file.originalname,
      filename: req.file.filename,
      absolutePath: req.file.path,
      storedPath: mediaPath,
      uploadRoot: mediaStorage.UPLOAD_ROOT
    });

    const result = await db.query(
      'INSERT INTO media (type, filename, original_name, path, workspace_id) VALUES (?, ?, ?, ?, ?)',
      [type, req.file.filename, req.file.originalname, mediaPath, workspaceId]
    );

    console.log('[DEBUG] uploadMedia.saved', { id: result.insertId, workspaceId, type, path: mediaPath });
    await logService.create('info', 'media_upload', `uploaded ${type} ${req.file.originalname} as media ${result.insertId}`, workspaceId);

    return res.json({
      success: true,
      message: 'Media uploaded successfully',
      id: result.insertId,
      path: mediaPath,
      type,
      filename: req.file.originalname
    });
  } catch (err) {
    await logService.create('error', 'media_upload_failed', err.message, workspaceId);
    console.error('[ERROR] uploadMedia.failed', { error: err.message, workspaceId });
    return res.status(500).json({ success: false, message: 'Media upload failed', error: err.message });
  }
}

async function deleteMedia(req, res) {
  const id = req.params.id;
  const workspaceId = req.workspaceId || 1;
  const rows = await db.query('SELECT * FROM media WHERE id = ? AND workspace_id = ?', [id, workspaceId]);
  if (!rows.length) return res.status(404).json({ success: false, message: 'Media not found' });

  const media = rows[0];
  const filePath = mediaStorage.resolveStoredPath(media.path);
  await db.query('DELETE FROM media WHERE id = ? AND workspace_id = ?', [id, workspaceId]);
  fs.unlink(filePath, () => {});
  await logService.create('info', 'media_delete', `deleted media ${media.original_name}`, workspaceId);
  res.json({ success: true, message: 'Media deleted successfully' });
}

module.exports = { uploadMedia, deleteMedia };
