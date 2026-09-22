import { execFile } from 'child_process';

const TESSERACT_PATH = '/opt/homebrew/bin/tesseract';

export async function runTesseractOCR(imagePath, options = {}) {
  return new Promise((resolve, reject) => {
    const startTime = performance.now();
    const psm = options.psm || '3'; // Fully automatic page segmentation, but no OSD
    const lang = options.lang || 'eng';

    execFile(
      TESSERACT_PATH,
      [imagePath, 'stdout', '-l', lang, '--psm', psm],
      { maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const latencyMs = Math.round((performance.now() - startTime) * 10) / 10;
        if (error) {
          return reject(new Error(`Tesseract error: ${stderr || error.message}`));
        }

        const rawText = stdout.trim();
        const lines = rawText
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((text) => ({ text, confidence: 1.0 }));

        resolve({
          text: rawText,
          lines,
          latencyMs,
          engine: 'tesseract',
          engineName: 'Tesseract OCR (v5.5.1)'
        });
      }
    );
  });
}
