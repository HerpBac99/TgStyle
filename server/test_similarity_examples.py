#!/usr/bin/env python3
"""
Скрипт для тестирования конкретных примеров сходства
Позволяет быстро сравнить несколько конкретных вещей между собой
"""

import os
import sys
import json
import math
from pathlib import Path
import psycopg2
from typing import List, Dict, Tuple, Optional

# ========================================
# НАСТРОЙКИ СКРИПТА
# ========================================

# Список ID вещей для сравнения (ИЗМЕНИТЕ НА ВАШИ ID)
TEST_ITEMS = [
    # Добавьте сюда ID ваших вещей:
    # 1,  # серое пальто
    # 2,  # розовое пальто  
    # 3,  # серое худи
]

# Если TEST_ITEMS пуст, можно искать по описанию
SEARCH_BY_DESCRIPTION = True
SEARCH_TERMS = [
    "серое пальто",
    "розовое пальто", 
    "серое худи"
]

# ========================================

# Настройки подключения к БД
DB_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'database': 'telegramstyle',
    'user': 'TgStyle_Admin',
    'password': '@TgStyle2025@'
}

def get_db_connection():
    """Подключение к PostgreSQL"""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        return conn
    except Exception as e:
        print(f"❌ Ошибка подключения к БД: {e}")
        return None

def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """Вычисляет косинусное сходство между двумя векторами"""
    if not vec1 or not vec2 or len(vec1) != len(vec2):
        return 0.0
    
    dot_product = sum(a * b for a, b in zip(vec1, vec2))
    norm1 = math.sqrt(sum(a * a for a in vec1))
    norm2 = math.sqrt(sum(b * b for b in vec2))
    
    if norm1 == 0 or norm2 == 0:
        return 0.0
    
    return dot_product / (norm1 * norm2)

def load_items_by_ids(conn, item_ids: List[int]) -> List[Dict]:
    """Загружает вещи по списку ID"""
    if not item_ids:
        return []
    
    try:
        cursor = conn.cursor()
        
        # Создаем плейсхолдеры для IN запроса
        placeholders = ','.join(['%s'] * len(item_ids))
        
        query = f"""
        SELECT id, telegram_id, category, subtype, color, material, style, pattern, 
               fit, season, image_path, embedding, name, tags, created_at
        FROM wardrobe_items 
        WHERE id IN ({placeholders}) AND embedding IS NOT NULL
        ORDER BY id
        """
        
        cursor.execute(query, item_ids)
        results = cursor.fetchall()
        
        items = []
        for row in results:
            id, telegram_id, category, subtype, color, material, style, pattern, fit, season, image_path, embedding, name, tags, created_at = row
            
            # Парсим embedding из JSON
            embedding_vector = json.loads(embedding) if embedding else []
            
            if embedding_vector:  # Только вещи с векторами
                items.append({
                    'id': id,
                    'telegram_id': telegram_id,
                    'category': category,
                    'subtype': subtype,
                    'color': color,
                    'material': material,
                    'style': style,
                    'pattern': pattern,
                    'fit': fit,
                    'season': season,
                    'image_path': image_path,
                    'embedding': embedding_vector,
                    'name': name,
                    'tags': tags or [],
                    'created_at': created_at
                })
        
        print(f"📦 Загружено {len(items)} вещей по ID")
        return items
        
    except Exception as e:
        print(f"❌ Ошибка загрузки вещей по ID: {e}")
        return []

