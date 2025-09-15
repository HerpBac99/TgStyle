#!/usr/bin/env python3
"""
Тест многопоточного режима FastVLM сервера через waitress
Использует реальные фотографии и промпт из prompt.md для демонстрации работы LLM
"""

import time
import threading
import requests
import json
import base64
import os
from PIL import Image
import io

def load_real_images():
    """Загружает реальные фотографии из корневой директории проекта"""
    # Получаем путь к корневой директории проекта (родительская директория fastvlm-server)
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    # Список файлов для тестирования
    test_files = ['10.jpg', '11.jpg', '12.jpg', '13.jpg', '14.jpg']

    images = []
    for filename in test_files:
        filepath = os.path.join(project_root, filename)
        if os.path.exists(filepath):
            try:
                # Открываем изображение
                with Image.open(filepath) as img:
                    # Конвертируем в RGB если нужно
                    if img.mode != 'RGB':
                        img = img.convert('RGB')

                    # Сохраняем в memory buffer
                    img_byte_arr = io.BytesIO()
                    img.save(img_byte_arr, format='JPEG', quality=95)
                    img_byte_arr = img_byte_arr.getvalue()

                    # Кодируем в base64
                    img_base64 = base64.b64encode(img_byte_arr).decode('utf-8')

                    images.append({
                        'filename': filename,
                        'filepath': filepath,
                        'base64': img_base64,
                        'size': len(img_byte_arr)
                    })

                    print(f"✓ Загружено изображение: {filename} ({len(img_byte_arr)} bytes)")

            except Exception as e:
                print(f"✗ Ошибка загрузки {filename}: {e}")
        else:
            print(f"✗ Файл не найден: {filepath}")

    if not images:
        print("❌ Не удалось загрузить ни одного изображения!")
        return None

    print(f"📸 Загружено {len(images)} изображений для тестирования")
    return images

