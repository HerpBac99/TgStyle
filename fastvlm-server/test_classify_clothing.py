#!/usr/bin/env python3
"""
Простой тест: отправляем фото и промпт, получаем ответ LLM
"""

import os
import sys
import io
import base64
from pathlib import Path
import requests
from PIL import Image

SERVER_URL = os.environ.get("FASTVLM_URL", "http://127.0.0.1:3001")

def to_base64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=100)
    return base64.b64encode(buf.getvalue()).decode('utf-8')

def test_simple_analyze(image_b64: str, prompt: str):
    """Простой запрос: фото + промпт = ответ LLM"""
    try:
        payload = {
            "image_base64": image_b64,
            "prompt": prompt
        }

        resp = requests.post(
            f"{SERVER_URL}/simple_analyze",
            json=payload,
            timeout=120
        )
        resp.raise_for_status()
        result = resp.json()

        if result.get("success"):
            return {
                "success": True,
                "answer": result.get("answer", ""),
                "time": result.get("time", 0)
            }
        else:
            return {
                "success": False,
                "error": result.get("error", "Server error")
            }

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def main():
    if len(sys.argv) >= 2:
        image_path = sys.argv[1]
    else:
        # Свитер по умолчанию
        image_path = str(Path(__file__).parent.parent / "server" / "uploads" / "wardrobe" / "251053908" / "item_251053908_0fubt8zr.png")

    if not os.path.exists(image_path):
        print(f"Image not found: {image_path}")
        sys.exit(1)

    # Промпт для классификации (9 пунктов)
    prompt = """Analyze the clothing item in the photograph and provide a strict answer in this format:
1. [Type of clothing (Outerwear, Innerwear, Bodywear, Fullbody, Legwear, Footwear, Headwear, Accessories)]
2. [Subtype]
3. [Color]
4. [Material]
5. [Fit (fitted, loose, oversized, etc.)]
6. [Style (casual, business, office, sport, streetwear, etc.)]
7. [Season (spring, summer, autumn, winter, all-season)]
8. [Pattern (solid, striped, checkered, floral, graphic, printed, etc.)]
9. [Describe clothing in one sentence]
9. [Describe clothing]
"""

    img = Image.open(image_path).convert('RGB')
    b64_image = to_base64(img)

    print(f"Тест простого анализа")
    print(f"Изображение: {image_path}")
    print(f"Размер: {img.size}")
    print()
    print("Промпт:")
    print("-" * 80)
    print(prompt)
    print("-" * 80)
    print()
    print("Отправляем запрос...")
    print()

    result = test_simple_analyze(b64_image, prompt)

    if result.get("success"):
        print("✅ УСПЕШНО")
        print(f"⏱️  Время: {result.get('time', 0):.2f}с")
        print()
        print("Ответ LLM:")
        print("=" * 80)
        print(result.get("answer", ""))
        print("=" * 80)
    else:
        print(f"❌ ОШИБКА: {result.get('error', 'Unknown error')}")

if __name__ == "__main__":
    main()
