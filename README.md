# OCR Evaluation & PDF Viewing Platform

A high-performance web platform for previewing PDF documents, executing multi-engine OCR (Optical Character Recognition), and benchmarking recognition speed, accuracy, and bounding boxes across different OCR engines.

Built with **FastAPI** and a self-contained, responsive single-page web interface with zero frontend build dependencies.

---

## ⚡ Highlights

- **Triple OCR Engine Support**:
  - **Apple Vision OCR**: Hardware-accelerated native text recognition utilizing Apple Silicon's Neural Engine via a custom Swift binary. Provides bounding box coordinates, confidence scores, and sub-second inference.
  - **Tesseract OCR (v5.5.1)**: Local standard open-source OCR engine running via Homebrew with configurable page segmentation (PSM) and language models.
  - **Microsoft Florence-2**: Advanced 230M-parameter vision-language foundation model running locally on Apple Silicon GPU (`mps`) via PyTorch. Supports grounded OCR with normalized bounding box coordinates and scene text parsing.
- **In-Browser High-Fidelity PDF Viewer**: Client-side rendering powered by `PDF.js` with multi-page thumbnail navigation, smooth zoom (50%–250%), fit reset, and drag-and-drop file upload.
- **Instant Pre-loaded Sample**: One-click sample financial document loading for immediate testing without needing to find and upload files.
- **Real-Time Performance Scorecard**: Side-by-side metric tracking of latency (ms), word count, character count, and detected line count.
- **Interactive Results Inspector**: Switch seamlessly between formatted raw text view and structured line-by-line confidence inspectors.
- **Export & Clipboard**: Copy extracted text with one click or download results as `.txt`.
- **Zero Frontend Build Step**: Self-contained modern HTML5/CSS3/ES6 single-page app served directly by FastAPI. No React or Node.js compilation required!
- **Fast Package Management with `uv`**: Ultra-fast environment provisioning and script execution.

---

## 🏗️ Architecture

```
                    ┌────────────────────────────────────────────────────────┐
                    │            FastAPI Server (:3050) & Static UI          │
                    │   • Single-Page Modern UI (HTML5 / Vanilla JS / CSS)   │
                    │   • In-Browser PDF.js Canvas Rendering & Export        │
                    │   • Multipart Image & PDF Processing Endpoints         │
                    └──────────┬──────────────────┬─────────────────┬────────┘
                               │                  │                 │
              ┌────────────────┴──────┐    ┌──────┴──────────┐   ┌──┴───────────────┐
              ▼                       ▼    ▼                 ▼   ▼                  ▼
      ┌───────────────┐      ┌─────────────────┐   ┌─────────────────┐  ┌─────────────────┐
      │ Apple Vision  │      │  Tesseract OCR  │   │   Florence-2    │  │ Poppler Utility │
      │  Swift CLI    │      │  (CLI v5.5.1)   │   │  (PyTorch MPS)  │  │(pdfinfo/pdftoppm│
      └───────────────┘      └─────────────────┘   └─────────────────┘  └─────────────────┘
```

---

## 📋 Prerequisites

- **macOS** with Apple Silicon (M1/M2/M3/M4) recommended for Apple Vision OCR.
- **Xcode Command Line Tools** (for compiling native Swift tool):
  ```bash
  xcode-select --install
  ```
- **uv** (fast Python package and project manager):
  ```bash
  curl -LsSf https://astral.sh/uv/install.sh | sh
  # or: brew install uv
  ```
- **Tesseract OCR**:
  ```bash
  brew install tesseract
  ```
- **Poppler** (for PDF rendering & inspection utilities):
  ```bash
  brew install poppler
  ```

---

## 🚀 Quick Start

### 1. Setup Virtual Environment & Dependencies with `uv`

```bash
cd ocr

# Sync dependencies using uv
uv sync
# or: uv pip install -r requirements.txt
```

### 2. Build the Native Apple Vision Tool (Optional)

