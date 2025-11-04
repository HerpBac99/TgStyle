#!/usr/bin/env python3
"""
Скрипт для сравнения векторов конкретных вещей из гардероба
Помогает понять почему одна вещь похожа больше чем другая
"""

import json
import math
import psycopg2
from typing import List

# ID вещей для сравнения
WARDROBE_IDS = [15, 16]  # Джинсы и Брюки
STYLE_OUTFIT_ITEM_ID = 3  # Вещь из набора для сравнения

# Настройки подключения к БД
DB_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'database': 'telegramstyle',
    'user': 'TgStyle_Admin',
    'password': '@TgStyle2025@'
}

def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """Вычисляет косинусное сходство"""
    if not vec1 or not vec2 or len(vec1) != len(vec2):
        return 0.0
    
    dot_product = sum(a * b for a, b in zip(vec1, vec2))
    norm1 = math.sqrt(sum(a * a for a in vec1))
    norm2 = math.sqrt(sum(b * b for b in vec2))
    
    if norm1 == 0 or norm2 == 0:
        return 0.0
    
    return dot_product / (norm1 * norm2)

def get_db_connection():
    """Подключение к PostgreSQL"""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        return conn
    except Exception as e:
        print(f"Ошибка подключения к БД: {e}")
        return None

def load_wardrobe_item(conn, item_id: int):
    """Загружает вещь из гардероба"""
    cursor = conn.cursor()
    query = """
    SELECT id, category, color, subtype, image_path, embedding
    FROM wardrobe_items 
    WHERE id = %s
    """
    cursor.execute(query, (item_id,))
    row = cursor.fetchone()
    
    if not row:
        return None
    
    id, category, color, subtype, image_path, embedding = row
    embedding_vector = json.loads(embedding) if embedding else []
    
    return {
        'id': id,
        'category': category,
        'color': color,
        'subtype': subtype,
        'image_path': image_path,
        'embedding': embedding_vector
    }

def load_style_outfit_item(conn, item_id: int):
    """Загружает вещь из StyleOutfitItem"""
    cursor = conn.cursor()
    query = """
    SELECT id, category, color, subtype, image_path, embedding
    FROM style_outfit_items 
    WHERE id = %s
    """
    cursor.execute(query, (item_id,))
    row = cursor.fetchone()
    
    if not row:
        return None
    
    id, category, color, subtype, image_path, embedding = row
    embedding_vector = json.loads(embedding) if embedding else []
    
    return {
        'id': id,
        'category': category,
        'color': color,
        'subtype': subtype,
        'image_path': image_path,
        'embedding': embedding_vector
    }

def main():
    print("СРАВНЕНИЕ ВЕКТОРОВ ВЕЩЕЙ")
    print("=" * 80)
    
    conn = get_db_connection()
    if not conn:
        return
    
    try:
        # Загружаем эталонную вещь из StyleOutfitItem
        reference = load_style_outfit_item(conn, STYLE_OUTFIT_ITEM_ID)
        if not reference:
            print(f"Вещь StyleOutfitItem ID {STYLE_OUTFIT_ITEM_ID} не найдена")
            return
        
        print(f"\nЭТАЛОН (StyleOutfitItem ID {reference['id']}):")
        print(f"  Категория: {reference['category']}")
        print(f"  Цвет: {reference['color']}")
        print(f"  Тип: {reference['subtype']}")
        print(f"  Фото: {reference['image_path']}")
        print(f"  Вектор: {len(reference['embedding'])} измерений")
        
        print(f"\n{'='*80}")
        print("\nСРАВНЕНИЕ С ВЕЩАМИ ИЗ ГАРДЕРОБА:")
        print("=" * 80)
        
        # Сравниваем с каждой вещью из гардероба
        for wardrobe_id in WARDROBE_IDS:
            item = load_wardrobe_item(conn, wardrobe_id)
            if not item:
                print(f"\nВещь Wardrobe ID {wardrobe_id} не найдена")
                continue
            
            similarity = cosine_similarity(reference['embedding'], item['embedding'])
            
            print(f"\nВЕЩЬ {item['id']} - СХОДСТВО: {similarity:.1%}")
            print(f"  Категория: {item['category']}")
            print(f"  Цвет: {item['color']}")
            print(f"  Тип: {item['subtype']}")
            print(f"  Фото: server\\uploads\\{item['image_path']}")
            print(f"  Вектор: {len(item['embedding'])} измерений")
            
            # Анализ различий
            if item['category'] != reference['category']:
                print(f"  ⚠️  РАЗНЫЕ КАТЕГОРИИ: {item['category']} vs {reference['category']}")
            
            if item['color'] != reference['color']:
                print(f"  ⚠️  РАЗНЫЕ ЦВЕТА: {item['color']} vs {reference['color']}")
        
        print(f"\n{'='*80}")
        
    finally:
        conn.close()

if __name__ == "__main__":
    main()
