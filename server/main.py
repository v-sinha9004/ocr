import asyncio
import datetime
import json
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .engines.registry import ENGINES, execute_ocr
from .services.pdf_service import (
    get_document_meta,
    get_page_image_path,
    process_pdf,
)

import dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
dotenv.load_dotenv(BASE_DIR / ".env")
STATIC_DIR = Path(__file__).resolve().parent / "static"
DATA_DIR = BASE_DIR / "data"
TMP_DIR = DATA_DIR / "tmp"
TMP_DIR.mkdir(parents=True, exist_ok=True)

SAMPLE_PDF_PATH = DATA_DIR / "sample_document.pdf"

app = FastAPI(title="OCR Platform API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static assets
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.api_route("/", methods=["GET", "HEAD"], response_class=FileResponse)
async def serve_index():
    index_path = STATIC_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="Index HTML not found")
    return FileResponse(str(index_path))


@app.get("/api/engines")
async def get_engines():
    return {"engines": ENGINES}


@app.post("/api/upload")
async def upload_pdf(pdf: UploadFile = File(...)):
    if not pdf.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    temp_path = TMP_DIR / f"{int(datetime.datetime.now().timestamp() * 1000)}-{pdf.filename}"
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(pdf.file, buffer)

    try:
        doc_meta = process_pdf(str(temp_path), pdf.filename)
        return {"success": True, "document": doc_meta}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/sample")
async def load_sample():
    if not SAMPLE_PDF_PATH.exists():
        raise HTTPException(status_code=404, detail="Sample PDF not found")

    temp_path = TMP_DIR / f"{int(datetime.datetime.now().timestamp() * 1000)}-sample_document.pdf"
    shutil.copyfile(SAMPLE_PDF_PATH, temp_path)

    try:
        doc_meta = process_pdf(str(temp_path), "sample_financial_summary.pdf")
        return {"success": True, "document": doc_meta}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sample-pdf")
async def get_sample_pdf():
    if not SAMPLE_PDF_PATH.exists():
        raise HTTPException(status_code=404, detail="Sample PDF not found")
    return FileResponse(str(SAMPLE_PDF_PATH), media_type="application/pdf")


@app.get("/api/documents/{doc_id}")
async def get_document(doc_id: str):
    meta = get_document_meta(doc_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"document": meta}


@app.get("/api/documents/{doc_id}/pages/{page_num}")
async def get_page_image(doc_id: str, page_num: int):
    image_path = get_page_image_path(doc_id, page_num)
    if not image_path or not os.path.exists(image_path):
        raise HTTPException(status_code=404, detail="Page image not found")
    return FileResponse(image_path, media_type="image/png")


class OCRRequestBody(BaseModel):
    documentId: str
    pageNumber: int = 1
    engineId: str = "apple_vision"
    options: Optional[Dict[str, Any]] = None


@app.post("/api/ocr")
async def run_document_ocr(body: OCRRequestBody):
    image_path = get_page_image_path(body.documentId, body.pageNumber)
    if not image_path or not os.path.exists(image_path):
        raise HTTPException(
            status_code=404,
            detail=f"Page image for page {body.pageNumber} not found",
        )

    try:
        ocr_result = await asyncio.to_thread(execute_ocr, body.engineId, image_path, body.options or {})
        text = ocr_result.get("text", "")
        words = len(text.strip().split()) if text.strip() else 0
        chars = len(text)

        return {
            "success": True,
            "documentId": body.documentId,
            "pageNumber": int(body.pageNumber),
            "engine": ocr_result.get("engine"),
            "engineName": ocr_result.get("engineName"),
            "text": text,
            "lines": ocr_result.get("lines", []),
            "latencyMs": ocr_result.get("latencyMs", 0),
            "wordCount": words,
            "charCount": chars,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ocr-page-image")
async def run_page_image_ocr(
    image: UploadFile = File(...),
    engineId: str = Form("apple_vision"),
    pageNumber: int = Form(1),
    options: Optional[str] = Form(None),
):
    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(image.filename or "page.png").suffix) as tmp:
        shutil.copyfileobj(image.file, tmp)
        temp_image_path = tmp.name

    parsed_options = {}
    if options:
        try:
            parsed_options = json.loads(options)
        except Exception:
            pass

    try:
        ocr_result = await asyncio.to_thread(execute_ocr, engineId, temp_image_path, parsed_options)
        text = ocr_result.get("text", "")
        words = len(text.strip().split()) if text.strip() else 0
        chars = len(text)

        return {
            "success": True,
            "pageNumber": int(pageNumber),
            "engine": ocr_result.get("engine"),
            "engineName": ocr_result.get("engineName"),
            "text": text,
            "lines": ocr_result.get("lines", []),
            "latencyMs": ocr_result.get("latencyMs", 0),
            "wordCount": words,
            "charCount": chars,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(temp_image_path):
            try:
                os.unlink(temp_image_path)
            except OSError:
                pass


@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 3050))
    uvicorn.run("server.main:app", host="0.0.0.0", port=port, reload=True)
