import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BINARY_PATH = path.resolve(__dirname, '../../tools/apple_vision_ocr');

export async function runAppleVisionOCR(imagePath) {
  return new Promise((resolve, reject) => {
    const startTime = performance.now();
    execFile(BINARY_PATH, [imagePath], { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      const fallbackLatency = performance.now() - startTime;
      if (error) {
        return reject(new Error(`Apple Vision OCR execution error: ${stderr || error.message}`));
      }

      try {
        const parsed = JSON.parse(stdout);
        if (parsed.error) {
          return reject(new Error(parsed.error));
        }
        resolve({
          text: parsed.text || '',
          lines: parsed.lines || [],
          latencyMs: Math.round((parsed.latency_ms || fallbackLatency) * 10) / 10,
          engine: 'apple_vision',
          engineName: 'Apple Vision OCR (macOS Native)'
        });
      } catch (err) {
        reject(new Error(`Failed to parse Apple Vision output: ${err.message}. Raw: ${stdout}`));
      }
    });
  });
}