def search_items_by_description(conn, search_terms: List[str]) -> List[Dict]:
    """Ищет вещи по описанию (цвет + подтип)"""
    try:
        cursor = conn.cursor()
        
        items = []
        
        for term in search_terms:
            print(f"🔍 Ищем: '{term}'")
            
            # Разбиваем термин на слова
            words = term.lower().split()
            
            # Строим условия поиска
            conditions = []
            params = []
            
            for word in words:
                # Ищем в цвете, подтипе, названии
                condition = """
                (LOWER(color) LIKE %s OR 
                 LOWER(subtype) LIKE %s OR 
                 LOWER(name) LIKE %s OR
                 LOWER(category::text) LIKE %s)
                """
                conditions.append(condition)
                like_pattern = f"%{word}%"
                params.extend([like_pattern, like_pattern, like_pattern, like_pattern])
            
            # Объединяем условия через AND
            where_clause = " AND ".join(conditions)
            
            query = f"""
            SELECT id, telegram_id, category, subtype, color, material, style, pattern, 
                   fit, season, image_path, embedding, name, tags, created_at
            FROM wardrobe_items 
            WHERE ({where_clause}) AND embedding IS NOT NULL
            ORDER BY created_at DESC
            LIMIT 5
            """
            
            cursor.execute(query, params)
            results = cursor.fetchall()
            
            print(f"   Найдено {len(results)} совпадений")
            
            for row in results:
                id, telegram_id, category, subtype, color, material, style, pattern, fit, season, image_path, embedding, name, tags, created_at = row
                
                # Парсим embedding из JSON
                embedding_vector = json.loads(embedding) if embedding else []
                
                if embedding_vector:
                    item = {
                        'id': id,
                        'telegram_id': telegram_id,
                        'category': category,
                        'subtype': subtype,
                        'color': color,
                        'material': material,
                        'style': style,
                        'pattern': pattern,
                        'fit': fit,
                        'season': season,
                        'image_path': image_path,
                        'embedding': embedding_vector,
                        'name': name,
                        'tags': tags or [],
                        'created_at': created_at,
                        'search_term': term  # Добавляем для отслеживания
                    }
                    items.append(item)
                    
                    # Показываем что нашли
                    desc = f"{color or ''} {subtype or category or ''} {name or ''}".strip()
                    print(f"   ✅ ID {id}: {desc}")
        
        return items
        
    except Exception as e:
        print(f"❌ Ошибка поиска по описанию: {e}")
        return []

def format_item_info(item: Dict) -> str:
    """Форматирует информацию о вещи для вывода"""
    parts = []
    
    if item['color']:
        parts.append(item['color'])
    
    if item['subtype']:
        parts.append(item['subtype'])
    elif item['category']:
        parts.append(item['category'])
    
    if item['material']:
        parts.append(f"({item['material']})")
    
    if item['name']:
        parts.append(f'"{item["name"]}"')
    
    return ' '.join(parts) if parts else f"ID {item['id']}"

def create_similarity_matrix(items: List[Dict]) -> List[List[float]]:
    """Создает матрицу сходства между всеми вещами"""
    n = len(items)
    matrix = [[0.0 for _ in range(n)] for _ in range(n)]
    
    for i in range(n):
        for j in range(n):
            if i == j:
                matrix[i][j] = 1.0  # Сходство с самой собой = 100%
            else:
                similarity = cosine_similarity(items[i]['embedding'], items[j]['embedding'])
                matrix[i][j] = similarity
    
    return matrix

def print_similarity_matrix(items: List[Dict], matrix: List[List[float]]):
    """Выводит матрицу сходства в красивом формате"""
    n = len(items)
    
    print(f"\n{'='*120}")
    print(f"📊 МАТРИЦА СХОДСТВА ({n}x{n})")
    print(f"{'='*120}")
    
    # Заголовки столбцов
    print(f"{'ID':<4} {'Описание':<40}", end="")
    for j in range(n):
        print(f"{'ID'+str(items[j]['id']):<8}", end="")
    print()
    
    print("-" * 120)
    
    # Строки матрицы
    for i in range(n):
        item_desc = format_item_info(items[i])[:38]  # Обрезаем длинные описания
        print(f"{items[i]['id']:<4} {item_desc:<40}", end="")
        
        for j in range(n):
            similarity = matrix[i][j]
            if i == j:
                print(f"{'100%':<8}", end="")  # Диагональ
            else:
                print(f"{similarity:.1%}{'':>2}", end="")
        print()

