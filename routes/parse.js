const express = require('express');
const multer = require('multer');
const { extractText, ALLOWED_TYPES } = require('../lib/parseDocument');

const router = express.Router();
const MAX_FILE_BYTES = parseInt(process.env.MAX_UPLOAD_BYTES || String(5 * 1024 * 1024), 10);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter(req, file, cb) {
    const ok = ALLOWED_TYPES[file.mimetype] || /\.(pdf|docx?|txt)$/i.test(file.originalname);
    cb(null, !!ok);
  },
});

router.post('/document', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Use PDF, Word (.docx), or TXT.' });
  }

  try {
    const result = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname);
    res.json({
      filename: req.file.originalname,
      ...result,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;