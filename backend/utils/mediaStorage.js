const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR || path.join(PROJECT_ROOT, 'uploads'));

function normalizeSlashes(value) {
  return value.replace(/\\/g, '/');
}

function getMediaType(mimetype = '') {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  return 'file';
}

function getMediaFolder(mimetypeOrType = '') {
  const type = mimetypeOrType.includes('/') ? getMediaType(mimetypeOrType) : mimetypeOrType;
  if (type === 'image') return 'images';
  if (type === 'video') return 'videos';
  if (type === 'audio') return 'audio';
  return 'files';
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getUploadDir(mimetypeOrType = '') {
  return path.join(UPLOAD_ROOT, getMediaFolder(mimetypeOrType));
}

function toStoredPath(absolutePath) {
  return normalizeSlashes(path.relative(PROJECT_ROOT, absolutePath));
}

function resolveStoredPath(storedPath = '') {
  if (path.isAbsolute(storedPath)) return storedPath;
  return path.resolve(PROJECT_ROOT, storedPath);
}

function sanitizeFilename(filename) {
  return String(filename || 'media')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-');
}

module.exports = {
  PROJECT_ROOT,
  UPLOAD_ROOT,
  getMediaType,
  getMediaFolder,
  getUploadDir,
  ensureDir,
  toStoredPath,
  resolveStoredPath,
  sanitizeFilename
};
