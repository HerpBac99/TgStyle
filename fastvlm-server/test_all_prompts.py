#!/usr/bin/env python3
"""
Тестирование всех вариантов промптов для FastVLM
Запускает каждый промпт и показывает результат
"""

import os
import sys
import json
import time
import base64
import requests
from pathlib import Path

# Configuration
TEST_IMAGE_PATH = "12.jpg"
SERVER_URL = "http://127.0.0.1:3001"

# Список всех промптов для тестирования
PROMPTS_TO_TEST = [
    ("Original", "prompt.md"),
    ("Structured v1 (Numbered)", "prompt_structured_v1.md"),
    ("Structured v2 (Bullet points)", "prompt_structured_v2.md"), 
    ("Structured v3 (Sections)", "prompt_structured_v3.md"),
    ("Structured v4 (Catalog)", "prompt_structured_v4.md")
]

def load_image_as_base64(image_path):
    """Load image and convert to base64"""
    try:
        with open(image_path, 'rb') as f:
            image_data = f.read()
        return base64.b64encode(image_data).decode('utf-8')
    except Exception as e:
        print(f"Error loading image: {e}")
        return None

def load_prompt_from_file(prompt_file):
    """Load prompt from specific file"""
    try:
        prompt_path = Path(__file__).parent / prompt_file
        with open(prompt_path, 'r', encoding='utf-8') as f:
            content = f.read().strip()
        return content
    except Exception as e:
        print(f"Error loading prompt from {prompt_file}: {e}")
        return None

def test_prompt(prompt_name, prompt_file, image_base64):
    """Test a specific prompt"""
    print(f"\n{'='*80}")
    print(f"ТЕСТИРУЕМ: {prompt_name}")
    print(f"Файл: {prompt_file}")
    print(f"{'='*80}")
    
    # Load prompt
    prompt_text = load_prompt_from_file(prompt_file)
    if not prompt_text:
        print(f"❌ Не удалось загрузить промпт из {prompt_file}")
        return None
    
    print(f"\nПРОМПТ:")
    print("-" * 40)
    print(prompt_text)
    print("-" * 40)
    
    # Prepare request
    data = {
        'prompt': prompt_text,
        'image_base64': image_base64
    }
    
    try:
        print(f"\n⏳ Отправляем запрос в FastVLM...")
        start_time = time.time()
        
        response = requests.post(
            f"{SERVER_URL}/analyze",
            json=data,
            timeout=90  # Увеличиваем таймаут для сложных промптов
        )
        
        end_time = time.time()
        
        if response.status_code == 200:
            result = response.json()
            technical_analysis = result.get('technical_analysis', 'No technical analysis received')
            
            print(f"\n✅ РЕЗУЛЬТАТ (время: {end_time - start_time:.1f}с):")
            print("=" * 80)
            print(technical_analysis)
            print("=" * 80)
            
            return {
                'prompt_name': prompt_name,
                'prompt_file': prompt_file,
                'success': True,
                'response': technical_analysis,
                'time': end_time - start_time
            }
        else:
            print(f"❌ Ошибка сервера: {response.status_code}")
            print(f"Ответ: {response.text}")
            return {
                'prompt_name': prompt_name,
                'prompt_file': prompt_file,
                'success': False,
                'error': f"Server error {response.status_code}",
                'time': end_time - start_time
            }
            
    except Exception as e:
        print(f"❌ Ошибка запроса: {e}")
        return {
            'prompt_name': prompt_name,
            'prompt_file': prompt_file,
            'success': False,
            'error': str(e),
            'time': 0
        }

