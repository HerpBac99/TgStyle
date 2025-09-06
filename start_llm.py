#!/usr/bin/env python3
"""
FastVLM Server Launcher
Кроссплатформенный скрипт для запуска FastVLM сервера
"""

import os
import sys
import subprocess
import platform
from pathlib import Path

def main():
    print("Запуск FastVLM сервера...")

    # Проверяем CUDA доступность
    try:
        import torch
        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            print(f"GPU доступен: {gpu_name}")
        else:
            print("GPU не найден, будет использоваться CPU")
    except ImportError:
        print("PyTorch не установлен, проверка GPU невозможна")

    # Определяем текущую директорию
    current_dir = Path(__file__).parent
    fastvlm_dir = current_dir / "fastvlm-server"

    if not fastvlm_dir.exists():
        print(f"❌ Папка {fastvlm_dir} не найдена!")
        print("💡 Сначала выполните реструктуризацию (Фаза 0.1)")
        sys.exit(1)

    # Переходим в папку fastvlm-server
    os.chdir(fastvlm_dir)
    print(f"📍 Переход в папку: {fastvlm_dir}")

    # Определяем Python команду
    python_cmd = sys.executable  # Используем тот же Python что и текущий

    # Проверяем виртуальное окружение
    venv_path = fastvlm_dir / "venv"
    if venv_path.exists():
        print("📦 Активация виртуального окружения...")

        if platform.system() == "Windows":
            python_cmd = str(venv_path / "Scripts" / "python.exe")
        else:
            python_cmd = str(venv_path / "bin" / "python")

        if not os.path.exists(python_cmd):
            print("⚠️  Виртуальное окружение найдено, но Python не доступен")
            python_cmd = sys.executable

    # Проверяем requirements.txt
    requirements_file = fastvlm_dir / "requirements.txt"
    if not requirements_file.exists():
        print("⚠️  requirements.txt не найден, создаем...")
        requirements_content = """Flask==2.3.3
Pillow==10.0.0
torch==2.0.1
torchvision==0.15.2
transformers==4.21.3
accelerate==0.20.3
psutil==5.9.0
python-dotenv==1.0.0"""

        with open(requirements_file, 'w') as f:
            f.write(requirements_content)
        print("✅ requirements.txt создан")

    # Устанавливаем зависимости если нужно
    if venv_path.exists() and python_cmd != sys.executable:
        print("📦 Установка зависимостей...")
        try:
            subprocess.run([python_cmd, "-m", "pip", "install", "-r", "requirements.txt"],
                         check=True, capture_output=True)
        except subprocess.CalledProcessError as e:
            print(f"⚠️  Ошибка установки зависимостей: {e}")
            print("Продолжаем без установки...")

    # Запускаем сервер
    print("🚀 Запуск FastVLM сервера...")
    try:
        subprocess.run([python_cmd, "server.py"])
    except KeyboardInterrupt:
        print("\n🛑 Сервер остановлен пользователем")
    except Exception as e:
        print(f"❌ Ошибка запуска сервера: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