def analyze_similarities(items: List[Dict], matrix: List[List[float]]):
    """Анализирует результаты сходства"""
    n = len(items)
    
    print(f"\n{'='*120}")
    print(f"🔍 АНАЛИЗ СХОДСТВА")
    print(f"{'='*120}")
    
    # Находим наиболее похожие пары
    max_similarity = 0.0
    max_pair = None
    
    similarities = []
    
    for i in range(n):
        for j in range(i + 1, n):  # Избегаем дублирования и диагонали
            similarity = matrix[i][j]
            similarities.append((i, j, similarity))
            
            if similarity > max_similarity:
                max_similarity = similarity
                max_pair = (i, j)
    
    # Сортируем по убыванию сходства
    similarities.sort(key=lambda x: x[2], reverse=True)
    
    print(f"🥇 НАИБОЛЕЕ ПОХОЖИЕ ПАРЫ:")
    print("-" * 80)
    
    for rank, (i, j, similarity) in enumerate(similarities[:5], 1):  # Топ-5
        item1_desc = format_item_info(items[i])
        item2_desc = format_item_info(items[j])
        
        print(f"{rank}. {similarity:.1%} сходство:")
        print(f"   📦 {items[i]['id']}: {item1_desc}")
        print(f"   📦 {items[j]['id']}: {item2_desc}")
        print()
    
    # Анализ по категориям
    print(f"📂 АНАЛИЗ ПО КАТЕГОРИЯМ:")
    print("-" * 80)
    
    category_pairs = {}
    cross_category_pairs = []
    
    for i, j, similarity in similarities:
        cat1 = items[i]['category']
        cat2 = items[j]['category']
        
        if cat1 == cat2:
            if cat1 not in category_pairs:
                category_pairs[cat1] = []
            category_pairs[cat1].append((i, j, similarity))
        else:
            cross_category_pairs.append((i, j, similarity))
    
    # Показываем лучшие пары внутри категорий
    for category, pairs in category_pairs.items():
        if pairs:
            best_pair = max(pairs, key=lambda x: x[2])
            i, j, similarity = best_pair
            print(f"   {category}: {similarity:.1%} (ID {items[i]['id']} ↔ ID {items[j]['id']})")
    
    # Показываем лучшие межкатегорийные пары
    if cross_category_pairs:
        print(f"\n🔄 МЕЖКАТЕГОРИЙНЫЕ СХОДСТВА:")
        print("-" * 80)
        
        for i, j, similarity in cross_category_pairs[:3]:  # Топ-3
            cat1 = items[i]['category']
            cat2 = items[j]['category']
            print(f"   {similarity:.1%}: {cat1} ↔ {cat2} (ID {items[i]['id']} ↔ ID {items[j]['id']})")

