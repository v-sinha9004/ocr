// Initialize PDF.js worker
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// Application State
const state = {
  pdfDoc: null,
  docTitle: '',
  currentPage: 1,
  totalPages: 1,
  zoom: 100,
  engines: [],
  selectedEngine: 'apple_vision',
  selectedOpenaiModel: 'gpt-5.4-mini',
  selectedOllamaModel: 'qwen3-vl:8b',
  isRunningOCR: false,
  ocrResult: null,
  activeTab: 'text',
  currentRenderTask: null,
};

// DOM Elements
const elements = {
  // Navigation & File Input
  navUploadBtn: document.getElementById('navUploadBtn'),
  fileInput: document.getElementById('fileInput'),

  // Viewer Toolbar
  viewerToolbar: document.getElementById('viewerToolbar'),
  docTitle: document.getElementById('docTitle'),
  prevPageBtn: document.getElementById('prevPageBtn'),
  nextPageBtn: document.getElementById('nextPageBtn'),
  currentPageNum: document.getElementById('currentPageNum'),
  totalPagesNum: document.getElementById('totalPagesNum'),
  zoomInBtn: document.getElementById('zoomInBtn'),
  zoomOutBtn: document.getElementById('zoomOutBtn'),
  zoomResetBtn: document.getElementById('zoomResetBtn'),
  zoomLevelText: document.getElementById('zoomLevelText'),

  // Viewer Content & Dropzone
  viewerContent: document.getElementById('viewerContent'),
  thumbnailsSidebar: document.getElementById('thumbnailsSidebar'),
  canvasViewport: document.getElementById('canvasViewport'),
  canvasWrapper: document.getElementById('canvasWrapper'),
  pdfCanvas: document.getElementById('pdfCanvas'),
  renderingIndicator: document.getElementById('renderingIndicator'),
  emptyDropzone: document.getElementById('emptyDropzone'),
  dropTarget: document.getElementById('dropTarget'),
  dropSelectBtn: document.getElementById('dropSelectBtn'),
  loadSampleBtn: document.getElementById('loadSampleBtn'),

  // OCR Panel
  engineSelect: document.getElementById('engineSelect'),
  engineDescText: document.getElementById('engineDescText'),
  openaiModelContainer: document.getElementById('openaiModelContainer'),
  openaiModelSelect: document.getElementById('openaiModelSelect'),
  ollamaModelContainer: document.getElementById('ollamaModelContainer'),
  ollamaModelSelect: document.getElementById('ollamaModelSelect'),
  runOcrBtn: document.getElementById('runOcrBtn'),
  runIcon: document.getElementById('runIcon'),
  runSpinner: document.getElementById('runSpinner'),
  runBtnText: document.getElementById('runBtnText'),

  // Error Banner
  errorBanner: document.getElementById('errorBanner'),
  errorText: document.getElementById('errorText'),

  // Scorecards & Tabs
  scorecardBar: document.getElementById('scorecardBar'),
  scoreLatency: document.getElementById('scoreLatency'),
  scoreWords: document.getElementById('scoreWords'),
  scoreChars: document.getElementById('scoreChars'),
  scoreTokensContainer: document.getElementById('scoreTokensContainer'),
  scorePromptTokens: document.getElementById('scorePromptTokens'),
  scoreCompletionTokens: document.getElementById('scoreCompletionTokens'),
  scoreTotalTokens: document.getElementById('scoreTotalTokens'),
  textTokensBanner: document.getElementById('textTokensBanner'),
  bannerPromptTokens: document.getElementById('bannerPromptTokens'),
  bannerCompletionTokens: document.getElementById('bannerCompletionTokens'),
  bannerTotalTokens: document.getElementById('bannerTotalTokens'),
  copyBtn: document.getElementById('copyBtn'),
  copyIcon: document.getElementById('copyIcon'),
  copiedIcon: document.getElementById('copiedIcon'),
  downloadBtn: document.getElementById('downloadBtn'),
  inspectorTabs: document.getElementById('inspectorTabs'),
  tabText: document.getElementById('tabText'),
  tabLines: document.getElementById('tabLines'),
  tabLinesCount: document.getElementById('tabLinesCount'),

  // Results Inspector
  initialStateNotice: document.getElementById('initialStateNotice'),
  readyNotice: document.getElementById('readyNotice'),
  runningNotice: document.getElementById('runningNotice'),
  runningNoticeTitle: document.getElementById('runningNoticeTitle'),
  fullTextContainer: document.getElementById('fullTextContainer'),
  rawTextContent: document.getElementById('rawTextContent'),
  linesContainer: document.getElementById('linesContainer'),
};