def analyze_results(results):
    """Анализируем результаты всех тестов"""
    print(f"\n{'='*80}")
    print("СВОДКА РЕЗУЛЬТАТОВ")
    print(f"{'='*80}")
    
    successful_results = [r for r in results if r['success']]
    
    print(f"\n📊 Успешных тестов: {len(successful_results)}/{len(results)}")
    
    for i, result in enumerate(results, 1):
        status = "✅" if result['success'] else "❌"
        time_str = f"{result['time']:.1f}с" if result['success'] else "N/A"
        print(f"{i}. {status} {result['prompt_name']} ({time_str})")
        
        if result['success']:
            response = result['response']
            # Проверяем структурированность ответа
            if "ITEM 1:" in response and "ITEM 2:" in response:
                print("   📝 Структурированный ответ - ОТЛИЧНО!")
            elif response.count('\n') > 3:
                print("   📝 Многострочный ответ - хорошо")
            else:
                print("   📝 Одна строка - нужно улучшить")
    
    print(f"\n{'='*80}")
    print("РЕКОМЕНДАЦИИ:")
    print(f"{'='*80}")
    
    # Находим лучший результат
    structured_results = []
    for result in successful_results:
        if result['success']:
            response = result['response']
            score = 0
            
            # Оцениваем структурированность
            if "ITEM 1:" in response and "ITEM 2:" in response:
                score += 10  # Отличная структура
            elif "•" in response or "-" in response:
                score += 7   # Хорошие списки
            elif response.count('\n') > 3:
                score += 5   # Многострочный
            
            # Оцениваем детальность
            if len(response) > 200:
                score += 5
            
            # Оцениваем упоминание отдельных элементов
            clothing_items = ['sweater', 'cardigan', 'jeans', 'loafers', 'necklace', 
                            'свитер', 'кардиган', 'джинсы', 'туфли', 'ожерелье']
            mentioned_items = sum(1 for item in clothing_items if item.lower() in response.lower())
            score += mentioned_items * 2
            
            structured_results.append((result, score))
    
    if structured_results:
        # Сортируем по оценке
        structured_results.sort(key=lambda x: x[1], reverse=True)
        best_result = structured_results[0]
        
        print(f"🏆 ЛУЧШИЙ РЕЗУЛЬТАТ: {best_result[0]['prompt_name']}")
        print(f"   Оценка: {best_result[1]} баллов")
        print(f"   Файл: {best_result[0]['prompt_file']}")
        print(f"   Время: {best_result[0]['time']:.1f}с")
        
        return best_result[0]['prompt_file']
    
    return None

def main():
    """Main function"""
    # Use command line argument or default image
    if len(sys.argv) >= 2:
        image_path = sys.argv[1]
    else:
        # Use default image from project root
        project_root = Path(__file__).parent.parent
        image_path = str(project_root / TEST_IMAGE_PATH)
    
    # Check if image exists
    if not os.path.exists(image_path):
        print(f"❌ Изображение не найдено: {image_path}")
        sys.exit(1)
    
    print(f"🖼️  Используем изображение: {image_path}")
    
    # Load image once
    image_base64 = load_image_as_base64(image_path)
    if not image_base64:
        print("❌ Не удалось загрузить изображение")
        sys.exit(1)
    
    # Test all prompts
    results = []
    
    for prompt_name, prompt_file in PROMPTS_TO_TEST:
        result = test_prompt(prompt_name, prompt_file, image_base64)
        if result:
            results.append(result)
        
        # Небольшая пауза между запросами
        time.sleep(2)
    
    # Analyze and show summary
    best_prompt_file = analyze_results(results)
    
    if best_prompt_file:
        print(f"\n💡 РЕКОМЕНДАЦИЯ: Используйте {best_prompt_file} как основной промпт")
        
        # Предложить заменить основной промпт
        replace = input(f"\nЗаменить prompt.md на лучший вариант? (y/N): ").strip().lower()
        if replace == 'y':
            try:
                import shutil
                shutil.copy(best_prompt_file, "prompt.md")
                print(f"✅ prompt.md обновлен содержимым из {best_prompt_file}")
            except Exception as e:
                print(f"❌ Ошибка при замене: {e}")

if __name__ == "__main__":
    main()
