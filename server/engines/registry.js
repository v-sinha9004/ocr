import { runAppleVisionOCR } from './appleVision.js';
import { runTesseractOCR } from './tesseract.js';

export const ENGINES = [
  {
    id: 'apple_vision',
    name: 'Apple Vision OCR',
    badge: 'macOS Native / Neural Engine',
    description: 'Hardware-accelerated text recognition using Apple Silicon Neural Engine.',
    available: true
  },
  {
    id: 'tesseract',
    name: 'Tesseract OCR',
    badge: 'v5.5.1 Local',
    description: 'Standard open-source OCR engine running locally via Homebrew.',
    available: true
  }
];

export async function executeOCR(engineId, imagePath, options = {}) {
  switch (engineId) {
    case 'apple_vision':
      return await runAppleVisionOCR(imagePath);
    case 'tesseract':
      return await runTesseractOCR(imagePath, options);
    default:
      throw new Error(`Unknown or unsupported OCR engine: ${engineId}`);
  }
}