def test_health_endpoint():
    """Тестирует health эндпоинт"""
    try:
        response = requests.get('http://127.0.0.1:3001/health', timeout=10)
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Health check: {data.get('status', 'unknown')}")
            print(f"  Модель загружена: {data.get('model_loaded', False)}")
            print(f"  Устройство: {data.get('device', 'unknown')}")
            return True
        else:
            print(f"✗ Health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"✗ Health check error: {e}")
        return False

def test_load_endpoint():
    """Тестирует load эндпоинт"""
    try:
        response = requests.get('http://127.0.0.1:3001/load', timeout=10)
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Load check: CPU {data.get('cpu_percent', 0):.1f}%, Memory {data.get('memory_percent', 0):.1f}%")
            return True
        else:
            print(f"✗ Load check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"✗ Load check error: {e}")
        return False

def test_gpu_endpoint():
    """Тестирует GPU эндпоинт"""
    try:
        response = requests.get('http://127.0.0.1:3001/gpu', timeout=10)
        if response.status_code == 200:
            data = response.json()
            gpu_available = data.get('gpu_available', False)
            if gpu_available:
                print(f"✓ GPU check: {data.get('gpu_name', 'unknown')} - {data.get('gpu_memory_total_mb', 0)}MB")
            else:
                print(f"✓ GPU check: GPU не доступен")
            return True
        else:
            print(f"✗ GPU check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"✗ GPU check error: {e}")
        return False

def test_model_endpoint():
    """Тестирует model эндпоинт"""
    try:
        response = requests.get('http://127.0.0.1:3001/model', timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get('loaded', False):
                print(f"✓ Model check: {data.get('model_name', 'unknown')} on {data.get('device', 'unknown')}")
            else:
                print(f"✗ Model not loaded")
            return data.get('loaded', False)
        else:
            print(f"✗ Model check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"✗ Model check error: {e}")
        return False

def test_concurrent_requests(images):
    """Тестирует одновременные запросы к analyze эндпоинту с реальными изображениями"""
    if not images:
        print("❌ Нет изображений для тестирования!")
        return False

    num_requests = len(images)
    print(f"\n🚀 Тестируем {num_requests} одновременных запросов с реальными изображениями...")

    results = []

    def make_request(request_id, image_data):
        """Выполняет один запрос анализа"""
        try:
            print(f"\n📤 Запрос {request_id}: отправка {image_data['filename']} ({image_data['size']} bytes)")

            # Загружаем промпт из файла prompt.md
            prompt_file = os.path.join(os.path.dirname(__file__), 'prompt.md')
            try:
                with open(prompt_file, 'r', encoding='utf-8') as f:
                    prompt_text = f.read().strip()
            except Exception as e:
                print(f"⚠️  Не удалось загрузить промпт из файла: {e}")
                prompt_text = 'Describe the clothing and accessories you see in this image.'

            # Данные для запроса
            data = {
                'image_base64': image_data['base64'],
                'prompt': prompt_text
            }

            # Выполняем запрос
            start_time = time.time()
            response = requests.post('http://127.0.0.1:3001/analyze',
                                   json=data,
                                   timeout=120)  # Увеличиваем таймаут до 2 минут
            end_time = time.time()

            if response.status_code == 200:
                result = response.json()
                if result.get('success', False):
                    processing_time = end_time - start_time

                    print(f"✓ Запрос {request_id} ({image_data['filename']}): успех за {processing_time:.2f}с")
                    print(f"  Модель: {result.get('model_used', 'unknown')} на {result.get('device', 'unknown')}")
                    print(f"  Время: total={result.get('timing', {}).get('total_time', 0):.2f}с, inference={result.get('timing', {}).get('inference_time', 0):.2f}с")

                    # Выводим ответ LLM
                    llm_response = result.get('technical_analysis', '') or result.get('analysis', '')
                    if llm_response:
                        print(f"\n🤖 Ответ LLM ({image_data['filename']}):")
                        print("=" * 60)
                        print(llm_response)
                        print("=" * 60)

                    results.append({
                        'success': True,
                        'filename': image_data['filename'],
                        'processing_time': processing_time,
                        'llm_response': llm_response
                    })
                    return True
                else:
                    error_msg = result.get('error', 'unknown error')
                    print(f"✗ Запрос {request_id} ({image_data['filename']}): API вернул ошибку - {error_msg}")
                    results.append({
                        'success': False,
                        'filename': image_data['filename'],
                        'error': error_msg
                    })
                    return False
            else:
                print(f"✗ Запрос {request_id} ({image_data['filename']}): HTTP {response.status_code}")
                try:
                    error_data = response.json()
                    error_msg = error_data.get('error', 'unknown error')
                    print(f"  Ошибка: {error_msg}")
                    results.append({
                        'success': False,
                        'filename': image_data['filename'],
                        'error': f"HTTP {response.status_code}: {error_msg}"
                    })
                except:
                    results.append({
                        'success': False,
                        'filename': image_data['filename'],
                        'error': f"HTTP {response.status_code}"
                    })
                return False

        except requests.exceptions.Timeout:
            print(f"✗ Запрос {request_id} ({image_data['filename']}): таймаут")
            results.append({
                'success': False,
                'filename': image_data['filename'],
                'error': 'timeout'
            })
            return False
        except Exception as e:
            print(f"✗ Запрос {request_id} ({image_data['filename']}): ошибка - {e}")
            results.append({
                'success': False,
                'filename': image_data['filename'],
                'error': str(e)
            })
            return False

    # Запускаем несколько потоков одновременно
    threads = []

    for i, image_data in enumerate(images):
        def run_request(req_id=i, img_data=image_data):
            make_request(req_id + 1, img_data)

        thread = threading.Thread(target=run_request)
        threads.append(thread)

    # Запускаем все потоки одновременно
    start_time = time.time()
    print(f"\n🎯 Запуск {len(threads)} одновременных потоков...")
    for thread in threads:
        thread.start()

    # Ждем завершения всех потоков
    for thread in threads:
        thread.join()

    end_time = time.time()

    # Анализируем результаты
    successful_requests = sum(1 for r in results if r['success'])
    total_time = end_time - start_time

    print(f"\n📈 ИТОГОВЫЕ РЕЗУЛЬТАТЫ:")
    print("=" * 80)
    print(f"Всего изображений: {num_requests}")
    print(f"Успешных анализов: {successful_requests}")
    print(f"Неудачных: {num_requests - successful_requests}")
    print(f"Общее время выполнения: {total_time:.2f}с")
    print(f"Среднее время на изображение: {total_time/num_requests:.2f}с")

    if successful_requests > 0:
        avg_success_time = sum(r['processing_time'] for r in results if r['success']) / successful_requests
        print(f"Среднее время успешного анализа: {avg_success_time:.2f}с")

    print(f"Производительность: {successful_requests / total_time:.2f} изображений/сек")

    # Выводим детали по каждому изображению
    print(f"\n📋 ДЕТАЛИ ПО КАЖДОМУ ИЗОБРАЖЕНИЮ:")
    print("-" * 80)
    for result in results:
        status = "✓" if result['success'] else "✗"
        if result['success']:
            print(f"{status} {result['filename']}: {result['processing_time']:.2f}с")
        else:
            print(f"{status} {result['filename']}: {result['error']}")

    return successful_requests == num_requests

def main():
    """Основная функция тестирования"""
    print("🚀 Тестирование многопоточного режима FastVLM сервера")
    print("📸 Используем реальные фотографии и промпт из prompt.md")
    print("=" * 80)

    # Загружаем реальные изображения
    print("📸 Загрузка изображений для тестирования...")
    images = load_real_images()
    if not images:
        print("❌ Невозможно продолжить тестирование без изображений!")
        return False

    # Ждем запуска сервера
    print("\n⏳ Ожидаем запуска сервера...")
    time.sleep(5)

    # Тестируем базовые эндпоинты
    tests = [
        ("Health endpoint", test_health_endpoint),
        ("Load endpoint", test_load_endpoint),
        ("GPU endpoint", test_gpu_endpoint),
        ("Model endpoint", test_model_endpoint),
    ]

    all_passed = True
    for test_name, test_func in tests:
        print(f"\nТестируем {test_name}:")
        if not test_func():
            all_passed = False

    # Тестируем модель на загрузку
    model_loaded = test_model_endpoint()
    if model_loaded:
        print("\n🧪 Тестируем многопоточность с реальными изображениями...")
        print("💡 Это займет некоторое время - FastVLM анализирует каждое изображение...")

        if test_concurrent_requests(images):  # Тестируем со всеми загруженными изображениями
            print("\n✅ Многопоточный режим работает корректно!")
            print("🎉 Все изображения успешно проанализированы LLM с использованием промпта из prompt.md!")
        else:
            print("\n❌ Некоторые изображения не удалось проанализировать")
            all_passed = False
    else:
        print("\n⚠️  Пропускаем тест анализа - модель не загружена")
        print("💡 Убедитесь что FastVLM сервер запущен и модель загружена")
        all_passed = False

    print("\n" + "=" * 80)
    if all_passed:
        print("🎉 Все тесты пройдены! Многопоточный режим с LLM работает корректно.")
        print("🚀 Сервер готов к обработке одновременных запросов с использованием промпта из prompt.md!")
    else:
        print("⚠️  Некоторые тесты не пройдены. Проверьте логи сервера и состояние модели.")

    return all_passed

if __name__ == '__main__':
    main()
