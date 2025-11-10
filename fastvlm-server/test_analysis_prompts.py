#!/usr/bin/env python3
"""
Тестовый скрипт для проверки разных промптов анализа одежды
Вызывает все методы предобработки из handle_analyze_request
Промпты объявлены как переменные для быстрого изменения
"""

import base64
import io
import time
from pathlib import Path
from PIL import Image

# Импортируем необходимые модули
from image_preprocessing import fast_mobile_preprocess

# ============================================================================
# КОНФИГУРАЦИЯ
# ============================================================================

# Путь к тестовому изображению (относительно корня проекта)
IMAGE_PATH = "server/uploads/analysis/251053908/analysis_1762628992667.jpg"

# ============================================================================
# ПРОМПТЫ ДЛЯ ТЕСТИРОВАНИЯ
# ============================================================================

# Промпт 1: Анализ человека
PERSON_PROMPT = """Describe the person in the photo:
- Gender (male/female/unknown)
- Approximate age range
- Body type
- Skin tone
- Hair color and style
- Facial features (if visible)
- Overall appearance"""

# Промпт 2: Анализ верхней одежды
CLOTHING_PROMPT = """Describe All outerwear and innerwear clothing on person's TORSO. Describe type, color, material, fit."""

# Промпт 3: Анализ одежды на ногах
LEGS_PROMPT = """Output EXACTLY one short line: Describe All clothing on person's LEGS. Describe type, color, material, fit."""

# Промпт 4: Анализ обуви
SHOES_PROMPT = """Output EXACTLY one short line: Describe All shoes on person's FEET. Describe type, color, material, fit."""

# Промпт 5: Анализ аксессуаров на голове/шее
ACCESSORIES_HEAD_PROMPT = """Output EXACTLY one short line: Describe All accessories on person's HEAD. Describe type, color, material."""

# Промпт 6: Анализ аксессуаров на руках
ACCESSORIES_HAND_PROMPT = """Output EXACTLY one short line: Describe All accessories on person's HANDS. Describe type, color, material."""

# Промпт 7: Общий стилистический анализ
STYLE_ANALYSIS_PROMPT = """Analyze the overall style and fashion"""


# Список всех промптов для тестирования
PROMPTS = [
    ("PERSON", PERSON_PROMPT),
    ("CLOTHING", CLOTHING_PROMPT),
    ("LEGS", LEGS_PROMPT),
    ("SHOES", SHOES_PROMPT),
    ("ACCESSORIES_HEAD", ACCESSORIES_HEAD_PROMPT),
    ("ACCESSORIES_HAND", ACCESSORIES_HAND_PROMPT),
    ("STYLE_ANALYSIS", STYLE_ANALYSIS_PROMPT),
]

# ============================================================================
# ФУНКЦИИ ПРЕДОБРАБОТКИ (из handle_analyze_request)
# ============================================================================

def preprocess_image_like_server(image_path: str) -> tuple:
    """
    Предобработка изображения точно так же как в handle_analyze_request
    
    Returns:
        tuple: (processed_image, base64_string, metadata)
    """
    # Загружаем изображение
    image = Image.open(image_path)
    
    # Конвертируем в RGB если нужно (для PNG с палитрой)
    if image.mode != 'RGB':
        image = image.convert('RGB')
    
    # Получаем исходные данные для логирования
    original_buffer = io.BytesIO()
    image.save(original_buffer, format='JPEG')
    original_size_mb = len(original_buffer.getvalue()) / (1024 * 1024)
    
    print(f"\n{'='*70}")
    print(f"ПРЕДОБРАБОТКА ИЗОБРАЖЕНИЯ")
    print(f"{'='*70}")
    print(f"Исходное изображение: {image.size[0]}x{image.size[1]} пикселей")
    print(f"Исходный размер: {original_size_mb:.2f} MB")
    print(f"Исходный режим: {image.mode}")
    
    # Применяем fast_mobile_preprocess (как в handle_analyze_request)
    processed_image, base64_string, metadata = fast_mobile_preprocess(
        image.convert("RGB"),
        target_width=1344,
        target_height=1008,
        quality=95
    )
    
    print(f"\nПосле предобработки:")
    print(f"  Размер: {metadata['original_size']} → {metadata['final_size']} пикселей")
    print(f"  Файл: {original_size_mb:.2f} MB → {metadata['compressed_size_mb']:.2f} MB")
    print(f"  Режим: {metadata['original_mode']} → {metadata['final_mode']}")
    print(f"  JPEG качество: {metadata['jpeg_quality']}%")
    print(f"  Изменен размер: {'Да' if metadata['resized'] else 'Нет'}")
    print(f"{'='*70}\n")
    
    return processed_image, base64_string, metadata


