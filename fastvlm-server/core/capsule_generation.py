"""
Сервис генерации капсул через Gemini API и алгоритмический подход
"""
import json
import time
from typing import List, Dict, Any, Optional
from google import genai
from google.genai import types

from .capsule_combination_builder import CapsuleCombinationBuilder, CapsuleMetadataGenerator


class CapsuleGenerationService:
    """Сервис для генерации капсул из вещей гардероба"""
    
    def __init__(self, gemini_client: Optional[genai.Client], config, logger):
        """
        Инициализация сервиса
        
        Args:
            gemini_client: Клиент Gemini API (может быть None)
            config: Конфигурация приложения
            logger: Logger для логирования
        """
        self.gemini_client = gemini_client
        self.config = config
        self.logger = logger
    
    def build_capsule_generation_prompt(
        self,
        wardrobe_items: List[Dict],
        current_season: str,
        current_month: str,
        existing_capsules: List[Dict]
    ) -> str:
        """
        Строит промпт для Gemini с полными данными вещей (9 полей) и учетом сезона
        
        Args:
            wardrobe_items: Список вещей с полной классификацией (9 полей + usageCount)
            current_season: Текущий сезон (winter, spring, summer, autumn)
            current_month: Текущий месяц на русском
            existing_capsules: Существующие капсулы для избежания дубликатов
        
        Returns:
            Промпт для Gemini API
        """
        # Формируем JSON с полной классификацией каждой вещи
        items_data = []
        for item in wardrobe_items:
            items_data.append({
                'id': item['id'],
                'category': item['category'],
                'subtype': item['subtype'],
                'color': item['color'],
                'material': item['material'],
                'fit': item['fit'],
                'style': item['style'],
                'season': item['season'],
                'pattern': item['pattern'],
                'description': item['description'],
                'usageCount': item.get('usageCount', 0)
            })
        
        # Инструкции по многослойности в зависимости от сезона
        layering_instructions = {
            'winter': 'Зима: используй многослойность - футболки/рубашки как базовый слой, свитера/кофты как средний слой, куртки/пальто как верхний слой.',
            'spring': 'Весна: переходный сезон - футболки/рубашки как базовый слой, свитера/кофты как средний слой или верхний в прохладную погоду, легкие куртки.',
            'summer': 'Лето: футболки/рубашки как основная одежда или базовый слой, свитера/кофты для прохладных вечеров как верхний слой, куртки/пальто не используй.',
            'autumn': 'Осень: переходный сезон - футболки/рубашки как базовый слой, свитера/кофты как средний слой, куртки как верхний слой.'
        }
        
        prompt = f"""Ты профессиональный AI-стилист. Создай 3 стильных образа из вещей гардероба.

ТЕКУЩИЙ СЕЗОН: {current_season} ({current_month})
{layering_instructions.get(current_season, '')}

СТРАТЕГИЯ ПРИОРИТИЗАЦИИ:
- Приоритизируй вещи с usageCount 1-3 (одобрены пользователем, но используются редко)
- Создай 3 РАЗНЫХ подхода:
  * Капсула 1: Микс редко используемых (usageCount 1-2) + популярных (usageCount 3+)
  * Капсула 2: Больше популярных вещей (проверенные комбинации)
  * Капсула 3: Экспериментальная (можно включить 1-2 новые вещи с usageCount = 0)

Вещи гардероба (с полной классификацией):
{json.dumps(items_data, ensure_ascii=False, indent=2)}

Существующие капсулы (избегать похожих >80%):
{json.dumps(existing_capsules, ensure_ascii=False)}

Требования:
1. Создай ровно 3 разных комбинации согласно стратегии выше
2. Каждая комбинация должна отличаться минимум на 30%
3. Учитывай МНОГОСЛОЙНОСТЬ и текущий сезон (НЕ фильтруй жестко по полю season)
4. Учитывай ВСЕ 9 полей: цвет, стиль, материал, сезон, паттерн, fit, category, subtype, description
5. Для каждого образа дай:
   - Название (максимум 3 слова на русском)
   - Описание образа (1-2 предложения)
   - Обоснование выбора комбинации (почему эти вещи сочетаются с учетом сезона и многослойности)
   - Рекомендации по улучшению

Формат ответа: JSON
{{
  "capsules": [
    {{
      "name": "Casual Denim",
      "description": "Повседневный образ для {current_season}",
      "reasoning": "Синяя джинсовая куртка (верхний слой) хорошо сочетается с белой футболкой (базовый слой)",
      "recommendations": "Добавьте аксессуары для завершения образа",
      "itemIds": [1, 5, 12, 20]
    }}
  ]
}}
"""
        return prompt
    
    def parse_gemini_capsule_response(self, response_text: str) -> Optional[List[Dict]]:
        """
        Парсит JSON ответ от Gemini
        
        Args:
            response_text: Текстовый ответ от Gemini (должен быть JSON)
        
        Returns:
            Список капсул или None при ошибке
        """
        try:
            # Парсим JSON
            data = json.loads(response_text)
            
            # Проверяем структуру
            if 'capsules' not in data:
                self.logger.error("Ответ Gemini не содержит поле 'capsules'")
                return None
            
            capsules = data['capsules']
            
            # Валидируем каждую капсулу
            for capsule in capsules:
                required_fields = ['name', 'description', 'reasoning', 'recommendations', 'itemIds']
                for field in required_fields:
                    if field not in capsule:
                        self.logger.error(f"Капсула не содержит обязательное поле '{field}'")
                        return None
                
                # Проверяем что itemIds - это список
                if not isinstance(capsule['itemIds'], list):
                    self.logger.error("itemIds должен быть списком")
                    return None
            
            return capsules
        
        except json.JSONDecodeError as e:
            self.logger.error(f"Ошибка парсинга JSON от Gemini: {e}")
            self.logger.error(f"Ответ: {response_text}")
            return None
        except Exception as e:
            self.logger.error(f"Ошибка обработки ответа Gemini: {e}")
            return None
    
    def create_capsules_with_gemini(self, prompt: str) -> List[Dict]:
        """
        Вызывает Gemini API для создания 3 капсул
        
        Args:
            prompt: Промпт для генерации капсул
        
        Returns:
            Список капсул
            
        Raises:
            Exception: При ошибке вызова API или парсинга ответа
        """
        if not self.gemini_client:
            raise Exception("Gemini клиент не инициализирован")
        
        try:
            self.logger.info("Отправка запроса в Gemini для генерации капсул")
            
            response = self.gemini_client.models.generate_content(
                model=self.config.STYLIST_GEMINI_MODEL,
                contents=[{"parts": [{"text": prompt}]}],
                config=types.GenerateContentConfig(
                    temperature=self.config.STYLIST_GEMINI_TEMPERATURE,
                    max_output_tokens=self.config.STYLIST_GEMINI_MAX_TOKENS,
                    response_mime_type="application/json"
                )
            )
            
            if not response or not hasattr(response, 'text') or not response.text:
                raise Exception("Gemini API вернул пустой ответ")
            
            self.logger.info(f"Получен ответ от Gemini: {len(response.text)} символов")
            
            # Парсим ответ
            capsules = self.parse_gemini_capsule_response(response.text)
            
            if capsules is None:
                raise Exception("Не удалось распарсить ответ Gemini")
            
            self.logger.info(f"Успешно сгенерировано {len(capsules)} капсул")
            return capsules
        
        except Exception as e:
            self.logger.error(f"Ошибка вызова Gemini API: {e}")
            raise
    
    def generate_capsules_gemini(
        self,
        wardrobe_items: List[Dict],
        current_season: str,
        current_month: str,
        existing_capsules: List[Dict]
    ) -> Dict[str, Any]:
        """
        Полный pipeline генерации капсул через Gemini
        
        Args:
            wardrobe_items: Список вещей гардероба
            current_season: Текущий сезон
            current_month: Текущий месяц
            existing_capsules: Существующие капсулы
        
        Returns:
            Результат с капсулами и метаданными
        """
        start_time = time.time()
        
        try:
            # Строим промпт
            prompt = self.build_capsule_generation_prompt(
                wardrobe_items,
                current_season,
                current_month,
                existing_capsules
            )
            
            # Генерируем капсулы
            capsules = self.create_capsules_with_gemini(prompt)
            
            processing_time = time.time() - start_time
            
            return {
                'success': True,
                'capsules': capsules,
                'metadata': {
                    'method': 'gemini',
                    'model': self.config.STYLIST_GEMINI_MODEL,
                    'processingTime': round(processing_time, 2),
                    'itemsCount': len(wardrobe_items),
                    'capsulesGenerated': len(capsules)
                }
            }
        
        except Exception as e:
            self.logger.error(f"Ошибка генерации капсул через Gemini: {e}")
            raise
    
    def generate_capsules_algorithmically(
        self,
        wardrobe_items: List[Dict],
        current_season: str,
        current_month: str,
        existing_capsules: List[Dict],
        exclude_combinations: List[List[int]]
    ) -> List[Dict]:
        """
        Алгоритмическая генерация 3 капсул на основе правил стиля
        
        Args:
            wardrobe_items: Список вещей гардероба
            current_season: Текущий сезон
            current_month: Текущий месяц
            existing_capsules: Существующие капсулы
            exclude_combinations: Комбинации для исключения
        
        Returns:
            Список из 3 капсул
        """
        # Создаем строитель комбинаций
        builder = CapsuleCombinationBuilder(wardrobe_items, current_season)
        
        # Генерируем 3 капсулы с разными стратегиями
        strategies = ['balanced', 'popular', 'experimental']
        capsules = []
        used_combinations = []  # Отслеживаем уже созданные комбинации
        
        for i, strategy in enumerate(strategies):
            # Создаем комбинацию с учетом уже использованных
            items = builder.create_combination(strategy, used_combinations)
            
            if len(items) < 3:
                continue  # Пропускаем если недостаточно вещей
            
            # Добавляем комбинацию в список использованных
            used_combinations.append([item['id'] for item in items])
            
            # Создаем капсулу с метаданными
            capsule = {
                'id': f'mock_{i+1}',
                'name': CapsuleMetadataGenerator.generate_name(strategy),
                'description': CapsuleMetadataGenerator.generate_description(strategy, current_season),
                'reasoning': f'Стратегия "{strategy}": комбинация из {len(items)} вещей с учетом сезона {current_season}',
                'recommendations': CapsuleMetadataGenerator.generate_recommendations(items, current_season),
                'itemIds': [item['id'] for item in items],
                'items': items,
                'strategy': strategy
            }
            
            capsules.append(capsule)
        
        # Если получилось меньше 3 капсул, дополняем случайными
        attempts = 0
        while len(capsules) < 3 and attempts < 5:
            items = builder.create_combination('balanced', used_combinations)
            if len(items) >= 3:
                used_combinations.append([item['id'] for item in items])
                capsule = {
                    'id': f'mock_{len(capsules)+1}',
                    'name': f'Образ {len(capsules)+1}',
                    'description': f'Дополнительный образ для {current_season}',
                    'reasoning': 'Автоматически сгенерированная комбинация',
                    'recommendations': CapsuleMetadataGenerator.generate_recommendations(items, current_season),
                    'itemIds': [item['id'] for item in items],
                    'items': items,
                    'strategy': 'auto'
                }
                capsules.append(capsule)
            attempts += 1
        
        return capsules[:3]  # Возвращаем максимум 3 капсулы
    
    def handle_generate_capsules_request(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Обработка запроса на генерацию капсул через Gemini
        
        Args:
            data: Данные запроса (wardrobeItems, currentSeason, currentMonth, existingCapsules)
        
        Returns:
            Результат генерации с метаданными или ошибка
        """
        start_time = time.time()
        
        try:
            # Валидация клиента
            if not self.gemini_client:
                return {
                    'success': False,
                    'error': 'Gemini клиент не инициализирован'
                }, 500
            
            # Валидация данных
            if not data:
                return {
                    'success': False,
                    'error': 'No data provided'
                }, 400
            
            wardrobe_items = data.get('wardrobeItems', [])
            current_season = data.get('currentSeason', 'summer')
            current_month = data.get('currentMonth', 'июнь')
            existing_capsules = data.get('existingCapsules', [])
            
            # Валидация вещей
            if not wardrobe_items:
                return {
                    'success': False,
                    'error': 'Нет вещей в гардеробе'
                }, 400
            
            if len(wardrobe_items) < 3:
                return {
                    'success': False,
                    'error': 'Недостаточно вещей в гардеробе (минимум 3)'
                }, 400
            
            self.logger.info(f"Генерация капсул: {len(wardrobe_items)} вещей, сезон: {current_season} ({current_month})")
            
            # Генерируем капсулы
            result = self.generate_capsules_gemini(
                wardrobe_items,
                current_season,
                current_month,
                existing_capsules
            )
            
            total_time = time.time() - start_time
            result['metadata']['total_time'] = round(total_time, 2)
            
            self.logger.info(f"Генерация капсул завершена за {total_time:.2f}с")
            
            return result, 200
        
        except Exception as e:
            total_time = time.time() - start_time
            error_msg = f"Ошибка генерации капсул: {e}"
            self.logger.error(error_msg)
            
            return {
                'success': False,
                'error': str(e),
                'timing': {
                    'total_time': round(total_time, 2)
                }
            }, 500
    
    def handle_generate_capsules_mock_request(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Обработка запроса на алгоритмическую генерацию капсул (без Gemini)
        
        Args:
            data: Данные запроса (wardrobeItems, currentSeason, currentMonth, existingCapsules, excludeCombinations)
        
        Returns:
            Результат генерации с метаданными или ошибка
        """
        start_time = time.time()
        
        try:
            # Валидация данных
            if not data:
                return {
                    'success': False,
                    'error': 'No data provided'
                }, 400
            
            wardrobe_items = data.get('wardrobeItems', [])
            current_season = data.get('currentSeason', 'summer')
            current_month = data.get('currentMonth', 'июнь')
            existing_capsules = data.get('existingCapsules', [])
            exclude_combinations = data.get('excludeCombinations', [])
            
            # Валидация вещей
            if not wardrobe_items:
                return {
                    'success': False,
                    'error': 'Нет вещей в гардеробе'
                }, 400
            
            if len(wardrobe_items) < 3:
                return {
                    'success': False,
                    'error': 'Недостаточно вещей в гардеробе (минимум 3)'
                }, 400
            
            self.logger.info(f"Mock генерация капсул: {len(wardrobe_items)} вещей, сезон: {current_season} ({current_month})")
            
            # Генерируем капсулы алгоритмически
            capsules = self.generate_capsules_algorithmically(
                wardrobe_items,
                current_season,
                current_month,
                existing_capsules,
                exclude_combinations
            )
            
            total_time = time.time() - start_time
            
            self.logger.info(f"Mock генерация капсул завершена за {total_time:.2f}с, создано {len(capsules)} капсул")
            
            return {
                'success': True,
                'capsules': capsules,
                'timing': {
                    'total_time': round(total_time, 2)
                }
            }, 200
        
        except Exception as e:
            total_time = time.time() - start_time
            error_msg = f"Ошибка mock генерации капсул: {e}"
            self.logger.error(error_msg)
            
            return {
                'success': False,
                'error': str(e),
                'timing': {
                    'total_time': round(total_time, 2)
                }
            }, 500
