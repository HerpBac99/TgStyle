#!/usr/bin/env python3
"""
Универсальный скрипт запуска FastVLM сервера (1.5B или 7B)
Автоматическая проверка системы и запуск оптимизированного сервера
"""

import os
import sys
import subprocess
import time
import psutil
import platform

def check_python_version():
    """Проверка версии Python"""
    version = sys.version_info
    if version < (3, 8):
        print("❌ Требуется Python 3.8 или выше")
        print(f"   Текущая версия: {version.major}.{version.minor}.{version.micro}")
        return False

    print(f"✅ Python {version.major}.{version.minor}.{version.micro}")
    return True

def check_gpu():
    """Проверка доступности GPU"""
    try:
        import torch

        if not torch.cuda.is_available():
            print("⚠️  GPU не доступен, будет использован CPU")
            print("   ⚠️  ВНИМАНИЕ: CPU режим очень медленный для больших моделей")
            return False

        gpu_name = torch.cuda.get_device_name(0)
        gpu_memory = torch.cuda.get_device_properties(0).total_memory / 1024**3  # GB

        print(f"✅ GPU: {gpu_name}")
        print(f"   Память: {gpu_memory:.1f} GB")

        if gpu_memory < 12:
            print("⚠️  Предупреждение: Для 7B модели рекомендуется минимум 12GB GPU памяти")
            print("   Возможны ошибки Out of Memory (OOM)")

        return True

    except ImportError:
        print("❌ PyTorch не установлен")
        return False

def check_memory():
    """Проверка оперативной памяти"""
    memory = psutil.virtual_memory()
    memory_gb = memory.total / 1024**3

    print(f"💾 RAM: {memory_gb:.1f} GB")

    if memory_gb < 16:
        print("⚠️  Предупреждение: Для 7B модели рекомендуется минимум 16GB RAM")

    return memory_gb >= 8  # Минимум 8GB

def check_dependencies(model_type='1.5b', is_7b=False):
    """Проверка зависимостей"""
    required_packages = [
        ('torch', 'PyTorch'),
        ('transformers', 'Transformers'),
        ('flask', 'Flask'),
        ('waitress', 'Waitress'),
        ('PIL', 'Pillow')
    ]

    missing = []

    for package, name in required_packages:
        try:
            __import__(package)
            print(f"✅ {name}")
        except ImportError:
            print(f"❌ {name} не установлен")
            missing.append(package)

    if missing:
        print(f"\n📦 Установите зависимости для модели {model_type.upper()}:")
        if is_7b:
            print(f"   pip install -r requirements7b.txt")
        else:
            print(f"   pip install -r requirements1.5b.txt")
        print(f"   Или универсальный файл: pip install -r requirements.txt")
        return False

    return True

def get_model_info():
    """Получение информации о выбранной модели из .env файла"""
    env_file = os.path.join(os.path.dirname(__file__), '.env')
    model_type = '1.5b'  # по умолчанию

    # Читаем модель из .env файла
    if os.path.exists(env_file):
        try:
            with open(env_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line.startswith('FASTVLM_MODEL='):
                        model_type = line.split('=')[1].strip()
                        break
        except UnicodeDecodeError:
            # Если проблемы с кодировкой, пробуем cp1251
            try:
                with open(env_file, 'r', encoding='cp1251') as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith('FASTVLM_MODEL='):
                            model_type = line.split('=')[1].strip()
                            break
            except:
                print("⚠️  Не удалось прочитать .env файл, используется модель по умолчанию")

    # Определяем путь к модели
    model_path = os.path.join(os.path.dirname(__file__), f'models/llava-fastvithd_{model_type}_stage3')
    if model_type.startswith('7b'):
        model_path = os.path.join(model_path, f'llava-fastvithd_{model_type}_stage3')

    is_7b = model_type.startswith('7b')

    return model_type, model_path, is_7b

def check_model(model_path, model_type, is_7b):
    """Проверка наличия модели"""
    if not os.path.exists(model_path):
        print(f"❌ Модель {model_type} не найдена: {model_path}")
        if is_7b:
            print("   Загрузите FastVLM 7B модель с официального сайта Apple")
        else:
            print("   Загрузите FastVLM 1.5B модель с официального сайта Apple")
        return False

    if is_7b:
        # Проверяем ключевые файлы 7B модели
        required_files = [
            'config.json',
            'model-00001-of-00004.safetensors',
            'model-00002-of-00004.safetensors',
            'model-00003-of-00004.safetensors',
            'model-00004-of-00004.safetensors',
            'model.safetensors.index.json',
            'tokenizer_config.json'
        ]

        missing_files = []
        for file in required_files:
            if not os.path.exists(os.path.join(model_path, file)):
                missing_files.append(file)

        if missing_files:
            print(f"❌ Отсутствуют файлы модели: {missing_files}")
            return False

    print(f"✅ FastVLM {model_type.upper()} модель найдена")
    return True

def check_port(port):
    """Проверка доступности порта"""
    import socket

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(('127.0.0.1', port))
    sock.close()

    if result == 0:
        print(f"❌ Порт {port} уже занят")
        return False

    print(f"✅ Порт {port} доступен")
    return True


def main():
    """Основная функция запуска"""
    print("🚀 FastVLM Unified Server Launcher")
    print("=" * 50)

    # Получаем информацию о модели
    model_type, model_path, is_7b = get_model_info()

    print(f"🎯 Выбранная модель: FastVLM {model_type.upper()}")
    if is_7b:
        print("   💪 Большая модель (высокое качество, медленнее)")
    else:
        print("   ⚡ Малая модель (быстрее, оптимизированные параметры)")

    # Системная информация
    print(f"\n💻 Система: {platform.system()} {platform.release()}")
    print(f"🏗️  Архитектура: {platform.machine()}")
    print()

    # Проверки системы
    print("🔍 Проверяю систему...")

    checks = [
        ("Python версия", check_python_version),
        ("GPU доступность", check_gpu),
        ("Оперативная память", check_memory),
        ("Зависимости", lambda: check_dependencies(model_type, is_7b)),
        (f"Модель FastVLM {model_type.upper()}", lambda: check_model(model_path, model_type, is_7b)),
        ("Порт 3001", lambda: check_port(3001))
    ]

    all_passed = True
    for check_name, check_func in checks:
        print(f"\n📋 {check_name}:")
        if not check_func():
            all_passed = False

    if not all_passed:
        print("\n❌ Некоторые проверки не прошли. Исправьте ошибки перед запуском.")
        return 1

    print("\n" + "=" * 50)
    print(f"✅ Все проверки пройдены! Запускаю FastVLM {model_type.upper()} сервер...")
    print("=" * 50)

    # Запуск сервера
    try:
        server_script = os.path.join(os.path.dirname(__file__), 'server.py')

        if not os.path.exists(server_script):
            print(f"❌ Не найден скрипт сервера: {server_script}")
            return 1

        print("🎯 Запускаю server.py...")
        print("   Ctrl+C для остановки сервера")
        print("   Сервер будет доступен на http://127.0.0.1:3001")
        print()

        # Запускаем сервер
        subprocess.run([sys.executable, server_script], check=True)

    except KeyboardInterrupt:
        print("\n⏹️  Сервер остановлен пользователем")
        return 0
    except subprocess.CalledProcessError as e:
        print(f"\n❌ Ошибка запуска сервера: {e}")
        return 1
    except Exception as e:
        print(f"\n❌ Неожиданная ошибка: {e}")
        return 1

if __name__ == '__main__':
    exit_code = main()
    sys.exit(exit_code)
