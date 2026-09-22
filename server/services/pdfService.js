import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data/documents');

// Ensure base data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function execAsync(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`${cmd} error: ${stderr || error.message}`));
      }
      resolve(stdout);
    });
  });
}

export async function getPDFInfo(pdfPath) {
  const output = await execAsync('/opt/homebrew/bin/pdfinfo', [pdfPath]);
  const lines = output.split('\n');
  let pages = 1;
  let title = '';

  for (const line of lines) {
    const matchPages = line.match(/^Pages:\s+(\d+)/);
    if (matchPages) {
      pages = parseInt(matchPages[1], 10);
    }
    const matchTitle = line.match(/^Title:\s+(.*)/);
    if (matchTitle) {
      title = matchTitle[1].trim();
    }
  }

  return { pages, title };
}

export async function processPDF(tempFilePath, originalFilename) {
  const docId = uuidv4();
  const docDir = path.join(DATA_DIR, docId);
  fs.mkdirSync(docDir, { recursive: true });

  const targetPdfPath = path.join(docDir, 'source.pdf');
  fs.copyFileSync(tempFilePath, targetPdfPath);
  fs.unlinkSync(tempFilePath); // remove temp upload

  const info = await getPDFInfo(targetPdfPath);

  // Render pages to PNG (150 DPI for fast rendering and high OCR accuracy)
  await execAsync('/opt/homebrew/bin/pdftoppm', [
    '-png',
    '-r',
    '150',
    targetPdfPath,
    path.join(docDir, 'page')
  ]);

  const renderedFiles = fs.readdirSync(docDir).filter((f) => f.startsWith('page-') && f.endsWith('.png'));

  // Normalize filenames if pdftoppm outputs page-1.png or page-01.png
  const pagesList = [];
  for (let i = 1; i <= info.pages; i++) {
    // Try page-1.png, page-01.png, page-001.png
    let found = renderedFiles.find((f) => {
      const match = f.match(/page-(\d+)\.png/);
      return match && parseInt(match[1], 10) === i;
    });

    if (found) {
      pagesList.push({
        pageNumber: i,
        imageFilename: found,
        url: `/api/documents/${docId}/pages/${i}`
      });
    }
  }

  const meta = {
    id: docId,
    filename: originalFilename,
    title: info.title || originalFilename,
    pageCount: info.pages,
    pages: pagesList,
    createdAt: new Date().toISOString()
  };

  fs.writeFileSync(path.join(docDir, 'meta.json'), JSON.stringify(meta, null, 2));
  return meta;
}

export function getDocumentMeta(docId) {
  const metaPath = path.join(DATA_DIR, docId, 'meta.json');
  if (!fs.existsSync(metaPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
}

export function getPageImagePath(docId, pageNumber) {
  const docDir = path.join(DATA_DIR, docId);
  if (!fs.existsSync(docDir)) {
    return null;
  }
  const files = fs.readdirSync(docDir).filter((f) => f.startsWith('page-') && f.endsWith('.png'));
  const found = files.find((f) => {
    const match = f.match(/page-(\d+)\.png/);
    return match && parseInt(match[1], 10) === Number(pageNumber);
  });

  return found ? path.join(docDir, found) : null;
}
