#!/usr/bin/env python3
"""
Скрипт для создания стильных образов в базе данных
НОВАЯ ЛОГИКА с keyId и setId:
1. Главная папка: server/uploads/stock/StyleOutfit/Woman/Пальто_серое
2. Внутри 3 фотографии -> создаем для каждой фотографии запись в StyleOutfit с одинаковым keyId
3. Циклом проходимся по каждой папке Set_X и создаем записи в StyleOutfitItem
4. У создаваемых строк StyleOutfitItem: keyId = из предыдущего шага, setId = название папки (например "Set_1")
"""

import os
import sys
import json
import base64
from pathlib import Path
import psycopg2
from PIL import Image
import requests
import io
import re

# ========================================
# НАСТРОЙКИ СКРИПТА (ИЗМЕНИ ПОД СВОИ НУЖДЫ)
# ========================================

# Путь к конкретной папке для обработки
TARGET_FOLDER = "server/uploads/stock/StyleOutfit/Woman/Пальто_бежевое"

# Пол для обработки ('male' или 'female')
GENDER = "female"

# Сезон
SEASON = "autumn"

# Повод
OCCASION = "casual"

# ========================================

# Настройки подключения к БД
DB_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'database': 'telegramstyle',
    'user': 'TgStyle_Admin',
    'password': '@TgStyle2025@'
}

# URL FastVLM сервера
FASTVLM_URL = "http://127.0.0.1:3001"

def get_db_connection():
    """Подключение к PostgreSQL"""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        return conn
    except Exception as e:
        print(f"❌ Ошибка подключения к БД: {e}")
        return None

def file_to_base64(image_path: str) -> str:
    """
    Конвертирует файл в base64 (как в приложении)
    """
    with open(image_path, 'rb') as f:
        file_data = f.read()
    
    # Определяем MIME тип по расширению
    ext = Path(image_path).suffix.lower()
    if ext in ['.jpg', '.jpeg']:
        mime_type = 'image/jpeg'
    elif ext == '.png':
        mime_type = 'image/png'
    elif ext == '.webp':
        mime_type = 'image/webp'
    else:
        mime_type = 'image/jpeg'
    
    base64_data = base64.b64encode(file_data).decode('utf-8')
    return f'data:{mime_type};base64,{base64_data}'

def optimize_for_classification(base64_image: str) -> str:
    """
    Оптимизация изображения перед отправкой на FastVLM
    (как в PhotoProcessor.optimizeForClassification)
    """
    try:
        # Убираем data:image/...;base64, префикс
        if ',' in base64_image:
            base64_data = base64_image.split(',', 1)[1]
        else:
            base64_data = base64_image
        
        # Декодируем base64
        image_data = base64.b64decode(base64_data)
        img = Image.open(io.BytesIO(image_data)).convert('RGB')
        
        # Вычисляем новые размеры (максимум 1200px)
        width, height = img.size
        max_size = 1200
        
        if width > max_size or height > max_size:
            if width > height:
                height = int((height * max_size) / width)
                width = max_size
            else:
                width = int((width * max_size) / height)
                height = max_size
        
        # Изменяем размер если нужно
        if (width, height) != img.size:
            img = img.resize((width, height), Image.Resampling.LANCZOS)
        
        # Сохраняем как JPEG с качеством 85%
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=85, optimize=True)
        
        # Конвертируем в base64 с префиксом
        optimized_data = base64.b64encode(buf.getvalue()).decode('utf-8')
        return f'data:image/jpeg;base64,{optimized_data}'
        
    except Exception as e:
        print(f"❌ Ошибка оптимизации {base64_image[:50]}...: {e}")
        return base64_image

def save_processed_image(base64_image: str, original_path: str) -> str:
    """
    Сохраняет обработанное изображение (с удаленным фоном) в PNG формате
    Удаляет оригинальный файл и возвращает новый путь
    """
    try:
        # Убираем префикс data:image/png;base64,
        if ',' in base64_image:
            base64_data = base64_image.split(',', 1)[1]
        else:
            base64_data = base64_image
        
        # Декодируем base64
        image_data = base64.b64decode(base64_data)
        
        # Формируем новый путь с расширением .png
        original_path_obj = Path(original_path)
        new_path = original_path_obj.with_suffix('.png')
        
        # Сохраняем обработанное изображение
        with open(new_path, 'wb') as f:
            f.write(image_data)
        
        # Удаляем оригинальный файл если он отличается
        if original_path != str(new_path) and os.path.exists(original_path):
            os.remove(original_path)
            print(f"  🔄 Заменено: {original_path_obj.name} → {new_path.name}")
        
        return str(new_path)
        
    except Exception as e:
        print(f"  ⚠️  Ошибка сохранения обработанного изображения: {e}")
        return original_path  # Возвращаем оригинальный путь при ошибке