// Initialize Application
async function initApp() {
  setupEventListeners();
  await fetchEngines();
}

// Fetch OCR Engines from FastAPI
async function fetchEngines() {
  try {
    const res = await fetch('/api/engines');
    const data = await res.json();
    if (data.engines && data.engines.length > 0) {
      state.engines = data.engines;
      renderEngineOptions();
    }
  } catch (err) {
    console.warn('Could not fetch engines from server:', err);
  }
}

function renderEngineOptions() {
  elements.engineSelect.innerHTML = '';
  state.engines.forEach((eng) => {
    const opt = document.createElement('option');
    opt.value = eng.id;
    opt.textContent = `${eng.name} — ${eng.badge}`;
    elements.engineSelect.appendChild(opt);
  });
  elements.engineSelect.value = state.selectedEngine;

  // Populate Ollama models if returned by registry
  const ollamaEng = state.engines.find((e) => e.id === 'ollama');
  if (ollamaEng && ollamaEng.models && elements.ollamaModelSelect) {
    elements.ollamaModelSelect.innerHTML = '';
    ollamaEng.models.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      elements.ollamaModelSelect.appendChild(opt);
    });
    if (ollamaEng.defaultModel) {
      elements.ollamaModelSelect.value = state.selectedOllamaModel || ollamaEng.defaultModel;
    }
  }

  updateEngineDescription();
  updateEngineControls();
}

function updateEngineDescription() {
  const current = state.engines.find((e) => e.id === state.selectedEngine);
  if (current && elements.engineDescText) {
    elements.engineDescText.textContent = current.description || '';
  }
}

function updateEngineControls() {
  if (elements.openaiModelContainer) {
    if (state.selectedEngine === 'openai') {
      elements.openaiModelContainer.classList.remove('hidden');
    } else {
      elements.openaiModelContainer.classList.add('hidden');
    }
  }
  if (elements.ollamaModelContainer) {
    if (state.selectedEngine === 'ollama') {
      elements.ollamaModelContainer.classList.remove('hidden');
    } else {
      elements.ollamaModelContainer.classList.add('hidden');
    }
  }
}

// Event Listeners
function setupEventListeners() {
  // File Upload Handlers
  elements.navUploadBtn.addEventListener('click', () => elements.fileInput.click());
  elements.dropSelectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.fileInput.click();
  });
  elements.dropTarget.addEventListener('click', () => elements.fileInput.click());

  elements.fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      loadPDFFile(e.target.files[0]);
    }
  });

  // Drag & Drop
  ['dragenter', 'dragover'].forEach((eventName) => {
    elements.dropTarget.addEventListener(eventName, (e) => {
      e.preventDefault();
      elements.dropTarget.classList.add('border-indigo-400', 'bg-indigo-500/10');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    elements.dropTarget.addEventListener(eventName, (e) => {
      e.preventDefault();
      elements.dropTarget.classList.remove('border-indigo-400', 'bg-indigo-500/10');
    });
  });

  elements.dropTarget.addEventListener('drop', (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        loadPDFFile(file);
      }
    }
  });

  // Load Sample PDF
  elements.loadSampleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    loadSamplePDF();
  });

  // Page Controls
  elements.prevPageBtn.addEventListener('click', () => {
    if (state.currentPage > 1) {
      changePage(state.currentPage - 1);
    }
  });
  elements.nextPageBtn.addEventListener('click', () => {
    if (state.currentPage < state.totalPages) {
      changePage(state.currentPage + 1);
    }
  });

  // Zoom Controls
  elements.zoomInBtn.addEventListener('click', () => setZoom(Math.min(250, state.zoom + 15)));
  elements.zoomOutBtn.addEventListener('click', () => setZoom(Math.max(50, state.zoom - 15)));
  elements.zoomResetBtn.addEventListener('click', () => setZoom(100));

  // Engine Select
  elements.engineSelect.addEventListener('change', (e) => {
    state.selectedEngine = e.target.value;
    updateEngineDescription();
    updateEngineControls();
    updateOCRButtonState();
    clearOCRResults();
  });

  // OpenAI Model Select
  if (elements.openaiModelSelect) {
    elements.openaiModelSelect.addEventListener('change', (e) => {
      state.selectedOpenaiModel = e.target.value;
      updateOCRButtonState();
    });
  }

  // Ollama Model Select
  if (elements.ollamaModelSelect) {
    elements.ollamaModelSelect.addEventListener('change', (e) => {
      state.selectedOllamaModel = e.target.value;
      updateOCRButtonState();
    });
  }

  // Run OCR Button
  elements.runOcrBtn.addEventListener('click', runOCR);

  // Tabs
  elements.tabText.addEventListener('click', () => switchTab('text'));
  elements.tabLines.addEventListener('click', () => switchTab('lines'));

  // Copy & Download
  elements.copyBtn.addEventListener('click', copyResultsToClipboard);
  elements.downloadBtn.addEventListener('click', downloadResultsAsText);
}

