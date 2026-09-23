import base64
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Union

import dotenv
import openai
from pydantic import BaseModel, Field

dotenv.load_dotenv()

MODEL_DISPLAY_NAMES = {
    "gpt-5.4-mini": "GPT-5.4-mini",
    "gpt-5-mini": "GPT-5-mini",
    "gpt-4o-mini": "GPT-4o-mini",
    "gpt-4o": "GPT-4o",
}


class UPSCAnswerOCRResponse(BaseModel):
    question_text: str = Field(
        default="",
        description="The printed or handwritten question statement/prompt found at the top of the answer copy. Empty string if not present on the scanned page(s).",
    )
    question_marks: Optional[str] = Field(
        default=None,
        description="The allotted marks indicated for the question (e.g. '10 Marks', '15', '12.5', '250 words / 15m'), or null if not indicated.",
    )
    full_markdown_text: str = Field(
        description="The entire transcribed candidate answer in clean Markdown, preserving headers (###), bullet points (- ), bold underlines (**word**), tables, and flowchart structure.",
    )
    detected_intro: str = Field(
        default="",
        description="The opening 1–2 paragraphs where the candidate sets context or defines the topic. Empty string if not present on the scanned page(s).",
    )
    detected_conclusion: str = Field(
        default="",
        description="The final closing paragraph written by the candidate. Empty string if not present on the scanned page(s).",
    )
    estimated_word_count: int = Field(
        description="Total word count of the candidate's written answer only (excluding the question statement and marks).",
    )
    legibility_status: Literal["CLEAR", "AVERAGE", "POOR"] = Field(
        description="Overall readability of the candidate's handwriting across the scanned page(s).",
    )


UPSC_OCR_SYSTEM_PROMPT = """You are an expert handwritten document transcriber specializing in UPSC Civil Services Examination answer copies.
Your job is to transcribe the candidate's handwritten pages into clean, structured Markdown with 100% fidelity.

CRITICAL INSTRUCTIONS FOR TRANSCRIPTION:

1. QUESTION AND MARKS EXTRACTION:
   - Identify and extract the question statement/prompt (printed or handwritten) into `question_text`.
   - Identify any allotted marks specified alongside the question (e.g. "10", "15 Marks", "12.5", "10M") into `question_marks`. If not found, set to null.
   - Do NOT include the question text or marks in `full_markdown_text` or `estimated_word_count`; `full_markdown_text` must focus strictly on the candidate's handwritten answer.

2. VERBATIM TRANSCRIPTION ONLY (NO AUTO-CORRECTION):
   - Transcribe EXACTLY what the candidate wrote.
   - Do NOT correct grammatical mistakes, spelling errors, or incorrect historical dates/facts. Our evaluation agents must see the student's actual mistakes.

3. PRESERVE STRUCTURAL DISCIPLINE:
   - Convert handwritten section headings, underlined headers, or boxed headers into Markdown headings: `### Heading Name`.
   - Convert bullet points, dashes, arrows, and numbers into standard Markdown lists (`- ` or `1. `).
   - Convert underlined keywords or boxed phrases into bold (`**keyword**`).
   - Preserve paragraph breaks with double newlines (`\n\n`).
   - If multiple pages are provided, transcribe them sequentially in order as a single continuous answer.

4. TABLES & FLOWCHARTS (CLEAN MARKDOWN):
   - Transcribe handwritten comparison tables or data tables using standard GitHub Flavored Markdown tables (`| Column 1 | Column 2 |`).
   - Transcribe flowcharts, cycle diagrams, or process structures using clean text arrows (e.g., `Step A -> Step B -> Step C`), indented hierarchical lists, or clean Markdown tables.

5. IGNORE CROSSED-OUT / STRIKETHROUGH TEXT:
   - Completely OMIT any words, sentences, or paragraphs that the candidate has scratched out or crossed out with a pen. Do not transcribe deleted mistakes.

6. DIAGRAMS & DRAWINGS (SKIP THEM):
   - Ignore pencil drawings, sketches, or maps. Do NOT attempt to transcribe diagram labels or arrows as garbled text. Simply transcribe the surrounding written text.

7. ILLEGIBLE WORDS:
   - If a word is impossible to decipher, write `[illegible]`. Never guess or hallucinate.

8. SECTION IDENTIFICATION:
   - `detected_intro`: Extract only the opening 1–2 paragraph(s) where the candidate sets context or defines the topic before the main body headings. If the provided page(s) do not contain an introduction, return an empty string `""`.
   - `detected_conclusion`: Extract only the final closing paragraph or 'Way Forward'. If the provided page(s) do not contain a conclusion, return an empty string `""`.
   - `estimated_word_count`: Total word count of the candidate's written answer only.
   - `legibility_status`: Evaluate the overall handwriting legibility as "CLEAR", "AVERAGE", or "POOR".
"""


