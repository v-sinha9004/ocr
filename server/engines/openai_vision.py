import base64
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, Optional

import dotenv
import openai

dotenv.load_dotenv()

MODEL_DISPLAY_NAMES = {
    "gpt-5.4-mini": "GPT-5.4-mini",
    "gpt-5-mini": "GPT-5-mini",
    "gpt-4o-mini": "GPT-4o-mini",
    "gpt-4o": "GPT-4o",
}


def run_openai_ocr(image_path: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if options is None:
        options = {}

    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY environment variable is not set. "
            "Please set OPENAI_API_KEY in your backend environment to use OpenAI OCR."
        )

    model = str(options.get("model", "gpt-5.4-mini")).strip()
    if not model:
        model = "gpt-5.4-mini"

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

    start_time = time.perf_counter()

    try:
        client = openai.OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "Perform Optical Character Recognition (OCR) on this document page image. "
                                "Transcribe ALL text accurately, preserving the original reading flow, layout structure, and line breaks. "
                                "Output ONLY the transcribed document text without any commentary, greetings, notes, or markdown code fences."
                            ),
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{base64_image}",
                                "detail": "high",
                            },
                        },
                    ],
                }
            ],
            temperature=0.0,
        )
    except openai.AuthenticationError as e:
        raise RuntimeError(f"OpenAI Authentication Failed: Invalid API key. ({e.message})")
    except openai.NotFoundError as e:
        raise RuntimeError(
            f"OpenAI Model '{model}' not found or not accessible with your API account. ({e.message})"
        )
    except openai.RateLimitError as e:
        raise RuntimeError(f"OpenAI Rate Limit Exceeded: {e.message}")
    except openai.APIConnectionError as e:
        raise RuntimeError(f"OpenAI Connection Error: Unable to reach OpenAI servers. ({e})")
    except openai.APIError as e:
        raise RuntimeError(f"OpenAI API Error: {e.message}")
    except Exception as e:
        raise RuntimeError(f"OpenAI OCR execution failed: {e}")

    latency_ms = round((time.perf_counter() - start_time) * 1000, 1)

    raw_text = ""
    if response.choices and len(response.choices) > 0:
        raw_text = response.choices[0].message.content or ""

    # Clean markdown fences if present
    raw_text = re.sub(r"^```(?:markdown|text)?\n", "", raw_text.strip(), flags=re.IGNORECASE)
    raw_text = re.sub(r"\n```$", "", raw_text.strip())

    lines = [
        {"text": line.strip(), "confidence": 0.99}
        for line in raw_text.splitlines()
        if line.strip()
    ]

    display_name = MODEL_DISPLAY_NAMES.get(model, model)

    result = {
        "text": raw_text,
        "lines": lines,
        "latencyMs": latency_ms,
        "engine": "openai",
        "engineName": f"OpenAI ({display_name})",
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

