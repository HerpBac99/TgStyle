#!/usr/bin/env python3
"""
Простой тест FastVLM 1.5B сервера с промптом TORSO_CLOTHING_PROMPT
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
    img.save(buf, format='JPEG', quality=95)
    return base64.b64encode(buf.getvalue()).decode('utf-8')

def post_analyze(prompt: str, image_b64: str, nickname: str = "test_user"):
    """Send analysis request to FastVLM server"""
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

# Промпт из PROMPT
#Опиши человека на фотографии. 
#Output EXACTLY one short line: Woman/Man; approximate age; build; hair (length, style, color)
#Output EXACTLY one short line: Describe the accessories on your head, neck, hand and bag
#Output EXACTLY one short line: Describe All clothing on torso. What type? What color? What material? What length?
PROMPT_person = """Output EXACTLY one short line: Describe the person in the photograph. Provide ONLY the person's approximate age and gender."""
PROMPT_cloth = """Output EXACTLY one short line: Describe All clothing on person. What type? What color? What material? What length?"""
PROMPT_shoes = """Output EXACTLY one short line: Describe the shoes on the person. What type of shoes? What color? What material? What style?"""
PROMPT_accessories = """Output EXACTLY one short line: Describe the ALL accessories on your head, neck, hand and bag."""


def main():
    if len(sys.argv) >= 2:
        image_path = sys.argv[1]
    else:
        image_path = str(Path(__file__).parent.parent / "16.jpg")

    if not os.path.exists(image_path):
        print(f"Image not found: {image_path}")
        sys.exit(1)

    img = load_image(image_path)
    b64_image = to_base64(img)

    print(f"Testing FastVLM 1.5B with PROMPT")
    print(f"Image: {image_path}")

    # Последовательные вызовы 3 промптов
    total_start_time = time.perf_counter()

    # Промпт 1: PERSON
    person_start_time = time.perf_counter()
    person_result = post_analyze(PROMPT_person, b64_image, "test_1.5b_user")
    person_time = time.perf_counter() - person_start_time

    cloth_start_time = time.perf_counter()
    cloth_result = post_analyze(PROMPT_cloth, b64_image, "test_1.5b_user")
    cloth_time = time.perf_counter() - cloth_start_time

    shoes_start_time = time.perf_counter()
    shoes_result = post_analyze(PROMPT_shoes, b64_image, "test_1.5b_user")
    shoes_time = time.perf_counter() - shoes_start_time

    accessories_start_time = time.perf_counter()
    accessories_result = post_analyze(PROMPT_accessories, b64_image, "test_1.5b_user")
    accessories_time = time.perf_counter() - accessories_start_time

    total_time = time.perf_counter() - total_start_time

    # Собираем результаты
    results = {
        "person": {
            "technical_analysis": extract_technical(person_result),
            "time": round(person_time, 3),
            "success": person_result.get("success", False)
        },
        "clothing": {
            "technical_analysis": extract_technical(cloth_result),
            "time": round(cloth_time, 3),
            "success": cloth_result.get("success", False)
        },
        "shoes": {
            "technical_analysis": extract_technical(shoes_result),
            "time": round(shoes_time, 3),
            "success": shoes_result.get("success", False)
        },
        "accessories": {
            "technical_analysis": extract_technical(accessories_result),
            "time": round(accessories_time, 3),
            "success": accessories_result.get("success", False)
        }
    }

    report = {
        "image": image_path,
        "results": results
        
    }

    # Выводим результат
    print("\n" + "="*50)
    print("📊 ОТЧЕТ ТЕСТИРОВАНИЯ FASTVLM 1.5B")
    print("="*50)
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print("="*50)

if __name__ == "__main__":
    main()