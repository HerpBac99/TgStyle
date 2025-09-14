#!/usr/bin/env python3
"""
Скрипт для скачивания модели Qwen2.5-VL-3B-Instruct
Использует huggingface_hub для загрузки модели
"""

import os
import sys
from pathlib import Path
from huggingface_hub import snapshot_download, HfApi
from config import Config

def download_model():
    """Скачивание модели Qwen2.5-VL"""
    try:
        print(f"Начинаем скачивание модели: {Config.MODEL_NAME}")
        print("Это может занять несколько минут в зависимости от скорости интернета...")

        # Создаем директорию для модели
        model_dir = Path.home() / ".cache" / "huggingface" / "hub" / f"models--{Config.MODEL_NAME.replace('/', '--')}"

        # Проверяем, существует ли модель
        if model_dir.exists():
            print(f"Модель уже скачана в: {model_dir}")
            return True

        # Скачиваем модель
        model_path = snapshot_download(
            repo_id=Config.MODEL_NAME,
            local_dir=None,  # Используем стандартную директорию HF
            local_dir_use_symlinks=False,
            cache_dir=None,
            resume_download=True,
            force_download=False,
            proxies=None,
            token=None,  # Если нужна аутентификация, добавьте токен
            revision="main",
            library_name="transformers",
            library_version=None,
            user_agent=None,
        )

        print(f"Модель успешно скачана в: {model_path}")

        # Проверяем размер скачанной модели
        total_size = sum(f.stat().st_size for f in Path(model_path).rglob('*') if f.is_file())
        size_gb = total_size / (1024**3)
        print(f"Размер модели: {size_gb:.1f} GB")
        return True

    except Exception as e:
        print(f"Ошибка при скачивании модели: {e}")
        print("\nВозможные решения:")
        print("1. Проверьте подключение к интернету")
        print("2. Добавьте токен HuggingFace, если модель приватная:")
        print("   export HF_TOKEN=your_token_here")
        print("3. Попробуйте скачать позже")
        return False

def check_model_availability():
    """Проверка доступности модели на HuggingFace"""
    try:
        api = HfApi()
        model_info = api.model_info(Config.MODEL_NAME)

        print(f"Информация о модели {Config.MODEL_NAME}:")
        print(f"- Скачиваний: {model_info.downloads}")
        print(f"- Лайков: {model_info.likes}")
        print(f"- Обновлено: {model_info.last_modified}")
        print(f"- Теги: {model_info.tags}")

        return True

    except Exception as e:
        print(f"Ошибка при проверке модели: {e}")
        return False

def main():
    """Главная функция"""
    print("=" * 50)
    print("Скачивание модели Qwen2.5-VL")
    print("=" * 50)

    # Загружаем конфигурацию
    Config.load_env()

    print(f"Выбранная модель: {Config.MODEL_NAME}")
    print(f"Устройство: {Config.DEVICE}")
    print()

    # Проверяем доступность модели
    print("Проверяем доступность модели...")
    if not check_model_availability():
        print("Не удалось получить информацию о модели")
        sys.exit(1)

    print()

    # Скачиваем модель
    if download_model():
        print("\n✅ Модель успешно скачана!")
        print("Теперь можно запускать сервер: python server.py")
    else:
        print("\n❌ Ошибка при скачивании модели")
        sys.exit(1)

if __name__ == "__main__":
    main()
