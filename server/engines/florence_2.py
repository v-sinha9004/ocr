import time
from typing import Any, Dict, Optional
from PIL import Image
import torch

_model = None
_processor = None
_device = None
_dtype = None
MODEL_ID = "microsoft/Florence-2-base"


def get_florence_model_and_processor():
    global _model, _processor, _device, _dtype
    if _model is not None and _processor is not None:
        return _model, _processor, _device, _dtype

    from unittest.mock import patch
    from transformers.dynamic_module_utils import get_imports
    from transformers import AutoModelForCausalLM, AutoProcessor

    def fixed_get_imports(filename):
        imports = get_imports(filename)
        if "flash_attn" in imports:
            imports.remove("flash_attn")
        return imports

    if torch.backends.mps.is_available():
        _device = torch.device("mps")
    else:
        _device = torch.device("cpu")

    # torch.float32 is recommended on Apple Silicon MPS for Florence-2 to avoid NaN issues
    _dtype = torch.float32

    print(f"[Florence-2] Initializing {MODEL_ID} on {_device} ({_dtype})...")
    with patch("transformers.dynamic_module_utils.get_imports", fixed_get_imports):
        _model = AutoModelForCausalLM.from_pretrained(
            MODEL_ID,
            torch_dtype=_dtype,
            trust_remote_code=True,
        ).to(_device)
        _model.eval()

        _processor = AutoProcessor.from_pretrained(
            MODEL_ID,
            trust_remote_code=True,
        )
    print(f"[Florence-2] Successfully loaded and cached on {_device}.")
    return _model, _processor, _device, _dtype


def run_florence_ocr(image_path: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if options is None:
        options = {}

    task = options.get("task", "<OCR_WITH_REGION>")
    start_time = time.perf_counter()

    model, processor, device, dtype = get_florence_model_and_processor()

    try:
        image = Image.open(image_path).convert("RGB")
    except Exception as e:
        raise RuntimeError(f"Failed to open image at {image_path}: {e}")

    inputs = processor(text=task, images=image, return_tensors="pt").to(device, dtype)

    with torch.no_grad():
        generated_ids = model.generate(
            input_ids=inputs["input_ids"],
            pixel_values=inputs["pixel_values"],
            max_new_tokens=options.get("max_new_tokens", 1024),
            num_beams=options.get("num_beams", 3),
            do_sample=False,
        )

    generated_text = processor.batch_decode(generated_ids, skip_special_tokens=False)[0]
    parsed = processor.post_process_generation(
        generated_text,
        task=task,
        image_size=(image.width, image.height),
    )

    latency_ms = round((time.perf_counter() - start_time) * 1000, 1)

    lines = []
    full_text = ""

    def clean_text(raw_val: str) -> str:
        return raw_val.replace("</s>", "").replace("<s>", "").strip()

    if "<OCR_WITH_REGION>" in parsed:
        data = parsed["<OCR_WITH_REGION>"]
        labels = data.get("labels", [])
        quad_boxes = data.get("quad_boxes", [])
        for i, label in enumerate(labels):
            text_clean = clean_text(label)
            if not text_clean:
                continue
            box = quad_boxes[i] if i < len(quad_boxes) else None
            lines.append({
                "text": text_clean,
                "confidence": 0.95,
                "bbox": box,
            })
        full_text = "\n".join([l["text"] for l in lines])
    elif "<OCR>" in parsed:
        full_text = clean_text(parsed["<OCR>"])
        lines = [
            {"text": clean_text(l), "confidence": 0.95}
            for l in full_text.splitlines()
            if clean_text(l)
        ]
    else:
        first_val = next(iter(parsed.values()), "")
        if isinstance(first_val, str):
            full_text = first_val.strip()
        elif isinstance(first_val, dict) and "labels" in first_val:
            full_text = "\n".join(first_val["labels"])
        else:
            full_text = str(first_val)
        lines = [
            {"text": l.strip(), "confidence": 0.95}
            for l in full_text.splitlines()
            if l.strip()
        ]

    return {
        "text": full_text,
        "lines": lines,
        "latencyMs": latency_ms,
        "engine": "florence_2",
        "engineName": "Microsoft Florence-2 (Local MPS)",
    }
