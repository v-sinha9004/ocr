import shutil
import subprocess
import time

TESSERACT_PATH = shutil.which("tesseract") or "/opt/homebrew/bin/tesseract"


def run_tesseract_ocr(image_path: str, options: dict = None) -> dict:
    if options is None:
        options = {}

    psm = str(options.get("psm", "3"))  # Fully automatic page segmentation, but no OSD
    lang = str(options.get("lang", "eng"))

    start_time = time.perf_counter()
    result = subprocess.run(
        [TESSERACT_PATH, str(image_path), "stdout", "-l", lang, "--psm", psm],
        capture_output=True,
        text=True,
        check=False
    )
    latency_ms = round((time.perf_counter() - start_time) * 1000, 1)

    if result.returncode != 0:
        raise RuntimeError(f"Tesseract error: {result.stderr or 'Process failed'}")

    raw_text = result.stdout.strip()
    lines = [
        {"text": line.strip(), "confidence": 1.0}
        for line in raw_text.splitlines()
        if line.strip()
    ]

    return {
        "text": raw_text,
        "lines": lines,
        "latencyMs": latency_ms,
        "engine": "tesseract",
        "engineName": "Tesseract OCR (v5.5.1)"
    }
