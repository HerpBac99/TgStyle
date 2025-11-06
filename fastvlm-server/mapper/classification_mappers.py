"""
Модуль для маппинга результатов классификации одежды на русский язык

Содержит функции для перевода:
- Цветов (color)
- Подтипов одежды (subtype)
- Материалов (material)
- Стилей (style)
- Категорий (category)
"""


def map_color_to_russian(color_input: str) -> str:
    """
    Маппинг английского цвета на русский язык
    
    Синхронизировано с Color_prompt.md (52 цвета)

    Args:
        color_input: Цвет на английском из списка промпта (navy, skyblue, multicolor и т.д.)

    Returns:
        Цвет на русском языке или оригинальное значение если не найдено
        
    Examples:
        >>> map_color_to_russian("navy")
        'Темно-синий'
        >>> map_color_to_russian("multicolor")
        'Многоцветный'
    """
    normalized = color_input.lower().strip()

    # Color mapping dictionary (СТРОГО из Color_prompt.md)
    # Список: black, white, gray, silver, charcoal, blue, navy, lightblue, skyblue, 
    # turquoise, cyan, teal, aqua, red, burgundy, maroon, crimson, pink, hotpink, 
    # rose, coral, salmon, green, darkgreen, olive, lime, mint, emerald, yellow, 
    # gold, mustard, lemon, orange, tangerine, peach, brown, tan, beige, khaki, 
    # camel, chocolate, purple, violet, lavender, lilac, magenta, indigo, cream, 
    # ivory, offwhite, multicolor
    color_map = {
        'black': 'Черный',
        'white': 'Белый',
        'gray': 'Серый',
        'silver': 'Серебряный',
        'charcoal': 'Угольный',
        'blue': 'Синий',
        'navy': 'Темно-синий',
        'lightblue': 'Светло-синий',
        'skyblue': 'Небесно-голубой',
        'turquoise': 'Бирюзовый',
        'cyan': 'Голубой',
        'teal': 'Сине-зеленый',
        'aqua': 'Аква',
        'red': 'Красный',
        'burgundy': 'Бургунди',
        'maroon': 'Бордовый',
        'crimson': 'Малиновый',
        'pink': 'Розовый',
        'hotpink': 'Ярко-розовый',
        'rose': 'Розовый',
        'coral': 'Коралловый',
        'salmon': 'Лососевый',
        'green': 'Зеленый',
        'darkgreen': 'Темно-зеленый',
        'olive': 'Оливковый',
        'lime': 'Лаймовый',
        'mint': 'Мятный',
        'emerald': 'Изумрудный',
        'yellow': 'Желтый',
        'gold': 'Золотой',
        'mustard': 'Горчичный',
        'lemon': 'Лимонный',
        'orange': 'Оранжевый',
        'tangerine': 'Мандариновый',
        'peach': 'Персиковый',
        'brown': 'Коричневый',
        'tan': 'Желтовато-коричневый',
        'beige': 'Бежевый',
        'khaki': 'Хаки',
        'camel': 'Верблюжий',
        'chocolate': 'Шоколадный',
        'purple': 'Фиолетовый',
        'violet': 'Фиолетовый',
        'lavender': 'Лавандовый',
        'lilac': 'Сиреневый',
        'magenta': 'Пурпурный',
        'indigo': 'Индиго',
        'cream': 'Кремовый',
        'ivory': 'Слоновая кость',
        'offwhite': 'Молочный',
        'multicolor': 'Многоцветный'
    }

    # Прямой маппинг (все цвета уже определены в промпте)
    return color_map.get(normalized, color_input)


def map_material_to_russian(material_input: str) -> str:
    """
    Маппинг английского материала на русский язык
    
    Синхронизировано с Material_prompt.md (26 материалов)

    Args:
        material_input: Материал на английском из списка промпта (cotton, leather, synthetic и т.д.)

    Returns:
        Материал на русском языке или оригинальное значение если не найдено
        
    Examples:
        >>> map_material_to_russian("cotton")
        'Хлопок'
        >>> map_material_to_russian("synthetic")
        'Синтетика'
    """
    normalized = material_input.lower().strip()

    # Material mapping dictionary (СТРОГО из Material_prompt.md)
    # Список: cotton, polyester, wool, leather, denim, silk, linen, nylon, spandex, 
    # fleece, cashmere, suede, canvas, velvet, satin, chiffon, jersey, tweed, 
    # corduroy, knit, mesh, synthetic, rubber, plastic, metal, fabric
    material_map = {
        'cotton': 'Хлопок',
        'polyester': 'Полиэстер',
        'wool': 'Шерсть',
        'leather': 'Кожа',
        'denim': 'Деним',
        'silk': 'Шелк',
        'linen': 'Лен',
        'nylon': 'Нейлон',
        'spandex': 'Спандекс',
        'fleece': 'Флис',
        'cashmere': 'Кашемир',
        'suede': 'Замша',
        'canvas': 'Холст',
        'velvet': 'Бархат',
        'satin': 'Сатин',
        'chiffon': 'Шифон',
        'jersey': 'Джерси',
        'tweed': 'Твид',
        'corduroy': 'Вельвет',
        'knit': 'Трикотаж',
        'mesh': 'Сетка',
        'synthetic': 'Синтетика',
        'rubber': 'Кожа',
        'plastic': 'Пластик',
        'metal': 'Металл',
        'fabric': 'Ткань'
    }

    # Простые материалы без модификаторов
    return material_map.get(normalized, material_input)


def map_style_to_enum(style_input: str) -> str:
    """
    Маппинг стиля одежды на нормализованный enum (на русском)
    
    Синхронизировано с Style_prompt.md (10 стилей)

    Args:
        style_input: Стиль от FastVLM из списка промпта (casual, sporty, businesscasual и т.д.)

    Returns:
        Нормализованный стиль на русском языке или оригинальное значение с заглавной буквы
        
    Examples:
        >>> map_style_to_enum("casual")
        'Повседневный'
        >>> map_style_to_enum("businesscasual")
        'Деловой повседневный'
    """
    normalized = style_input.lower().strip()

    # Style mapping dictionary (СТРОГО из Style_prompt.md)
    # Список: casual, business, sporty, streetwear, formal, businesscasual, 
    # bohemian, vintage, minimalist, romantic
    style_map = {
        'casual': 'Повседневный',
        'business': 'Деловой',
        'sporty': 'Спортивный',
        'streetwear': 'Уличный',
        'formal': 'Официальный',
        'businesscasual': 'Деловой повседневный',
        'bohemian': 'Бохо',
        'vintage': 'Винтаж',
        'minimalist': 'Минимализм',
        'romantic': 'Романтический'
    }

    # Прямой маппинг (все стили уже определены в промпте)
    return style_map.get(normalized, style_input.capitalize())
