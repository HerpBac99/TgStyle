#!/usr/bin/env python3
"""
Тест FastVLM 1.5B сервера с выбором режима анализа

ПЕРЕМЕННАЯ TECH_ANALYZE:
Управляет режимом работы теста:

- TECH_ANALYZE=true (или не установлена):
  Многопроходный анализ с отдельными промптами для разных частей
  Использует endpoint /analyze_for_test с промптами
  Анализирует: человек, одежда, обувь, аксессуары отдельно
  Выводит только технический анализ (без стилистического)

- TECH_ANALYZE=false:
  Реальный режим сервера - как работает в продакшене
  Использует endpoint /analyze без промпта
  Один вызов для полного анализа изображения
  Выводит и технический, и стилистический анализ

Примеры использования:
  python test_1.5b.py                    # многопроходный режим (по умолчанию)
  TECH_ANALYZE=false python test_1.5b.py # реальный режим сервера
  TECH_ANALYZE=true python test_1.5b.py  # многопроходный режим

ВЫВОД:
- Режим и endpoint
- Время анализа
- Технический анализ (всегда)
- Стилистический анализ (только в реальном режиме)
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
# Режим анализа: True = многопроходный, False = реальный режим сервера
TECH_ANALYZE = False

def to_base64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=95)
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

def post_analyze_real(image_b64: str, nickname: str = "test_user"):
    """Send analysis request to real FastVLM server (single call mode)"""
    try:
        # В реальном режиме вызываем /analyze без промпта
        resp = requests.post(
            f"{SERVER_URL}/analyze",
            json={
                "image_base64": image_b64,
                "nickname": nickname
            },
            timeout=120
        )
        resp.raise_for_status()
        result = resp.json()

        if result.get("success"):
            # В реальном режиме сервер возвращает technical_analysis и analysis (стилистический)
            return {
                "success": True,
                "technical_analysis": result.get("technical_analysis", ""),
                "analysis": result.get("analysis", ""),  # Это стилистический анализ
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
        print(f"Error in post_analyze_real: {e}")
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
#PROMPT_person = """Describe the person gender and age in the photograph.""" 
#PROMPT_cloth = """Output EXACTLY one short line: Describe all VISIBLE Outerwear and Innerwear clothing on the person's torso."""
#PROMPT_leg = """Output EXACTLY one short line: Describe all VISIBLE clothing on the person's legs."""
#PROMPT_shoes = """Output EXACTLY one short line: Describe the VISIBLE shoes on the person's feet. If no shoes are visible, state that clearly."""
#PROMPT_accessories = """Output EXACTLY one short line: Describe the ALL VISIBLE accessories on your head, neck, hand and bag. If no accessories are visible, state that clearly."""
#describe in one sentence
PROMPT_person = """Describe the person gender and age in the photograph.""" 
PROMPT_cloth = """Focus on the person's torso area. Describe all VISIBLE Outerwear and Innerwear clothing on the person's torso. 
**Strictly classify items using the following types:**
**Outerwear:** Puffer/Down Jacket, Parka, Coat, Trench Coat/Raincoat, Windbreaker, Anorak, Bomber Jacket, Leather Jacket, Fleece Jacket.
**Mid-Layers:** Sweater, Jumper, Pullover, Hoodie, Cardigan, Hoodie (Zip-up), Vest/Gilet, Sweatshirt.
**Innerwear:** T-shirt shirt, Longsleeve T-shirt, Polo Shirt, Turtleneck/Rollneck, Shirt, Blouse, Tunic, Tank Top/Undershirt 
If no torso is visible, state that clearly."""
PROMPT_leg = """Focus on the person's legs area. Describe all VISIBLE clothing on the person's legs. If no legs are visible, state that clearly."""
PROMPT_shoes = """Focus on the person's feet area. Describe the VISIBLE shoes on the person's feet. If no shoes are visible, state that clearly."""
PROMPT_accessories = """Focus on the person's head, neck, hand and bag area. Describe the ALL VISIBLE accessories on your head, neck, hand and bag. If no accessories are visible, state that clearly."""