def classify_clothing(image_path: str) -> dict:
    """
    Отправляет изображение на классификацию в FastVLM
    """
    try:
        print(f"  📸 Классифицируем: {Path(image_path).name}")
        
        # 1. Конвертируем в base64
        base64_image = file_to_base64(image_path)
        
        # 2. Оптимизируем для классификации
        optimized_image = optimize_for_classification(base64_image)
        
        # 3. Отправляем на FastVLM
        response = requests.post(
            f"{FASTVLM_URL}/classify_clothing",
            json={"image_base64": optimized_image},
            timeout=120
        )
        response.raise_for_status()
        result = response.json()
        
        if result.get("success"):
            classification = result.get("classification", {})
            embedding = classification.get("embedding", [])
            processed_image = result.get("processed_image_base64", "")  # Изображение с удаленным фоном
            
            print(f"  ✅ Классифицировано: {classification.get('category')} - {classification.get('subtype')} - {classification.get('color')}")
            
            return {
                "success": True,
                "category": classification.get("category"),
                "subtype": classification.get("subtype"),
                "color": classification.get("color"),
                "material": classification.get("material"),
                "season": classification.get("season"),
                "style": classification.get("style"),
                "pattern": classification.get("pattern"),
                "fit": classification.get("fit"),
                "embedding": embedding,
                "processed_image_base64": processed_image  # Добавляем обработанное изображение
            }
        else:
            print(f"  ❌ Ошибка классификации: {result.get('error')}")
            return {"success": False, "error": result.get("error")}
            
    except Exception as e:
        print(f"  ❌ Ошибка при классификации {image_path}: {e}")
        return {"success": False, "error": str(e)}

def get_existing_key_id_for_folder(conn, folder_path: str) -> str:
    """
    Ищет существующий keyId для папки по пути к изображению
    Возвращает keyId если найден, иначе None
    """
    try:
        cursor = conn.cursor()
        # Ищем записи где image_path содержит путь к папке
        folder_pattern = folder_path.replace('\\', '\\\\')  # Экранируем для SQL
        query = """
        SELECT key_id FROM style_outfits 
        WHERE image_path LIKE %s 
        ORDER BY id DESC 
        LIMIT 1
        """
        cursor.execute(query, (f'%{folder_pattern}%',))
        result = cursor.fetchone()
        
        if result:
            key_id = result[0]
            print(f"  ✅ Найден существующий keyId={key_id} для папки {folder_path}")
            return key_id
        
        return None
        
    except Exception as e:
        print(f"  ⚠️  Ошибка поиска keyId: {e}")
        return None

def is_image_already_processed(conn, image_path: str) -> bool:
    """
    Проверяет существует ли уже запись StyleOutfit для этого изображения
    """
    try:
        cursor = conn.cursor()
        # Проверяем по точному пути или по пути с .png вместо оригинального расширения
        image_path_png = str(Path(image_path).with_suffix('.png'))
        
        query = """
        SELECT COUNT(*) FROM style_outfits 
        WHERE image_path = %s OR image_path = %s
        """
        cursor.execute(query, (image_path, image_path_png))
        count = cursor.fetchone()[0]
        
        return count > 0
        
    except Exception as e:
        print(f"  ⚠️  Ошибка проверки изображения: {e}")
        return False

def is_set_item_already_processed(conn, key_id: str, set_id: str, image_path: str) -> bool:
    """
    Проверяет существует ли уже запись StyleOutfitItem для этого элемента набора
    """
    try:
        cursor = conn.cursor()
        # Проверяем по keyId, setId и пути
        image_path_png = str(Path(image_path).with_suffix('.png'))
        
        query = """
        SELECT COUNT(*) FROM style_outfit_items 
        WHERE key_id = %s AND set_id = %s AND (image_path = %s OR image_path = %s)
        """
        cursor.execute(query, (key_id, set_id, image_path, image_path_png))
        count = cursor.fetchone()[0]
        
        return count > 0
        
    except Exception as e:
        print(f"  ⚠️  Ошибка проверки элемента набора: {e}")
        return False

