#!/usr/bin/env python3
"""
Тестовый скрипт для проверки разных промптов классификации одежды
Отправляет одно или несколько изображений с разными промптами на FastVLM сервер
"""

import requests
import base64
import json
import time
import os
from pathlib import Path
from typing import List, Dict, Any

# ============================================================================
# КОНФИГУРАЦИЯ
# ============================================================================

# URL FastVLM сервера
FASTVLM_URL = "http://127.0.0.1:3001"

# Путь к изображению или папке с изображениями
# Примеры:
# - Одно изображение: "../server/uploads/wardrobe/251053908/item_251053908_9na5rrt5.png"
# - Папка пользователя: "../server/uploads/wardrobe/251053908"
# - Вся папка wardrobe: "../server/uploads/wardrobe"
#IMAGE_PATH = "server/uploads/wardrobe/251053908/item_251053908_yyz78fw2.png" #джинсы
IMAGE_PATH = "server/uploads/wardrobe/251053908/item_251053908_9na5rrt5.png" #пальто
#IMAGE_PATH = "server/uploads/wardrobe/251053908/item_251053908_74kyg057.png" #t-shirt
#IMAGE_PATH = "server/uploads/wardrobe/251053908/item_251053908_uqwj3pcw.png" #ботинки


# Список промптов для тестирования
PROMPTS = [
    # Промпт 1: Только категория
    """What type of clothing is this? Answer in one word from this list:  
- OUTERWEAR (jackets, coats)
- INNERWEAR (sweaters, hoodies, cardigans)
- BODYWEAR (t-shirts, shirts, blouses)
- FULLBODY (dresses, jumpsuits)
- LEGWEAR (pants, jeans, shorts)
- FOOTWEAR (shoes, boots, sneakers)
- HEADWEAR (hats, caps, beanies)
- ACCESSORIES (bags, belts, jewelry)""",
    #"""What type of clothing in image? Answer in one word""", #2
    #"""What color of clothing in image? Answer in one word""", #3
    #"""What style of clothing in image? Answer in one word""", #4
    #"""What material of clothing in image? Answer in one word""", #5
    #"""What fit of clothing in image? Answer in one word""", #6
    #"""What season of clothing in image? Answer in one word""", #7
    """clothing type?""",
    """clothing color?""",
    """clothing style?""",
    """clothing material?""",
    """clothing fit?""",
    """clothing season?"""
]

# ============================================================================
# ФУНКЦИИ
# ============================================================================

def load_image_as_base64(image_path: str) -> str:
    """Загружает изображение и конвертирует в base64"""
    with open(image_path, 'rb') as f:
        image_data = f.read()
    return base64.b64encode(image_data).decode('utf-8')


def test_prompt(image_base64: str, prompt: str, prompt_index: int) -> Dict[str, Any]:
    """Тестирует один промпт"""
    start_time = time.time()
    
    try:
        # Отправляем запрос на FastVLM сервер
        response = requests.post(
            f"{FASTVLM_URL}/analyze_for_test",
            json={
                "image_base64": image_base64,
                "prompt": prompt,
                "nickname": "test_user"
            },
            timeout=120
        )
        
        request_time = time.time() - start_time
        
        if response.status_code == 200:
            result = response.json()
            answer = result.get('technical_analysis', 'Нет ответа')
            
            # Минималистичный вывод: номер, ответ, время
            print(f"\n{prompt_index + 1}. {answer} == {request_time:.2f}с")
            
            return {
                'success': True,
                'prompt_index': prompt_index + 1,
                'prompt': prompt,
                'response': answer,
                'time': request_time,
                'timing_details': result.get('timing', {})
            }
        else:
            print(f"\n{prompt_index + 1}. ❌ ОШИБКА: {response.status_code} == {request_time:.2f}с")
            
            return {
                'success': False,
                'prompt_index': prompt_index + 1,
                'prompt': prompt,
                'error': f"HTTP {response.status_code}: {response.text}",
                'time': request_time
            }
    
    except Exception as e:
        request_time = time.time() - start_time
        print(f"\n{prompt_index + 1}. ❌ ИСКЛЮЧЕНИЕ: {e} == {request_time:.2f}с")
        
        return {
            'success': False,
            'prompt_index': prompt_index + 1,
            'prompt': prompt,
            'error': str(e),
            'time': request_time
        }


def get_image_files(path: str) -> List[str]:
    """Получает список файлов изображений"""
    path_obj = Path(path)
    
    if path_obj.is_file():
        return [str(path_obj)]
    elif path_obj.is_dir():
        image_extensions = {'.jpg', '.jpeg', '.png', '.webp', '.bmp'}
        return [
            str(f) for f in path_obj.iterdir() 
            if f.suffix.lower() in image_extensions
        ]
    else:
        raise ValueError(f"Путь не существует: {path}")

def print_summary(all_results: List[Dict[str, Any]]):
    """Выводит итоговую статистику"""
    total_time = sum(r['time'] for r in all_results)
    print(f"\nОбщее время: {total_time:.2f}с")


# ============================================================================
# ГЛАВНАЯ ФУНКЦИЯ
# ============================================================================

def main():
    """Главная функция"""
    # Получаем список изображений
    try:
        image_files = get_image_files(IMAGE_PATH)
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        return
    
    if not image_files:
        print("❌ Не найдено изображений")
        return
    
    # Проверяем доступность сервера
    try:
        requests.get(f"{FASTVLM_URL}/health", timeout=5)
    except Exception as e:
        print(f"❌ FastVLM сервер недоступен: {e}")
        return
    
    # Тестируем каждое изображение с каждым промптом
    all_results = []
    
    for image_index, image_file in enumerate(image_files):
        # Загружаем изображение
        try:
            image_base64 = load_image_as_base64(image_file)
        except Exception as e:
            print(f"❌ Ошибка загрузки: {e}")
            continue
        
        # Тестируем все промпты
        image_results = []
        for prompt_index, prompt in enumerate(PROMPTS):
            result = test_prompt(image_base64, prompt, prompt_index)
            result['image_file'] = image_file
            result['image_index'] = image_index + 1
            image_results.append(result)
            all_results.append(result)
            
            # Небольшая пауза между запросами
            time.sleep(0.5)
        
    # Выводим итоговую статистику
    print_summary(all_results)
    


if __name__ == "__main__":
    main()
