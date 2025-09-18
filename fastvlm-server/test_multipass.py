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
    """Send analysis request to FastVLM server analyze_for_test endpoint"""
    try:
        resp = requests.post(
            f"{SERVER_URL}/analyze_for_test",
            json={
                "image_base64": image_b64,
                "prompt": prompt,
                "nickname": "test_user"
            },
            timeout=120
        )
        resp.raise_for_status()
        result = resp.json()

        if result.get("success"):
            return {
                "success": True,
                "analysis": result.get("analysis", ""),
                "timing": result.get("timing", {})
            }
        else:
            return {
                "success": False,
                "error": result.get("error", "Server error"),
                "analysis": ""
            }

    except Exception as e:
        print(f"Error in post_analyze: {e}")
        return {
            "success": False,
            "error": str(e),
            "analysis": ""
        }

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

TOP_CLOTHING_PROMPT = (
    #"Output EXACTLY one short line: Outerwear, color, material, style, fit."
    #"Describe only the outermost TOP clothing items the person is wearing. Focus on jackets, coats, blazers, cardigans. Include: type, color, material, fit. Be brief and factual."
    #"Output EXACTLY one short line with format: [TYPE] [COLOR] [MATERIAL] [STYLE/FIT]"
    "Describe the outer top clothing on the person. What is the outermost layer? What type of clothing? What color? What material? How does it fit?"
)

INNER_TOP_CLOTHING_PROMPT = (
    #"Output EXACTLY one short line: Innerwear, color, material, style, fit."
    #"Describe only the inner TOP clothing items the person is wearing UNDERNEATH any outerwear. Focus on shirts, sweaters, turtlenecks, blouses, tops. Include: type, color, material, neckline style, fit. Be brief and factual."
    #"Output EXACTLY one short line with format: [TYPE] [COLOR] [MATERIAL] [NECKLINE/FIT]"
    "Describe the inner top clothing under the outer layer. What type of clothing? What color? What material? What neckline?"
)

LEG_CLOTHING_PROMPT = (
    #"Output EXACTLY one short line: Legwear, color, material, style, fit."
    #"Describe only the clothing items covering the LEGS the person is wearing. Focus on pants, jeans, skirts, shorts, dresses that cover the lower body. Include: type, color, material, length, fit. Be brief and factual."
    #"Output EXACTLY one short line with format: [TYPE] [COLOR] [MATERIAL] [LENGTH/FIT]"
    "Describe the clothing on the person's legs. What type of clothing? What color? What material? What length?"
)

SHOES_PROMPT = (
    #"Output EXACTLY one short line: Shoes, color, material, style, fit."
    #"Describe only the SHOES and FOOTWEAR the person is wearing. Include: type, color, material, heel height. Be brief and factual."
    #"Output EXACTLY one short line with format: [TYPE] [COLOR] [MATERIAL] [HEEL/STYLE]"
    "Describe the shoes on the person. What type of shoes? What color? What material? What style?"
)

ACCESSORIES_PROMPT = (
    #"Output EXACTLY one short line: Accessories, color, material, style, fit."
    #"List only the accessories the person is wearing. Note: face, ears, neck, fingers, belt, wrists, bag. Include: type, color, material. Be brief and factual."
    #"Output EXACTLY one short line: List accessories with format: [TYPE] [COLOR] [MATERIAL]. Separate multiple items with semicolons."
    "List the accessories on the person. What accessories? What color? What material?"
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

    # Pass 2: top clothing (outerwear)
    r2 = post_analyze(TOP_CLOTHING_PROMPT, b64_full)
    t2 = time.perf_counter()
    top_clothing = extract_text(r2)

    # Pass 3: inner top clothing (tops, sweaters)
    r3 = post_analyze(INNER_TOP_CLOTHING_PROMPT, b64_full)
    t3 = time.perf_counter()
    inner_top_clothing = extract_text(r3)

    # Pass 4: leg clothing (pants, skirts, shorts)
    r4 = post_analyze(LEG_CLOTHING_PROMPT, b64_full)
    t4 = time.perf_counter()
    leg_clothing = extract_text(r4)

    # Pass 5: shoes
    r5 = post_analyze(SHOES_PROMPT, b64_full)
    t5 = time.perf_counter()
    shoes = extract_text(r5)

    # Pass 6: accessories
    r6 = post_analyze(ACCESSORIES_PROMPT, b64_full)
    t6 = time.perf_counter()
    accessories = extract_text(r6)

    report = {
        "image": image_path,
        "person": person,
        "top_clothing": top_clothing,
        "inner_top_clothing": inner_top_clothing,
        "leg_clothing": leg_clothing,
        "shoes": shoes,
        "accessories": accessories,
        "timings_seconds": {
            "person": round(t1 - t0, 3),
            "top_clothing": round(t2 - t1, 3),
            "inner_top_clothing": round(t3 - t2, 3),
            "leg_clothing": round(t4 - t3, 3),
            "shoes": round(t5 - t4, 3),
            "accessories": round(t6 - t5, 3),
            "total": round(t6 - t0, 3)
        }
    }

    out_path = Path(__file__).parent / "results" / "latest_multi_test_output.txt"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("PERSON\n" + person.split("\n")[0].strip() + "\n\n")
        f.write("TOP CLOTHING\n" + (top_clothing or "none") + "\n\n")
        f.write("INNER TOP CLOTHING\n" + (inner_top_clothing or "none") + "\n\n")
        f.write("LEG CLOTHING\n" + (leg_clothing or "none") + "\n\n")
        f.write("SHOES\n" + (shoes or "none") + "\n\n")
        f.write("ACCESSORIES\n" + (accessories or "none") + "\n\n")
        f.write("TIMINGS\n" + json.dumps(report["timings_seconds"], ensure_ascii=False, indent=2) + "\n")

    print("\n=== MULTI-PASS RESULT ===")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print("Saved:", out_path)

if __name__ == "__main__":
    main()


