#!/usr/bin/env python3
"""
Скрипт тестирования FastVLM 7B сервера
Проверяет все эндпоинты и функциональность
"""

import requests
import base64
import json
import time
import sys
import os
from PIL import Image
import io

# Настройки тестирования
SERVER_URL = "http://127.0.0.1:3002"
TIMEOUT = 60  # Увеличенный таймаут для 7B модели

class Colors:
    """ANSI цвета для консоли"""
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    PURPLE = '\033[95m'
    CYAN = '\033[96m'
    END = '\033[0m'
    BOLD = '\033[1m'

def print_test(test_name):
    """Печать заголовка теста"""
    print(f"\n{Colors.CYAN}{Colors.BOLD}🧪 {test_name}{Colors.END}")
    print("=" * 50)

def print_success(message):
    """Печать успешного результата"""
    print(f"{Colors.GREEN}✅ {message}{Colors.END}")

def print_error(message):
    """Печать ошибки"""
    print(f"{Colors.RED}❌ {message}{Colors.END}")

def print_warning(message):
    """Печать предупреждения"""
    print(f"{Colors.YELLOW}⚠️  {message}{Colors.END}")

def print_info(message):
    """Печать информации"""
    print(f"{Colors.BLUE}ℹ️  {message}{Colors.END}")

def create_test_image():
    """Создание тестового изображения"""
    try:
        # Создаем простое тестовое изображение
        img = Image.new('RGB', (512, 512), color=(100, 150, 200))
        
        # Добавляем простые элементы
        from PIL import ImageDraw, ImageFont
        draw = ImageDraw.Draw(img)
        
        # Рисуем прямоугольники (имитация одежды)
        draw.rectangle([100, 150, 400, 350], fill=(50, 50, 200))  # Синяя "рубашка"
        draw.rectangle([150, 350, 350, 450], fill=(100, 50, 50))  # Коричневые "брюки"
        
        # Конвертируем в base64
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        img_str = base64.b64encode(buffer.getvalue()).decode()
        
        print_success("Тестовое изображение создано")
        return img_str
        
    except Exception as e:
        print_error(f"Ошибка создания тестового изображения: {e}")
        return None

def test_server_connection():
    """Тест подключения к серверу"""
    print_test("Подключение к серверу")
    
    try:
        response = requests.get(f"{SERVER_URL}/health", timeout=10)
        
        if response.status_code == 200:
            print_success("Сервер доступен")
            return True
        else:
            print_error(f"Сервер вернул статус {response.status_code}")
            return False
            
    except requests.exceptions.ConnectionError:
        print_error("Не удается подключиться к серверу")
        print_info("Убедитесь что FastVLM 7B сервер запущен на порту 3002")
        return False
    except Exception as e:
        print_error(f"Ошибка подключения: {e}")
        return False

def test_health_endpoint():
    """Тест эндпоинта /health"""
    print_test("Проверка /health")
    
    try:
        response = requests.get(f"{SERVER_URL}/health", timeout=10)
        
        if response.status_code != 200:
            print_error(f"Статус код: {response.status_code}")
            return False
        
        data = response.json()
        
        # Проверяем обязательные поля
        required_fields = ['status', 'model_loaded', 'device', 'model_type']
        for field in required_fields:
            if field not in data:
                print_error(f"Отсутствует поле: {field}")
                return False
        
        print_success(f"Статус: {data['status']}")
        print_success(f"Модель загружена: {data['model_loaded']}")
        print_success(f"Устройство: {data['device']}")
        print_success(f"Тип модели: {data['model_type']}")
        
        if 'gpu_name' in data:
            print_success(f"GPU: {data['gpu_name']}")
            print_success(f"GPU память: {data.get('gpu_memory_allocated_mb', 0):.1f} MB")
        
        return True
        
    except Exception as e:
        print_error(f"Ошибка тестирования /health: {e}")
        return False

def test_model_endpoint():
    """Тест эндпоинта /model"""
    print_test("Проверка /model")
    
    try:
        response = requests.get(f"{SERVER_URL}/model", timeout=10)
        
        if response.status_code != 200:
            print_error(f"Статус код: {response.status_code}")
            return False
        
        data = response.json()
        
        print_success(f"Модель загружена: {data.get('loaded', False)}")
        print_success(f"Имя модели: {data.get('model_name', 'Unknown')}")
        print_success(f"Устройство: {data.get('device', 'Unknown')}")
        print_success(f"Контекстная длина: {data.get('context_length', 'Unknown')}")
        print_success(f"Тип данных: {data.get('torch_dtype', 'Unknown')}")
        
        return True
        
    except Exception as e:
        print_error(f"Ошибка тестирования /model: {e}")
        return False

