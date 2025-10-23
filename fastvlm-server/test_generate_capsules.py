#!/usr/bin/env python3
"""
Тестовый скрипт для проверки endpoint /generate-capsules
"""

import requests
import json

# URL FastVLM сервера
FASTVLM_URL = "http://127.0.0.1:3001"

# Тестовые данные гардероба
test_wardrobe_items = [
    {
        "id": 1,
        "category": "BODYWEAR",
        "subtype": "Футболка",
        "color": "Белый",
        "material": "Хлопок",
        "fit": "Regular",
        "style": "Повседневный",
        "season": "All-season",
        "pattern": "Solid",
        "description": "Белая хлопковая футболка",
        "usageCount": 5
    },
    {
        "id": 2,
        "category": "LEGWEAR",
        "subtype": "Джинсы",
        "color": "Синий",
        "material": "Деним",
        "fit": "Slim",
        "style": "Повседневный",
        "season": "All-season",
        "pattern": "Solid",
        "description": "Синие джинсы slim fit",
        "usageCount": 4
    },
    {
        "id": 3,
        "category": "OUTERWEAR",
        "subtype": "Куртка",
        "color": "Черный",
        "material": "Кожа",
        "fit": "Regular",
        "style": "Уличный",
        "season": "Spring",
        "pattern": "Solid",
        "description": "Черная кожаная куртка",
        "usageCount": 2
    },
    {
        "id": 4,
        "category": "FOOTWEAR",
        "subtype": "Кроссовки",
        "color": "Белый",
        "material": "Кожа",
        "fit": "Regular",
        "style": "Спортивный",
        "season": "All-season",
        "pattern": "Solid",
        "description": "Белые кожаные кроссовки",
        "usageCount": 3
    },
    {
        "id": 5,
        "category": "INNERWEAR",
        "subtype": "Свитер",
        "color": "Серый",
        "material": "Шерсть",
        "fit": "Regular",
        "style": "Повседневный",
        "season": "Winter",
        "pattern": "Solid",
        "description": "Серый шерстяной свитер",
        "usageCount": 1
    }
]

# Существующие капсулы (для избежания дубликатов)
existing_capsules = [
    {"itemIds": [1, 2, 4]}
]

def test_generate_capsules():
    """Тестирует endpoint /generate-capsules"""
    print("🧪 Тестирование endpoint /generate-capsules")
    print("=" * 60)
    
    # Проверяем доступность сервера
    try:
        health_response = requests.get(f"{FASTVLM_URL}/health", timeout=5)
        if health_response.status_code != 200:
            print("❌ FastVLM сервер недоступен")
            return
        print("✅ FastVLM сервер доступен")
    except Exception as e:
        print(f"❌ Ошибка подключения к FastVLM серверу: {e}")
        return
    
    # Отправляем запрос на генерацию капсул
    payload = {
        "wardrobeItems": test_wardrobe_items,
        "currentSeason": "spring",
        "currentMonth": "апрель",
        "existingCapsules": existing_capsules,
        "excludeCombinations": []
    }
    
    print(f"\n📤 Отправка запроса с {len(test_wardrobe_items)} вещами...")
    print(f"   Сезон: spring (апрель)")
    
    try:
        response = requests.post(
            f"{FASTVLM_URL}/generate-capsules",
            json=payload,
            timeout=60
        )
        
        if response.status_code != 200:
            print(f"❌ Ошибка: {response.status_code}")
            print(f"   Ответ: {response.text}")
            return
        
        result = response.json()
        
        if not result.get('success'):
            print(f"❌ Генерация не удалась: {result.get('error')}")
            return
        
        print("✅ Генерация успешна!")
        print(f"   Время: {result.get('timing', {}).get('total_time', 0)}с")
        
        capsules = result.get('capsules', [])
        print(f"\n📦 Сгенерировано капсул: {len(capsules)}")
        
        for i, capsule in enumerate(capsules, 1):
            print(f"\n--- Капсула {i} ---")
            print(f"Название: {capsule.get('name')}")
            print(f"Описание: {capsule.get('description')}")
            print(f"Обоснование: {capsule.get('reasoning')}")
            print(f"Рекомендации: {capsule.get('recommendations')}")
            print(f"Вещи (ID): {capsule.get('itemIds')}")
        
        print("\n" + "=" * 60)
        print("✅ Тест завершен успешно!")
        
    except requests.exceptions.Timeout:
        print("❌ Таймаут запроса (>60с)")
    except Exception as e:
        print(f"❌ Ошибка: {e}")

if __name__ == "__main__":
    test_generate_capsules()
