#!/usr/bin/env python3
"""
FastVLM API Tester Launcher
Кроссплатформенный скрипт для запуска тестирования FastVLM API
"""

import os
import sys
import subprocess
from pathlib import Path

def main():
    print("🧪 Запуск тестирования FastVLM API...")

    # Определяем пути
    current_dir = Path(__file__).parent
    fastvlm_dir = current_dir / "fastvlm-server"
    test_script = fastvlm_dir / "test_api.py"

    if not fastvlm_dir.exists():
        print(f"❌ Папка {fastvlm_dir} не найдена!")
        sys.exit(1)

    if not test_script.exists():
        print(f"❌ Скрипт тестирования {test_script} не найден!")
        sys.exit(1)

    # Переходим в папку fastvlm-server
    os.chdir(fastvlm_dir)
    print(f"📍 Переход в папку: {fastvlm_dir}")

    # Определяем Python команду
    python_cmd = sys.executable

    # Проверяем виртуальное окружение
    venv_path = fastvlm_dir / "venv"
    if venv_path.exists():
        print("📦 Активация виртуального окружения...")

        if os.name == "nt":  # Windows
            python_cmd = str(venv_path / "Scripts" / "python.exe")
        else:  # Unix/Linux/Mac
            python_cmd = str(venv_path / "bin" / "python")

        if not os.path.exists(python_cmd):
            print("⚠️  Виртуальное окружение найдено, но Python не доступен")
            python_cmd = sys.executable

    # Запускаем тестирование
    print("🚀 Запуск тестирования API...")
    try:
        # Передаем аргументы командной строки
        cmd = [python_cmd, "test_api.py"] + sys.argv[1:]
        subprocess.run(cmd)
    except KeyboardInterrupt:
        print("\n🛑 Тестирование остановлено пользователем")
    except Exception as e:
        print(f"❌ Ошибка запуска тестирования: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