def get_next_key_id(conn) -> str:
    """
    Получает следующий keyId (максимальный + 1)
    Возвращает строковое представление числа
    """
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT COALESCE(MAX(CAST(key_id AS INTEGER)), 0) + 1 FROM style_outfits WHERE key_id ~ '^[0-9]+$'")
        next_key_id = cursor.fetchone()[0]
        return str(next_key_id)
    except Exception as e:
        print(f"❌ Ошибка получения следующего keyId: {e}")
        return "1"

def create_style_outfit(conn, name: str, image_path: str, gender: str, season: str, theme: str, 
                       key_id: str, classification: dict) -> int:
    """
    Создает запись в таблице StyleOutfit с новой структурой
    Возвращает ID созданной записи
    """
    try:
        cursor = conn.cursor()
        
        # Для PostgreSQL vector типа нужно передавать как строку массива
        embedding = classification.get("embedding", [])
        embedding_str = str(embedding) if embedding else None
        
        query = """
        INSERT INTO style_outfits (
            key_id, name, description, image_path, gender, season, style,
            category, subtype, color, material, pattern, fit,
            embedding, created_at, updated_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::vector, NOW(), NOW())
        RETURNING id
        """
        
        description = f"Якорная вещь: {classification.get('category', '')} - {classification.get('subtype', '')} - {classification.get('color', '')}"
        
        cursor.execute(query, (
            key_id, name, description, image_path, gender, season, 
            classification.get("style"),
            classification.get("category"),
            classification.get("subtype"),
            classification.get("color"),
            classification.get("material"),
            classification.get("pattern"),
            classification.get("fit"),
            embedding_str
        ))
        outfit_id = cursor.fetchone()[0]
        conn.commit()
        
        embedding_info = f", embedding: {len(embedding)} измерений" if embedding else ", без embedding"
        print(f"✅ Создан StyleOutfit: ID={outfit_id}, keyId='{key_id}', name='{name}'{embedding_info}")
        return outfit_id
        
    except Exception as e:
        print(f"❌ Ошибка создания StyleOutfit: {e}")
        conn.rollback()
        return None

def create_style_outfit_item(conn, key_id: str, set_id: str, image_path: str, classification: dict, gender: str) -> bool:
    """
    Создает запись в таблице StyleOutfitItem с новой структурой
    keyId - ссылка на группу якорных вещей
    setId - идентификатор набора одежды (например "Set_1")
    """
    try:
        cursor = conn.cursor()
        
        # Находим любой outfit_id с данным keyId для связи
        cursor.execute('SELECT id FROM style_outfits WHERE key_id = %s LIMIT 1', (key_id,))
        result = cursor.fetchone()
        if not result:
            print(f"  ❌ Не найден StyleOutfit с keyId={key_id}")
            return False
        
        outfit_id = result[0]
        
        # Для PostgreSQL vector типа нужно передавать как строку массива
        embedding = classification.get("embedding", [])
        embedding_str = str(embedding) if embedding else None
        
        # Определяем mandatory по суффиксу "_m" в названии файла
        # Если в названии есть "_m" (например: "1_m.jpg") - обязательная вещь
        # Иначе - опциональная
        file_name = Path(image_path).stem  # Получаем имя файла без расширения
        mandatory = "_m" in file_name.lower()
        
        query = """
        INSERT INTO style_outfit_items (
            outfit_id, key_id, set_id, gender, category, subtype, color, material, season,
            image_path, embedding, mandatory, style, pattern, fit, description, created_at, updated_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::vector, %s, %s, %s, %s, %s, NOW(), NOW())
        """
        
        description = f"{classification.get('category', '')} - {classification.get('subtype', '')} - {classification.get('color', '')}"
        
        cursor.execute(query, (
            outfit_id,
            key_id,
            set_id,
            gender,
            classification.get("category"),
            classification.get("subtype"),
            classification.get("color"),
            classification.get("material"),
            classification.get("season"),
            image_path,
            embedding_str,
            mandatory,
            classification.get("style"),
            classification.get("pattern"),
            classification.get("fit"),
            description
        ))
        
        conn.commit()
        mandatory_text = "ОБЯЗАТЕЛЬНАЯ" if mandatory else "опциональная"
        embedding_info = f", embedding: {len(embedding)} измерений" if embedding else ""
        print(f"  ✅ Создан StyleOutfitItem: keyId={key_id}, setId={set_id}, {mandatory_text}, category={classification.get('category')}{embedding_info}")
        return True
        
    except Exception as e:
        print(f"  ❌ Ошибка создания StyleOutfitItem: {e}")
        conn.rollback()
        return False

