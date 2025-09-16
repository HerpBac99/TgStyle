#!/usr/bin/env python3
"""
Тест Ollama моделей на задачу стилиста
"""

import requests
import json
import time

OLLAMA_URL = "http://127.0.0.1:11434"

# Пример технического анализа из FastVLM
technical_analysis = """PERSON: Woman; 20-29; slim; long brown hair

CLOTHING: The person in the image is wearing a mustard yellow wool blazer, which has a relaxed fit and appears to be made of a soft, textured fabric. Underneath the blazer, they are wearing a dark brown or maroon turtleneck sweater that complements the warm tones of the blazer. The individual is also wearing light blue denim jeans with a slightly faded wash, featuring a relaxed fit and a cuffed hem at the ankles. On their feet, they have chosen a pair of brown suede ankle boots that add a touch of sophistication to the overall outfit.

ACCESSORIES: The person in the picture is wearing a silver necklace with a small pendant, a black belt around their waist, and brown shoes. The necklace has a simple, elegant design, likely made of metal, and hangs just above the belt. The belt appears to be made of leather or a similar material and is fastened at the front. The shoes are brown, possibly made of suede or a suede-like material, and have a pointed toe design."""

# Промпт стилиста
stylist_prompt = """Ты профессиональный ИИ стилист и консультант по моде.

На основе технического анализа одежды ниже, создай креативный, дружелюбный и экспертный ответ от лица стилиста.

ТЕХНИЧЕСКЙ АНАЛИЗ:
{fastvlm_analysis}

Преобразуй анализ в живой совет стилиста с рекомендациями по сочетаниям и стилю. Используй эмодзи и пиши на русском языке максимум 800 символов."""

def test_model(model_name):
    print(f"\n{'='*60}")
    print(f"Тестируем модель: {model_name}")
    print(f"{'='*60}")

    # Заменяем плейсхолдер
    formatted_prompt = stylist_prompt.replace('{fastvlm_analysis}', technical_analysis)

    payload = {
        "model": model_name,
        "prompt": formatted_prompt,
        "stream": False,
        "options": {
            "temperature": 0.3,
            "top_p": 0.7,
            "max_tokens": 1500,
            "repeat_penalty": 1.1
        }
    }

    try:
        response = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json=payload,
            timeout=120
        )

        if response.status_code == 200:
            result = response.json()
            creative_response = result.get('response', '').strip()
            print(f"Длина ответа: {len(creative_response)} символов")
            print(f"Ответ:\n{creative_response}")
            return True
        else:
            print(f"Ошибка API: {response.status_code}")
            print(f"Ответ: {response.text}")
            return False

    except Exception as e:
        print(f"Ошибка: {e}")
        return False

if __name__ == "__main__":
    # Проверяем доступные модели
    try:
        response = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        if response.status_code == 200:
            models = response.json().get('models', [])
            available_models = [model['name'] for model in models]
            print("Доступные модели:", available_models)

            # Тестируем модели (ТОП-3 кандидатов) - учитываем :latest
            test_models = ["gemma3:4b", "phi4-mini-reasoning", "qwen3:4b"]
            # Создаем маппинг для поиска моделей с :latest
            model_mapping = {}
            for available_model in available_models:
                base_name = available_model.replace(":latest", "")
                model_mapping[base_name] = available_model
            results = []

            print(f"\n{'='*100}")
            print("🚀 НАЧИНАЕМ ТЕСТИРОВАНИЕ МОДЕЛЕЙ НА ЗАДАЧУ СТИЛИСТА")
            print(f"{'='*100}")

            for i, model in enumerate(test_models, 1):
                # Ищем модель в маппинге (учитываем :latest)
                actual_model_name = model_mapping.get(model, model)

                if actual_model_name in available_models:
                    print(f"\n{'='*80}")
                    print(f"🎯 МОДЕЛЬ {i}/3: {actual_model_name}")
                    print(f"{'='*80}")

                    start_time = time.time()
                    success = test_model(actual_model_name)
                    end_time = time.time()

                    generation_time = end_time - start_time

                    results.append({
                        'model': actual_model_name,
                        'success': success,
                        'time': generation_time
                    })

                    print(".2f")
                    if success:
                        print("✅ Тест завершен успешно")
                    else:
                        print("❌ Ошибка при тестировании")

                else:
                    print(f"\n❌ МОДЕЛЬ {i}/3: {model} - НЕ НАЙДЕНА")
                    print(f"💡 Скачать: ollama pull {model}")
                    results.append({
                        'model': model,
                        'success': False,
                        'time': 0,
                        'error': 'Модель не найдена'
                    })

            # ИТОГОВЫЙ РЕЗУЛЬТАТ
            print(f"\n{'='*100}")
            print("📊 РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ:")
            print(f"{'='*100}")

            successful_models = [r for r in results if r['success']]
            if successful_models:
                print(f"✅ УСПЕШНЫЕ МОДЕЛИ: {len(successful_models)}/3")

                # Сортируем по времени генерации
                sorted_results = sorted(successful_models, key=lambda x: x['time'])

                print(f"\n🏆 РЕЙТИНГ ПО СКОРОСТИ:")
                for i, result in enumerate(sorted_results, 1):
                    speed_indicator = "⚡" if result['time'] < 10 else "🐌"
                    print("2d")

                # Лучшая модель
                best_model = sorted_results[0]
                print(f"\n🎯 САМАЯ БЫСТРАЯ МОДЕЛЬ: {best_model['model']} ({best_model['time']:.2f} сек)")
            else:
                print("❌ Нет успешных моделей")

            failed_models = [r for r in results if not r['success']]
            if failed_models:
                print(f"\n❌ НЕУДАЧНЫЕ МОДЕЛИ: {len(failed_models)}")
                for result in failed_models:
                    print(f"   - {result['model']}: {result.get('error', 'Неизвестная ошибка')}")

            print(f"\n{'='*100}")
            print("💡 РЕКОМЕНДАЦИЯ:")
            if successful_models:
                best = min(successful_models, key=lambda x: x['time'])
                print(f"   Для быстрого ответа используйте: {best['model']}")
                print("   Оцените качество ответов выше и выберите оптимальную модель")
            else:
                print("   Сначала скачайте модели командой: ollama pull <model_name>")
            print(f"{'='*100}")
        else:
            print("Не удалось получить список моделей")

    except Exception as e:
        print(f"Ошибка подключения к Ollama: {e}")
