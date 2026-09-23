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
    assert "paddleocr_vl" in engine_ids
    assert "openai" in engine_ids
    assert "ollama" in engine_ids

    openai_engine = next(e for e in data["engines"] if e["id"] == "openai")
    model_ids = [m["id"] for m in openai_engine["models"]]
    assert "gpt-5.4-mini" in model_ids
    assert "gpt-5-mini" in model_ids
    assert openai_engine["defaultModel"] == "gpt-5.4-mini"


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


def test_openai_ocr_missing_key():
    import os
    from unittest.mock import patch

    with patch.dict(os.environ, {"OPENAI_API_KEY": ""}, clear=True):
        sample_res = client.post("/api/sample")
        doc_id = sample_res.json()["document"]["id"]
        page_img_res = client.get(f"/api/documents/{doc_id}/pages/1")
        img_bytes = page_img_res.content

        response = client.post(
            "/api/ocr-page-image",
            files={"image": ("page_1.png", img_bytes, "image/png")},
            data={"engineId": "openai", "pageNumber": "1"},
        )
        assert response.status_code == 500
        assert "OPENAI_API_KEY environment variable is not set" in response.json()["detail"]


def test_openai_ocr_with_models():
    import json
    import os
    from unittest.mock import MagicMock, patch

    mock_response = MagicMock()
    mock_choice = MagicMock()
    mock_choice.message.content = "INVOICE #1024\nTOTAL DUE: $1,250.00"
    mock_response.choices = [mock_choice]
    mock_usage = MagicMock()
    mock_usage.prompt_tokens = 1120
    mock_usage.completion_tokens = 38
    mock_usage.total_tokens = 1158
    mock_response.usage = mock_usage

    sample_res = client.post("/api/sample")
    doc_id = sample_res.json()["document"]["id"]
    page_img_res = client.get(f"/api/documents/{doc_id}/pages/1")
    img_bytes = page_img_res.content

    with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test-key-12345"}):
        with patch("openai.OpenAI") as mock_openai_cls:
            mock_client_instance = MagicMock()
            mock_openai_cls.return_value = mock_client_instance
            mock_client_instance.chat.completions.create.return_value = mock_response

            # 1. Test with GPT-5.4-mini
            response_gpt5_4 = client.post(
                "/api/ocr-page-image",
                files={"image": ("page_1.png", img_bytes, "image/png")},
                data={
                    "engineId": "openai",
                    "pageNumber": "1",
                    "options": json.dumps({"model": "gpt-5.4-mini"}),
                },
            )
            assert response_gpt5_4.status_code == 200
            data_gpt5_4 = response_gpt5_4.json()
            assert data_gpt5_4["success"] is True
            assert data_gpt5_4["engine"] == "openai"
            assert "GPT-5.4-mini" in data_gpt5_4["engineName"]
            assert "INVOICE #1024" in data_gpt5_4["text"]
            assert len(data_gpt5_4["lines"]) == 2
            assert "usage" in data_gpt5_4
            assert data_gpt5_4["usage"]["promptTokens"] == 1120
            assert data_gpt5_4["usage"]["completionTokens"] == 38
            assert data_gpt5_4["usage"]["totalTokens"] == 1158

            # Check that create was called with model="gpt-5.4-mini"
            call_kwargs = mock_client_instance.chat.completions.create.call_args.kwargs
            assert call_kwargs["model"] == "gpt-5.4-mini"

            # 2. Test with GPT-5-mini
            response_gpt5 = client.post(
                "/api/ocr-page-image",
                files={"image": ("page_1.png", img_bytes, "image/png")},
                data={
                    "engineId": "openai",
                    "pageNumber": "1",
                    "options": json.dumps({"model": "gpt-5-mini"}),
                },
            )
            assert response_gpt5.status_code == 200
            data_gpt5 = response_gpt5.json()
            assert data_gpt5["success"] is True
            assert "GPT-5-mini" in data_gpt5["engineName"]

            call_kwargs = mock_client_instance.chat.completions.create.call_args.kwargs
            assert call_kwargs["model"] == "gpt-5-mini"

