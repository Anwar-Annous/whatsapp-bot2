const express = require('express');
const multer = require('multer');
const mediaController = require('../controllers/mediaController');
const mediaStorage = require('../utils/mediaStorage');

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const fullPath = mediaStorage.getUploadDir(file.mimetype);
      mediaStorage.ensureDir(fullPath);
      cb(null, fullPath);
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${mediaStorage.sanitizeFilename(file.originalname)}`);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = file.mimetype.startsWith('image/') ||
      file.mimetype.startsWith('audio/') ||
      file.mimetype.startsWith('video/') ||
      file.mimetype === 'application/pdf' ||
      file.mimetype === 'text/plain' ||
      file.mimetype.includes('spreadsheet') ||
      file.mimetype.includes('word') ||
      file.mimetype.includes('presentation') ||
      file.mimetype === 'application/zip';
    cb(null, allowed);
  }
});

const router = express.Router();
router.post('/upload', upload.single('media'), mediaController.uploadMedia);
router.delete('/:id', mediaController.deleteMedia);

module.exports = router;
