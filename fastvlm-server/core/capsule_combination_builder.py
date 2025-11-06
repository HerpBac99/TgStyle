"""
Модуль для алгоритмического построения комбинаций вещей в капсулы
"""
import random
from typing import List, Dict, Set
from collections import defaultdict


class CapsuleCombinationBuilder:
    """Строитель комбинаций вещей для капсул на основе правил стиля"""
    
    # Правила сочетаемости цветов
    COLOR_COMPATIBILITY = {
        'black': ['white', 'gray', 'red', 'blue', 'green', 'yellow', 'pink', 'purple', 'brown', 'beige'],
        'white': ['black', 'gray', 'red', 'blue', 'green', 'yellow', 'pink', 'purple', 'brown', 'beige'],
        'gray': ['black', 'white', 'red', 'blue', 'green', 'yellow', 'pink', 'purple'],
        'blue': ['white', 'black', 'gray', 'beige', 'brown', 'yellow'],
        'red': ['black', 'white', 'gray', 'beige'],
        'green': ['black', 'white', 'gray', 'beige', 'brown'],
        'brown': ['white', 'beige', 'green', 'black'],
        'beige': ['black', 'white', 'brown', 'blue', 'green'],
        'yellow': ['black', 'white', 'gray', 'blue'],
        'pink': ['black', 'white', 'gray'],
        'purple': ['black', 'white', 'gray']
    }
    
    # Стилевая совместимость
    STYLE_COMPATIBILITY = {
        'casual': ['casual', 'streetwear', 'sporty'],
        'formal': ['formal', 'business', 'elegant'],
        'streetwear': ['streetwear', 'casual', 'sporty'],
        'sporty': ['sporty', 'casual', 'streetwear'],
        'elegant': ['elegant', 'formal', 'business'],
        'business': ['business', 'formal', 'elegant']
    }
    
    # Сезонные приоритеты категорий
    SEASON_PRIORITIES = {
        'winter': ['OUTERWEAR', 'INNERWEAR', 'BODYWEAR', 'LEGWEAR', 'FOOTWEAR'],
        'spring': ['BODYWEAR', 'INNERWEAR', 'LEGWEAR', 'OUTERWEAR', 'FOOTWEAR'],
        'summer': ['BODYWEAR', 'LEGWEAR', 'FOOTWEAR', 'INNERWEAR'],
        'autumn': ['INNERWEAR', 'BODYWEAR', 'OUTERWEAR', 'LEGWEAR', 'FOOTWEAR']
    }
    
    def __init__(self, wardrobe_items: List[Dict], current_season: str):
        """
        Инициализация строителя
        
        Args:
            wardrobe_items: Список вещей гардероба
            current_season: Текущий сезон
        """
        self.wardrobe_items = wardrobe_items
        self.current_season = current_season
        
        # Группируем вещи по категориям
        self.items_by_category = defaultdict(list)
        for item in wardrobe_items:
            category = item.get('category', 'UNKNOWN')
            self.items_by_category[category].append(item)
    
    @staticmethod
    def get_season_score(item_season: str, current_season: str) -> float:
        """
        Оценка сезонной уместности (0-1)
        
        Args:
            item_season: Сезон вещи
            current_season: Текущий сезон
        
        Returns:
            Оценка от 0 до 1
        """
        if not item_season:
            return 0.7
        
        item_season_clean = item_season.lower().strip()
        
        if item_season_clean == 'all-season' or item_season_clean == current_season:
            return 1.0
        
        # Переходные сезоны
        transitions = {
            'spring': ['summer', 'winter'],
            'autumn': ['winter', 'summer'],
            'summer': ['spring', 'autumn'],
            'winter': ['autumn', 'spring']
        }
        
        if item_season_clean in transitions.get(current_season, []):
            return 0.6
        
        return 0.3
    
    def calculate_item_priority(self, item: Dict) -> float:
        """
        Вычисляет приоритет вещи для текущего сезона
        
        Args:
            item: Вещь из гардероба
        
        Returns:
            Приоритет от 0 до 3
        """
        usage_count = item.get('usageCount', 0)
        
        # Приоритет по использованию (как в спецификации)
        if 1 <= usage_count <= 3:
            usage_score = 3  # Высокий приоритет
        elif usage_count > 3:
            usage_score = 2  # Средний приоритет
        else:
            usage_score = 1  # Низкий приоритет
        
        # Сезонная уместность
        season_score = self.get_season_score(item.get('season'), self.current_season)
        
        # Итоговый приоритет
        return usage_score * 0.6 + season_score * 0.4
    
    def create_combination(
        self,
        strategy: str = 'balanced',
        used_combinations: List[List[int]] = None
    ) -> List[Dict]:
        """
        Создает комбинацию вещей для капсулы
        
        Args:
            strategy: Стратегия выбора ('balanced', 'popular', 'experimental')
            used_combinations: Список уже использованных комбинаций (ID вещей)
        
        Returns:
            Список вещей для капсулы
        """
        if used_combinations is None:
            used_combinations = []
        
        combination = []
        used_categories = set()
        
        # Сортируем по приоритету категорий для сезона
        category_priority = self.SEASON_PRIORITIES.get(
            self.current_season,
            ['BODYWEAR', 'LEGWEAR', 'FOOTWEAR']
        )
        
        # Добавляем случайность в порядок категорий для разнообразия
        if strategy == 'experimental':
            category_priority = category_priority.copy()
            random.shuffle(category_priority)
        
        max_items = 4 if strategy == 'experimental' else 5  # Экспериментальные капсулы короче
        
        for category in category_priority:
            if category in self.items_by_category and len(self.items_by_category[category]) > 0:
                available_items = [
                    item for item in self.items_by_category[category]
                    if item['id'] not in [c['id'] for c in combination]
                ]
                
                if not available_items:
                    continue
                
                # Выбираем вещь в зависимости от стратегии
                selected = self._select_item_by_strategy(available_items, strategy, combination)
                
                combination.append(selected)
                used_categories.add(category)
                
                # Ограничиваем количество вещей в капсуле
                if len(combination) >= max_items:
                    break
        
        # Если мало вещей, добавляем из других категорий
        if len(combination) < 3:
            combination = self._add_missing_items(combination, used_categories)
        
        # Проверяем уникальность комбинации
        combination = self._ensure_uniqueness(combination, used_combinations)
        
        return combination
    
    def _select_item_by_strategy(
        self,
        available_items: List[Dict],
        strategy: str,
        current_combination: List[Dict]
    ) -> Dict:
        """
        Выбирает вещь в зависимости от стратегии
        
        Args:
            available_items: Доступные вещи для выбора
            strategy: Стратегия выбора
            current_combination: Текущая комбинация вещей
        
        Returns:
            Выбранная вещь
        """
        if strategy == 'popular':
            # Приоритет популярным вещам (usageCount > 3)
            popular_items = [item for item in available_items if item.get('usageCount', 0) > 3]
            if popular_items:
                return random.choice(popular_items)
            else:
                return max(available_items, key=lambda x: x.get('usageCount', 0))
        
        elif strategy == 'experimental':
            # Приоритет новым вещам (usageCount = 0)
            new_items = [item for item in available_items if item.get('usageCount', 0) == 0]
            rarely_used = [item for item in available_items if 1 <= item.get('usageCount', 0) <= 2]
            
            new_items_count = len([c for c in current_combination if c.get('usageCount', 0) == 0])
            
            if new_items and new_items_count < 2:
                return random.choice(new_items)
            elif rarely_used:
                return random.choice(rarely_used)
            else:
                return random.choice(available_items)
        
        else:  # balanced
            # Сбалансированный выбор (приоритет usageCount 1-3)
            balanced_items = [item for item in available_items if 1 <= item.get('usageCount', 0) <= 3]
            if balanced_items:
                return random.choice(balanced_items)
            else:
                priorities = [self.calculate_item_priority(item) for item in available_items]
                max_priority = max(priorities)
                best_items = [
                    item for item, priority in zip(available_items, priorities)
                    if priority >= max_priority * 0.8
                ]
                return random.choice(best_items)
    
    def _add_missing_items(
        self,
        combination: List[Dict],
        used_categories: Set[str]
    ) -> List[Dict]:
        """
        Добавляет недостающие вещи из других категорий
        
        Args:
            combination: Текущая комбинация
            used_categories: Уже использованные категории
        
        Returns:
            Дополненная комбинация
        """
        for category, items in self.items_by_category.items():
            if category not in used_categories:
                available = [
                    item for item in items
                    if item['id'] not in [c['id'] for c in combination]
                ]
                if available:
                    combination.append(random.choice(available))
                    if len(combination) >= 3:
                        break
        
        return combination
    
    def _ensure_uniqueness(
        self,
        combination: List[Dict],
        used_combinations: List[List[int]]
    ) -> List[Dict]:
        """
        Проверяет уникальность комбинации и изменяет при необходимости
        
        Args:
            combination: Текущая комбинация
            used_combinations: Список уже использованных комбинаций
        
        Returns:
            Уникальная комбинация
        """
        combination_ids = set(item['id'] for item in combination)
        
        for used_combo in used_combinations:
            used_ids = set(used_combo)
            # Если совпадает больше 70% вещей, пытаемся изменить
            overlap = len(combination_ids & used_ids) / len(combination_ids | used_ids)
            
            if overlap > 0.7 and len(combination) > 3:
                # Заменяем одну вещь на случайную из той же категории
                item_to_replace = random.choice(combination)
                category = item_to_replace.get('category')
                
                if category in self.items_by_category:
                    alternatives = [
                        item for item in self.items_by_category[category]
                        if item['id'] not in combination_ids
                    ]
                    if alternatives:
                        combination.remove(item_to_replace)
                        combination.append(random.choice(alternatives))
                break
        
        return combination


