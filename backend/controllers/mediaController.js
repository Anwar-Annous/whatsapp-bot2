const fs = require('fs');
const path = require('path');
const db = require('../database/db');
const logService = require('../services/logService');

function getMediaType(mimetype) {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype.startsWith('video/')) return 'video';
  return 'file';
}

async function uploadMedia(req, res) {
  if (!req.file) return res.status(400).json({ success: false, message: 'الملف مطلوب' });
  const type = getMediaType(req.file.mimetype);
  const mediaPath = path.relative(path.join(__dirname, '..', '..'), req.file.path).replace(/\\/g, '/');
  const result = await db.query('INSERT INTO media (type, filename, original_name, path) VALUES (?, ?, ?, ?)', [
    type,
    req.file.filename,
    req.file.originalname,
    mediaPath
  ]);
  await logService.create('info', 'media_upload', `uploaded ${req.file.originalname}`);
  res.json({
    success: true,
    message: 'تم رفع الوسائط بنجاح',
    id: result.insertId,
    path: mediaPath,
    type,
    filename: req.file.originalname
  });
}

async function deleteMedia(req, res) {
  const id = req.params.id;
  const rows = await db.query('SELECT * FROM media WHERE id = ?', [id]);
  if (!rows.length) return res.status(404).json({ success: false, message: 'الوسائط غير موجودة' });
  const media = rows[0];
  const filePath = path.join(__dirname, '..', '..', media.path);
  await db.query('DELETE FROM media WHERE id = ?', [id]);
  fs.unlink(filePath, () => {});
  await logService.create('info', 'media_delete', `deleted media ${media.original_name}`);
  res.json({ success: true, message: 'تم حذف الوسائط' });
}

module.exports = { uploadMedia, deleteMedia };
