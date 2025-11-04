#!/usr/bin/env python3
"""
Простой поиск совпадений между гардеробом пользователя и стильными образами
Находит вещи по векторному сходству с учетом категории и цвета
"""

import json
import math
import psycopg2
from typing import List, Dict, Optional

# ========================================
# НАСТРОЙКИ СКРИПТА
# ========================================

# ID пользователя Telegram для анализа
USER_TELEGRAM_ID = 251053908

# Порог векторного сходства для якорных вещей
SIMILARITY_THRESHOLD = 0.85  # 85% сходство

# Порог для обязательных вещей в наборах
SIMILARITY_THRESHOLD_MANDATORY = 0.75  # 75% сходство для mandatory вещей

# Порог для опциональных вещей в наборах
SIMILARITY_THRESHOLD_OPTIONAL = 0.50  # 50% сходство для опциональных вещей

# Группы совместимых цветов
COLOR_GROUPS = {
    'neutral': ['белый', 'белоснежный', 'кремовый', 'бежевый', 'слоновая кость', 'молочный'],
    'gray_brown': ['серый', 'темно-серый', 'светло-серый', 'угольный', 'графитовый', 'пепельный', 
                   'коричневый', 'темно-коричневый', 'светло-коричневый', 'шоколадный', 'каштановый', 'бежево-коричневый'],  # Объединили серый и коричневый
    'black': ['черный', 'черный матовый', 'черный глянцевый', 'антрацит'],
    'blue': ['синий', 'темно-синий', 'светло-синий', 'голубой', 'небесно-голубой', 'индиго', 'navy'],
    'red': ['красный', 'темно-красный', 'бордовый', 'вишневый', 'алый', 'малиновый'],
    'pink': ['розовый', 'светло-розовый', 'темно-розовый', 'пудровый', 'фуксия'],
    'green': ['зеленый', 'темно-зеленый', 'светло-зеленый', 'оливковый', 'хаки', 'изумрудный'],
    'yellow': ['желтый', 'светло-желтый', 'лимонный', 'золотистый', 'горчичный'],
    'orange': ['оранжевый', 'светло-оранжевый', 'темно-оранжевый', 'персиковый', 'коралловый'],
    'purple': ['фиолетовый', 'сиреневый', 'лиловый', 'пурпурный', 'баклажановый'],
}

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

def normalize_color(color: Optional[str]) -> str:
    """Нормализует цвет для сравнения"""
    if not color:
        return ""
    return color.lower().strip()

def get_color_group(color: str) -> Optional[str]:
    """Определяет группу цвета"""
    normalized = normalize_color(color)
    if not normalized:
        return None
    
    for group_name, colors in COLOR_GROUPS.items():
        if normalized in colors:
            return group_name
    
    return None

def colors_compatible(color1: str, color2: str) -> bool:
    """
    Проверяет совместимость двух цветов
    Возвращает True если:
    1. Цвета точно совпадают
    2. Цвета входят в одну группу
    """
    norm1 = normalize_color(color1)
    norm2 = normalize_color(color2)
    
    # Точное совпадение
    if norm1 == norm2:
        return True
    
    # Проверяем группы
    group1 = get_color_group(color1)
    group2 = get_color_group(color2)
    
    if group1 and group2 and group1 == group2:
        return True
    
    return False

def get_user_gender(conn, telegram_id: int) -> str:
    """Получает пол пользователя из таблицы users"""
    try:
        cursor = conn.cursor()
        
        query = '''
        SELECT gender FROM users 
        WHERE "telegramId" = %s
        '''
        
        cursor.execute(query, (telegram_id,))
        result = cursor.fetchone()
        
        if result and result[0]:
            gender = result[0].lower()
            print(f"👤 Пол пользователя: {gender}")
            return gender
        
        print(f"⚠️  Пол пользователя не указан, используем 'unisex'")
        return 'unisex'
        
    except Exception as e:
        print(f"❌ Ошибка загрузки пола пользователя: {e}")
        return 'unisex'