def main():
    if len(sys.argv) >= 2:
        image_path = sys.argv[1]
    else:
        image_path = str(Path(__file__).parent.parent / "19.jpg")

    if not os.path.exists(image_path):
        print(f"Image not found: {image_path}")
        sys.exit(1)

    img = load_image(image_path)
    b64_image = to_base64(img)

    print(f"Testing FastVLM 1.5B with TECH_ANALYZE={TECH_ANALYZE}")
    print(f"Image: {image_path}")
    print(f"Mode: {'Multipass analysis (tech_analyze=True)' if TECH_ANALYZE else 'Real server mode (tech_analyze=False)'}")
    print("-" * 50)

    # Выбор режима анализа
    total_start_time = time.perf_counter()

    if TECH_ANALYZE:
        # Многопроходный режим анализа (tech_analyze = True)
        print("Running multipass analysis...")

        # Промпт 1: PERSON
        person_start_time = time.perf_counter()
        person_result = post_analyze(PROMPT_person, b64_image, "test_1.5b_user")
        person_time = time.perf_counter() - person_start_time

        cloth_start_time = time.perf_counter()
        cloth_result = post_analyze(PROMPT_cloth, b64_image, "test_1.5b_user")
        cloth_time = time.perf_counter() - cloth_start_time

        leg_start_time = time.perf_counter()
        leg_result = post_analyze(PROMPT_leg, b64_image, "test_1.5b_user")
        leg_time = time.perf_counter() - leg_start_time

        shoes_start_time = time.perf_counter()
        shoes_result = post_analyze(PROMPT_shoes, b64_image, "test_1.5b_user")
        shoes_time = time.perf_counter() - shoes_start_time

        accessories_start_time = time.perf_counter()
        accessories_result = post_analyze(PROMPT_accessories, b64_image, "test_1.5b_user")
        accessories_time = time.perf_counter() - accessories_start_time

        total_time = time.perf_counter() - total_start_time

        print(f"Multipass analysis completed in {total_time:.2f}s")
    else:
        # Реальный режим сервера (tech_analyze = False)
        print("Running real server mode...")

        # Один вызов /analyze без промпта
        server_start_time = time.perf_counter()
        server_result = post_analyze_real(b64_image, "test_1.5b_user")
        server_time = time.perf_counter() - server_start_time

        total_time = time.perf_counter() - total_start_time

        print(f"Real server analysis completed in {server_time:.2f}s")

        # В реальном режиме сервер возвращает единый результат
        # Заполняем все поля одинаковыми значениями для совместимости
        person_result = server_result
        cloth_result = server_result
        leg_result = server_result
        shoes_result = server_result
        accessories_result = server_result

        person_time = server_time
        cloth_time = server_time
        leg_time = server_time
        shoes_time = server_time
        accessories_time = server_time

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
        "leg": {
            "technical_analysis": extract_technical(leg_result),
            "time": round(leg_time, 3),
            "success": leg_result.get("success", False)
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
        "tech_analyze_mode": TECH_ANALYZE,
        "mode_description": "multipass" if TECH_ANALYZE else "real_server",
        "results": results,
        "total_time": round(total_time, 3)
    }

    # Выводим результат
    print("\n" + "="*60)
    print("РЕЗУЛЬТАТ АНАЛИЗА FASTVLM")
    print("="*60)

    # Выводим информацию о режиме
    mode_name = "МНОГОПРОХОДНЫЙ" if TECH_ANALYZE else "РЕАЛЬНЫЙ РЕЖИМ"
    endpoint_name = "/analyze_for_test" if TECH_ANALYZE else "/analyze"
    print(f"Режим: {mode_name}")
    print(f"Endpoint: {endpoint_name}")
    print(f"Время: {total_time:.2f}с")
    print()

    if TECH_ANALYZE:
        # Режим TECH_ANALYZE=true: выводим ВСЕ технические анализы отдельно
        print("ТЕХНИЧЕСКИЙ АНАЛИЗ:")
        print("-" * 30)

        # Выводим результаты всех проходов
        if results['person']['technical_analysis']:
            print(f"ЧЕЛОВЕК: ({results['person']['time']:.3f}с)")
            print(f"  {results['person']['technical_analysis']}")
            print()

        if results['clothing']['technical_analysis']:
            print(f"ОДЕЖДА: ({results['clothing']['time']:.3f}с)")
            print(f"  {results['clothing']['technical_analysis']}")
            print()

        if results['leg']['technical_analysis']:
            print(f"НОГИ: ({results['leg']['time']:.3f}с)")
            print(f"  {results['leg']['technical_analysis']}")
            print()

        if results['shoes']['technical_analysis']:
            print(f"ОБУВЬ: ({results['shoes']['time']:.3f}с)")
            print(f"  {results['shoes']['technical_analysis']}")
            print()

        if results['accessories']['technical_analysis']:
            print(f"АКСЕССУАРЫ: ({results['accessories']['time']:.3f}с)")
            print(f"  {results['accessories']['technical_analysis']}")
            print()

        # В режиме TECH_ANALYZE стилистический анализ не выводится
        print("СТИЛИСТИЧЕСКИЙ АНАЛИЗ: не выводится (TECH_ANALYZE=true)")

    else:
        # Режим TECH_ANALYZE=false: реальный режим сервера
        # Выводим объединенный технический анализ и стилистический анализ
        technical_response = extract_technical(server_result)
        stylist_response = extract_stylist(server_result)

        print("ТЕХНИЧЕСКИЙ АНАЛИЗ:")
        print("-" * 30)
        print(technical_response)
        print()

        if stylist_response:
            print("СТИЛИСТИЧЕСКИЙ АНАЛИЗ:")
            print("-" * 30)
            print(stylist_response)
        else:
            print("СТИЛИСТИЧЕСКИЙ АНАЛИЗ: не получен")

    print("\n" + "="*60)

if __name__ == "__main__":
    main()