A precompiled Mach-O binary is included at `tools/apple_vision_ocr`. If rebuilding:

```bash
swiftc -O tools/apple_vision_ocr.swift -o tools/apple_vision_ocr -framework Vision -framework AppKit
```

### 3. Start the Server

```bash
# Using uv directly:
uv run uvicorn server.main:app --host 0.0.0.0 --port 3050 --reload

# Or using npm script:
npm run server
```

Open [http://localhost:3050](http://localhost:3050) in your browser.

---

## 📜 Available Scripts

| Command | Description |
| :--- | :--- |
| `uv run uvicorn server.main:app --port 3050 --reload` | Starts the FastAPI server on port 3050 with hot-reload |
| `npm run server` | Shortcut to run the FastAPI development server |
| `uv run python tests/test_ocr.py` | Runs end-to-end OCR benchmark comparing Apple Vision vs. Tesseract |
| `npm test` | Shortcut to run the benchmark test suite |
| `uv run pytest tests/test_api.py` | Runs automated FastAPI endpoint integration tests |
| `npm run test:api` | Shortcut to run the API integration tests |

---

## 📡 API Reference

The backend API runs on `http://localhost:3050`:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | Serves the single-page web application (`index.html`) |
| `GET` | `/api/engines` | Returns list of configured OCR engines and their availability |
| `POST` | `/api/ocr-page-image` | Uploads a single page image (PNG/JPEG) and runs specified OCR engine |
| `POST` | `/api/upload` | Uploads a complete PDF and converts pages to PNG via Poppler |
| `POST` | `/api/sample` | Copies sample financial PDF into uploads and processes pages |
| `GET` | `/api/sample-pdf` | Directly streams the bundled sample PDF file for client PDF.js rendering |
| `GET` | `/api/documents/{id}` | Returns metadata for a processed document |
| `GET` | `/api/documents/{id}/pages/{num}` | Returns the rendered page PNG for a given document |
| `POST` | `/api/ocr` | Executes OCR on a previously uploaded document's page image |
| `GET` | `/api/health` | Health check endpoint returning server status and timestamp |

---

## 🧪 Testing & Benchmarks

Run the built-in OCR benchmark test suite:

```bash
uv run python tests/test_ocr.py
```

This test:
1. Synthesizes a valid multi-line sample invoice PDF (`test_doc.pdf`).
2. Renders pages using `pdftoppm`.
3. Runs both **Apple Vision OCR** and **Tesseract OCR**.
4. Prints an execution scorecard comparing latency (ms), detected lines, and word counts.

To run full API endpoint tests:

```bash
uv run pytest tests/test_api.py
```

---

## 📂 Project Structure

```text
ocr/
├── data/
│   ├── sample_document.pdf          # Bundled financial document for quick tests
│   └── documents/                   # Cached/rendered documents directory
├── server/                          # FastAPI application
│   ├── engines/
│   │   ├── apple_vision.py          # Apple Vision CLI execution wrapper
│   │   ├── registry.py              # Supported OCR engine registry
│   │   └── tesseract.py             # Tesseract CLI execution wrapper
│   ├── services/
│   │   └── pdf_service.py           # Poppler (pdfinfo / pdftoppm) PDF processor
│   ├── static/                      # Self-contained frontend web app
│   │   ├── index.html               # Main single-page application markup
│   │   ├── style.css                # Modern dark-mode styling
│   │   └── app.js                   # PDF.js loader, canvas renderer, and OCR runner
│   └── main.py                      # FastAPI application entrypoint
├── tests/
│   ├── test_api.py                  # API endpoint integration tests
│   └── test_ocr.py                  # Multi-engine OCR benchmark test
├── tools/
│   ├── apple_vision_ocr.swift       # Swift source code for Apple Vision OCR CLI
│   └── apple_vision_ocr             # Compiled native Mach-O executable
├── pyproject.toml                   # Project metadata and uv configuration
├── requirements.txt                 # Python dependencies
└── package.json                     # Root orchestrator scripts
```