// Load PDF from File
async function loadPDFFile(file) {
  try {
    showError(null);
    clearOCRResults();
    const arrayBuffer = await file.arrayBuffer();
    await loadPDFDocument(arrayBuffer, file.name);
  } catch (err) {
    console.error('Error loading PDF file:', err);
    showError(err.message || 'Failed to open PDF document');
  }
}

// Load Pre-packaged Sample PDF
async function loadSamplePDF() {
  try {
    showError(null);
    clearOCRResults();
    const res = await fetch('/api/sample-pdf');
    if (!res.ok) {
      throw new Error(`Failed to download sample PDF (HTTP ${res.status})`);
    }
    const arrayBuffer = await res.arrayBuffer();
    await loadPDFDocument(arrayBuffer, 'sample_financial_summary.pdf');
  } catch (err) {
    console.error('Error loading sample PDF:', err);
    showError(err.message || 'Failed to load sample PDF');
  }
}

// Core PDF.js Loader
async function loadPDFDocument(arrayBuffer, filename) {
  state.docTitle = filename;
  const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
  state.pdfDoc = await loadingTask.promise;
  state.totalPages = state.pdfDoc.numPages;
  state.currentPage = 1;

  // Update UI Elements
  elements.docTitle.textContent = filename;
  elements.totalPagesNum.textContent = state.totalPages;
  elements.emptyDropzone.classList.add('hidden');
  elements.viewerToolbar.classList.remove('hidden');
  elements.viewerContent.classList.remove('hidden');

  // Render Thumbnails Sidebar if multi-page
  if (state.totalPages > 1) {
    elements.thumbnailsSidebar.classList.remove('hidden');
    renderThumbnails();
  } else {
    elements.thumbnailsSidebar.classList.add('hidden');
  }

  updatePageControls();
  await renderCurrentPage();
  updateOCRButtonState();
  showReadyNotice();
}

// Change Current Page
async function changePage(newPage) {
  if (newPage < 1 || newPage > state.totalPages || newPage === state.currentPage) return;
  state.currentPage = newPage;
  updatePageControls();
  highlightSelectedThumbnail();
  clearOCRResults();
  await renderCurrentPage();
  updateOCRButtonState();
  showReadyNotice();
}

function updatePageControls() {
  elements.currentPageNum.textContent = state.currentPage;
  elements.prevPageBtn.disabled = state.currentPage <= 1;
  elements.nextPageBtn.disabled = state.currentPage >= state.totalPages;
}

// Set Zoom Level
function setZoom(newZoom) {
  state.zoom = newZoom;
  elements.zoomLevelText.textContent = `${newZoom}%`;
  renderCurrentPage();
}

