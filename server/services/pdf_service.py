import json
import os
import re
import shutil
import subprocess
import uuid
from pathlib import Path
from typing import Dict, Optional

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "documents"
DATA_DIR.mkdir(parents=True, exist_ok=True)

PDFINFO_PATH = shutil.which("pdfinfo") or "/opt/homebrew/bin/pdfinfo"
PDFTOPPM_PATH = shutil.which("pdftoppm") or "/opt/homebrew/bin/pdftoppm"


def get_pdf_info(pdf_path: str) -> Dict[str, any]:
    result = subprocess.run(
        [PDFINFO_PATH, str(pdf_path)],
        capture_output=True,
        text=True,
        check=False
    )
    if result.returncode != 0:
        raise RuntimeError(f"pdfinfo error: {result.stderr or 'Failed to inspect PDF'}")

    lines = result.stdout.splitlines()
    pages = 1
    title = ""

    for line in lines:
        page_match = re.match(r"^Pages:\s+(\d+)", line)
        if page_match:
            pages = int(page_match.group(1))

        title_match = re.match(r"^Title:\s+(.*)", line)
        if title_match:
            title = title_match.group(1).strip()

    return {"pages": pages, "title": title}


def process_pdf(temp_file_path: str, original_filename: str) -> Dict[str, any]:
    doc_id = str(uuid.uuid4())
    doc_dir = DATA_DIR / doc_id
    doc_dir.mkdir(parents=True, exist_ok=True)

    target_pdf_path = doc_dir / "source.pdf"
    shutil.copyfile(temp_file_path, target_pdf_path)

    try:
        os.remove(temp_file_path)
    except OSError:
        pass

    info = get_pdf_info(str(target_pdf_path))

    # Render pages to PNG (150 DPI for fast rendering and high OCR accuracy)
    ppm_result = subprocess.run(
        [
            PDFTOPPM_PATH,
            "-png",
            "-r",
            "150",
            str(target_pdf_path),
            str(doc_dir / "page"),
        ],
        capture_output=True,
        text=True,
        check=False
    )
    if ppm_result.returncode != 0:
        raise RuntimeError(f"pdftoppm error: {ppm_result.stderr or 'Failed to render PDF pages'}")

    rendered_files = [
        f.name
        for f in doc_dir.iterdir()
        if f.is_file() and f.name.startswith("page-") and f.name.endswith(".png")
    ]

    pages_list = []
    for i in range(1, info["pages"] + 1):
        found = None
        for filename in rendered_files:
            match = re.match(r"page-(\d+)\.png", filename)
            if match and int(match.group(1)) == i:
                found = filename
                break

        if found:
            pages_list.append({
                "pageNumber": i,
                "imageFilename": found,
                "url": f"/api/documents/{doc_id}/pages/{i}",
            })

    meta = {
        "id": doc_id,
        "filename": original_filename,
        "title": info["title"] or original_filename,
        "pageCount": info["pages"],
        "pages": pages_list,
    }

    with open(doc_dir / "meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    return meta


def get_document_meta(doc_id: str) -> Optional[Dict[str, any]]:
    meta_path = DATA_DIR / doc_id / "meta.json"
    if not meta_path.exists():
        return None
    with open(meta_path, "r", encoding="utf-8") as f:
        return json.load(f)


def get_page_image_path(doc_id: str, page_number: int) -> Optional[str]:
    doc_dir = DATA_DIR / doc_id
    if not doc_dir.exists():
        return None

    rendered_files = [
        f.name
        for f in doc_dir.iterdir()
        if f.is_file() and f.name.startswith("page-") and f.name.endswith(".png")
    ]

    for filename in rendered_files:
        match = re.match(r"page-(\d+)\.png", filename)
        if match and int(match.group(1)) == int(page_number):
            return str(doc_dir / filename)

    return None
