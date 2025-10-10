#!/usr/bin/env python3
"""
Тест classify_clothing эндпоинта FastVLM
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

def post_classify_clothing(image_b64: str, prompt: str = None, nickname: str = "test_user"):
    """Send classification request to FastVLM server"""
    try:
        payload = {
            "image_base64": image_b64,
            "nickname": nickname
        }

        if prompt:
            payload["prompt"] = prompt

        resp = requests.post(
            f"{SERVER_URL}/classify_clothing",
            json=payload,
            timeout=120
        )
        resp.raise_for_status()
        result = resp.json()

        if result.get("success"):
            return {
                "success": True,
                "classification": result.get("classification", {}),
                "raw_analysis": result.get("raw_analysis", ""),
                "timing": result.get("timing", {}),
                "image_info": result.get("image_info", {})
            }
        else:
            return {
                "success": False,
                "error": result.get("error", "Server error"),
                "classification": {},
                "raw_analysis": ""
            }

    except Exception as e:
        print(f"Error in post_classify_clothing: {e}")
        return {
            "success": False,
            "error": str(e),
            "classification": {},
            "raw_analysis": ""
        }

def load_image(path: str) -> Image.Image:
    return Image.open(path).convert('RGB')

# Используем тот же промпт, что и в test_1prompt.py
PROMPT_classification = """Analyze the clothing item in the photograph and provide a strict answer in this format:
1. [Type of clothing (Outerwear, Innerwear, Bodywear, Fullbody, Legwear, Footwear, Headwear, Accessories)]
2. [Subtype of clothing]
3. [Color]
4. [material]
5. [fit (fit, loose, etc.)]
6. [Style (casual, business, office, sport, etc.)]
"""

def main():
    if len(sys.argv) >= 2:
        image_path = sys.argv[1]
    else:
        # Палка на фото
        image_path = str(Path(__file__).parent.parent / "server" / "uploads" / "wardrobe" / "251053908" / "item_251053908_3tgfmgxh.png")

    if not os.path.exists(image_path):
        print(f"Image not found: {image_path}")
        sys.exit(1)

    img = load_image(image_path)
    b64_image = to_base64(img)

    print(f"Testing classify_clothing endpoint")
    print(f"Image: {image_path}")
    print(f"Image size: {img.size}")
    print(f"Base64 length: {len(b64_image)} chars")
    print()

    total_start_time = time.perf_counter()

    classification_start_time = time.perf_counter()
    classification_result = post_classify_clothing(b64_image, PROMPT_classification, "test_classify_user")
    classification_time = time.perf_counter() - classification_start_time

    total_time = time.perf_counter() - total_start_time

    # Собираем результаты
    results = {
        "classification": {
            "result": classification_result.get("classification", {}),
            "raw_analysis": classification_result.get("raw_analysis", ""),
            "time": round(classification_time, 3),
            "success": classification_result.get("success", False)
        }
    }

    report = {
        "image": image_path,
        "results": results,
        "total_time": round(total_time, 3)
    }

    print("КЛАССИФИКАЦИЯ ОДЕЖДЫ:")
    print("-" * 50)

    if results['classification']['success']:
        print(f"Время выполнения: {results['classification']['time']:.3f}с")
        print()

        print("Классификация:")
        for key, value in results['classification']['result'].items():
            print(f"  {key}: {value}")
        print()

        print("Сырой анализ LLM:")
        print(results['classification']['raw_analysis'])
        print()

        if 'timing' in classification_result and classification_result['timing']:
            timing = classification_result['timing']
            print("Время по шагам:")
            print(f"  Всего: {timing.get('total_time', 0):.2f}с")
            print(f"  Удаление фона: {timing.get('background_removal_time', 0):.2f}с")
            print(f"  Анализ: {timing.get('analysis_time', 0):.2f}с")
            print()

        if 'image_info' in classification_result and classification_result['image_info']:
            image_info = classification_result['image_info']
            print("Информация об изображении:")
            print(f"  Оригинальный размер: {image_info.get('original_size', 'unknown')}")
            print(f"  Обработанный размер: {image_info.get('processed_size', 'unknown')}")
            print()

    else:
        print(f"ОШИБКА: {results['classification'].get('error', 'Unknown error')}")
        print()

    print("="*80)

if __name__ == "__main__":
    main()