def process_target_folder(conn, folder_path: Path, gender: str, season: str, theme: str):
    """
    НОВАЯ ЛОГИКА:
    1. Главная папка: server/uploads/stock/StyleOutfit/Woman/Пальто_серое
    2. Внутри 3 фотографии -> создаем для каждой фотографии запись в StyleOutfit с одинаковым keyId
    3. Циклом проходимся по каждой папке Set_X и создаем записи в StyleOutfitItem
    4. У создаваемых строк StyleOutfitItem: keyId = из предыдущего шага, setId = название папки
    """
    print(f"\n📁 Обрабатываем папку: {folder_path.name}")
    
    if not folder_path.exists():
        print(f"❌ Папка не найдена: {folder_path}")
        return False
    
    # 1. Проверяем существует ли уже keyId для этой папки
    existing_key_id = get_existing_key_id_for_folder(conn, str(folder_path))
    
    if existing_key_id:
        key_id = existing_key_id
        print(f"🔑 Используем существующий keyId: {key_id}")
    else:
        key_id = get_next_key_id(conn)
        print(f"🔑 Создаем новый keyId: {key_id}")
    
    # 2. Ищем все файлы изображений в корне папки (якорные вещи)
    image_files = []
    for item in folder_path.iterdir():
        if item.is_file() and item.suffix.lower() in ['.png', '.jpg', '.jpeg', '.webp']:
            image_files.append(item)
    
    if not image_files:
        print(f"❌ Не найдено изображений в корне папки: {folder_path}")
        return False
    
    # Сортируем файлы по имени для стабильного порядка
    image_files.sort(key=lambda x: x.name)
    print(f"📸 Найдено {len(image_files)} якорных изображений в корне папки")
    
    # 3. Обрабатываем каждое изображение и создаем записи StyleOutfit с одинаковым keyId
    style_outfit_count = 0
    skipped_count = 0
    
    for i, image_file in enumerate(image_files, 1):
        print(f"\n🎯 Обрабатываем якорное изображение {i}/{len(image_files)}: {image_file.name}")
        
        # Проверяем не обработано ли уже это изображение
        if is_image_already_processed(conn, str(image_file)):
            print(f"  ⏭️  Пропускаем: изображение уже обработано")
            skipped_count += 1
            continue
        
        # Классифицируем изображение
        classification = classify_clothing(str(image_file))
        
        if not classification.get("success"):
            print(f"  ❌ Не удалось классифицировать: {classification.get('error')}")
            continue
        
        # Сохраняем обработанное изображение (с удаленным фоном)
        processed_image_path = str(image_file)
        if classification.get("processed_image_base64"):
            processed_image_path = save_processed_image(
                classification.get("processed_image_base64"),
                str(image_file)
            )
        
        # Создаем запись StyleOutfit
        outfit_id = create_style_outfit(
            conn, 
            name=f"{folder_path.name}_вариант_{i}",  # Например: "Пальто_серое_вариант_1"
            image_path=processed_image_path,  # Используем обработанное изображение
            gender=gender,
            season=season,
            theme=theme,
            key_id=key_id,
            classification=classification
        )
        
        if outfit_id:
            style_outfit_count += 1
    
    if style_outfit_count == 0 and skipped_count == 0:
        print(f"❌ Не удалось создать ни одной записи StyleOutfit")
        return False
    
    print(f"\n📊 Статистика якорных изображений:")
    print(f"   ✅ Создано: {style_outfit_count}")
    print(f"   ⏭️  Пропущено (уже существуют): {skipped_count}")
    print(f"   🔑 KeyId: {key_id}")
    
    # 4. Ищем папки с наборами (Set_1, Set_2, etc.)
    set_folders = []
    for item in folder_path.iterdir():
        if item.is_dir() and item.name.startswith("Set_"):
            set_folders.append(item)
    
    if not set_folders:
        print(f"⚠️  Не найдено папок с наборами (Set_1, Set_2, etc.) в {folder_path.name}")
        print(f"✅ Обработка завершена: только StyleOutfit записи")
        return True
    
    # Сортируем папки по имени для стабильного порядка
    set_folders.sort(key=lambda x: x.name)
    print(f"\n📂 Найдено {len(set_folders)} наборов: {[folder.name for folder in set_folders]}")
    
    # 5. Обрабатываем каждый набор
    total_items = 0
    for set_folder in set_folders:
        set_id = set_folder.name  # Например: "Set_1"
        print(f"\n  📦 Обрабатываем {set_id}:")
        
        # Ищем все файлы в наборе
        item_files = []
        for item_file in set_folder.iterdir():
            if item_file.is_file() and item_file.suffix.lower() in ['.png', '.jpg', '.jpeg', '.webp']:
                item_files.append(item_file)
        
        if not item_files:
            print(f"    ⚠️  Нет изображений в {set_id}")
            continue
        
        # Сортируем файлы по имени для стабильного порядка
        item_files.sort(key=lambda x: x.name)
        
        print(f"    📸 Найдено {len(item_files)} элементов в наборе")
        
        # Обрабатываем каждый элемент набора
        set_success_count = 0
        set_skipped_count = 0
        
        for item_file in item_files:
            print(f"    📷 Обрабатываем: {item_file.name}")
            
            # Проверяем не обработан ли уже этот элемент
            if is_set_item_already_processed(conn, key_id, set_id, str(item_file)):
                print(f"    ⏭️  Пропускаем: элемент уже обработан")
                set_skipped_count += 1
                continue
            
            # Классифицируем элемент
            item_classification = classify_clothing(str(item_file))
            
            if item_classification.get("success"):
                # Сохраняем обработанное изображение (с удаленным фоном)
                processed_item_path = str(item_file)
                if item_classification.get("processed_image_base64"):
                    processed_item_path = save_processed_image(
                        item_classification.get("processed_image_base64"),
                        str(item_file)
                    )
                
                # Создаем запись StyleOutfitItem с keyId и setId
                if create_style_outfit_item(
                    conn, key_id, set_id, processed_item_path, item_classification, gender
                ):
                    set_success_count += 1
                    total_items += 1
            else:
                print(f"    ⚠️  Пропускаем {item_file.name} из-за ошибки классификации")
        
        print(f"    📊 {set_id}: создано {set_success_count}, пропущено {set_skipped_count}")
    
    print(f"\n🎉 Завершена обработка '{folder_path.name}':")
    print(f"   📋 StyleOutfit записей: создано {style_outfit_count}, пропущено {skipped_count} (keyId={key_id})")
    print(f"   📦 StyleOutfitItem записей: {total_items} в {len(set_folders)} наборах")
    print(f"   🎯 Итого комбинаций: {style_outfit_count + skipped_count} × {len(set_folders)} = {(style_outfit_count + skipped_count) * len(set_folders)}")
    return True