def load_user_wardrobe(conn, telegram_id: int) -> List[Dict]:
    """Загружает все вещи пользователя из гардероба с embedding"""
    try:
        cursor = conn.cursor()
        
        query = """
        SELECT id, category, color, subtype, image_path, embedding
        FROM wardrobe_items 
        WHERE telegram_id = %s AND embedding IS NOT NULL
        ORDER BY created_at DESC
        """
        
        cursor.execute(query, (telegram_id,))
        results = cursor.fetchall()
        
        wardrobe_items = []
        for row in results:
            id, category, color, subtype, image_path, embedding = row
            
            # Парсим embedding из JSON
            embedding_vector = json.loads(embedding) if embedding else []
            
            # Добавляем префикс к пути
            full_path = f"server\\uploads\\{image_path}" if image_path else image_path
            
            wardrobe_items.append({
                'id': id,
                'category': category,
                'color': normalize_color(color),
                'subtype': subtype,
                'image_path': full_path,
                'embedding': embedding_vector
            })
        
        print(f"📦 Загружено {len(wardrobe_items)} вещей из гардероба пользователя {telegram_id}")
        return wardrobe_items
        
    except Exception as e:
        print(f"❌ Ошибка загрузки гардероба: {e}")
        return []

def load_style_outfits(conn, user_gender: str = None) -> List[Dict]:
    """
    Загружает все образы из StyleOutfit с embedding
    Фильтрует по полу пользователя (male/female/unisex)
    """
    try:
        cursor = conn.cursor()
        
        # Фильтруем по полу: показываем образы для пола пользователя + unisex
        if user_gender and user_gender in ['male', 'female']:
            query = """
            SELECT id, key_id, name, category, color, subtype, image_path, embedding, 
                   gender, style, season, description
            FROM style_outfits
            WHERE embedding IS NOT NULL 
              AND (gender = %s OR gender = 'unisex')
            ORDER BY id
            """
            cursor.execute(query, (user_gender,))
        else:
            # Если пол не указан - показываем все
            query = """
            SELECT id, key_id, name, category, color, subtype, image_path, embedding, 
                   gender, style, season, description
            FROM style_outfits
            WHERE embedding IS NOT NULL
            ORDER BY id
            """
            cursor.execute(query)
        
        results = cursor.fetchall()
        
        style_outfits = []
        for row in results:
            id, key_id, name, category, color, subtype, image_path, embedding, gender, style, season, description = row
            
            # Парсим embedding из JSON
            embedding_vector = json.loads(embedding) if embedding else []
            
            style_outfits.append({
                'id': id,
                'key_id': key_id,
                'name': name,
                'category': category,
                'color': normalize_color(color),
                'subtype': subtype,
                'image_path': image_path,
                'embedding': embedding_vector,
                'gender': gender,
                'style': style,
                'season': season,
                'description': description
            })
        
        print(f"🎨 Загружено {len(style_outfits)} образов из StyleOutfit")
        return style_outfits
        
    except Exception as e:
        print(f"❌ Ошибка загрузки StyleOutfit: {e}")
        return []

def load_outfit_items_by_key(conn, key_id: str) -> Dict[str, List[Dict]]:
    """
    Загружает все вещи из StyleOutfitItem для конкретного keyId
    Группирует по setId
    """
    try:
        cursor = conn.cursor()
        
        query = """
        SELECT id, set_id, category, color, subtype, image_path, embedding, mandatory
        FROM style_outfit_items
        WHERE key_id = %s AND embedding IS NOT NULL
        ORDER BY set_id, mandatory DESC
        """
        
        cursor.execute(query, (key_id,))
        results = cursor.fetchall()
        
        # Группируем по setId
        sets = {}
        for row in results:
            id, set_id, category, color, subtype, image_path, embedding, mandatory = row
            
            embedding_vector = json.loads(embedding) if embedding else []
            
            item = {
                'id': id,
                'set_id': set_id,
                'category': category,
                'color': normalize_color(color),
                'subtype': subtype,
                'image_path': image_path,
                'embedding': embedding_vector,
                'mandatory': mandatory
            }
            
            if set_id not in sets:
                sets[set_id] = []
            sets[set_id].append(item)
        
        return sets
        
    except Exception as e:
        print(f"❌ Ошибка загрузки StyleOutfitItem для keyId={key_id}: {e}")
        return {}

