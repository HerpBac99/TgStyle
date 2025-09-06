#!/usr/bin/env python3
"""
TgStyle App Launcher
Кроссплатформенный скрипт для запуска основного приложения
"""

import os
import sys
import subprocess
import platform
from pathlib import Path

def run_command(cmd, cwd=None):
    """Запуск команды с обработкой ошибок"""
    try:
        print(f"▶️  {' '.join(cmd)}")
        result = subprocess.run(cmd, cwd=cwd, check=True, capture_output=False)
        return result.returncode == 0
    except subprocess.CalledProcessError as e:
        print(f"❌ Ошибка выполнения команды: {e}")
        return False
    except FileNotFoundError:
        print(f"❌ Команда не найдена: {cmd[0]}")
        return False

def main():
    print("🚀 Запуск TgStyle приложения...")

    # Определяем текущую директорию
    current_dir = Path(__file__).parent

    # Проверяем наличие package.json
    package_json = current_dir / "package.json"
    if not package_json.exists():
        print("❌ package.json не найден!")
        sys.exit(1)

    # Проверяем Node.js
    try:
        result = subprocess.run(["node", "--version"], capture_output=True, text=True)
        if result.returncode != 0:
            print("❌ Node.js не установлен!")
            sys.exit(1)
        print(f"✅ Node.js: {result.stdout.strip()}")
    except FileNotFoundError:
        print("❌ Node.js не найден!")
        sys.exit(1)

    # Проверяем npm
    try:
        result = subprocess.run(["npm", "--version"], capture_output=True, text=True)
        if result.returncode != 0:
            print("❌ npm не установлен!")
            sys.exit(1)
        print(f"✅ npm: {result.stdout.strip()}")
    except FileNotFoundError:
        print("❌ npm не найден!")
        sys.exit(1)

    # Проверяем наличие node_modules
    node_modules = current_dir / "node_modules"
    if not node_modules.exists():
        print("📦 Установка зависимостей...")
        if not run_command(["npm", "install"]):
            sys.exit(1)

    # Сборка клиента
    print("🔨 Сборка клиента...")
    if not run_command(["npm", "run", "build"]):
        print("❌ Ошибка сборки клиента!")
        sys.exit(1)

    # Запуск сервера
    print("🌐 Запуск сервера...")
    try:
        subprocess.run(["npm", "start"])
    except KeyboardInterrupt:
        print("\n🛑 Сервер остановлен пользователем")
    except Exception as e:
        print(f"❌ Ошибка запуска сервера: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
