import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface RenderPageResult {
  width: number;
  height: number;
}

/**
 * Loads a PDF document from an ArrayBuffer client-side
 */
export async function loadPDFDocument(data: ArrayBuffer): Promise<pdfjsLib.PDFDocumentProxy> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(data),
    cMapPacked: true,
  });
  return await loadingTask.promise;
}

/**
 * Renders a specific PDF page onto an HTML canvas element.
 * Supports cancellation if a new render request arrives for the same canvas.
 */
let currentRenderTask: any = null;

export async function renderPageToCanvas(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number = 1.5
): Promise<RenderPageResult> {
  if (currentRenderTask) {
    try {
      currentRenderTask.cancel();
    } catch {
      // Ignore cancellation error
    }
    currentRenderTask = null;
  }

  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context not available');
  }

  // Clear canvas
  context.clearRect(0, 0, canvas.width, canvas.height);

  currentRenderTask = page.render({
    canvas,
    canvasContext: context,
    viewport: viewport
  });

  await currentRenderTask.promise;
  currentRenderTask = null;

  return {
    width: viewport.width,
    height: viewport.height
  };
}

/**
 * Renders a thumbnail of a page onto a small canvas.
 */
export async function renderThumbnail(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  targetWidth: number = 90
): Promise<void> {
  const page = await pdfDoc.getPage(pageNumber);
  const unscaledViewport = page.getViewport({ scale: 1.0 });
  const scale = targetWidth / unscaledViewport.width;
  const viewport = page.getViewport({ scale });

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  const context = canvas.getContext('2d');
  if (!context) return;

  context.clearRect(0, 0, canvas.width, canvas.height);
  await page.render({
    canvas,
    canvasContext: context,
    viewport: viewport
  }).promise;
}

/**
 * Renders a specific PDF page to an offscreen canvas at a specified DPI (default 150 DPI for OCR)
 * and exports it as a PNG Blob.
 */
export async function exportPageToBlob(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  dpi: number = 150
): Promise<Blob> {
  const page = await pdfDoc.getPage(pageNumber);
  // 72 points per inch standard in PDF. Scale = dpi / 72
  const scale = dpi / 72.0;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context not available');
  }

  await page.render({
    canvas,
    canvasContext: context,
    viewport: viewport
  }).promise;

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to convert canvas to PNG blob'));
      }
    }, 'image/png');
  });
}
