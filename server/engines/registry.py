from typing import Any, Dict, List, Optional, Union

from .apple_vision import run_apple_vision_ocr
from .tesseract import run_tesseract_ocr
from .florence_2 import run_florence_ocr
from .openai_vision import run_openai_ocr
from .openai_vision_upsc import run_openai_vision_upsc
from .ollama import run_ollama_ocr, run_paddleocr_ollama, OLLAMA_VISION_MODELS

ENGINES = [
    {
        "id": "apple_vision",
        "name": "Apple Vision OCR",
        "badge": "macOS Native / Neural Engine",
        "description": "Hardware-accelerated text recognition using Apple Silicon Neural Engine.",
        "available": True,
    },
    {
        "id": "tesseract",
        "name": "Tesseract OCR",
        "badge": "v5.5.1 Local",
        "description": "Standard open-source OCR engine running locally via Homebrew.",
        "available": True,
    },
    {
        "id": "florence_2",
        "name": "Microsoft Florence-2",
        "badge": "VLM / Apple MPS GPU",
        "description": "Vision foundation model running locally on Apple Silicon GPU for grounded OCR & scene text.",
        "available": True,
    },
    {
        "id": "paddleocr_vl",
        "name": "PaddleOCR-VL 1.6",
        "badge": "0.9B VLM / Ollama Metal",
        "description": "State-of-the-art 0.9B document parsing VLM running locally via Ollama with full Apple Silicon GPU acceleration.",
        "available": True,
        "models": [
            {"id": "paddleocr-vl:1.6", "name": "PaddleOCR-VL 1.6 (GGUF)"},
        ],
        "defaultModel": "paddleocr-vl:1.6",
    },
    {
        "id": "openai_vision_upsc",
        "name": "OpenAI UPSC Vision",
        "badge": "UPSC Structured / Multi-Page",
        "description": "Specialized UPSC handwritten copy transcriber: extracts question, marks, verbatim answer in Markdown, tables/flowcharts, intro, conclusion, and handwriting legibility across single or multiple pages.",
        "available": True,
        "models": [
            {"id": "gpt-5.4-mini", "name": "GPT-5.4-mini"},
            {"id": "gpt-5-mini", "name": "GPT-5-mini"},
            {"id": "gpt-4o-mini", "name": "GPT-4o-mini (Fallback)"},
            {"id": "gpt-4o", "name": "GPT-4o"},
        ],
        "defaultModel": "gpt-5.4-mini",
    },
    {
        "id": "openai",
        "name": "OpenAI Vision",
        "badge": "Cloud / Multimodal LLM",
        "description": "Cloud-based multimodal OCR powered by OpenAI GPT vision models.",
        "available": True,
        "models": [
            {"id": "gpt-5.4-mini", "name": "GPT-5.4-mini"},
            {"id": "gpt-5-mini", "name": "GPT-5-mini"},
            {"id": "gpt-4o-mini", "name": "GPT-4o-mini (Fallback)"},
        ],
        "defaultModel": "gpt-5.4-mini",
    },
    {
        "id": "ollama",
        "name": "Ollama Vision",
        "badge": "Local / Multimodal LLM",
        "description": "Local vision-language text recognition running via Ollama (qwen3-vl:8b, paddleocr-vl).",
        "available": True,
        "models": OLLAMA_VISION_MODELS,
        "defaultModel": "paddleocr-vl:1.6",
    },
]


def execute_ocr(engine_id: str, image_path: Union[str, List[str]], options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if options is None:
        options = {}

    # Handle multi-page inputs
    if isinstance(image_path, (list, tuple)):
        if engine_id == "openai_vision_upsc":
            return run_openai_vision_upsc(image_path, options)

        if len(image_path) == 1:
            return execute_ocr(engine_id, image_path[0], options)

        if len(image_path) == 0:
            raise ValueError("No image paths provided for OCR.")

        # Aggregate sequential multi-page results for engines that take single images
        combined_texts = []
        combined_lines = []
        total_latency = 0.0
        total_prompt_tokens = 0
        total_completion_tokens = 0
        has_usage = False
        engine_name = ""
        model = None

        for idx, p in enumerate(image_path, 1):
            sub_res = execute_ocr(engine_id, p, options)
            engine_name = sub_res.get("engineName", engine_name)
            model = sub_res.get("model", model)
            total_latency += sub_res.get("latencyMs", 0.0)

            page_text = sub_res.get("text", "")
            if page_text:
                combined_texts.append(f"--- Page {idx} ---\n{page_text}")

            for line in sub_res.get("lines", []):
                combined_lines.append(line)

            if "usage" in sub_res and isinstance(sub_res["usage"], dict):
                has_usage = True
                total_prompt_tokens += sub_res["usage"].get("promptTokens", 0)
                total_completion_tokens += sub_res["usage"].get("completionTokens", 0)

        aggregated_text = "\n\n".join(combined_texts)
        res = {
            "text": aggregated_text,
            "lines": combined_lines,
            "latencyMs": round(total_latency, 1),
            "engine": engine_id,
            "engineName": engine_name,
            "wordCount": len(aggregated_text.strip().split()) if aggregated_text.strip() else 0,
            "charCount": len(aggregated_text),
            "pagesProcessed": len(image_path),
        }
        if model:
            res["model"] = model
        if has_usage:
            res["usage"] = {
                "promptTokens": total_prompt_tokens,
                "completionTokens": total_completion_tokens,
                "totalTokens": total_prompt_tokens + total_completion_tokens,
            }
        return res

    # Single-image execution
    if engine_id == "apple_vision":
        return run_apple_vision_ocr(image_path)
    elif engine_id == "tesseract":
        return run_tesseract_ocr(image_path, options)
    elif engine_id == "florence_2":
        return run_florence_ocr(image_path, options)
    elif engine_id == "paddleocr_vl":
        return run_paddleocr_ollama(image_path, options)
    elif engine_id == "openai":
        return run_openai_ocr(image_path, options)
    elif engine_id == "openai_vision_upsc":
        return run_openai_vision_upsc(image_path, options)
    elif engine_id == "ollama":
        return run_ollama_ocr(image_path, options)
    else:
        raise ValueError(f"Unknown or unsupported OCR engine: {engine_id}")