// Render Active Page to Canvas
async function renderCurrentPage() {
  if (!state.pdfDoc) return;

  if (state.currentRenderTask) {
    try {
      state.currentRenderTask.cancel();
    } catch (e) {}
    state.currentRenderTask = null;
  }

  elements.renderingIndicator.classList.remove('hidden');

  try {
    const page = await state.pdfDoc.getPage(state.currentPage);
    const canvas = elements.pdfCanvas;
    const ctx = canvas.getContext('2d');

    const baseViewport = page.getViewport({ scale: 1.0 });
    const zoomRatio = state.zoom / 100;
    const pixelRatio = window.devicePixelRatio || 1.5;
    const renderScale = zoomRatio * (pixelRatio > 1 ? 2.0 : 1.33);
    const viewport = page.getViewport({ scale: renderScale });

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    // Explicit CSS display dimensions based on zoom
    const displayWidth = Math.floor(baseViewport.width * zoomRatio * 1.2);
    const displayHeight = Math.floor(baseViewport.height * zoomRatio * 1.2);
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport,
    };

    state.currentRenderTask = page.render(renderContext);
    await state.currentRenderTask.promise;
    state.currentRenderTask = null;
  } catch (err) {
    if (err?.name !== 'RenderingCancelledException') {
      console.error('Page rendering error:', err);
    }
  } finally {
    elements.renderingIndicator.classList.add('hidden');
  }
}

// Render Thumbnails in Sidebar
async function renderThumbnails() {
  elements.thumbnailsSidebar.innerHTML = '';

  for (let p = 1; p <= state.totalPages; p++) {
    const thumbItem = document.createElement('div');
    thumbItem.className = `thumbnail-item ${p === state.currentPage ? 'selected' : ''}`;
    thumbItem.dataset.page = p;
    thumbItem.innerHTML = `
      <div class="thumbnail-canvas-wrapper">
        <canvas id="thumb-canvas-${p}" class="thumbnail-canvas"></canvas>
      </div>
      <div class="text-[10px] font-medium text-center text-slate-400">Page ${p}</div>
    `;

    thumbItem.addEventListener('click', () => changePage(p));
    elements.thumbnailsSidebar.appendChild(thumbItem);

    // Asynchronously render thumbnail
    renderSingleThumbnail(p);
  }
}

async function renderSingleThumbnail(pageNumber) {
  try {
    const page = await state.pdfDoc.getPage(pageNumber);
    const canvas = document.getElementById(`thumb-canvas-${pageNumber}`);
    if (!canvas) return;

    const unscaledViewport = page.getViewport({ scale: 1 });
    const scale = 96 / unscaledViewport.width;
    const viewport = page.getViewport({ scale });

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    await page.render({
      canvasContext: canvas.getContext('2d'),
      viewport,
    }).promise;
  } catch (err) {
    console.warn(`Thumbnail rendering error page ${pageNumber}:`, err);
  }
}

function highlightSelectedThumbnail() {
  const items = elements.thumbnailsSidebar.querySelectorAll('.thumbnail-item');
  items.forEach((item) => {
    if (parseInt(item.dataset.page, 10) === state.currentPage) {
      item.classList.add('selected');
      item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      item.classList.remove('selected');
    }
  });
}

// Update OCR Run Button
function updateOCRButtonState() {
  if (!state.pdfDoc) {
    elements.runOcrBtn.disabled = true;
    elements.runBtnText.textContent = 'Select a PDF to Run OCR';
    return;
  }

  const currentEng = state.engines.find((e) => e.id === state.selectedEngine);
  let engName = currentEng ? currentEng.name : 'OCR';
  if (state.selectedEngine === 'openai') {
    const modelLabels = {
      'gpt-5.4-mini': 'GPT-5.4-mini',
      'gpt-5-mini': 'GPT-5-mini',
      'gpt-4o-mini': 'GPT-4o-mini',
    };
    const modelLabel = modelLabels[state.selectedOpenaiModel] || state.selectedOpenaiModel;
    engName = `OpenAI (${modelLabel})`;
  } else if (state.selectedEngine === 'ollama') {
    engName = `Ollama (${state.selectedOllamaModel})`;
  }

  if (state.isRunningOCR) {
    elements.runOcrBtn.disabled = true;
    elements.runIcon.classList.add('hidden');
    elements.runSpinner.classList.remove('hidden');
    elements.runBtnText.textContent = `Processing Page ${state.currentPage}...`;
  } else {
    elements.runOcrBtn.disabled = false;
    elements.runIcon.classList.remove('hidden');
    elements.runSpinner.classList.add('hidden');
    elements.runBtnText.textContent = `Run ${engName} on Page ${state.currentPage}`;
  }
}