def find_set_matches(set_items: List[Dict], wardrobe_items: List[Dict]) -> Dict:
    """
    Ищет совпадения вещей набора с гардеробом (обязательные + опциональные)
    Возвращает словарь с обязательными и опциональными совпадениями
    
    ВАЖНО: 
    - Одна вещь из гардероба может использоваться в РАЗНЫХ сетах
    - Но ВНУТРИ ОДНОГО СЕТА одна вещь не может использоваться дважды
    """
    # Разделяем на обязательные и опциональные
    mandatory_items = [item for item in set_items if item['mandatory']]
    optional_items = [item for item in set_items if not item['mandatory']]
    
    if not mandatory_items:
        return {'mandatory': [], 'optional': []}
    
    mandatory_matches = []
    optional_matches = []
    used_wardrobe_ids = set()  # Отслеживаем использованные вещи ВНУТРИ ЭТОГО СЕТА
    
    # Сначала ищем обязательные вещи
    for set_item in mandatory_items:
        # Фильтруем по категории, цветовой группе И исключаем уже использованные
        candidates = [
            w for w in wardrobe_items
            if w['category'] == set_item['category']
            and colors_compatible(w['color'], set_item['color'])
            and w['embedding']
            and w['id'] not in used_wardrobe_ids
        ]
        
        # Ищем лучшее совпадение
        best_match = None
        best_similarity = 0.0
        
        for wardrobe_item in candidates:
            similarity = cosine_similarity(set_item['embedding'], wardrobe_item['embedding'])
            
            if similarity >= SIMILARITY_THRESHOLD_MANDATORY and similarity > best_similarity:
                best_similarity = similarity
                best_match = wardrobe_item
        
        if best_match:
            exact_color = normalize_color(set_item['color']) == normalize_color(best_match['color'])
            
            mandatory_matches.append({
                'set_item': set_item,
                'wardrobe_item': best_match,
                'similarity': best_similarity,
                'exact_color': exact_color,
                'mandatory': True
            })
            
            used_wardrobe_ids.add(best_match['id'])
    
    # Теперь ищем опциональные вещи (только если все обязательные найдены)
    if len(mandatory_matches) == len(mandatory_items):
        for set_item in optional_items:
            # Для опциональных вещей НЕ фильтруем по цвету - можно любой цвет!
            candidates = [
                w for w in wardrobe_items
                if w['category'] == set_item['category']
                and w['embedding']
                and w['id'] not in used_wardrobe_ids
            ]
            
            best_match = None
            best_similarity = 0.0
            
            for wardrobe_item in candidates:
                similarity = cosine_similarity(set_item['embedding'], wardrobe_item['embedding'])
                
                if similarity >= SIMILARITY_THRESHOLD_OPTIONAL and similarity > best_similarity:
                    best_similarity = similarity
                    best_match = wardrobe_item
            
            if best_match:
                exact_color = normalize_color(set_item['color']) == normalize_color(best_match['color'])
                
                optional_matches.append({
                    'set_item': set_item,
                    'wardrobe_item': best_match,
                    'similarity': best_similarity,
                    'exact_color': exact_color,
                    'mandatory': False
                })
                
                used_wardrobe_ids.add(best_match['id'])
    
    return {
        'mandatory': mandatory_matches,
        'optional': optional_matches
    }

def find_matches_for_wardrobe_item(wardrobe_item: Dict, style_items: List[Dict], top_n: int = 5, use_color_filter: bool = True) -> List[Dict]:
    """
    Находит топ-N похожих вещей из StyleOutfit для одной вещи из гардероба
    Критерии: 
    1. category совпадает
    2. color совместим (если use_color_filter=True) - точное совпадение или одна цветовая группа
    3. векторное сходство (сортируем по убыванию)
    """
    if not wardrobe_item['embedding']:
        return []
    
    # Фильтруем по категории
    candidates = [
        item for item in style_items 
        if item['category'] == wardrobe_item['category'] 
        and item['embedding']
    ]
    
    # Дополнительно фильтруем по цвету (если включено)
    if use_color_filter:
        candidates = [
            item for item in candidates
            if colors_compatible(wardrobe_item['color'], item['color'])
        ]
    
    # Вычисляем сходство для всех кандидатов
    similarities = []
    for style_item in candidates:
        similarity = cosine_similarity(wardrobe_item['embedding'], style_item['embedding'])
        
        # Фильтруем по порогу сходства
        if similarity < SIMILARITY_THRESHOLD:
            continue
        
        # Определяем совместимость цвета
        exact_color_match = normalize_color(wardrobe_item['color']) == normalize_color(style_item['color'])
        color_group_match = get_color_group(wardrobe_item['color']) == get_color_group(style_item['color'])
        
        similarities.append({
            'style_item': style_item,
            'similarity': similarity,
            'exact_color_match': exact_color_match,
            'color_group_match': color_group_match
        })
    
    # Сортируем по убыванию сходства и берем топ-N
    similarities.sort(key=lambda x: x['similarity'], reverse=True)
    return similarities[:top_n]