def answer_specific_question(items: List[Dict], matrix: List[List[float]]):
    """Отвечает на конкретный вопрос из примера"""
    
    # Ищем серое пальто, розовое пальто, серое худи
    grey_coat = None
    pink_coat = None
    grey_hoodie = None
    
    for i, item in enumerate(items):
        desc = format_item_info(item).lower()
        
        if 'серое' in desc and ('пальто' in desc or 'coat' in desc):
            grey_coat = (i, item)
        elif 'розовое' in desc and ('пальто' in desc or 'coat' in desc):
            pink_coat = (i, item)
        elif 'серое' in desc and ('худи' in desc or 'hoodie' in desc):
            grey_hoodie = (i, item)
    
    print(f"\n{'='*120}")
    print(f"❓ ОТВЕТ НА ВОПРОС: Что больше похоже?")
    print(f"{'='*120}")
    
    if grey_coat and pink_coat and grey_hoodie:
        grey_coat_idx, grey_coat_item = grey_coat
        pink_coat_idx, pink_coat_item = pink_coat
        grey_hoodie_idx, grey_hoodie_item = grey_hoodie
        
        # Сравниваем розовое пальто с серым пальто и серым худи
        pink_to_grey_coat = matrix[pink_coat_idx][grey_coat_idx]
        pink_to_grey_hoodie = matrix[pink_coat_idx][grey_hoodie_idx]
        
        print(f"🔍 Сравниваем розовое пальто с:")
        print(f"   📦 Серое пальто: {pink_to_grey_coat:.1%} сходство")
        print(f"   📦 Серое худи: {pink_to_grey_hoodie:.1%} сходство")
        print()
        
        if pink_to_grey_coat > pink_to_grey_hoodie:
            diff = pink_to_grey_coat - pink_to_grey_hoodie
            print(f"✅ ОТВЕТ: Розовое пальто больше похоже на серое пальто")
            print(f"   Разница в сходстве: {diff:.1%}")
        elif pink_to_grey_hoodie > pink_to_grey_coat:
            diff = pink_to_grey_hoodie - pink_to_grey_coat
            print(f"✅ ОТВЕТ: Розовое пальто больше похоже на серое худи")
            print(f"   Разница в сходстве: {diff:.1%}")
        else:
            print(f"🤔 ОТВЕТ: Сходство одинаковое ({pink_to_grey_coat:.1%})")
        
        # Дополнительный анализ
        print(f"\n💡 ДОПОЛНИТЕЛЬНЫЙ АНАЛИЗ:")
        print(f"   Это логично, потому что:")
        if pink_to_grey_coat > pink_to_grey_hoodie:
            print(f"   - Оба предмета относятся к категории пальто")
            print(f"   - Форма и силуэт похожи")
            print(f"   - Различается только цвет")
        else:
            print(f"   - Возможно, серое худи имеет похожий силуэт")
            print(f"   - Или цвет играет большую роль в векторном представлении")
    
    else:
        print("❌ Не удалось найти все нужные вещи для ответа на вопрос")
        print("   Найденные вещи:")
        if grey_coat:
            print(f"   ✅ Серое пальто: ID {grey_coat[1]['id']}")
        if pink_coat:
            print(f"   ✅ Розовое пальто: ID {pink_coat[1]['id']}")
        if grey_hoodie:
            print(f"   ✅ Серое худи: ID {grey_hoodie[1]['id']}")

def main():
    print(f"🧪 ТЕСТИРОВАНИЕ СХОДСТВА КОНКРЕТНЫХ ПРИМЕРОВ")
    
    # Подключаемся к БД
    conn = get_db_connection()
    if not conn:
        return
    
    try:
        items = []
        
        # Загружаем вещи по ID или ищем по описанию
        if TEST_ITEMS:
            print(f"📋 Загружаем вещи по ID: {TEST_ITEMS}")
            items = load_items_by_ids(conn, TEST_ITEMS)
        elif SEARCH_BY_DESCRIPTION and SEARCH_TERMS:
            print(f"🔍 Ищем вещи по описанию: {SEARCH_TERMS}")
            items = search_items_by_description(conn, SEARCH_TERMS)
        else:
            print("❌ Не указаны ни ID вещей, ни поисковые термины")
            return
        
        if len(items) < 2:
            print(f"❌ Найдено недостаточно вещей для сравнения: {len(items)}")
            return
        
        print(f"\n✅ Будем сравнивать {len(items)} вещей:")
        for item in items:
            desc = format_item_info(item)
            print(f"   📦 ID {item['id']}: {desc}")
        
        # Создаем матрицу сходства
        print(f"\n🔄 Вычисляем матрицу сходства...")
        matrix = create_similarity_matrix(items)
        
        # Выводим результаты
        print_similarity_matrix(items, matrix)
        analyze_similarities(items, matrix)
        answer_specific_question(items, matrix)
        
    finally:
        conn.close()

if __name__ == "__main__":
    main()