import React, { useState } from 'react';
import {
  Play,
  Copy,
  Check,
  Download,
  Clock,
  Type,
  FileSpreadsheet,
  AlertCircle,
  Loader2,
  ChevronDown,
  Sparkles,
  Cpu
} from 'lucide-react';
import { DocumentMeta, EngineInfo, OCRResult } from '../types';

interface OCRControlPanelProps {
  document: DocumentMeta | null;
  currentPage: number;
  engines: EngineInfo[];
  selectedEngine: string;
  onSelectEngine: (id: string) => void;
  onRunOCR: () => void;
  isRunning: boolean;
  result: OCRResult | null;
  error: string | null;
}

export const OCRControlPanel: React.FC<OCRControlPanelProps> = ({
  document,
  currentPage,
  engines,
  selectedEngine,
  onSelectEngine,
  onRunOCR,
  isRunning,
  result,
  error
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'text' | 'lines'>('text');

  const currentEngine = engines.find((e) => e.id === selectedEngine) || engines[0];

  const handleCopy = () => {
    if (!result?.text) return;
    navigator.clipboard.writeText(result.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!result?.text) return;
    const blob = new Blob([result.text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `ocr_page_${currentPage}_${selectedEngine}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col bg-slate-900 border-l border-slate-800 select-none overflow-hidden">
      {/* Engine Selection & Action Bar */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/90 space-y-3 shrink-0">
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            OCR Engine Selection
          </label>
          <div className="relative">
            <select
              value={selectedEngine}
              onChange={(e) => onSelectEngine(e.target.value)}
              disabled={isRunning}
              className="w-full appearance-none bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-lg px-3.5 py-2.5 text-xs font-medium text-slate-100 pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition cursor-pointer disabled:opacity-50"
            >
              {engines.map((eng) => (
                <option key={eng.id} value={eng.id}>
                  {eng.name} — {eng.badge}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {currentEngine && (
            <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1.5">
              <Cpu className="w-3 h-3 text-indigo-400 shrink-0" />
              <span>{currentEngine.description}</span>
            </p>
          )}
        </div>

        {/* Action Button */}
        <button
          onClick={onRunOCR}
          disabled={!document || isRunning}
          className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-semibold shadow-lg transition duration-150 ${
            !document
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
              : isRunning
              ? 'bg-indigo-600/80 text-white cursor-wait'
              : 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-indigo-500/25 active:scale-[0.99]'
          }`}
        >
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Processing Page {currentPage}...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Run {currentEngine?.name || 'OCR'} on Page {currentPage}</span>
            </>
          )}
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="m-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2.5 text-red-300 text-xs shrink-0">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-red-200">Execution Error</div>
            <div className="text-[11px] text-red-300/90 break-all mt-0.5">{error}</div>
          </div>
        </div>
      )}

      {/* Results Header / Stats */}
      {result && (
        <div className="px-4 py-2.5 bg-slate-950/60 border-b border-slate-800/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-emerald-400 text-xs font-mono font-medium">
              <Clock className="w-3.5 h-3.5" />
              <span>{result.latencyMs} ms</span>
            </div>
            <span className="text-slate-700">|</span>
            <div className="flex items-center gap-1 text-slate-300 text-xs font-mono">
              <Type className="w-3.5 h-3.5 text-slate-400" />
              <span>{result.wordCount} words</span>
            </div>
            <span className="text-slate-700">|</span>
            <div className="text-xs text-slate-400 font-mono">
              {result.charCount} chars
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleCopy}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
              title="Copy text to clipboard"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={handleDownload}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
              title="Download text file"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Tabs if results are present */}
      {result && result.lines && result.lines.length > 0 && (
        <div className="px-4 pt-2 border-b border-slate-800 flex gap-2 text-xs font-medium shrink-0">
          <button
            onClick={() => setActiveTab('text')}
            className={`pb-2 px-1 border-b-2 transition ${
              activeTab === 'text'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            Full Text
          </button>
          <button
            onClick={() => setActiveTab('lines')}
            className={`pb-2 px-1 border-b-2 transition ${
              activeTab === 'lines'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            Lines ({result.lines.length})
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto p-4 select-text">
        {!document ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
            <FileSpreadsheet className="w-10 h-10 mb-2 stroke-1 text-slate-600" />
            <p className="text-xs">Upload a PDF document to begin OCR analysis.</p>
          </div>
        ) : !result && !isRunning ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
            <Sparkles className="w-8 h-8 mb-2 text-indigo-400/60" />
            <p className="text-xs text-slate-300 font-medium">Ready to extract</p>
            <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
              Select an engine above and click "Run OCR" to process Page {currentPage}.
            </p>
          </div>
        ) : isRunning ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            <div>
              <p className="text-xs font-semibold text-slate-200">Executing {currentEngine?.name}...</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Analyzing document layout and extracting text</p>
            </div>
          </div>
        ) : activeTab === 'text' ? (
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 min-h-full">
            <pre className="text-xs font-mono text-slate-200 whitespace-pre-wrap break-words leading-relaxed">
              {result?.text || '(No text detected on this page)'}
            </pre>
          </div>
        ) : (
          <div className="space-y-2">
            {result?.lines.map((line, idx) => (
              <div
                key={idx}
                className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5 flex items-start justify-between gap-3 text-xs hover:border-slate-700 transition"
              >
                <div className="font-mono text-slate-200 break-words flex-1">
                  {line.text}
                </div>
                {line.confidence !== undefined && (
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                      line.confidence > 0.8
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}
                  >
                    {Math.round(line.confidence * 100)}%
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