def test_prompt_with_fastvlm(image_base64: str, prompt_name: str, prompt_text: str) -> dict:
    """
    Тестирует один промпт через FastVLM
    
    Args:
        image_base64: Изображение в base64
        prompt_name: Название промпта
        prompt_text: Текст промпта
    
    Returns:
        dict: Результат анализа
    """
    import requests
    
    FASTVLM_URL = "http://127.0.0.1:3001"
    
    print(f"\n{'─'*70}")
    print(f"ТЕСТ ПРОМПТА: {prompt_name}")
    print(f"{'─'*70}")
    
    start_time = time.time()
    
    try:
        # Отправляем запрос на FastVLM сервер
        response = requests.post(
            f"{FASTVLM_URL}/analyze_for_test",
            json={
                "image_base64": image_base64,
                "prompt": prompt_text,
                "nickname": "test_user"
            },
            timeout=120
        )
        
        request_time = time.time() - start_time
        
        if response.status_code == 200:
            result = response.json()
            answer = result.get('technical_analysis', 'Нет ответа')
            
            print(f"\n✅ ОТВЕТ ({request_time:.2f}с):")
            print(f"{answer}")
            print(f"\nTiming details:")
            timing = result.get('timing', {})
            print(f"  Total: {timing.get('total_time', 0):.2f}с")
            print(f"  FastVLM: {timing.get('fastvlm_time', 0):.2f}с")
            
            return {
                'success': True,
                'prompt_name': prompt_name,
                'response': answer,
                'time': request_time,
                'timing_details': timing
            }
        else:
            print(f"\n❌ ОШИБКА: HTTP {response.status_code}")
            print(f"Response: {response.text}")
            
            return {
                'success': False,
                'prompt_name': prompt_name,
                'error': f"HTTP {response.status_code}",
                'time': request_time
            }
    
    except Exception as e:
        request_time = time.time() - start_time
        print(f"\n❌ ИСКЛЮЧЕНИЕ: {e}")
        
        return {
            'success': False,
            'prompt_name': prompt_name,
            'error': str(e),
            'time': request_time
        }


# ============================================================================
# ГЛАВНАЯ ФУНКЦИЯ
# ============================================================================

def main():
    """Главная функция"""
    print(f"\n{'='*70}")
    print(f"ТЕСТИРОВАНИЕ ПРОМПТОВ АНАЛИЗА ОДЕЖДЫ")
    print(f"{'='*70}")
    
    # Проверяем существование файла
    image_path = Path(IMAGE_PATH)
    if not image_path.exists():
        print(f"❌ Файл не найден: {IMAGE_PATH}")
        return
    
    print(f"Изображение: {IMAGE_PATH}")
    
    # Проверяем доступность FastVLM сервера
    try:
        import requests
        requests.get("http://127.0.0.1:3001/health", timeout=5)
        print("[OK] FastVLM сервер доступен")
    except Exception as e:
        print(f"[ERROR] FastVLM сервер недоступен: {e}")
        return
    
    # Предобработка изображения (как в handle_analyze_request)
    try:
        processed_image, image_base64, metadata = preprocess_image_like_server(str(image_path))
    except Exception as e:
        print(f"[ERROR] Ошибка предобработки: {e}")
        return
    
    # Тестируем все промпты
    all_results = []
    total_start_time = time.time()
    
    for prompt_name, prompt_text in PROMPTS:
        result = test_prompt_with_fastvlm(image_base64, prompt_name, prompt_text)
        all_results.append(result)
        
        # Небольшая пауза между запросами
        time.sleep(0.5)
    
    total_time = time.time() - total_start_time
    
    # Итоговая статистика
    print(f"\n{'='*70}")
    print(f"ИТОГОВАЯ СТАТИСТИКА")
    print(f"{'='*70}")
    
    successful = sum(1 for r in all_results if r['success'])
    failed = len(all_results) - successful
    
    print(f"Всего промптов: {len(all_results)}")
    print(f"Успешных: {successful}")
    print(f"Ошибок: {failed}")
    print(f"Общее время: {total_time:.2f}с")
    print(f"Среднее время на промпт: {total_time / len(all_results):.2f}с")
    
    if failed > 0:
        print(f"\nОшибки:")
        for r in all_results:
            if not r['success']:
                print(f"  - {r['prompt_name']}: {r.get('error', 'Unknown error')}")
    
    print(f"{'='*70}\n")


if __name__ == "__main__":
    main()