// Execute OCR Pipeline
async function runOCR() {
  if (!state.pdfDoc || state.isRunningOCR) return;

  try {
    state.isRunningOCR = true;
    showError(null);
    updateOCRButtonState();
    showRunningNotice();

    // 1. Render high-resolution 150 DPI canvas for the current page
    const page = await state.pdfDoc.getPage(state.currentPage);
    const viewport = page.getViewport({ scale: 150 / 72 }); // 150 DPI export
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = Math.floor(viewport.width);
    offscreenCanvas.height = Math.floor(viewport.height);

    const ctx = offscreenCanvas.getContext('2d');
    await page.render({
      canvasContext: ctx,
      viewport,
    }).promise;

    // 2. Convert canvas to Blob
    const blob = await new Promise((resolve) => offscreenCanvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Failed to capture page canvas for OCR');

    // 3. Dispatch to FastAPI /api/ocr-page-image
    const formData = new FormData();
    formData.append('image', blob, `page_${state.currentPage}.png`);
    formData.append('engineId', state.selectedEngine);
    formData.append('pageNumber', state.currentPage);

    const options = {};
    if (state.selectedEngine === 'openai') {
      options.model = state.selectedOpenaiModel;
    } else if (state.selectedEngine === 'ollama') {
      options.model = state.selectedOllamaModel;
    }
    formData.append('options', JSON.stringify(options));

    const response = await fetch('/api/ocr-page-image', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || errData.error || `OCR failed with HTTP status ${response.status}`);
    }

    const data = await response.json();
    if (data.success) {
      displayOCRResults(data);
    }
  } catch (err) {
    console.error('OCR run failed:', err);
    showError(err.message || 'OCR processing failed');
    showReadyNotice();
  } finally {
    state.isRunningOCR = false;
    updateOCRButtonState();
  }
}

// Display Results
function displayOCRResults(result) {
  state.ocrResult = result;

  // Scorecards
  elements.scoreLatency.textContent = `${result.latencyMs} ms`;
  elements.scoreWords.textContent = `${result.wordCount} words`;
  elements.scoreChars.textContent = result.charCount;

  // Tokens (for OpenAI & other models reporting usage)
  const tokensContainer = elements.scoreTokensContainer || document.getElementById('scoreTokensContainer');
  const promptEl = elements.scorePromptTokens || document.getElementById('scorePromptTokens');
  const compEl = elements.scoreCompletionTokens || document.getElementById('scoreCompletionTokens');
  const totalEl = elements.scoreTotalTokens || document.getElementById('scoreTotalTokens');

  const textBanner = elements.textTokensBanner || document.getElementById('textTokensBanner');
  const bannerPrompt = elements.bannerPromptTokens || document.getElementById('bannerPromptTokens');
  const bannerComp = elements.bannerCompletionTokens || document.getElementById('bannerCompletionTokens');
  const bannerTotal = elements.bannerTotalTokens || document.getElementById('bannerTotalTokens');

  if (result.usage && (result.usage.promptTokens != null || result.usage.completionTokens != null)) {
    const promptCount = (result.usage.promptTokens || 0).toLocaleString();
    const compCount = (result.usage.completionTokens || 0).toLocaleString();
    const totalCount = (result.usage.totalTokens || 0).toLocaleString();

    if (promptEl) promptEl.textContent = promptCount;
    if (compEl) compEl.textContent = compCount;
    if (totalEl) totalEl.textContent = totalCount;
    if (tokensContainer) tokensContainer.classList.remove('hidden');

    if (bannerPrompt) bannerPrompt.textContent = promptCount;
    if (bannerComp) bannerComp.textContent = compCount;
    if (bannerTotal) bannerTotal.textContent = totalCount;
    if (textBanner) textBanner.classList.remove('hidden');
  } else {
    if (tokensContainer) tokensContainer.classList.add('hidden');
    if (textBanner) textBanner.classList.add('hidden');
  }

  elements.scorecardBar.classList.remove('hidden');

  // Full Text tab
  elements.rawTextContent.textContent = result.text || '(No text detected on this page)';

  // Lines Inspector tab
  elements.linesContainer.innerHTML = '';
  const lines = result.lines || [];
  elements.tabLinesCount.textContent = lines.length;

  lines.forEach((line) => {
    const row = document.createElement('div');
    row.className = 'line-row';
    const conf = line.confidence !== undefined ? Math.round(line.confidence * 100) : 100;
    const badgeClass = conf >= 80 ? 'badge-conf-high' : 'badge-conf-med';

    row.innerHTML = `
      <div class="line-text">${escapeHtml(line.text)}</div>
      <span class="${badgeClass}">${conf}%</span>
    `;
    elements.linesContainer.appendChild(row);
  });

  // Show tabs and hide notices
  elements.inspectorTabs.classList.remove('hidden');
  elements.initialStateNotice.classList.add('hidden');
  elements.readyNotice.classList.add('hidden');
  elements.runningNotice.classList.add('hidden');

  switchTab(state.activeTab);
}