def main():
    # Используем глобальные переменные
    target_folder = TARGET_FOLDER
    gender = GENDER
    season = SEASON
    theme = OCCASION  # Переименовываем для ясности
    
    # Определяем целевую папку
    folder_path = Path(target_folder)
    
    print(f"🎯 СОЗДАНИЕ СТИЛЬНЫХ ОБРАЗОВ С ЯКОРНЫМИ ВЕЩАМИ")
    print(f"📁 Целевая папка: {folder_path}")
    print(f"👤 Пол: {gender}")
    print(f"🌿 Сезон: {season}")
    print(f"🎪 Тема: {theme}")
    print(f"\n📋 ЛОГИКА ОБРАБОТКИ:")
    print(f"   1. Фото в корне папки → StyleOutfit записи с одинаковым keyId")
    print(f"   2. Папки Set_X → StyleOutfitItem записи с keyId и setId")
    
    # Подключаемся к БД
    conn = get_db_connection()
    if not conn:
        return
    
    try:
        # Проверяем доступность FastVLM сервера
        try:
            response = requests.get(f"{FASTVLM_URL}/", timeout=5)
            print(f"✅ FastVLM сервер доступен: {FASTVLM_URL}")
        except Exception as e:
            print(f"❌ FastVLM сервер недоступен: {e}")
            print(f"   Убедитесь что сервер запущен на {FASTVLM_URL}")
            return
        
        # Обрабатываем целевую папку
        if process_target_folder(conn, folder_path, gender, season, theme):
            print(f"\n🎉 УСПЕШНО ЗАВЕРШЕНО!")
            print(f"✅ Папка '{folder_path.name}' обработана")
            print(f"💡 Теперь у вас есть система якорных вещей с вариантами!")
        else:
            print(f"\n❌ ОШИБКА!")
            print(f"❌ Не удалось обработать папку '{folder_path.name}'")
        
    finally:
        conn.close()

if __name__ == "__main__":
    main()