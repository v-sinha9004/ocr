import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from fastapi.testclient import TestClient
from server.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "timestamp" in data


def test_index_html_served():
    response = client.get("/")
    assert response.status_code == 200
    assert "OCR Evaluation &amp; PDF Platform" in response.text or "OCR Evaluation" in response.text
    assert "PDF.js" in response.text or "pdf.min.js" in response.text


def test_engines_endpoint():
    response = client.get("/api/engines")
    assert response.status_code == 200
    data = response.json()
    assert "engines" in data
    engine_ids = [e["id"] for e in data["engines"]]
    assert "apple_vision" in engine_ids
    assert "tesseract" in engine_ids
    assert "florence_2" in engine_ids


def test_sample_pdf_stream():
    response = client.get("/api/sample-pdf")
    assert response.status_code == 200
    assert response.headers.get("content-type") == "application/pdf"
    assert len(response.content) > 1000


def test_sample_processing_and_document_pages():
    response = client.post("/api/sample")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    doc = data["document"]
    assert doc["pageCount"] >= 1
    doc_id = doc["id"]

    # Verify document metadata endpoint
    doc_meta_res = client.get(f"/api/documents/{doc_id}")
    assert doc_meta_res.status_code == 200
    assert doc_meta_res.json()["document"]["id"] == doc_id

    # Verify page 1 image endpoint
    page1_res = client.get(f"/api/documents/{doc_id}/pages/1")
    assert page1_res.status_code == 200
    assert page1_res.headers.get("content-type") == "image/png"


def test_ocr_page_image_upload():
    # Use the sample page image generated above
    sample_res = client.post("/api/sample")
    doc_id = sample_res.json()["document"]["id"]
    page_img_res = client.get(f"/api/documents/{doc_id}/pages/1")
    img_bytes = page_img_res.content

    # Test Apple Vision OCR on image upload
    response = client.post(
        "/api/ocr-page-image",
        files={"image": ("page_1.png", img_bytes, "image/png")},
        data={"engineId": "apple_vision", "pageNumber": "1"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["engine"] == "apple_vision"
    assert len(data["text"]) > 0
    assert data["latencyMs"] >= 0

    # Test Tesseract OCR on image upload
    tess_response = client.post(
        "/api/ocr-page-image",
        files={"image": ("page_1.png", img_bytes, "image/png")},
        data={"engineId": "tesseract", "pageNumber": "1"},
    )
    assert tess_response.status_code == 200
    tess_data = tess_response.json()
    assert tess_data["success"] is True
    assert tess_data["engine"] == "tesseract"
    assert len(tess_data["text"]) > 0

    # Test Microsoft Florence-2 OCR on image upload
    florence_response = client.post(
        "/api/ocr-page-image",
        files={"image": ("page_1.png", img_bytes, "image/png")},
        data={"engineId": "florence_2", "pageNumber": "1"},
    )
    assert florence_response.status_code == 200
    florence_data = florence_response.json()
    assert florence_data["success"] is True
    assert florence_data["engine"] == "florence_2"
    assert len(florence_data["text"]) > 0
    assert "FINANCIAL" in florence_data["text"]
