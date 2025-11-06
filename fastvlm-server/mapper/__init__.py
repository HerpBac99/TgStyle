"""
Модуль маппинга классификации одежды

Содержит функции для перевода результатов классификации с английского на русский:
- Цвета (color)
- Подтипы одежды (subtype)
- Материалы (material)
- Стили (style)
"""

from .classification_mappers import (
    map_color_to_russian,
    map_material_to_russian,
    map_style_to_enum
)
from .subtype_mapper import map_subtype_to_russian

__all__ = [
    'map_color_to_russian',
    'map_material_to_russian',
    'map_style_to_enum',
    'map_subtype_to_russian'
]
