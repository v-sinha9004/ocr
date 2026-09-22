import os
import shutil
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from server.services.pdf_service import process_pdf, get_page_image_path
from server.engines.apple_vision import run_apple_vision_ocr
from server.engines.tesseract import run_tesseract_ocr
from server.engines.florence_2 import run_florence_ocr


def main():
    print("=== Step 1: Generating Sample Multi-Line PDF ===")
    sample_pdf_path = PROJECT_ROOT / "tests" / "test_doc.pdf"

    pdf_content = b"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 280 >>
stream
BT
/F1 20 Tf
72 710 Td
(INVOICE #INV-2026-9042) Tj
0 -36 Td
/F1 14 Tf
(Billed To: Acme Technology Solutions) Tj
0 -24 Td
(Description: Enterprise AI OCR Engine Integration) Tj
0 -24 Td
(Subtotal: $4,500.00 | Tax: $360.00 | Total: $4,860.00) Tj
0 -30 Td
(Thank you for your business!) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000578 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
657
%%EOF
"""
    with open(sample_pdf_path, "wb") as f:
        f.write(pdf_content)
    print(f"Created test PDF at: {sample_pdf_path}")

    try:
        print("\n=== Step 2: Processing PDF & Rendering Pages with pdftoppm ===")
        temp_copy = PROJECT_ROOT / "tests" / "test_copy.pdf"
        shutil.copyfile(sample_pdf_path, temp_copy)

        doc_meta = process_pdf(str(temp_copy), "test_doc.pdf")
        print(f"Document ID: {doc_meta['id']}")
        print(f"Total Pages Rendered: {doc_meta['pageCount']}")

        page1_path = get_page_image_path(doc_meta["id"], 1)
        print(f"Rendered Page 1 Image: {page1_path}")
        assert page1_path and os.path.exists(page1_path), "Page 1 image was not found!"

        print("\n=== Step 3: Running Apple Vision OCR (macOS Native) ===")
        apple_result = run_apple_vision_ocr(page1_path)
        print(f"[Apple Vision] Latency: {apple_result['latencyMs']} ms")
        print(f"[Apple Vision] Extracted text:\n---\n{apple_result['text']}\n---")

        print("\n=== Step 4: Running Tesseract OCR (v5.5.1) ===")
        tesseract_result = run_tesseract_ocr(page1_path)
        print(f"[Tesseract] Latency: {tesseract_result['latencyMs']} ms")
        print(f"[Tesseract] Extracted text:\n---\n{tesseract_result['text']}\n---")

        print("\n=== Step 5: Running Microsoft Florence-2 (Local Apple MPS GPU) ===")
        florence_result = run_florence_ocr(page1_path)
        print(f"[Florence-2] Latency: {florence_result['latencyMs']} ms")
        print(f"[Florence-2] Extracted text:\n---\n{florence_result['text']}\n---")

        print("\n=== Step 6: 3-Way Benchmark Scorecard Comparison ===")
        scorecard = {
            "apple_vision": {
                "latency_ms": apple_result["latencyMs"],
                "words": len(apple_result["text"].strip().split()),
                "chars": len(apple_result["text"]),
                "lines_detected": len(apple_result.get("lines", [])),
            },
            "tesseract": {
                "latency_ms": tesseract_result["latencyMs"],
                "words": len(tesseract_result["text"].strip().split()),
                "chars": len(tesseract_result["text"]),
                "lines_detected": len(tesseract_result.get("lines", [])),
            },
            "florence_2": {
                "latency_ms": florence_result["latencyMs"],
                "words": len(florence_result["text"].strip().split()),
                "chars": len(florence_result["text"]),
                "lines_detected": len(florence_result.get("lines", [])),
            },
        }
        import pprint
        pprint.pprint(scorecard)

        # Assertions
        assert "INVOICE" in apple_result["text"], "Apple Vision failed to extract INVOICE keyword"
        assert "INVOICE" in tesseract_result["text"], "Tesseract failed to extract INVOICE keyword"
        assert "INVOICE" in florence_result["text"], "Florence-2 failed to extract INVOICE keyword"
        print("\nAll 3 OCR engine verification tests passed successfully!")

    finally:
        if sample_pdf_path.exists():
            os.remove(sample_pdf_path)


if __name__ == "__main__":
    main()
