import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { processPDF, getDocumentMeta, getPageImagePath } from './services/pdfService.js';
import { ENGINES, executeOCR } from './engines/registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3050;

// Middlewares
app.use(cors());
app.use(express.json());

// Setup multer for PDF uploads
const UPLOAD_TMP_DIR = path.resolve(__dirname, '../data/tmp');
if (!fs.existsSync(UPLOAD_TMP_DIR)) {
  fs.mkdirSync(UPLOAD_TMP_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_TMP_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are supported'));
    }
  }
});

const uploadImage = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.originalname.toLowerCase().match(/\.(png|jpe?g|webp|tiff)$/)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are supported for OCR'));
    }
  }
});

// Routes

// 1. Get available OCR engines
app.get('/api/engines', (req, res) => {
  res.json({ engines: ENGINES });
});

// 2. Upload PDF
app.post('/api/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const docMeta = await processPDF(req.file.path, req.file.originalname);
    res.json({ success: true, document: docMeta });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to process uploaded PDF' });
  }
});

// 2b. Load pre-packaged sample PDF for instant testing
app.post('/api/sample', async (req, res) => {
  try {
    const samplePath = path.resolve(__dirname, '../data/sample_document.pdf');
    if (!fs.existsSync(samplePath)) {
      return res.status(404).json({ error: 'Sample PDF not found' });
    }
    const tempCopy = path.resolve(UPLOAD_TMP_DIR, `${Date.now()}-sample_document.pdf`);
    fs.copyFileSync(samplePath, tempCopy);
    const docMeta = await processPDF(tempCopy, 'sample_financial_summary.pdf');
    res.json({ success: true, document: docMeta });
  } catch (error) {
    console.error('Sample loading error:', error);
    res.status(500).json({ error: error.message || 'Failed to load sample document' });
  }
});


// 2c. Serve sample PDF directly for in-browser client rendering
app.get('/api/sample-pdf', (req, res) => {
  const samplePath = path.resolve(__dirname, '../data/sample_document.pdf');
  if (!fs.existsSync(samplePath)) {
    return res.status(404).json({ error: 'Sample PDF not found' });
  }
  res.sendFile(samplePath);
});

// 3. Get document metadata
app.get('/api/documents/:id', (req, res) => {
  const meta = getDocumentMeta(req.params.id);
  if (!meta) {
    return res.status(404).json({ error: 'Document not found' });
  }
  res.json({ document: meta });
});

// 4. Serve rendered page image
app.get('/api/documents/:id/pages/:pageNum', (req, res) => {
  const imagePath = getPageImagePath(req.params.id, req.params.pageNum);
  if (!imagePath || !fs.existsSync(imagePath)) {
    return res.status(404).json({ error: 'Page image not found' });
  }
  res.sendFile(imagePath);
});

// 5. Execute OCR (Legacy document-id-based)
app.post('/api/ocr', async (req, res) => {
  try {
    const { documentId, pageNumber = 1, engineId = 'apple_vision', options = {} } = req.body;

    if (!documentId) {
      return res.status(400).json({ error: 'documentId is required' });
    }

    const imagePath = getPageImagePath(documentId, pageNumber);
    if (!imagePath || !fs.existsSync(imagePath)) {
      return res.status(404).json({ error: `Page image for page ${pageNumber} not found` });
    }

    const ocrResult = await executeOCR(engineId, imagePath, options);

    const words = ocrResult.text.trim() ? ocrResult.text.trim().split(/\s+/).length : 0;
    const chars = ocrResult.text.length;

    res.json({
      success: true,
      documentId,
      pageNumber: Number(pageNumber),
      engine: ocrResult.engine,
      engineName: ocrResult.engineName,
      text: ocrResult.text,
      lines: ocrResult.lines || [],
      latencyMs: ocrResult.latencyMs,
      wordCount: words,
      charCount: chars
    });
  } catch (error) {
    console.error('OCR execution error:', error);
    res.status(500).json({ error: error.message || 'OCR execution failed' });
  }
});

// 5b. Execute OCR on single page image (Browser-rendered canvas)
app.post('/api/ocr-page-image', uploadImage.single('image'), async (req, res) => {
  let tempFilePath = null;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No page image uploaded' });
    }
    tempFilePath = req.file.path;
    const { engineId = 'apple_vision', pageNumber = 1 } = req.body;
    let options = {};
    if (req.body.options) {
      try {
        options = typeof req.body.options === 'string' ? JSON.parse(req.body.options) : req.body.options;
      } catch (e) {
        // ignore
      }
    }

    const ocrResult = await executeOCR(engineId, tempFilePath, options);

    const words = ocrResult.text.trim() ? ocrResult.text.trim().split(/\s+/).length : 0;
    const chars = ocrResult.text.length;

    res.json({
      success: true,
      pageNumber: Number(pageNumber),
      engine: ocrResult.engine,
      engineName: ocrResult.engineName,
      text: ocrResult.text,
      lines: ocrResult.lines || [],
      latencyMs: ocrResult.latencyMs,
      wordCount: words,
      charCount: chars
    });
  } catch (error) {
    console.error('OCR page image execution error:', error);
    res.status(500).json({ error: error.message || 'OCR execution failed' });
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (unlinkErr) {
        console.warn('Failed to clean up temporary OCR image:', unlinkErr.message);
      }
    }
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static frontend build if available
const CLIENT_DIST = path.resolve(__dirname, '../client/dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