function clearOCRResults() {
  state.ocrResult = null;
  elements.scorecardBar.classList.add('hidden');
  const tokensContainer = elements.scoreTokensContainer || document.getElementById('scoreTokensContainer');
  const textBanner = elements.textTokensBanner || document.getElementById('textTokensBanner');
  if (tokensContainer) tokensContainer.classList.add('hidden');
  if (textBanner) textBanner.classList.add('hidden');
  elements.inspectorTabs.classList.add('hidden');
  elements.fullTextContainer.classList.add('hidden');
  elements.linesContainer.classList.add('hidden');
  if (state.pdfDoc) {
    showReadyNotice();
  }
}

function switchTab(tabName) {
  state.activeTab = tabName;
  if (tabName === 'text') {
    elements.tabText.classList.add('active');
    elements.tabLines.classList.remove('active');
    elements.fullTextContainer.classList.remove('hidden');
    elements.linesContainer.classList.add('hidden');
  } else {
    elements.tabText.classList.remove('active');
    elements.tabLines.classList.add('active');
    elements.fullTextContainer.classList.add('hidden');
    elements.linesContainer.classList.remove('hidden');
  }
}

function showReadyNotice() {
  elements.initialStateNotice.classList.add('hidden');
  elements.runningNotice.classList.add('hidden');
  elements.readyNotice.classList.remove('hidden');
}

function showRunningNotice() {
  const currentEng = state.engines.find((e) => e.id === state.selectedEngine);
  let title = `Executing ${currentEng ? currentEng.name : 'OCR'}...`;
  if (state.selectedEngine === 'openai') {
    const modelLabels = {
      'gpt-5.4-mini': 'GPT-5.4-mini',
      'gpt-5-mini': 'GPT-5-mini',
      'gpt-4o-mini': 'GPT-4o-mini',
    };
    const modelLabel = modelLabels[state.selectedOpenaiModel] || state.selectedOpenaiModel;
    title = `Executing OpenAI (${modelLabel})...`;
  }
  elements.runningNoticeTitle.textContent = title;
  elements.initialStateNotice.classList.add('hidden');
  elements.readyNotice.classList.add('hidden');
  elements.fullTextContainer.classList.add('hidden');
  elements.linesContainer.classList.add('hidden');
  elements.runningNotice.classList.remove('hidden');
}

function showError(msg) {
  if (msg) {
    elements.errorText.textContent = msg;
    elements.errorBanner.classList.remove('hidden');
  } else {
    elements.errorBanner.classList.add('hidden');
  }
}

// Copy to Clipboard
function copyResultsToClipboard() {
  if (!state.ocrResult?.text) return;
  navigator.clipboard.writeText(state.ocrResult.text).then(() => {
    elements.copyIcon.classList.add('hidden');
    elements.copiedIcon.classList.remove('hidden');
    setTimeout(() => {
      elements.copyIcon.classList.remove('hidden');
      elements.copiedIcon.classList.add('hidden');
    }, 2000);
  });
}

// Download Results
function downloadResultsAsText() {
  if (!state.ocrResult?.text) return;
  const blob = new Blob([state.ocrResult.text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ocr_page_${state.currentPage}_${state.selectedEngine}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', initApp);
