#!/usr/bin/env python3
"""
Тест 1 промта FastVLM
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

SERVER_URL = os.environ.get("FASTVLM_URL", "http://127.0.0.1:3001")

def to_base64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=100)
    return base64.b64encode(buf.getvalue()).decode('utf-8')

def post_analyze(prompt: str, image_b64: str, nickname: str = "test_user"):
    """Send analysis request to FastVLM server (multipass mode)"""
    try:
        resp = requests.post(
            f"{SERVER_URL}/analyze_for_test",
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

PROMPT_classification = """Analyze the clothing item in the photograph and provide a strict answer in this format:
1. [Type of clothing]
2. [Color]
3. [Material]
4. [Fit]
5. [Style]
6. [Description in one sentence]
"""

def main():
    if len(sys.argv) >= 2:
        image_path = sys.argv[1]
    else:
        #image_path = str(Path(__file__).parent.parent / "item_251053908_mhlxnwym.png") - пальто
        image_path = str(Path(__file__).parent.parent / "server" / "uploads" / "wardrobe" / "251053908" / "item_251053908_6cuey0f0.png")

    if not os.path.exists(image_path):
        print(f"Image not found: {image_path}")
        sys.exit(1)

    img = load_image(image_path)
    b64_image = to_base64(img)

    print(f"Testing FastVLM 1.5B with PROMPT_classification")
    print(f"Image: {image_path}")

    total_start_time = time.perf_counter()

    classification_start_time = time.perf_counter()
    classification_result = post_analyze(PROMPT_classification, b64_image, "test_1.5b_user")
    classification_time = time.perf_counter() - classification_start_time

    total_time = time.perf_counter() - total_start_time


    # Собираем результаты
    results = {
        "classification": {
            "technical_analysis": extract_technical(classification_result),
            "time": round(classification_time, 3),
            "success": classification_result.get("success", False)
        }
    }

    report = {
        "image": image_path,
        "results": results,
        "total_time": round(total_time, 3)
    }

    print("ТЕХНИЧЕСКИЙ АНАЛИЗ:")
    print("-" * 30)

    # Выводим результаты всех проходов
    if results['classification']['technical_analysis']:
        print(f"({results['classification']['time']:.3f}с)")
        print(f"{results['classification']['technical_analysis']}")
        print()

    print("\n" + "="*60)

if __name__ == "__main__":
    main()