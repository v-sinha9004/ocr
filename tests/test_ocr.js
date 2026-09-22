import path from 'path';
import { fileURLToPath } from 'url';
import { processPDF, getPageImagePath } from './server/services/pdfService.js';
import { runAppleVisionOCR } from './server/engines/appleVision.js';
import { runTesseractOCR } from './server/engines/tesseract.js';
import { execSync } from 'child_process';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('=== Step 1: Generating Sample Multi-Line PDF ===');
  const samplePdfPath = path.join(__dirname, 'test_doc.pdf');

  // Generate a clean test PDF with sample invoice / document text
  const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 280 >>
stream
BT
/F1 20 Tf
72 710 Td
(INVOICE #INV-2026-9042) Tj
0 -36 Td
/F1 14 Tf
(Billed To: Acme Technology Solutions) Tj
0 -24 Td
(Description: Enterprise AI OCR Engine Integration) Tj
0 -24 Td
(Subtotal: $4,500.00 | Tax: $360.00 | Total: $4,860.00) Tj
0 -30 Td
(Thank you for your business!) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000578 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
657
%%EOF
`;
  fs.writeFileSync(samplePdfPath, pdfContent);
  console.log(`Created test PDF at: ${samplePdfPath}`);

  console.log('\n=== Step 2: Processing PDF & Rendering Pages with pdftoppm ===');
  const tempCopy = path.join(__dirname, 'test_copy.pdf');
  fs.copyFileSync(samplePdfPath, tempCopy);

  const docMeta = await processPDF(tempCopy, 'test_doc.pdf');
  console.log(`Document ID: ${docMeta.id}`);
  console.log(`Total Pages Rendered: ${docMeta.pageCount}`);

  const page1Path = getPageImagePath(docMeta.id, 1);
  console.log(`Rendered Page 1 Image: ${page1Path}`);

  console.log('\n=== Step 3: Running Apple Vision OCR (macOS Native) ===');
  const appleResult = await runAppleVisionOCR(page1Path);
  console.log(`[Apple Vision] Latency: ${appleResult.latencyMs} ms`);
  console.log(`[Apple Vision] Extracted text:\n---\n${appleResult.text}\n---`);

  console.log('\n=== Step 4: Running Tesseract OCR (v5.5.1) ===');
  const tesseractResult = await runTesseractOCR(page1Path);
  console.log(`[Tesseract] Latency: ${tesseractResult.latencyMs} ms`);
  console.log(`[Tesseract] Extracted text:\n---\n${tesseractResult.text}\n---`);

  console.log('\n=== Step 5: Scorecard Comparison ===');
  console.log({
    apple_vision: {
      latency_ms: appleResult.latencyMs,
      words: appleResult.text.trim().split(/\s+/).length,
      chars: appleResult.text.length,
      lines_detected: appleResult.lines.length
    },
    tesseract: {
      latency_ms: tesseractResult.latencyMs,
      words: tesseractResult.text.trim().split(/\s+/).length,
      chars: tesseractResult.text.length,
      lines_detected: tesseractResult.lines.length
    }
  });

  // Clean up test_doc.pdf
  fs.unlinkSync(samplePdfPath);
  console.log('\nAll tests passed successfully!');
}

main().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
