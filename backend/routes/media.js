const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mediaController = require('../controllers/mediaController');

function getUploadFolder(mimetype) {
  if (mimetype.startsWith('image/')) return 'uploads/images';
  if (mimetype.startsWith('audio/')) return 'uploads/audio';
  if (mimetype.startsWith('video/')) return 'uploads/video';
  return 'uploads/images';
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const folder = getUploadFolder(file.mimetype);
      const fullPath = path.join(__dirname, '..', '..', folder);
      ensureDir(fullPath);
      cb(null, fullPath);
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/');
    cb(null, allowed);
  }
});

const router = express.Router();
router.post('/upload', upload.single('media'), mediaController.uploadMedia);
router.delete('/:id', mediaController.deleteMedia);

module.exports = router;
