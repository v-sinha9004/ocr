import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileText,
  Loader2,
  FileUp
} from 'lucide-react';
import { DocumentMeta } from '../types';
import { apiUrl } from '../api';
import { renderPageToCanvas, renderThumbnail } from '../pdfHelper';

interface PDFViewerProps {
  document: DocumentMeta | null;
  currentPage: number;
  onPageChange: (page: number) => void;
  onFileUpload: (file: File) => void;
  onLoadSample: () => void;
  isUploading: boolean;
}

const ThumbnailItem: React.FC<{
  pdfDoc: any;
  pageNumber: number;
  isSelected: boolean;
  onSelect: () => void;
}> = ({ pdfDoc, pageNumber, isSelected, onSelect }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let active = true;
    if (canvasRef.current && pdfDoc) {
      renderThumbnail(pdfDoc, pageNumber, canvasRef.current, 96).catch((err) => {
        if (active) console.warn(`Thumbnail render failed for page ${pageNumber}:`, err);
      });
    }
    return () => {
      active = false;
    };
  }, [pdfDoc, pageNumber]);

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-lg p-1.5 transition border block ${
        isSelected
          ? 'border-indigo-500 bg-indigo-500/10 shadow-sm'
          : 'border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
      }`}
    >
      <div className="aspect-[3/4] bg-slate-900 rounded overflow-hidden flex items-center justify-center border border-slate-800/80 mb-1">
        <canvas ref={canvasRef} className="w-full h-full object-contain pointer-events-none" />
      </div>
      <div className="text-[10px] font-medium text-center text-slate-400">
        Page {pageNumber}
      </div>
    </button>
  );
};

export const PDFViewer: React.FC<PDFViewerProps> = ({
  document,
  currentPage,
  onPageChange,
  onFileUpload,
  onLoadSample,
  isUploading
}) => {
  const [zoom, setZoom] = useState<number>(100);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [isPageRendering, setIsPageRendering] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        onFileUpload(file);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileUpload(e.target.files[0]);
    }
  };

  // Render active page to canvas when document, currentPage, or zoom changes
  useEffect(() => {
    let active = true;
    if (document?.pdfDoc && mainCanvasRef.current) {
      setIsPageRendering(true);
      const scale = (zoom / 100) * 1.5;
      renderPageToCanvas(document.pdfDoc, currentPage, mainCanvasRef.current, scale)
        .then(() => {
          if (active) setIsPageRendering(false);
        })
        .catch((err) => {
          if (active) {
            console.error('Page render error:', err);
            setIsPageRendering(false);
          }
        });
    }
    return () => {
      active = false;
    };
  }, [document?.pdfDoc, currentPage, zoom]);

  // If no document is loaded yet, show upload dropzone
  if (!document) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center bg-slate-900/40">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`w-full max-w-lg border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 group ${
            isDragOver
              ? 'border-indigo-400 bg-indigo-500/10 scale-[1.01]'
              : 'border-slate-700/80 bg-slate-800/30 hover:border-slate-500 hover:bg-slate-800/60'
          }`}
        >
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4 group-hover:scale-110 group-hover:bg-indigo-500/20 transition-transform">
            {isUploading ? (
              <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
            ) : (
              <FileUp className="w-8 h-8" />
            )}
          </div>
          <h3 className="text-base font-semibold text-white mb-1">
            {isUploading ? 'Opening PDF in browser...' : 'Open PDF to inspect & run OCR'}
          </h3>
          <p className="text-xs text-slate-400 max-w-xs mb-5">
            Drag and drop your PDF here, or click to browse. Renders instantly in the browser.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isUploading}
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition active:scale-95 disabled:opacity-50"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Select PDF File</span>
            </button>
            <button
              type="button"
              disabled={isUploading}
              onClick={(e) => {
                e.stopPropagation();
                onLoadSample();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-medium transition active:scale-95 disabled:opacity-50"
            >
              <span>Load Sample PDF</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentImageUrl = apiUrl(`/api/documents/${document.id}/pages/${currentPage}`);
  const pagesCount = document.pageCount || 1;
  const pageNumbers = Array.from({ length: pagesCount }, (_, i) => i + 1);

  return (
    <div className="h-full flex flex-col bg-slate-900/30 overflow-hidden select-none">
      {/* Top Toolbar */}
      <div className="h-12 border-b border-slate-800 bg-slate-900/60 px-4 flex items-center justify-between shrink-0">
        {/* Document details */}
        <div className="flex items-center gap-2 max-w-[40%] truncate">
          <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="text-xs font-medium text-slate-200 truncate" title={document.filename}>
            {document.filename}
          </span>
          {document.pdfDoc && (
            <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-mono border border-indigo-500/30">
              In-Browser
            </span>
          )}
        </div>

        {/* Page Switcher */}
        <div className="flex items-center gap-1.5 bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-700/60">
          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            className="p-1 rounded hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
            title="Previous Page"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs font-mono text-slate-300 px-1.5">
            {currentPage} <span className="text-slate-500">/</span> {pagesCount}
          </span>
          <button
            onClick={() => onPageChange(Math.min(pagesCount, currentPage + 1))}
            disabled={currentPage >= pagesCount}
            className="p-1 rounded hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
            title="Next Page"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 bg-slate-800/80 px-1.5 py-1 rounded-lg border border-slate-700/60">
          <button
            onClick={() => setZoom((z) => Math.max(50, z - 15))}
            className="p-1 rounded hover:bg-slate-700 text-slate-300 transition"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-mono text-slate-400 w-9 text-center">
            {zoom}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(250, z + 15))}
            className="p-1 rounded hover:bg-slate-700 text-slate-300 transition"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoom(100)}
            className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition"
            title="Reset Zoom"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Split Body: Thumbnails Sidebar + Image/Canvas Viewer */}
      <div className="flex-1 flex overflow-hidden">
        {/* Thumbnails Sidebar */}
        {pagesCount > 1 && (
          <div className="w-28 shrink-0 border-r border-slate-800 bg-slate-950/40 p-2 overflow-y-auto space-y-2">
            {pageNumbers.map((p) => {
              const isSelected = p === currentPage;
              if (document.pdfDoc) {
                return (
                  <ThumbnailItem
                    key={p}
                    pdfDoc={document.pdfDoc}
                    pageNumber={p}
                    isSelected={isSelected}
                    onSelect={() => onPageChange(p)}
                  />
                );
              }

              // Fallback for legacy documents with pre-rendered URLs
              return (
                <button
                  key={p}
                  onClick={() => onPageChange(p)}
                  className={`w-full text-left rounded-lg p-1.5 transition border block ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-500/10 shadow-sm'
                      : 'border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="aspect-[3/4] bg-slate-900 rounded overflow-hidden flex items-center justify-center border border-slate-800/80 mb-1">
                    <img
                      src={apiUrl(`/api/documents/${document.id}/pages/${p}`)}
                      alt={`Page ${p}`}
                      className="w-full h-full object-contain pointer-events-none"
                      loading="lazy"
                    />
                  </div>
                  <div className="text-[10px] font-medium text-center text-slate-400">
                    Page {p}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Page Render Container */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-950/80 relative">
          {isPageRendering && (
            <div className="absolute top-4 right-4 z-10 bg-slate-900/80 backdrop-blur border border-slate-800 px-2.5 py-1 rounded-full flex items-center gap-1.5 text-[11px] text-slate-400">
              <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
              <span>Rendering...</span>
            </div>
          )}

          <div
            style={{ width: `${zoom}%`, maxWidth: 'none' }}
            className="transition-all duration-150 flex justify-center"
          >
            <div className="relative shadow-2xl rounded-sm border border-slate-700/60 overflow-hidden bg-white">
              {document.pdfDoc ? (
                <canvas
                  ref={mainCanvasRef}
                  className="max-w-none w-full h-auto block select-none"
                />
              ) : (
                <img
                  src={currentImageUrl}
                  alt={`Page ${currentPage}`}
                  className="max-w-none w-full h-auto block select-none"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
