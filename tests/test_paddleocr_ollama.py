import os
import sys
from pathlib import Path
import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from fastapi.testclient import TestClient
from server.main import app
from server.engines.registry import ENGINES, execute_ocr

client = TestClient(app)


def test_paddleocr_vl_registered_in_engines():
    response = client.get("/api/engines")
    assert response.status_code == 200
    data = response.json()
    assert "engines" in data
    engine_ids = [e["id"] for e in data["engines"]]
    assert "paddleocr_vl" in engine_ids

    paddle_engine = next(e for e in data["engines"] if e["id"] == "paddleocr_vl")
    assert paddle_engine["available"] is True
    assert "0.9B VLM" in paddle_engine["badge"]
    assert "Metal" in paddle_engine["badge"]
    assert paddle_engine["defaultModel"] == "paddleocr-vl:1.6"


def test_paddleocr_vl_in_ollama_engine_models():
    response = client.get("/api/engines")
    assert response.status_code == 200
    data = response.json()
    ollama_engine = next(e for e in data["engines"] if e["id"] == "ollama")
    model_ids = [m["id"] for m in ollama_engine["models"]]
    assert "paddleocr-vl:1.6" in model_ids


def test_paddleocr_vl_ocr_execution():
    images = list(Path(PROJECT_ROOT / "data" / "documents").glob("**/page-1.png"))
    if not images:
        pytest.skip("No sample document page image available for live OCR execution")

    test_image_path = str(images[0])
    result = execute_ocr("paddleocr_vl", test_image_path)

    assert result is not None
    assert result["engine"] == "paddleocr_vl"
    assert "text" in result
    assert len(result["text"]) > 0
    assert "latencyMs" in result
    assert result["latencyMs"] > 0
    assert "lines" in result
    assert isinstance(result["lines"], list)