def test_gpu_endpoint():
    """Тест эндпоинта /gpu"""
    print_test("Проверка /gpu")
    
    try:
        response = requests.get(f"{SERVER_URL}/gpu", timeout=10)
        
        if response.status_code != 200:
            print_error(f"Статус код: {response.status_code}")
            return False
        
        data = response.json()
        
        if data.get('gpu_available', False):
            print_success(f"GPU доступен: {data['gpu_name']}")
            print_success(f"Память выделена: {data['gpu_memory_allocated_mb']:.1f} MB")
            print_success(f"Память зарезервирована: {data['gpu_memory_reserved_mb']:.1f} MB")
            print_success(f"Общая память: {data['gpu_memory_total_mb']:.1f} MB")
        else:
            print_warning("GPU не доступен")
        
        return True
        
    except Exception as e:
        print_error(f"Ошибка тестирования /gpu: {e}")
        return False

def test_load_endpoint():
    """Тест эндпоинта /load"""
    print_test("Проверка /load")
    
    try:
        response = requests.get(f"{SERVER_URL}/load", timeout=10)
        
        if response.status_code != 200:
            print_error(f"Статус код: {response.status_code}")
            return False
        
        data = response.json()
        
        print_success(f"CPU нагрузка: {data.get('cpu_percent', 0):.1f}%")
        print_success(f"RAM использование: {data.get('memory_percent', 0):.1f}%")
        print_success(f"RAM использовано: {data.get('memory_used_gb', 0):.1f} GB")
        
        if 'gpu_memory_mb' in data:
            print_success(f"GPU память: {data['gpu_memory_mb']:.1f} MB")
            print_success(f"GPU использование: {data.get('gpu_utilization', 0):.1f}%")
        
        return True
        
    except Exception as e:
        print_error(f"Ошибка тестирования /load: {e}")
        return False

def test_analyze_endpoint():
    """Тест эндпоинта /analyze"""
    print_test("Проверка /analyze")
    
    # Создаем тестовое изображение
    test_image = create_test_image()
    if not test_image:
        return False
    
    try:
        print_info("Отправляю запрос на анализ (может занять несколько секунд)...")
        start_time = time.time()
        
        response = requests.post(
            f"{SERVER_URL}/analyze",
            json={
                "image_base64": test_image,
                "prompt": "Describe the clothing in this image in detail."
            },
            timeout=TIMEOUT
        )
        
        response_time = time.time() - start_time
        
        if response.status_code != 200:
            print_error(f"Статус код: {response.status_code}")
            try:
                error_data = response.json()
                print_error(f"Ошибка: {error_data.get('error', 'Unknown error')}")
            except:
                print_error(f"Текст ответа: {response.text}")
            return False
        
        data = response.json()
        
        if not data.get('success', False):
            print_error(f"Анализ неуспешен: {data.get('error', 'Unknown error')}")
            return False
        
        analysis = data.get('analysis', '')
        
        print_success(f"Анализ завершен за {response_time:.2f} секунд")
        print_success(f"Модель: {data.get('model_used', 'Unknown')}")
        print_success(f"Устройство: {data.get('device', 'Unknown')}")
        print_success(f"Длина анализа: {len(analysis)} символов")
        
        print(f"\n{Colors.PURPLE}{Colors.BOLD}📝 Результат анализа:{Colors.END}")
        print(f"{Colors.PURPLE}{analysis[:500]}{'...' if len(analysis) > 500 else ''}{Colors.END}")
        
        return True
        
    except requests.exceptions.Timeout:
        print_error(f"Таймаут запроса ({TIMEOUT} секунд)")
        print_warning("7B модель может требовать больше времени на первый запрос")
        return False
    except Exception as e:
        print_error(f"Ошибка тестирования /analyze: {e}")
        return False

