#!/usr/bin/env python3
"""
Тестовый скрипт для проверки mock endpoint /generate-capsules-mock
"""

import requests
import json
import time

# Конфигурация
FASTVLM_URL = "http://127.0.0.1:3001"

def test_mock_generation():
    """Тестирует mock endpoint /generate-capsules-mock"""
    print("🧪 Тестирование mock endpoint /generate-capsules-mock")
    print("=" * 60)
    
    # Тестовые данные гардероба (расширенный набор)
    test_wardrobe = [
        # BODYWEAR
        {
            "id": 1,
            "category": "BODYWEAR",
            "subtype": "t-shirt",
            "color": "white",
            "material": "cotton",
            "fit": "regular",
            "style": "casual",
            "season": "all-season",
            "pattern": "solid",
            "description": "Белая футболка",
            "usageCount": 2
        },
        {
            "id": 6,
            "category": "BODYWEAR",
            "subtype": "shirt",
            "color": "blue",
            "material": "cotton",
            "fit": "slim",
            "style": "formal",
            "season": "all-season",
            "pattern": "solid",
            "description": "Синяя рубашка",
            "usageCount": 4
        },
        {
            "id": 7,
            "category": "BODYWEAR",
            "subtype": "t-shirt",
            "color": "black",
            "material": "cotton",
            "fit": "oversized",
            "style": "streetwear",
            "season": "all-season",
            "pattern": "solid",
            "description": "Черная футболка оверсайз",
            "usageCount": 0
        },
        
        # LEGWEAR
        {
            "id": 2,
            "category": "LEGWEAR",
            "subtype": "jeans",
            "color": "blue",
            "material": "denim",
            "fit": "slim",
            "style": "casual",
            "season": "all-season",
            "pattern": "solid",
            "description": "Синие джинсы",
            "usageCount": 5
        },
        {
            "id": 8,
            "category": "LEGWEAR",
            "subtype": "trousers",
            "color": "black",
            "material": "wool",
            "fit": "regular",
            "style": "formal",
            "season": "autumn",
            "pattern": "solid",
            "description": "Черные брюки",
            "usageCount": 1
        },
        {
            "id": 9,
            "category": "LEGWEAR",
            "subtype": "shorts",
            "color": "beige",
            "material": "cotton",
            "fit": "regular",
            "style": "casual",
            "season": "summer",
            "pattern": "solid",
            "description": "Бежевые шорты",
            "usageCount": 0
        },
        
        # FOOTWEAR
        {
            "id": 3,
            "category": "FOOTWEAR",
            "subtype": "sneakers",
            "color": "white",
            "material": "leather",
            "fit": "regular",
            "style": "casual",
            "season": "all-season",
            "pattern": "solid",
            "description": "Белые кроссовки",
            "usageCount": 3
        },
        {
            "id": 10,
            "category": "FOOTWEAR",
            "subtype": "boots",
            "color": "brown",
            "material": "leather",
            "fit": "regular",
            "style": "casual",
            "season": "autumn",
            "pattern": "solid",
            "description": "Коричневые ботинки",
            "usageCount": 2
        },
        
        # OUTERWEAR
        {
            "id": 4,
            "category": "OUTERWEAR",
            "subtype": "jacket",
            "color": "black",
            "material": "denim",
            "fit": "regular",
            "style": "casual",
            "season": "spring",
            "pattern": "solid",
            "description": "Черная джинсовая куртка",
            "usageCount": 0
        },
        {
            "id": 11,
            "category": "OUTERWEAR",
            "subtype": "coat",
            "color": "gray",
            "material": "wool",
            "fit": "regular",
            "style": "formal",
            "season": "winter",
            "pattern": "solid",
            "description": "Серое пальто",
            "usageCount": 1
        },
        
        # INNERWEAR
        {
            "id": 5,
            "category": "INNERWEAR",
            "subtype": "sweater",
            "color": "gray",
            "material": "wool",
            "fit": "regular",
            "style": "casual",
            "season": "autumn",
            "pattern": "solid",
            "description": "Серый свитер",
            "usageCount": 1
        },
        {
            "id": 12,
            "category": "INNERWEAR",
            "subtype": "hoodie",
            "color": "black",
            "material": "cotton",
            "fit": "oversized",
            "style": "streetwear",
            "season": "autumn",
            "pattern": "solid",
            "description": "Черное худи",
            "usageCount": 0
        }
    ]
    
    payload = {
        "wardrobeItems": test_wardrobe,
        "currentSeason": "autumn",
        "currentMonth": "октябрь",
        "existingCapsules": [],
        "excludeCombinations": []
    }
    
    print(f"📤 Отправляем запрос с {len(test_wardrobe)} вещами...")
    print(f"🍂 Текущий сезон: autumn (октябрь)")
    
    try:
        start_time = time.time()
        response = requests.post(
            f"{FASTVLM_URL}/generate-capsules-mock",
            json=payload,
            timeout=30
        )
        
        duration = time.time() - start_time
        
        print(f"⏱️  Время ответа: {duration:.2f}с")
        print(f"📊 HTTP статус: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            
            if result.get('success'):
                capsules = result.get('capsules', [])
                print(f"✅ Успешно сгенерировано {len(capsules)} капсул")
                
                for i, capsule in enumerate(capsules, 1):
                    print(f"\n📦 Капсула {i}:")
                    print(f"   Название: {capsule.get('name')}")
                    print(f"   Описание: {capsule.get('description')}")
                    print(f"   Стратегия: {capsule.get('strategy')}")
                    print(f"   Вещи: {len(capsule.get('itemIds', []))} шт")
                    print(f"   ID вещей: {capsule.get('itemIds')}")
                    print(f"   Рекомендации: {capsule.get('recommendations')}")
                
                timing = result.get('timing', {})
                print(f"\n⚡ Время генерации: {timing.get('total_time', 'N/A')}с")
                
            else:
                print(f"❌ Ошибка генерации: {result.get('error')}")
        else:
            print(f"❌ HTTP ошибка: {response.status_code}")
            print(f"📄 Ответ: {response.text}")
            
    except requests.exceptions.Timeout:
        print("⏰ Таймаут запроса (30с)")
    except requests.exceptions.ConnectionError:
        print("🔌 Ошибка подключения к FastVLM серверу")
        print("💡 Убедитесь, что сервер запущен на http://127.0.0.1:3001")
    except Exception as e:
        print(f"💥 Неожиданная ошибка: {e}")

if __name__ == "__main__":
    test_mock_generation()