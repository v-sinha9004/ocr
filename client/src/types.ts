export interface PageInfo {
  pageNumber: number;
  imageFilename?: string;
  url?: string;
}

export interface DocumentMeta {
  id: string;
  filename: string;
  title: string;
  pageCount: number;
  pages?: PageInfo[];
  createdAt: string;
  pdfDoc?: any;
}

export interface EngineInfo {
  id: string;
  name: string;
  badge: string;
  description: string;
  available: boolean;
}

export interface RecognizedLine {
  text: string;
  confidence: number;
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface OCRResult {
  documentId?: string;
  pageNumber: number;
  engine: string;
  engineName: string;
  text: string;
  lines: RecognizedLine[];
  latencyMs: number;
  wordCount: number;
  charCount: number;
}
