import json
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from server.engines.openai_vision_upsc import UPSCAnswerOCRResponse, run_openai_vision_upsc
from server.engines.registry import ENGINES, execute_ocr
from server.main import app

client = TestClient(app)


def test_upsc_pydantic_schema():
    # Valid instance
    data = {
        "question_text": "Examine the role of self-help groups in rural development.",
        "question_marks": "15 Marks",
        "full_markdown_text": "### Introduction\nSelf-help groups (SHGs) play a pivotal role.\n\n### Impact\n- Financial inclusion\n- Women empowerment\n\n| Indicator | Impact |\n| --- | --- |\n| Savings | Increased by 40% |\n\n### Conclusion\nThus, SHGs are the cornerstone of grassroots development.",
        "detected_intro": "Self-help groups (SHGs) play a pivotal role.",
        "detected_conclusion": "Thus, SHGs are the cornerstone of grassroots development.",
        "estimated_word_count": 185,
        "legibility_status": "CLEAR",
    }
    model = UPSCAnswerOCRResponse(**data)
    assert model.question_marks == "15 Marks"
    assert model.estimated_word_count == 185
    assert model.legibility_status == "CLEAR"
    assert "| Indicator | Impact |" in model.full_markdown_text

    # Default empty strings for missing intro / conclusion / question
    minimal = UPSCAnswerOCRResponse(
        full_markdown_text="Only body points\n- Point 1\n- Point 2",
        estimated_word_count=50,
        legibility_status="AVERAGE",
    )
    assert minimal.question_text == ""
    assert minimal.question_marks is None
    assert minimal.detected_intro == ""
    assert minimal.detected_conclusion == ""
    assert minimal.legibility_status == "AVERAGE"

    # Invalid legibility status should fail validation
    with pytest.raises(Exception):
        UPSCAnswerOCRResponse(
            full_markdown_text="Some text",
            estimated_word_count=10,
            legibility_status="SUPERB",  # Not in CLEAR, AVERAGE, POOR
        )


