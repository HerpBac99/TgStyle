#!/usr/bin/env python3
"""
Сравнение embedding векторов из тестового скрипта с векторами из базы данных
"""

import os
import sys
import json
import psycopg2
from pathlib import Path
import math

# Настройки подключения к БД (из .env файла проекта)
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

def get_wardrobe_embeddings():
    """Получает все embedding векторы из таблицы wardrobe_items"""
    conn = get_db_connection()
    if not conn:
        return []
    
    try:
        cursor = conn.cursor()
        
        # Получаем все записи с embedding
        query = """
        SELECT id, category, color, material, style, embedding, created_at
        FROM wardrobe_items 
        WHERE embedding IS NOT NULL 
        ORDER BY created_at DESC
        """
        
        cursor.execute(query)
        results = cursor.fetchall()
        
        embeddings = []
        for row in results:
            id, category, color, material, style, embedding, created_at = row
            
            # Парсим embedding из JSON строки
            parsed_embedding = None
            if embedding:
                try:
                    if isinstance(embedding, str):
                        parsed_embedding = json.loads(embedding)
                    else:
                        parsed_embedding = embedding
                except json.JSONDecodeError as e:
                    print(f"⚠️  Ошибка парсинга embedding для записи {id}: {e}")
                    continue
            
            embeddings.append({
                'id': id,
                'category': category,
                'color': color,
                'material': material,
                'style': style,
                'embedding': parsed_embedding,
                'created_at': created_at
            })
        
        print(f"📊 Найдено {len(embeddings)} записей с embedding в БД")
        return embeddings
        
    except Exception as e:
        print(f"❌ Ошибка запроса к БД: {e}")
        return []
    finally:
        conn.close()

