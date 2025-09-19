#!/usr/bin/env python3
"""
Простой тест FastVLM 7B сервера с промптом TORSO_CLOTHING_PROMPT
"""

import os
import sys
import io
import json
import base64
from pathlib import Path
import time
import requests
from PIL import Image

SERVER_URL = os.environ.get("FASTVLM_URL", "http://127.0.0.1:3002")

def to_base64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=95)
    return base64.b64encode(buf.getvalue()).decode('utf-8')

def post_analyze(prompt: str, image_b64: str, nickname: str = "test_user"):
    """Send analysis request to FastVLM server"""
    try:
        resp = requests.post(
            f"{SERVER_URL}/analyze",
            json={
                "image_base64": image_b64,
                "prompt": prompt,
                "nickname": nickname
            },
            timeout=120
        )
        resp.raise_for_status()
        result = resp.json()

        if result.get("success"):
            return {
                "success": True,
                "technical_analysis": result.get("technical_analysis", ""),
                "analysis": result.get("analysis", ""),
                "timing": result.get("timing", {})
            }
        else:
            return {
                "success": False,
                "error": result.get("error", "Server error"),
                "technical_analysis": "",
                "analysis": ""
            }

    except Exception as e:
        print(f"Error in post_analyze: {e}")
        return {
            "success": False,
            "error": str(e),
            "technical_analysis": "",
            "analysis": ""
        }

def extract_technical(result: dict) -> str:
    return (
        (result or {}).get("technical_analysis")
        or ""
    )

def extract_stylist(result: dict) -> str:
    return (
        (result or {}).get("analysis")
        or ""
    )

def load_image(path: str) -> Image.Image:
    return Image.open(path).convert('RGB')

# Промпт из TORSO_CLOTHING_PROMPT
TORSO_CLOTHING_PROMPT = "Briefly describe the person, gender, and age. Describe all clothing in detail. Describe shoes in detail. Describe all accessories in detail."

def main():
    if len(sys.argv) >= 2:
        image_path = sys.argv[1]
    else:
        image_path = str(Path(__file__).parent.parent / "10.jpg")

    if not os.path.exists(image_path):
        print(f"Image not found: {image_path}")
        sys.exit(1)

    img = load_image(image_path)
    b64_image = to_base64(img)

    print(f"Testing FastVLM 7B with TORSO_CLOTHING_PROMPT")
    print(f"Image: {image_path}")

    # Single analysis request
    start_time = time.perf_counter()
    result = post_analyze(TORSO_CLOTHING_PROMPT, b64_image, "test_7b_user")
    elapsed = time.perf_counter() - start_time

    technical_analysis = extract_technical(result)
    stylist_analysis = extract_stylist(result)

    report = {
        "image": image_path,
        "technical_analysis": technical_analysis,
        "stylist_analysis": stylist_analysis,
        "timings_seconds": {
            "total": round(elapsed, 3),
            "fastvlm_time": result.get("timing", {}).get("fastvlm_time", 0),
            "stylist_time": result.get("timing", {}).get("stylist_time", 0)
        },
        "success": result.get("success", False)
    }

    print("\n=== FASTVLM 7B TORSO_CLOTHING_PROMPT RESULT ===")
    print(json.dumps(report, ensure_ascii=False, indent=2))

    # Save result
    out_path = Path(__file__).parent / "results" / "latest_7b_test_output.txt"
    out_path.parent.mkdir(exist_ok=True)

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("TECHNICAL ANALYSIS (FastVLM)\n")
        f.write(technical_analysis or "No technical analysis")
        f.write("\n\n")
        f.write("STYLIST ANALYSIS (AI)\n")
        f.write(stylist_analysis or "No stylist analysis")
        f.write("\n\n")
        f.write("TIMINGS\n" + json.dumps(report["timings_seconds"], ensure_ascii=False, indent=2) + "\n")

    print(f"Saved: {out_path}")

if __name__ == "__main__":
    main()