def test_analyze_with_custom_prompt():
    """Тест анализа с кастомным промптом"""
    print_test("Анализ с кастомным промптом")
    
    # Создаем тестовое изображение
    test_image = create_test_image()
    if not test_image:
        return False
    
    custom_prompt = """Проанализируй одежду на изображении и опиши:
1. Тип одежды
2. Цвета
3. Стиль
4. Возможные материалы
5. Рекомендации по сочетанию"""
    
    try:
        print_info("Отправляю запрос с кастомным промптом...")
        start_time = time.time()
        
        response = requests.post(
            f"{SERVER_URL}/analyze",
            json={
                "image_base64": test_image,
                "prompt": custom_prompt
            },
            timeout=TIMEOUT
        )
        
        response_time = time.time() - start_time
        
        if response.status_code != 200:
            print_error(f"Статус код: {response.status_code}")
            return False
        
        data = response.json()
        
        if not data.get('success', False):
            print_error(f"Анализ неуспешен: {data.get('error', 'Unknown error')}")
            return False
        
        analysis = data.get('analysis', '')
        
        print_success(f"Кастомный анализ завершен за {response_time:.2f} секунд")
        print_success(f"Длина анализа: {len(analysis)} символов")
        
        return True
        
    except Exception as e:
        print_error(f"Ошибка тестирования кастомного промпта: {e}")
        return False

def run_performance_test():
    """Тест производительности"""
    print_test("Тест производительности")
    
    test_image = create_test_image()
    if not test_image:
        return False
    
    num_requests = 3
    response_times = []
    
    print_info(f"Выполняю {num_requests} запросов для измерения производительности...")
    
    for i in range(num_requests):
        try:
            print_info(f"Запрос {i+1}/{num_requests}...")
            start_time = time.time()
            
            response = requests.post(
                f"{SERVER_URL}/analyze",
                json={
                    "image_base64": test_image,
                    "prompt": "Describe this clothing briefly."
                },
                timeout=TIMEOUT
            )
            
            response_time = time.time() - start_time
            response_times.append(response_time)
            
            if response.status_code == 200:
                data = response.json()
                if data.get('success'):
                    print_success(f"Запрос {i+1}: {response_time:.2f}с")
                else:
                    print_error(f"Запрос {i+1}: ошибка анализа")
            else:
                print_error(f"Запрос {i+1}: статус {response.status_code}")
                
        except Exception as e:
            print_error(f"Запрос {i+1}: ошибка {e}")
    
    if response_times:
        avg_time = sum(response_times) / len(response_times)
        min_time = min(response_times)
        max_time = max(response_times)
        
        print_success(f"Среднее время ответа: {avg_time:.2f}с")
        print_success(f"Минимальное время: {min_time:.2f}с")
        print_success(f"Максимальное время: {max_time:.2f}с")
        
        return True
    
    return False

def main():
    """Основная функция тестирования"""
    print(f"{Colors.BOLD}{Colors.BLUE}")
    print("🧪 FastVLM 7B Server Test Suite")
    print("=" * 50)
    print(f"{Colors.END}")
    
    print_info(f"Сервер: {SERVER_URL}")
    print_info(f"Таймаут: {TIMEOUT} секунд")
    print()
    
    tests = [
        ("Подключение к серверу", test_server_connection),
        ("Health endpoint", test_health_endpoint),
        ("Model endpoint", test_model_endpoint),
        ("GPU endpoint", test_gpu_endpoint),
        ("Load endpoint", test_load_endpoint),
        ("Analyze endpoint", test_analyze_endpoint),
        ("Кастомный промпт", test_analyze_with_custom_prompt),
        ("Тест производительности", run_performance_test)
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        try:
            if test_func():
                passed += 1
            else:
                print_warning(f"Тест '{test_name}' не прошел")
        except KeyboardInterrupt:
            print_warning("\nТестирование прервано пользователем")
            break
        except Exception as e:
            print_error(f"Неожиданная ошибка в тесте '{test_name}': {e}")
    
    print("\n" + "=" * 50)
    
    if passed == total:
        print_success(f"Все тесты пройдены! ({passed}/{total})")
        print_success("FastVLM 7B сервер работает корректно 🎉")
    else:
        print_warning(f"Пройдено тестов: {passed}/{total}")
        if passed < total // 2:
            print_error("Критические проблемы с сервером")
        else:
            print_warning("Сервер работает с предупреждениями")

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n{Colors.YELLOW}Тестирование прервано{Colors.END}")
    except Exception as e:
        print(f"\n{Colors.RED}Критическая ошибка: {e}{Colors.END}")
        sys.exit(1)
