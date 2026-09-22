import React, { useState, useEffect, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { PDFViewer } from './components/PDFViewer';
import { OCRControlPanel } from './components/OCRControlPanel';
import { DocumentMeta, EngineInfo, OCRResult } from './types';
import { apiUrl } from './api';
import { loadPDFDocument, exportPageToBlob } from './pdfHelper';

export default function App() {
  const [document, setDocument] = useState<DocumentMeta | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [engines, setEngines] = useState<EngineInfo[]>([
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
  ]);
  const [selectedEngine, setSelectedEngine] = useState<string>('apple_vision');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isRunningOCR, setIsRunningOCR] = useState<boolean>(false);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch engines on mount
  useEffect(() => {
    fetch(apiUrl('/api/engines'))
      .then((res) => res.json())
      .then((data) => {
        if (data.engines && data.engines.length > 0) {
          setEngines(data.engines);
          setSelectedEngine(data.engines[0].id);
        }
      })
      .catch((err) => {
        console.warn('Could not fetch engines from server, using defaults:', err);
      });
  }, []);

  // Handle PDF file upload (In-Browser with PDF.js)
  const handleFileUpload = async (file: File) => {
    try {
      setIsUploading(true);
      setError(null);
      setOcrResult(null);

      const buffer = await file.arrayBuffer();
      const pdfDoc = await loadPDFDocument(buffer);

      const docMeta: DocumentMeta = {
        id: `local-${Date.now()}`,
        filename: file.name,
        title: file.name,
        pageCount: pdfDoc.numPages,
        createdAt: new Date().toISOString(),
        pdfDoc
      };

      setDocument(docMeta);
      setCurrentPage(1);
    } catch (err: any) {
      console.error('File open error:', err);
      setError(err.message || 'Failed to open PDF file');
    } finally {
      setIsUploading(false);
    }
  };

  // Handle Page Change
  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    setOcrResult(null);
    setError(null);
  };

  // Run OCR on current page
  const handleRunOCR = async () => {
    if (!document) return;

    try {
      setIsRunningOCR(true);
      setError(null);

      let response: Response;

      if (document.pdfDoc) {
        // High resolution 150 DPI render of ONLY the current page sent as image
        const imageBlob = await exportPageToBlob(document.pdfDoc, currentPage, 150);
        const formData = new FormData();
        formData.append('image', imageBlob, `page_${currentPage}.png`);
        formData.append('engineId', selectedEngine);
        formData.append('pageNumber', String(currentPage));

        response = await fetch(apiUrl('/api/ocr-page-image'), {
          method: 'POST',
          body: formData
        });
      } else {
        // Fallback to legacy document ID endpoint
        response = await fetch(apiUrl('/api/ocr'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            documentId: document.id,
            pageNumber: currentPage,
            engineId: selectedEngine
          })
        });
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `OCR failed with status ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setOcrResult(data);
      }
    } catch (err: any) {
      console.error('OCR execution failed:', err);
      setError(err.message || 'OCR execution failed');
    } finally {
      setIsRunningOCR(false);
    }
  };

  // Handle Load Sample Document
  const handleLoadSample = async () => {
    try {
      setIsUploading(true);
      setError(null);
      setOcrResult(null);

      const response = await fetch(apiUrl('/api/sample-pdf'));
      if (!response.ok) {
        throw new Error('Failed to load sample document from server');
      }

      const buffer = await response.arrayBuffer();
      const pdfDoc = await loadPDFDocument(buffer);

      const docMeta: DocumentMeta = {
        id: `sample-${Date.now()}`,
        filename: 'sample_document.pdf',
        title: 'Sample Financial Summary',
        pageCount: pdfDoc.numPages,
        createdAt: new Date().toISOString(),
        pdfDoc
      };

      setDocument(docMeta);
      setCurrentPage(1);
    } catch (err: any) {
      console.error('Load sample error:', err);
      setError(err.message || 'Failed to load sample document');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-slate-950 text-slate-100">
      {/* Hidden file input for navbar upload button */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFileUpload(e.target.files[0]);
          }
        }}
      />

      <Navbar
        hasDocument={!!document}
        onUploadClick={() => fileInputRef.current?.click()}
      />

      {/* Main Split Body */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Side: PDF Viewer */}
        <section className="flex-1 h-full min-w-0">
          <PDFViewer
            document={document}
            currentPage={currentPage}
            onPageChange={handlePageChange}
            onFileUpload={handleFileUpload}
            onLoadSample={handleLoadSample}
            isUploading={isUploading}
          />
        </section>

        {/* Right Side: OCR Control Panel & Results */}
        <section className="w-[450px] lg:w-[500px] xl:w-[560px] h-full shrink-0">
          <OCRControlPanel
            document={document}
            currentPage={currentPage}
            engines={engines}
            selectedEngine={selectedEngine}
            onSelectEngine={(id) => {
              setSelectedEngine(id);
              setOcrResult(null);
            }}
            onRunOCR={handleRunOCR}
            isRunning={isRunningOCR}
            result={ocrResult}
            error={error}
          />
        </section>
      </main>
    </div>
  );
}
