from .apple_vision import run_apple_vision_ocr
from .tesseract import run_tesseract_ocr
from .florence_2 import run_florence_ocr
from .openai_vision import run_openai_ocr

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
]


def execute_ocr(engine_id: str, image_path: str, options: dict = None) -> dict:
    if options is None:
        options = {}

    if engine_id == "apple_vision":
        return run_apple_vision_ocr(image_path)
    elif engine_id == "tesseract":
        return run_tesseract_ocr(image_path, options)
    elif engine_id == "florence_2":
        return run_florence_ocr(image_path, options)
    elif engine_id == "openai":
        return run_openai_ocr(image_path, options)
    else:
        raise ValueError(f"Unknown or unsupported OCR engine: {engine_id}")