def find_latest_test_result():
    """Находит последний результат тестирования"""
    results_dir = Path(__file__).parent / "embedding_results"
    if not results_dir.exists():
        print("❌ Папка embedding_results не найдена")
        return None
    
    # Ищем файлы с app_flow в названии
    app_flow_files = list(results_dir.glob("embedding_app_flow_*.json"))
    if not app_flow_files:
        print("❌ Файлы результатов тестирования не найдены")
        return None
    
    # Берем самый новый файл
    latest_file = max(app_flow_files, key=lambda f: f.stat().st_mtime)
    
    try:
        with open(latest_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        print(f"📁 Загружен результат теста: {latest_file.name}")
        return data
    except Exception as e:
        print(f"❌ Ошибка чтения файла {latest_file}: {e}")
        return None

def cosine_similarity(vec1, vec2):
    """Вычисляет косинусное сходство между двумя векторами"""
    if len(vec1) != len(vec2):
        return 0
    
    dot_product = sum(a * b for a, b in zip(vec1, vec2))
    norm1 = math.sqrt(sum(a * a for a in vec1))
    norm2 = math.sqrt(sum(b * b for b in vec2))
    
    if norm1 == 0 or norm2 == 0:
        return 0
    
    return dot_product / (norm1 * norm2)

def compare_embeddings(test_embedding, db_embedding, db_info):
    """Сравнивает embedding из теста с embedding из БД"""
    if not test_embedding or not db_embedding:
        return False, 0, 0, 0
    
    if len(test_embedding) != len(db_embedding):
        return False, 0, 0, 0
    
    # Вычисляем различия
    differences = [abs(a - b) for a, b in zip(test_embedding, db_embedding)]
    max_diff = max(differences)
    avg_diff = sum(differences) / len(differences)
    
    # Косинусное сходство
    cosine_sim = cosine_similarity(test_embedding, db_embedding)
    
    print(f"\n🔍 СРАВНЕНИЕ С ЗАПИСЬЮ БД #{db_info['id']}:")
    print(f"📊 Категория: {db_info['category']}")
    print(f"📊 Цвет: {db_info['color']}")
    print(f"📊 Материал: {db_info['material']}")
    print(f"📊 Стиль: {db_info['style']}")
    print(f"📊 Создано: {db_info['created_at']}")
    print(f"📈 Размерность: {len(db_embedding)}")
    print(f"📈 Максимальная разность: {max_diff:.6f}")
    print(f"📈 Средняя разность: {avg_diff:.6f}")
    print(f"📈 Косинусное сходство: {cosine_sim:.6f}")
    
    # Проверяем идентичность
    is_identical = max_diff < 1e-10
    is_very_similar = cosine_sim > 0.999
    is_similar = cosine_sim > 0.95
    
    if is_identical:
        print("✅ ВЕКТОРЫ ИДЕНТИЧНЫ!")
        return True, max_diff, avg_diff, cosine_sim
    elif is_very_similar:
        print("✅ ВЕКТОРЫ ОЧЕНЬ ПОХОЖИ (косинусное сходство > 0.999)")
        return True, max_diff, avg_diff, cosine_sim
    elif is_similar:
        print("🟡 ВЕКТОРЫ ПОХОЖИ (косинусное сходство > 0.95)")
        return False, max_diff, avg_diff, cosine_sim
    else:
        print("❌ ВЕКТОРЫ РАЗЛИЧАЮТСЯ")
        return False, max_diff, avg_diff, cosine_sim

def main():
    print("🔍 СРАВНЕНИЕ EMBEDDING ВЕКТОРОВ: ТЕСТ vs БАЗА ДАННЫХ")
    print("=" * 80)
    
    # Загружаем результат последнего теста
    test_result = find_latest_test_result()
    if not test_result:
        print("❌ Не удалось загрузить результат теста")
        return
    
    test_embedding = test_result.get('embedding', {}).get('vector')
    if not test_embedding:
        print("❌ В результате теста нет embedding вектора")
        return
    
    print(f"✅ Тестовый вектор загружен: размерность {len(test_embedding)}")
    
    # Получаем embedding из БД
    db_embeddings = get_wardrobe_embeddings()
    if not db_embeddings:
        print("❌ Не удалось получить embedding из БД")
        return
    
    # Ищем наиболее похожие векторы
    best_match = None
    best_similarity = 0
    
    print(f"\n🔍 Сравниваем с {len(db_embeddings)} записями из БД:")
    
    for i, db_item in enumerate(db_embeddings):
        db_embedding = db_item['embedding']
        
        print(f"\n📋 Запись {i+1}/{len(db_embeddings)}:")
        print(f"   ID: {db_item['id']}")
        print(f"   Тип embedding: {type(db_embedding)}")
        print(f"   Размер embedding: {len(db_embedding) if db_embedding else 'None'}")
        
        is_match, max_diff, avg_diff, cosine_sim = compare_embeddings(
            test_embedding, db_embedding, db_item
        )
        
        # Отслеживаем лучшее совпадение
        if cosine_sim > best_similarity:
            best_similarity = cosine_sim
            best_match = db_item
        
        print("-" * 40)
    
    # Выводим итоги
    print(f"\n📊 ИТОГИ СРАВНЕНИЯ:")
    print("=" * 80)
    
    if best_match:
        print(f"🏆 ЛУЧШЕЕ СОВПАДЕНИЕ: Запись #{best_match['id']}")
        print(f"📈 Косинусное сходство: {best_similarity:.6f}")
        
        if best_similarity > 0.999:
            print("🎉 ОТЛИЧНОЕ СОВПАДЕНИЕ! Векторы практически идентичны")
        elif best_similarity > 0.95:
            print("✅ ХОРОШЕЕ СОВПАДЕНИЕ! Векторы очень похожи")
        elif best_similarity > 0.8:
            print("🟡 СРЕДНЕЕ СОВПАДЕНИЕ. Векторы частично похожи")
        else:
            print("❌ СЛАБОЕ СОВПАДЕНИЕ. Векторы сильно различаются")
    else:
        print("❌ Совпадений не найдено")
    
    print("\n" + "=" * 80)

if __name__ == "__main__":
    main()