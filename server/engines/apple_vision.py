import json
import time
import subprocess
from pathlib import Path

BINARY_PATH = Path(__file__).resolve().parent.parent.parent / "tools" / "apple_vision_ocr"


def run_apple_vision_ocr(image_path: str) -> dict:
    start_time = time.perf_counter()
    if not BINARY_PATH.exists():
        raise FileNotFoundError(f"Apple Vision OCR binary not found at: {BINARY_PATH}")

    result = subprocess.run(
        [str(BINARY_PATH), str(image_path)],
        capture_output=True,
        text=True,
        check=False
    )
    fallback_latency = (time.perf_counter() - start_time) * 1000

    if result.returncode != 0 and not result.stdout.strip():
        raise RuntimeError(f"Apple Vision OCR execution error: {result.stderr or 'Process failed'}")

    try:
        parsed = json.loads(result.stdout)
        if parsed.get("error"):
            raise RuntimeError(parsed["error"])

        latency_ms = round(float(parsed.get("latency_ms", fallback_latency)), 1)
        return {
            "text": parsed.get("text", ""),
            "lines": parsed.get("lines", []),
            "latencyMs": latency_ms,
            "engine": "apple_vision",
            "engineName": "Apple Vision OCR (macOS Native)"
        }
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Failed to parse Apple Vision output: {e}. Raw: {result.stdout}")