def main():
    # Подключаемся к БД
    conn = get_db_connection()
    if not conn:
        return
    
    try:
        # Загружаем пол пользователя
        user_gender = get_user_gender(conn, USER_TELEGRAM_ID)
        
        # Загружаем данные
        wardrobe_items = load_user_wardrobe(conn, USER_TELEGRAM_ID)
        style_outfits = load_style_outfits(conn, user_gender)
        
        if not wardrobe_items:
            print("❌ Гардероб пользователя пуст или не содержит embedding векторов")
            return
        
        if not style_outfits:
            print(f"❌ StyleOutfit пуст или не содержит образов для пола '{user_gender}'")
            return
        
        # Собираем все совпадения якорных вещей
        anchor_matches = []
        for wardrobe_item in wardrobe_items:
            matches = find_matches_for_wardrobe_item(wardrobe_item, style_outfits, top_n=100)
            for match in matches:
                anchor_matches.append({
                    'wardrobe_item': wardrobe_item,
                    'outfit': match['style_item'],
                    'similarity': match['similarity'],
                    'exact_color': match['exact_color_match'],
                    'color_group': match['color_group_match']
                })
        
        # Сортируем по проценту сходства
        anchor_matches.sort(key=lambda x: x['similarity'], reverse=True)
        
        if not anchor_matches:
            print(f"\n❌ Якорных совпадений не найдено")
            print(f"💡 Попробуйте снизить порог сходства (сейчас {SIMILARITY_THRESHOLD:.0%})")
            return
        
        # Группируем по keyId и оставляем только лучшее совпадение для каждого keyId
        best_matches_by_key = {}
        for match in anchor_matches:
            key_id = match['outfit']['key_id']
            
            # Если для этого keyId еще нет совпадения или текущее лучше
            if key_id not in best_matches_by_key or match['similarity'] > best_matches_by_key[key_id]['similarity']:
                best_matches_by_key[key_id] = match
        
        # Преобразуем в список и сортируем по убыванию сходства
        best_anchor_matches = list(best_matches_by_key.values())
        best_anchor_matches.sort(key=lambda x: x['similarity'], reverse=True)
        
        # Выводим якорные совпадения (только лучшие для каждого keyId)
        print(f"\n📊 ЯКОРНЫЕ СОВПАДЕНИЯ (лучшее для каждого образа):")
        print("=" * 120)
        
        for idx, match in enumerate(best_anchor_matches, 1):
            wardrobe = match['wardrobe_item']
            outfit = match['outfit']
            sim = match['similarity']
            exact_color = match['exact_color']
            color_group_match = match['color_group']
            
            # Определяем тип совпадения цвета
            if exact_color:
                color_status = "🎯 Точное"
            elif color_group_match:
                color_status = "🔵 Группа"
            else:
                color_status = "⚪ Разные"
            
            print(f"{idx}. {sim:.1%} | Wardrobe ID: {wardrobe['id']} → Outfit ID: {outfit['id']} (KeyID: {outfit['key_id']}) | {color_status}")
            print(f"   Образ:    {outfit['image_path']}")
            print(f"   Гардероб: {wardrobe['image_path']}")
        
        # ШАГ 2: Собираем уникальные пары (keyId, setId)
        # Собираем уникальные keyId из лучших якорных совпадений
        unique_keys = set()
        for anchor_match in best_anchor_matches:
            unique_keys.add(anchor_match['outfit']['key_id'])
        
        print(f"Найдено {len(unique_keys)} уникальных образов (keyId)")
        
        # Для каждого уникального keyId загружаем наборы
        all_sets = {}
        for key_id in unique_keys:
            sets = load_outfit_items_by_key(conn, key_id)
            if sets:
                all_sets[key_id] = sets
        
        # Теперь для каждого набора ищем совпадения
        # Группируем по keyId и выбираем лучший набор для каждого образа
        best_outfits_by_key = {}
        
        for key_id, sets in all_sets.items():
            best_set_for_key = None
            best_match_percentage = 0
            
            for set_id, set_items in sets.items():
                mandatory_items = [item for item in set_items if item['mandatory']]
                mandatory_count = len(mandatory_items)
                
                # Ищем совпадения вещей с гардеробом
                matches_result = find_set_matches(set_items, wardrobe_items)
                mandatory_matches = matches_result['mandatory']
                optional_matches = matches_result['optional']
                
                matched_count = len(mandatory_matches)
                
                # КРИТИЧЕСКОЕ УСЛОВИЕ: ВСЕ mandatory вещи должны совпасть
                if matched_count == mandatory_count and mandatory_count > 0:
                    match_percentage = 100.0  # Все обязательные вещи совпали
                    
                    # Если это лучший набор для данного keyId
                    if match_percentage > best_match_percentage or best_set_for_key is None:
                        # Находим лучшее якорное совпадение для этого keyId
                        best_anchor = None
                        for anchor_match in best_anchor_matches:
                            if anchor_match['outfit']['key_id'] == key_id:
                                best_anchor = anchor_match
                                break
                        
                        best_set_for_key = {
                            'key_id': key_id,
                            'anchor_match': best_anchor,
                            'set_id': set_id,
                            'mandatory_matches': mandatory_matches,
                            'optional_matches': optional_matches,
                            'mandatory_count': mandatory_count,
                            'matched_count': matched_count,
                            'match_percentage': match_percentage
                        }
                        best_match_percentage = match_percentage
            
            # Добавляем лучший набор для этого keyId (если найден)
            if best_set_for_key:
                best_outfits_by_key[key_id] = best_set_for_key
        
        # Преобразуем в список
        complete_outfits = list(best_outfits_by_key.values())
        
        # Сортируем по проценту совпадения и якорному сходству
        complete_outfits.sort(key=lambda x: (x['match_percentage'], x['anchor_match']['similarity'] if x['anchor_match'] else 0), reverse=True)
        
        # Выводим полные образы
        print(f"\n{'='*120}")
        print(f"\n🎉 НАЙДЕНО {len(complete_outfits)} ПОЛНЫХ ОБРАЗОВ:")
        print("=" * 120)
        
        if complete_outfits:
            for idx, outfit_data in enumerate(complete_outfits, 1):
                anchor = outfit_data['anchor_match']
                set_id = outfit_data['set_id']
                mandatory_matches = outfit_data['mandatory_matches']
                optional_matches = outfit_data['optional_matches']
                match_pct = outfit_data['match_percentage']
                
                print(f"\n{idx}. ОБРАЗ {anchor['outfit']['id']} | Набор: {set_id} | Совпадение: {match_pct:.0f}%")
                print(f"   Якорная вещь: Wardrobe ID {anchor['wardrobe_item']['id']} ({anchor['similarity']:.1%})")
                
                # Выводим обязательные вещи
                print(f"\n   ОБЯЗАТЕЛЬНЫЕ ВЕЩИ:")
                for match in mandatory_matches:
                    set_item = match['set_item']
                    wardrobe = match['wardrobe_item']
                    sim = match['similarity']
                    exact = match['exact_color']
                    
                    color_icon = "🎯" if exact else "🔵"
                    
                    print(f"   {color_icon} {sim:.1%} | {set_item['category']:12} | Wardrobe ID: {wardrobe['id']}")
                    print(f"      Набор:    {set_item['image_path']}")
                    print(f"      Гардероб: {wardrobe['image_path']}")
                
                # Выводим опциональные вещи если есть
                if optional_matches:
                    print(f"\n   ОПЦИОНАЛЬНЫЕ ВЕЩИ:")
                    for match in optional_matches:
                        set_item = match['set_item']
                        wardrobe = match['wardrobe_item']
                        sim = match['similarity']
                        exact = match['exact_color']
                        
                        color_icon = "🎯" if exact else "🔵"
                        
                        print(f"   {color_icon} {sim:.1%} | {set_item['category']:12} | Wardrobe ID: {wardrobe['id']}")
                        print(f"      Набор:    {set_item['image_path']}")
                        print(f"      Гардероб: {wardrobe['image_path']}")
        else:
            print(f"\n❌ Полных образов не найдено")
        
        print(f"\n{'='*120}")
        print(f"\n✅ АНАЛИЗ ЗАВЕРШЕН")
        
    finally:
        conn.close()

if __name__ == "__main__":
    main()