class CapsuleMetadataGenerator:
    """Генератор метаданных для капсул (названия, описания, рекомендации)"""
    
    # Названия по стратегиям
    NAMES_BY_STRATEGY = {
        'balanced': ['Casual Mix', 'Daily Look', 'Комфорт Стиль'],
        'popular': ['Проверенный', 'Любимый Лук', 'Классика'],
        'experimental': ['Новый Образ', 'Эксперимент', 'Свежий Взгляд']
    }
    
    # Названия сезонов
    SEASON_NAMES = {
        'winter': 'зимний',
        'spring': 'весенний',
        'summer': 'летний',
        'autumn': 'осенний'
    }
    
    @staticmethod
    def generate_name(strategy: str) -> str:
        """
        Генерирует название капсулы
        
        Args:
            strategy: Стратегия создания капсулы
        
        Returns:
            Название капсулы
        """
        names = CapsuleMetadataGenerator.NAMES_BY_STRATEGY.get(
            strategy,
            ['Стильный Образ']
        )
        return random.choice(names)
    
    @staticmethod
    def generate_description(strategy: str, season: str) -> str:
        """
        Генерирует описание капсулы
        
        Args:
            strategy: Стратегия создания капсулы
            season: Текущий сезон
        
        Returns:
            Описание капсулы
        """
        season_name = CapsuleMetadataGenerator.SEASON_NAMES.get(season, '')
        
        strategy_descriptions = {
            'balanced': f'Сбалансированный {season_name} образ',
            'popular': f'Проверенная комбинация для {season_name} сезона',
            'experimental': f'Экспериментальный {season_name} лук'
        }
        
        return strategy_descriptions.get(
            strategy,
            f'Стильный образ для {season_name} сезона'
        )
    
    @staticmethod
    def generate_recommendations(items: List[Dict], season: str) -> str:
        """
        Генерирует рекомендации для капсулы
        
        Args:
            items: Список вещей в капсуле
            season: Текущий сезон
        
        Returns:
            Рекомендации
        """
        recommendations = []
        
        # Проверяем наличие аксессуаров
        has_accessories = any(item.get('category') == 'ACCESSORIES' for item in items)
        if not has_accessories:
            recommendations.append("Добавьте аксессуары для завершения образа")
        
        # Сезонные рекомендации
        if season == 'winter':
            has_outerwear = any(item.get('category') == 'OUTERWEAR' for item in items)
            if not has_outerwear:
                recommendations.append("Рекомендуем добавить верхнюю одежду")
        
        if not recommendations:
            recommendations.append("Отличная комбинация! Образ готов")
        
        return "; ".join(recommendations)
