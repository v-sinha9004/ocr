import React from 'react';
import { Layers, FileText, UploadCloud, Cpu } from 'lucide-react';

interface NavbarProps {
  hasDocument: boolean;
  onUploadClick: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ hasDocument, onUploadClick }) => {
  return (
    <header className="h-14 border-b border-slate-800 bg-slate-900/80 backdrop-blur px-4 flex items-center justify-between select-none shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
          <Layers className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm tracking-tight text-white">OCR Studio</span>
            <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Engine Lab
            </span>
          </div>
          <p className="text-[11px] text-slate-400">PDF Viewer & Traditional/Native OCR Benchmarking</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 bg-slate-800/60 px-3 py-1.5 rounded-md border border-slate-700/50">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <Cpu className="w-3.5 h-3.5 text-slate-400" />
          <span>Apple Silicon & Homebrew Native</span>
        </div>

        {hasDocument && (
          <button
            onClick={onUploadClick}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-md border border-slate-700 transition"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Upload New PDF</span>
          </button>
        )}
      </div>
    </header>
  );
};
