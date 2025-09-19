#!/usr/bin/env python3
"""
Скрипт запуска FastVLM 7B сервера
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
            print("⚠️  GPU не доступен, будет использован CPU (очень медленно для 7B)")
            return False
        
        gpu_name = torch.cuda.get_device_name(0)
        gpu_memory = torch.cuda.get_device_properties(0).total_memory / 1024**3  # GB
        
        print(f"✅ GPU: {gpu_name}")
        print(f"   Память: {gpu_memory:.1f} GB")
        
        if gpu_memory < 10:
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

def check_dependencies():
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
        print(f"\n📦 Установите зависимости:")
        print(f"   pip install -r requirements7b.txt")
        return False
    
    return True

def check_model():
    """Проверка наличия модели"""
    model_path = os.path.join(os.path.dirname(__file__), 'models/llava-fastvithd_7b_stage3/llava-fastvithd_7b_stage3')
    
    if not os.path.exists(model_path):
        print(f"❌ Модель не найдена: {model_path}")
        print("   Загрузите FastVLM 7B модель с официального сайта Apple")
        return False
    
    # Проверяем ключевые файлы модели
    required_files = [
        'config.json',
        'model-00001-of-00004.safetensors',
        'model-00002-of-00004.safetensors',
        'model-00003-of-00004.safetensors',
        'model-00004-of-00004.safetensors',
        'model.safetensors.index.json'
    ]
    
    missing_files = []
    for file in required_files:
        if not os.path.exists(os.path.join(model_path, file)):
            missing_files.append(file)
    
    if missing_files:
        print(f"❌ Отсутствуют файлы модели: {missing_files}")
        return False
    
    print(f"✅ FastVLM 7B модель найдена")
    return True

def check_port():
    """Проверка доступности порта"""
    import socket
    
    port = 3002
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(('127.0.0.1', port))
    sock.close()
    
    if result == 0:
        print(f"❌ Порт {port} уже занят")
        return False
    
    print(f"✅ Порт {port} доступен")
    return True

def create_env_file():
    """Создание .env файла если его нет"""
    env_file = os.path.join(os.path.dirname(__file__), '.env')
    
    if not os.path.exists(env_file):
        print("📝 Создаю .env файл с настройками по умолчанию...")
        
        env_content = """# FastVLM 7B Server Configuration

# === Сервер ===
FASTVLM7B_HOST=127.0.0.1
FASTVLM7B_PORT=3002
FASTVLM7B_THREADS=4
FASTVLM7B_CONNECTION_LIMIT=512
FASTVLM7B_CONNECTION_TIMEOUT=120

# === Модель ===
MAX_NEW_TOKENS_7B=2048
TEMPERATURE_7B=0.1
DO_SAMPLE_7B=true
TOP_P_7B=0.8
REPETITION_PENALTY_7B=1.05

# === Производительность ===
MAX_IMAGE_SIZE_7B=2048
BATCH_SIZE_7B=1
TORCH_COMPILE_7B=false

# === Логирование ===
LOG_LEVEL_7B=INFO
LOG_MAX_BYTES_7B=10485760
LOG_BACKUP_COUNT_7B=5

# === Gemini API (опционально) ===
# GEMINI_API_KEY=your_api_key_here
# GEMINI_MODEL=gemini-2.5-flash
"""
        
        with open(env_file, 'w', encoding='utf-8') as f:
            f.write(env_content)
        
        print(f"✅ Создан .env файл: {env_file}")

def main():
    """Основная функция запуска"""
    print("🚀 FastVLM 7B Server Launcher")
    print("=" * 50)
    
    # Системная информация
    print(f"💻 Система: {platform.system()} {platform.release()}")
    print(f"🏗️  Архитектура: {platform.machine()}")
    print()
    
    # Проверки системы
    print("🔍 Проверяю систему...")
    
    checks = [
        ("Python версия", check_python_version),
        ("GPU доступность", check_gpu),
        ("Оперативная память", check_memory),
        ("Зависимости", check_dependencies),
        ("Модель FastVLM 7B", check_model),
        ("Порт 3002", check_port)
    ]
    
    all_passed = True
    for check_name, check_func in checks:
        print(f"\n📋 {check_name}:")
        if not check_func():
            all_passed = False
    
    if not all_passed:
        print("\n❌ Некоторые проверки не прошли. Исправьте ошибки перед запуском.")
        return 1
    
    # Создаем .env файл если нужно
    create_env_file()
    
    print("\n" + "=" * 50)
    print("✅ Все проверки пройдены! Запускаю FastVLM 7B сервер...")
    print("=" * 50)
    
    # Запуск сервера
    try:
        server_script = os.path.join(os.path.dirname(__file__), 'server7b.py')
        
        if not os.path.exists(server_script):
            print(f"❌ Не найден скрипт сервера: {server_script}")
            return 1
        
        print("🎯 Запускаю server7b.py...")
        print("   Ctrl+C для остановки сервера")
        print("   Сервер будет доступен на http://127.0.0.1:3002")
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