def _load_image_base64(image_path: Union[str, Path]) -> tuple[str, str]:
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
        b64 = base64.b64encode(f.read()).decode("utf-8")
    return mime_type, b64


def run_openai_vision_upsc(
    image_paths: Union[str, Path, List[Union[str, Path]]],
    options: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if options is None:
        options = {}

    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY environment variable is not set. "
            "Please set OPENAI_API_KEY in your backend environment to use OpenAI UPSC Vision OCR."
        )

    model = str(options.get("model", "gpt-5.4-mini")).strip()
    if not model:
        model = "gpt-5.4-mini"

    # Normalize image_paths into a list
    if isinstance(image_paths, (str, Path)):
        paths_list = [Path(image_paths)]
    else:
        paths_list = [Path(p) for p in image_paths]

    if not paths_list:
        raise ValueError("At least one image path must be provided for OCR.")

    # Prepare multimodal content array
    user_content: List[Dict[str, Any]] = [
        {
            "type": "text",
            "text": (
                f"Perform high-fidelity UPSC answer sheet OCR transcription on the attached {len(paths_list)} "
                f"page image(s). Follow all critical transcription rules verbatim."
            ),
        }
    ]

    for idx, path in enumerate(paths_list, 1):
        mime_type, b64_str = _load_image_base64(path)
        if len(paths_list) > 1:
            user_content.append({
                "type": "text",
                "text": f"--- Candidate Answer Sheet Page {idx} of {len(paths_list)} ---",
            })
        user_content.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:{mime_type};base64,{b64_str}",
                "detail": "high",
            },
        })

    start_time = time.perf_counter()

    try:
        client = openai.OpenAI(api_key=api_key)
        response = client.beta.chat.completions.parse(
            model=model,
            messages=[
                {"role": "system", "content": UPSC_OCR_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            response_format=UPSCAnswerOCRResponse,
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
        raise RuntimeError(f"OpenAI UPSC OCR execution failed: {e}")

    latency_ms = round((time.perf_counter() - start_time) * 1000, 1)

    if not response.choices or len(response.choices) == 0:
        raise RuntimeError("OpenAI returned an empty response with no choices.")

    choice = response.choices[0]
    if getattr(choice.message, "refusal", None):
        raise RuntimeError(f"OpenAI refused transcription request: {choice.message.refusal}")

    parsed: Optional[UPSCAnswerOCRResponse] = choice.message.parsed
    if not parsed:
        raise RuntimeError("Failed to parse structured UPSC answer from OpenAI response.")

    raw_text = parsed.full_markdown_text or ""
    lines = [
        {"text": line.strip(), "confidence": 0.99}
        for line in raw_text.splitlines()
        if line.strip()
    ]

    display_name = MODEL_DISPLAY_NAMES.get(model, model)

    result: Dict[str, Any] = {
        "text": raw_text,
        "lines": lines,
        "latencyMs": latency_ms,
        "engine": "openai_vision_upsc",
        "engineName": f"OpenAI UPSC ({display_name})",
        "model": model,
        "wordCount": parsed.estimated_word_count,
        "charCount": len(raw_text),
        "pagesProcessed": len(paths_list),
        "upscData": parsed.model_dump(),
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
