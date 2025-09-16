#!/usr/bin/env python3
"""
FastVLM multi-pass tester:
- Pass 1: person-only
- Pass 2: clothing-only
- Pass 3: accessories-only (full image only)
Sends separate requests to the running FastVLM server and prints a merged report.
"""

import os
import sys
import io
import json
import base64
from pathlib import Path
from typing import List, Tuple
import time

import requests
from PIL import Image
from concurrent.futures import ThreadPoolExecutor, as_completed

SERVER_URL = os.environ.get("FASTVLM_URL", "http://127.0.0.1:3001")

def to_base64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=95)
    return base64.b64encode(buf.getvalue()).decode('utf-8')

def post_analyze(prompt: str, image_b64: str):
    resp = requests.post(
        f"{SERVER_URL}/analyze",
        json={"prompt": prompt, "image_base64": image_b64},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()

def extract_text(result: dict) -> str:
    return (
        (result or {}).get("technical_analysis")
        or (result or {}).get("analysis")
        or ""
    )

def load_image(path: str) -> Image.Image:
    return Image.open(path).convert('RGB')

PERSON_PROMPT = (
    "Output EXACTLY one short line: Woman/Man; approximate age; build; hair (length, style, color)"
)

CLOTHING_PROMPT = (
    "Describe only the clothing and shoes the person in the image is WEARING. Ignore items on the furniture, floor, or background. List the clothing items, including colors, materials, and fit details."
)

ACCESSORIES_PROMPT = (
    "Describe only the accessories the person in the picture is WEARING. Note the face, ears, neck, fingers, belt, wrists, bag. List only the accessories, indicating the color, shape, and possibly the material."
)


def main():
    if len(sys.argv) >= 2:
        image_path = sys.argv[1]
    else:
        image_path = str(Path(__file__).parent.parent / "12.jpg")

    if not os.path.exists(image_path):
        print(f"Image not found: {image_path}")
        sys.exit(1)

    img = load_image(image_path)
    b64_full = to_base64(img)

    print("Using image:", image_path)

    # Pass 1: person-only
    t0 = time.perf_counter()
    r1 = post_analyze(PERSON_PROMPT, b64_full)
    t1 = time.perf_counter()
    person = extract_text(r1)

    # Pass 2: clothing-only
    r2 = post_analyze(CLOTHING_PROMPT, b64_full)
    t2 = time.perf_counter()
    clothing = extract_text(r2)

    # Pass 3: accessories – full image only
    r3_full = post_analyze(ACCESSORIES_PROMPT, b64_full)
    t3 = time.perf_counter()
    acc_texts = extract_text(r3_full)

    report = {
        "image": image_path,
        "person": person,
        "clothing": clothing,
        "accessories": acc_texts,
        "timings_seconds": {
            "person": round(t1 - t0, 3),
            "clothing": round(t2 - t1, 3),
            "accessories_full": round(t3 - t2, 3),
            "total": round(t3 - t0, 3)
        }
    }

    out_path = Path(__file__).parent / "results" / "latest_multi_test_output.txt"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("PERSON\n" + person.split("\n")[0].strip() + "\n\n")
        f.write("CLOTHING\n" + clothing.split("\n")[0].strip() + "\n\n")
        f.write("ACCESSORIES\n" + (acc_texts or "none") + "\n\n")
        f.write("TIMINGS\n" + json.dumps(report["timings_seconds"], ensure_ascii=False, indent=2) + "\n")

    print("\n=== MULTI-PASS RESULT ===")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print("Saved:", out_path)

if __name__ == "__main__":
    main()


