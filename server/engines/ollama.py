import base64
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import dotenv
import openai

dotenv.load_dotenv()

DEFAULT_OLLAMA_URL = "http://localhost:11434/v1"

MODEL_DISPLAY_NAMES = {
    "paddleocr-vl:1.6": "PaddleOCR-VL 1.6",
    "hf.co/PaddlePaddle/PaddleOCR-VL-1.6-GGUF:latest": "PaddleOCR-VL 1.6",
    "qwen3-vl:8b": "qwen3-vl:8b",
    "llama3.2-vision:11b": "llama3.2-vision:11b",
    "llama3.2-vision:90b": "llama3.2-vision:90b",
    "llava:7b": "LLaVA 7B",
    "llava:13b": "LLaVA 13B",
    "minicpm-v": "MiniCPM-V",
}

OLLAMA_VISION_MODELS: List[Dict[str, str]] = [
    {"id": "paddleocr-vl:1.6", "name": "PaddleOCR-VL 1.6 (0.9B Local VLM)"},
    {"id": "qwen3-vl:8b", "name": "qwen3-vl:8b (Local VLM)"},
    {"id": "llama3.2-vision:11b", "name": "llama3.2-vision:11b"},
]


def get_ollama_base_url() -> str:
    url = os.environ.get("OLLAMA_BASE_URL", "").strip() or os.environ.get("OLLAMA_HOST", "").strip()
    if not url:
        return DEFAULT_OLLAMA_URL
    if not url.startswith("http://") and not url.startswith("https://"):
        url = f"http://{url}"
    url = url.rstrip("/")
    if not url.endswith("/v1"):
        url = f"{url}/v1"
    return url


def run_ollama_ocr(image_path: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if options is None:
        options = {}

    model = str(options.get("model", "qwen3-vl:8b")).strip()
    if not model:
        model = "qwen3-vl:8b"

    img_path = Path(image_path)
    if not img_path.exists():
        raise FileNotFoundError(f"Image not found at path: {image_path}")

    suffix = img_path.suffix.lower()
    mime_type = "image/png"
    if suffix in [".jpg", ".jpeg"]:
        mime_type = "image/jpeg"
    elif suffix == ".webp":
        mime_type = "image/webp"

    with open(img_path, "rb") as f:
        base64_image = base64.b64encode(f.read()).decode("utf-8")

    base_url = get_ollama_base_url()
    client = openai.OpenAI(base_url=base_url, api_key="ollama")

    start_time = time.perf_counter()

    custom_prompt = options.get("prompt")
    if custom_prompt:
        prompt_text = custom_prompt
    elif "paddleocr" in model.lower():
        prompt_text = options.get("task", "OCR:")
    else:
        prompt_text = (
            "Perform Optical Character Recognition (OCR) on this document page image. "
            "Transcribe ALL text accurately, preserving the original reading flow, layout structure, and line breaks. "
            "Output ONLY the transcribed document text without any commentary, greetings, notes, or markdown code fences."
        )

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": prompt_text,
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{base64_image}",
                            },
                        },
                    ],
                }
            ],
            temperature=0.0,
        )
    except openai.APIConnectionError:
        raise RuntimeError(
            f"Ollama is not running at {base_url}. "
            "Please ensure the Ollama service is started (e.g. run 'ollama serve' or launch the Ollama app)."
        )
    except openai.NotFoundError as e:
        raise RuntimeError(
            f"Ollama model '{model}' was not found. "
            f"Please download it first using: ollama pull {model} ({e.message})"
        )
    except openai.BadRequestError as e:
        err_msg = str(e.message) if hasattr(e, "message") else str(e)
        if "multimodal" in err_msg.lower():
            raise RuntimeError(
                f"Model '{model}' does not support multimodal vision input. "
                "Please select a vision-language model such as 'qwen3-vl:8b'."
            )
        raise RuntimeError(f"Ollama Bad Request: {err_msg}")
    except openai.APIError as e:
        raise RuntimeError(f"Ollama API Error: {e.message if hasattr(e, 'message') else str(e)}")
    except Exception as e:
        raise RuntimeError(f"Ollama OCR execution failed: {e}")

    latency_ms = round((time.perf_counter() - start_time) * 1000, 1)

    raw_text = ""
    if response.choices and len(response.choices) > 0:
        raw_text = response.choices[0].message.content or ""

    # Clean thinking tags if present
    raw_text = re.sub(r"<think>[\s\S]*?</think>", "", raw_text).strip()

    # Clean markdown code fences if present
    raw_text = re.sub(r"^```(?:markdown|text)?\n", "", raw_text.strip(), flags=re.IGNORECASE)
    raw_text = re.sub(r"\n```$", "", raw_text.strip())

    lines = [
        {"text": line.strip(), "confidence": 0.98}
        for line in raw_text.splitlines()
        if line.strip()
    ]

    display_name = MODEL_DISPLAY_NAMES.get(model, model)

    result = {
        "text": raw_text,
        "lines": lines,
        "latencyMs": latency_ms,
        "engine": "ollama",
        "engineName": f"Ollama ({display_name})",
        "model": model,
    }

    prompt_tokens = None
    completion_tokens = None
    total_tokens = None
    if hasattr(response, "usage") and response.usage:
        prompt_tokens = getattr(response.usage, "prompt_tokens", None)
        completion_tokens = getattr(response.usage, "completion_tokens", None)
        total_tokens = getattr(response.usage, "total_tokens", None)
        if isinstance(response.usage, dict):
            prompt_tokens = response.usage.get("prompt_tokens", prompt_tokens)
            completion_tokens = response.usage.get("completion_tokens", completion_tokens)
            total_tokens = response.usage.get("total_tokens", total_tokens)

    if prompt_tokens is not None or completion_tokens is not None:
        result["usage"] = {
            "promptTokens": prompt_tokens or 0,
            "completionTokens": completion_tokens or 0,
            "totalTokens": total_tokens if total_tokens is not None else ((prompt_tokens or 0) + (completion_tokens or 0)),
        }

    return result


def run_paddleocr_ollama(image_path: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if options is None:
        options = {}
    opts = dict(options)
    if "model" not in opts or not opts["model"]:
        opts["model"] = "paddleocr-vl:1.6"
    result = run_ollama_ocr(image_path, opts)
    result["engine"] = "paddleocr_vl"
    result["engineName"] = "PaddleOCR-VL 1.6 (Ollama Metal)"
    return result