def test_openai_vision_upsc_missing_key(tmp_path):
    fake_img = tmp_path / "page.png"
    fake_img.write_bytes(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4")

    with patch.dict(os.environ, {"OPENAI_API_KEY": ""}, clear=True):
        with pytest.raises(RuntimeError, match="OPENAI_API_KEY environment variable is not set"):
            run_openai_vision_upsc(str(fake_img))


def test_openai_vision_upsc_single_page(tmp_path):
    fake_img = tmp_path / "page1.png"
    fake_img.write_bytes(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4")

    mock_parsed = UPSCAnswerOCRResponse(
        question_text="Discuss the impacts of climate change on Indian monsoon.",
        question_marks="10 Marks",
        full_markdown_text="### Climate Impact\n- Shifting rain patterns\n- Extreme weather events",
        detected_intro="Climate change has noticeably altered precipitation patterns across India.",
        detected_conclusion="Proactive climate resilience strategies are essential.",
        estimated_word_count=140,
        legibility_status="CLEAR",
    )

    mock_choice = MagicMock()
    mock_choice.message.parsed = mock_parsed
    mock_choice.message.refusal = None
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    mock_usage = MagicMock()
    mock_usage.prompt_tokens = 950
    mock_usage.completion_tokens = 110
    mock_usage.total_tokens = 1060
    mock_response.usage = mock_usage

    with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test-mock-key"}):
        with patch("openai.OpenAI") as mock_openai_cls:
            mock_client = MagicMock()
            mock_openai_cls.return_value = mock_client
            mock_client.beta.chat.completions.parse.return_value = mock_response

            res = run_openai_vision_upsc(str(fake_img), {"model": "gpt-5.4-mini"})

            assert res["engine"] == "openai_vision_upsc"
            assert res["model"] == "gpt-5.4-mini"
            assert res["wordCount"] == 140
            assert "upscData" in res
            assert res["upscData"]["question_marks"] == "10 Marks"
            assert res["upscData"]["legibility_status"] == "CLEAR"
            assert res["pagesProcessed"] == 1
            assert res["usage"]["totalTokens"] == 1060

            # Verify prompt arguments passed to client.beta.chat.completions.parse
            call_kwargs = mock_client.beta.chat.completions.parse.call_args.kwargs
            assert call_kwargs["model"] == "gpt-5.4-mini"
            assert call_kwargs["response_format"] == UPSCAnswerOCRResponse
            assert call_kwargs["temperature"] == 0.0


def test_openai_vision_upsc_multi_page(tmp_path):
    img1 = tmp_path / "page_1.png"
    img2 = tmp_path / "page_2.png"
    img1.write_bytes(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4")
    img2.write_bytes(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4")

    mock_parsed = UPSCAnswerOCRResponse(
        question_text="Critically analyze the role of Governor in center-state relations.",
        question_marks="15 Marks",
        full_markdown_text="### Introduction\nArticle 153 provides for Governor.\n\n### Discretionary Powers\n1. Article 356 report\n2. Reservation of bills\n\nFlowchart: Governor Decision -> President Assent -> Review\n\n### Conclusion\nSarkaria Commission recommendations must be adopted.",
        detected_intro="Article 153 provides for Governor.",
        detected_conclusion="Sarkaria Commission recommendations must be adopted.",
        estimated_word_count=230,
        legibility_status="AVERAGE",
    )

    mock_choice = MagicMock()
    mock_choice.message.parsed = mock_parsed
    mock_choice.message.refusal = None
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    mock_response.usage = None

    with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test-mock-key"}):
        with patch("openai.OpenAI") as mock_openai_cls:
            mock_client = MagicMock()
            mock_openai_cls.return_value = mock_client
            mock_client.beta.chat.completions.parse.return_value = mock_response

            res = run_openai_vision_upsc([str(img1), str(img2)], {"model": "gpt-5-mini"})

            assert res["pagesProcessed"] == 2
            assert res["upscData"]["question_text"].startswith("Critically analyze")
            assert res["upscData"]["legibility_status"] == "AVERAGE"
            assert "Flowchart: Governor Decision" in res["text"]

            # Verify that both images were encoded into the message content
            call_kwargs = mock_client.beta.chat.completions.parse.call_args.kwargs
            user_msg = next(m for m in call_kwargs["messages"] if m["role"] == "user")
            img_items = [item for item in user_msg["content"] if item.get("type") == "image_url"]
            assert len(img_items) == 2


def test_registry_contains_openai_upsc():
    upsc_engine = next((e for e in ENGINES if e["id"] == "openai_vision_upsc"), None)
    assert upsc_engine is not None
    assert upsc_engine["name"] == "OpenAI UPSC Vision"
    assert upsc_engine["defaultModel"] == "gpt-5.4-mini"
    model_ids = [m["id"] for m in upsc_engine["models"]]
    assert "gpt-5.4-mini" in model_ids
    assert "gpt-5-mini" in model_ids
    assert "gpt-4o-mini" in model_ids
    assert "gpt-4o" in model_ids


def test_api_multi_pages_endpoint():
    fake_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"

    mock_result = {
        "text": "Transcribed multi-page answer text",
        "lines": [{"text": "Transcribed multi-page answer text", "confidence": 0.99}],
        "latencyMs": 1450.5,
        "engine": "openai_vision_upsc",
        "engineName": "OpenAI UPSC (GPT-5.4-mini)",
        "model": "gpt-5.4-mini",
        "wordCount": 210,
        "charCount": 34,
        "pagesProcessed": 2,
        "upscData": {
            "question_text": "Examine the significance of wetlands.",
            "question_marks": "10",
            "full_markdown_text": "Transcribed multi-page answer text",
            "detected_intro": "Wetlands are vital ecosystems.",
            "detected_conclusion": "Ramsar sites must be protected.",
            "estimated_word_count": 210,
            "legibility_status": "CLEAR",
        },
        "usage": {"promptTokens": 1200, "completionTokens": 90, "totalTokens": 1290},
    }

    with patch("server.main.execute_ocr", return_value=mock_result) as mock_exec:
        response = client.post(
            "/api/ocr-multi-pages",
            files=[
                ("images", ("page_1.png", fake_png, "image/png")),
                ("images", ("page_2.png", fake_png, "image/png")),
            ],
            data={
                "engineId": "openai_vision_upsc",
                "pageNumbers": json.dumps([1, 2]),
                "options": json.dumps({"model": "gpt-5.4-mini"}),
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["engine"] == "openai_vision_upsc"
        assert data["pageCount"] == 2
        assert data["pageNumbers"] == [1, 2]
        assert "upscData" in data
        assert data["upscData"]["question_marks"] == "10"
        assert data["upscData"]["legibility_status"] == "CLEAR"
        assert data["usage"]["totalTokens"] == 1290
        assert mock_exec.called


def test_execute_ocr_single_and_multi_page_list():
    # 1. Single item list should unwrap and call engine with single string
    with patch("server.engines.registry.run_apple_vision_ocr") as mock_apple:
        mock_apple.return_value = {
            "text": "Page 1 Text",
            "lines": [{"text": "Page 1 Text"}],
            "latencyMs": 12.0,
            "engine": "apple_vision",
            "engineName": "Apple Vision OCR (macOS Native)",
        }
        res = execute_ocr("apple_vision", ["/tmp/page1.png"])
        assert res["text"] == "Page 1 Text"
        mock_apple.assert_called_once_with("/tmp/page1.png")

    # 2. Multi-item list should run sequentially and combine texts
    with patch("server.engines.registry.run_apple_vision_ocr") as mock_apple:
        mock_apple.side_effect = [
            {"text": "Page 1 Content", "lines": [{"text": "Page 1 Content"}], "latencyMs": 10.0, "engine": "apple_vision", "engineName": "Apple Vision OCR"},
            {"text": "Page 2 Content", "lines": [{"text": "Page 2 Content"}], "latencyMs": 15.0, "engine": "apple_vision", "engineName": "Apple Vision OCR"},
        ]
        res = execute_ocr("apple_vision", ["/tmp/page1.png", "/tmp/page2.png"])
        assert "--- Page 1 ---\nPage 1 Content" in res["text"]
        assert "--- Page 2 ---\nPage 2 Content" in res["text"]
        assert res["pagesProcessed"] == 2
        assert res["latencyMs"] == 25.0
        assert len(res["lines"]) == 2
        assert mock_apple.call_count == 2


def test_api_upsc_ocr_with_images():
    fake_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
    mock_res = {
        "text": "Answer text",
        "lines": [],
        "latencyMs": 400.0,
        "engine": "openai_vision_upsc",
        "engineName": "OpenAI UPSC Vision",
        "wordCount": 150,
        "charCount": 900,
        "upscData": {
            "question_text": "Examine the role of Speaker.",
            "question_marks": "15 Marks",
            "full_markdown_text": "Answer text",
            "detected_intro": "Speaker is the presiding officer.",
            "detected_conclusion": "Impartiality is key.",
            "estimated_word_count": 150,
            "legibility_status": "CLEAR",
        },
        "usage": {"totalTokens": 1100},
    }

    with patch("server.main.execute_ocr", return_value=mock_res) as mock_exec:
        resp = client.post(
            "/api/upsc-ocr",
            files=[
                ("images", ("p1.png", fake_png, "image/png")),
                ("images", ("p2.png", fake_png, "image/png")),
            ],
            data={"model": "gpt-5.4-mini"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["engine"] == "openai_vision_upsc"
        assert data["pageCount"] == 2
        assert data["data"]["question_text"] == "Examine the role of Speaker."
        assert data["data"]["legibility_status"] == "CLEAR"
        assert data["usage"]["totalTokens"] == 1100
        assert mock_exec.called


def test_api_upsc_ocr_missing_input():
    resp = client.post("/api/upsc-ocr", data={"model": "gpt-5.4-mini"})
    assert resp.status_code == 400
    assert "Must provide either" in resp.json()["detail"]


def test_api_upsc_ocr_with_pdf():
    # Use existing sample PDF
    from server.main import SAMPLE_PDF_PATH
    assert SAMPLE_PDF_PATH.exists()

    mock_res = {
        "text": "Answer text from PDF",
        "lines": [],
        "latencyMs": 550.0,
        "engine": "openai_vision_upsc",
        "engineName": "OpenAI UPSC Vision",
        "wordCount": 180,
        "charCount": 1100,
        "upscData": {
            "question_text": "Examine the role of Speaker.",
            "question_marks": "15 Marks",
            "full_markdown_text": "Answer text from PDF",
            "detected_intro": "Speaker is the presiding officer.",
            "detected_conclusion": "Impartiality is key.",
            "estimated_word_count": 180,
            "legibility_status": "CLEAR",
        },
        "usage": {"totalTokens": 1400},
    }

    with patch("server.main.execute_ocr", return_value=mock_res) as mock_exec:
        with open(SAMPLE_PDF_PATH, "rb") as f:
            resp = client.post(
                "/api/upsc-ocr",
                files={"pdf": ("sample.pdf", f, "application/pdf")},
                data={"model": "gpt-5.4-mini", "fromPage": 1, "toPage": 1},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["engine"] == "openai_vision_upsc"
        assert data["pageCount"] == 1
        assert data["data"]["question_text"] == "Examine the role of Speaker."
        assert mock_exec.called
