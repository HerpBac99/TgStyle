"""
Модуль для анализа изображений через FastVLM и AI-стилистов

Содержит:
- Низкоуровневый анализ через FastVLM
- Многопроходный анализ (6 промптов)
- Генерация ответов стилистов (Ollama, Gemini)
- Утилиты для работы с результатами
- Обработчики HTTP запросов для endpoints
"""

import sys
import base64
import time
import io
import json
import os
import traceback
from datetime import datetime
from PIL import Image
from contextlib import contextmanager

# Импортируем torch для GPU управления
import torch

# Импортируем FastVLM компоненты
sys.path.append('./models/ml-fastvlm')
from llava.conversation import conv_templates
from llava.mm_utils import tokenizer_image_token, process_images
from llava.constants import IMAGE_TOKEN_INDEX, DEFAULT_IMAGE_TOKEN, DEFAULT_IM_START_TOKEN, DEFAULT_IM_END_TOKEN

# Импортируем конфигурацию
from config import Config

# Импортируем requests для Ollama
try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False

# Импортируем Gemini
try:
    from google.genai import types
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False


@contextmanager
def gpu_memory_manager():
    """Контекст-менеджер для управления GPU памятью"""
    initial_memory = 0
    if torch.cuda.is_available():
        initial_memory = torch.cuda.memory_allocated()
    
    try:
        yield
    finally:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            final_memory = torch.cuda.memory_allocated()
            if final_memory > initial_memory:
                # Логирование через переданный logger
                pass


class AnalysisService:
    """
    Сервис для анализа изображений через FastVLM и AI-стилистов
    
    Архитектура:
    - Dependency Injection для всех зависимостей
    - Изолированное состояние (performance_stats)
    - Четкое разделение ответственности
    """
    
    def __init__(self, model, tokenizer, image_processor, gemini_client, 
                 ollama_config, prompts, logger):
        """
        Инициализация сервиса анализа
        
        Args:
            model: FastVLM модель
            tokenizer: Токенизатор
            image_processor: Обработчик изображений
            gemini_client: Клиент Gemini API
            ollama_config: Конфигурация Ollama {available, url, model}
            prompts: Словарь промптов {default, style, person, clothing, ...}
            logger: Logger для логирования
        """
        self.model = model
        self.tokenizer = tokenizer
        self.image_processor = image_processor
        self.gemini_client = gemini_client
        
        # Ollama конфигурация
        self.ollama_available = ollama_config.get('available', False)
        self.ollama_url = ollama_config.get('url', 'http://127.0.0.1:11434')
        self.ollama_model = ollama_config.get('model', 'gemma3:4b')
        
        # Промпты
        self.prompts = prompts
        
        # Logger
        self.logger = logger
        
        # Статистика производительности (изолированная)
        self.performance_stats = {
            'total_requests': 0,
            'successful_requests': 0,
            'failed_requests': 0,
            'total_processing_time': 0.0,
            'average_processing_time': 0.0
        }
    
    def update_performance_stats(self, processing_time, success=True):
        """Обновление статистики производительности"""
        self.performance_stats['total_requests'] += 1
        if success:
            self.performance_stats['successful_requests'] += 1
            self.performance_stats['total_processing_time'] += processing_time
            self.performance_stats['average_processing_time'] = (
                self.performance_stats['total_processing_time'] / 
                self.performance_stats['successful_requests']
            )
        else:
            self.performance_stats['failed_requests'] += 1
    
    def get_performance_stats(self):
        """Получение статистики производительности"""
        return self.performance_stats.copy()
    
    @staticmethod
    def extract_text(result) -> str:
        """Извлекает текст из результата анализа"""
        if isinstance(result, dict):
            return (
                result.get("technical_analysis")
                or result.get("analysis")
                or ""
            )
        elif isinstance(result, str):
            return result
        else:
            return ""
    
    @staticmethod
    def get_current_season(month: int) -> str:
        """
        Определяет текущий сезон по номеру месяца
        
        Args:
            month: Номер месяца (1-12)
        
        Returns:
            Название сезона: winter, spring, summer, autumn
        """
        if month in [12, 1, 2]:
            return 'winter'
        elif month in [3, 4, 5]:
            return 'spring'
        elif month in [6, 7, 8]:
            return 'summer'
        else:  # 9, 10, 11
            return 'autumn'
    
    def analyze_image_fastvlm(self, image_base64, prompt_text=None):
        """
        Анализ изображения с помощью FastVLM модели
        
        Args:
            image_base64: Изображение в base64
            prompt_text: Промпт для анализа (опционально)
        
        Returns:
            Tuple[str, str]: (результат, ошибка)
        """
        try:
            if not all([self.model, self.tokenizer, self.image_processor]):
                return None, "Модель не загружена"

            # Используем промпт или дефолтный
            if not prompt_text:
                prompt_text = self.prompts.get('default', '')

            # Декодируем изображение
            image_data = base64.b64decode(image_base64)
            image = Image.open(io.BytesIO(image_data)).convert('RGB')

            # Подготавливаем промпт
            qs = prompt_text
            if self.model.config.mm_use_im_start_end:
                qs = DEFAULT_IM_START_TOKEN + DEFAULT_IMAGE_TOKEN + DEFAULT_IM_END_TOKEN + '\n' + qs
            else:
                qs = DEFAULT_IMAGE_TOKEN + '\n' + qs

            # Создаем диалог
            conv = conv_templates[Config.FASHION_ANALYSIS_CONFIG['conv_mode']].copy()
            conv.append_message(conv.roles[0], qs)
            conv.append_message(conv.roles[1], None)
            prompt = conv.get_prompt()

            # Токенизация
            input_ids = tokenizer_image_token(
                prompt, self.tokenizer, IMAGE_TOKEN_INDEX, return_tensors='pt'
            ).unsqueeze(0).to(Config.DEVICE)

            # Обработка изображения
            image_tensor = process_images([image], self.image_processor, self.model.config)[0]

            # Очищаем кеш модели для предсказуемых результатов
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            
            # Генерация с оптимизациями
            with gpu_memory_manager():
                with torch.inference_mode():
                    output_ids = self.model.generate(
                        input_ids,
                        images=image_tensor.unsqueeze(0).to(dtype=Config.TORCH_DTYPE, device=Config.DEVICE),
                        image_sizes=[image.size],
                        do_sample=Config.FASHION_ANALYSIS_CONFIG['do_sample'],
                        temperature=Config.FASHION_ANALYSIS_CONFIG['temperature'],
                        top_p=Config.FASHION_ANALYSIS_CONFIG['top_p'],
                        top_k=Config.FASHION_ANALYSIS_CONFIG['top_k'],
                        num_beams=Config.FASHION_ANALYSIS_CONFIG['num_beams'],
                        max_new_tokens=Config.FASHION_ANALYSIS_CONFIG['max_new_tokens'],
                        repetition_penalty=Config.FASHION_ANALYSIS_CONFIG['repetition_penalty'],
                        length_penalty=Config.FASHION_ANALYSIS_CONFIG['length_penalty'],
                        no_repeat_ngram_size=Config.FASHION_ANALYSIS_CONFIG['no_repeat_ngram_size'],
                        early_stopping=Config.FASHION_ANALYSIS_CONFIG['early_stopping'],
                        use_cache=True,
                        pad_token_id=self.tokenizer.pad_token_id,
                        eos_token_id=self.tokenizer.eos_token_id
                    )

            # Декодируем результат
            outputs = self.tokenizer.batch_decode(output_ids, skip_special_tokens=True)[0].strip()

            # Очищаем результат от исходного промпта
            if prompt in outputs:
                outputs = outputs.replace(prompt, "").strip()

            # Удаляем стоп-последовательности
            for stop_seq in Config.STOP_SEQUENCES:
                if stop_seq in outputs:
                    outputs = outputs.split(stop_seq)[0].strip()

            return outputs, None

        except Exception as e:
            self.logger.error(f"Ошибка анализа изображения: {e}")
            self.logger.error(traceback.format_exc())
            return None, str(e)
    
    def perform_multi_pass_analysis(self, image_base64: str, nickname: str) -> dict:
        """
        Выполняет многопроходный анализ изображения через FastVLM (6 промптов)
        
        Args:
            image_base64: Изображение в base64
            nickname: Имя пользователя для логирования
        
        Returns:
            dict: Результаты анализа по всем промптам + timing
        """
        self.logger.info(f"Начинаем многопроходный анализ для пользователя {nickname}")

        # Временные переменные для результатов
        person_result = ""
        clothing_result = ""
        legs_result = ""
        shoes_result = ""
        accessories_head_result = ""
        accessories_hand_result = ""
        timing = {
            "person": 0, 
            "clothing": 0, 
            "legs": 0, 
            "shoes": 0, 
            "accessories_head": 0, 
            "accessories_hand": 0, 
            "total": 0
        }

        total_start_time = time.time()

        try:
            # Pass 1: Person analysis
            person_prompt = self.prompts.get('person')
            if person_prompt:
                pass1_start = time.time()
                person_response, error = self.analyze_image_fastvlm(image_base64, person_prompt)
                if error:
                    person_response = "Не удалось определить информацию о человеке"
                person_result = self.extract_text(person_response)
                timing["person"] = time.time() - pass1_start

            # Pass 2: Top clothing analysis
            clothing_prompt = self.prompts.get('clothing')
            if clothing_prompt:
                pass2_start = time.time()
                clothing_response, error = self.analyze_image_fastvlm(image_base64, clothing_prompt)
                if error:
                    clothing_response = "Не удалось определить верхнюю одежду"
                clothing_result = self.extract_text(clothing_response)
                timing["clothing"] = time.time() - pass2_start

            # Pass 3: Legs clothing analysis
            legs_prompt = self.prompts.get('legs')
            if legs_prompt:
                pass3_start = time.time()
                legs_response, error = self.analyze_image_fastvlm(image_base64, legs_prompt)
                if error:
                    legs_response = "Не удалось определить одежду на ногах"
                legs_result = self.extract_text(legs_response)
                timing["legs"] = time.time() - pass3_start
            else:
                self.logger.warning(f"legs_prompt is falsy: '{legs_prompt}' (type: {type(legs_prompt)})")

            # Pass 4: Shoes analysis
            shoes_prompt = self.prompts.get('shoes')
            if shoes_prompt:
                pass4_start = time.time()
                shoes_response, error = self.analyze_image_fastvlm(image_base64, shoes_prompt)
                if error:
                    shoes_response = "Не удалось определить обувь"
                shoes_result = self.extract_text(shoes_response)
                timing["shoes"] = time.time() - pass4_start

            # Pass 5: Head accessories analysis
            accessories_head_prompt = self.prompts.get('accessories_head')
            if accessories_head_prompt:
                pass5_start = time.time()
                accessories_head_response, error = self.analyze_image_fastvlm(image_base64, accessories_head_prompt)
                if error:
                    accessories_head_response = "Не удалось определить аксессуары на голове/шее"
                accessories_head_result = self.extract_text(accessories_head_response)
                timing["accessories_head"] = time.time() - pass5_start

            # Pass 6: Hand accessories analysis
            accessories_hand_prompt = self.prompts.get('accessories_hand')
            if accessories_hand_prompt:
                pass6_start = time.time()
                accessories_hand_response, error = self.analyze_image_fastvlm(image_base64, accessories_hand_prompt)
                if error:
                    accessories_hand_response = "Не удалось определить аксессуары на руках/запястьях"
                accessories_hand_result = self.extract_text(accessories_hand_response)
                timing["accessories_hand"] = time.time() - pass6_start

            timing["total"] = time.time() - total_start_time

            self.logger.info(f"Многопроходный анализ завершен за {timing['total']:.2f}с")

            return {
                "person": person_result,
                "clothing": clothing_result,
                "legs": legs_result,
                "shoes": shoes_result,
                "accessories_head": accessories_head_result,
                "accessories_hand": accessories_hand_result,
                "timing": timing,
                "success": True
            }

        except Exception as e:
            self.logger.error(f"Ошибка в многопроходном анализе: {e}")
            timing["total"] = time.time() - total_start_time
            return {
                "person": "",
                "clothing": "",
                "legs": "",
                "shoes": "",
                "accessories_head": "",
                "accessories_hand": "",
                "timing": timing,
                "success": False,
                "error": str(e)
            }
    
    def create_stylist_response_ollama(self, multi_pass_analysis, topic='casual'):
        """
        Создает креативный ответ ИИ стилиста через Ollama
        
        Args:
            multi_pass_analysis: Результат многопроходного анализа
            topic: Тема анализа
        
        Returns:
            str: Ответ стилиста или fallback на оригинальный анализ
        """
        if not self.ollama_available:
            self.logger.warning("Ollama недоступен, используем базовый анализ FastVLM")
            return multi_pass_analysis

        try:
            self.logger.info(f"Генерация креативного ответа стилиста через Ollama API (тема: {topic})")

            # Используем промпт из файла style_prompt.md
            style_prompt = self.prompts.get('style', '')
            formatted_prompt = style_prompt.replace('{fastvlm_analysis}', multi_pass_analysis).replace('{theme}', topic)

            # Логируем отправку запроса в Ollama
            self.logger.info(f"Отправка запроса в Ollama (промпт: {len(formatted_prompt)} символов, модель: {self.ollama_model})")

            ollama_request_start = time.time()

            # Создаем запрос к Ollama API
            payload = {
                "model": self.ollama_model,
                "prompt": formatted_prompt,
                "stream": False,
                "options": {
                    "temperature": Config.STYLIST_OLLAMA_TEMPERATURE,
                    "top_p": Config.STYLIST_OLLAMA_TOP_P,
                    "max_tokens": Config.STYLIST_OLLAMA_MAX_TOKENS,
                    "repeat_penalty": Config.STYLIST_OLLAMA_REPEAT_PENALTY,
                    "top_k": Config.STYLIST_OLLAMA_TOP_K
                }
            }

            response = requests.post(
                f"{self.ollama_url}/api/generate",
                json=payload,
                timeout=60
            )

            if response.status_code != 200:
                raise Exception(f"Ollama API error: {response.status_code} - {response.text}")

            result = response.json()
            creative_response = result.get('response', '').strip()

            ollama_request_time = time.time() - ollama_request_start

            # Логируем успешный ответ от Ollama
            self.logger.info(f"Ollama ответил успешно: {len(creative_response)} символов за {ollama_request_time:.2f} сек")

            return creative_response

        except Exception as e:
            self.logger.error(f"Ошибка создания ответа через Ollama: {e}")
            # Fallback на оригинальный анализ FastVLM
            return multi_pass_analysis
    
    def create_stylist_response_gemini(self, multi_pass_analysis, topic='casual'):
        """
        Создает креативный ответ ИИ стилиста через Gemini API
        
        Args:
            multi_pass_analysis: Результат многопроходного анализа
            topic: Тема анализа
        
        Returns:
            str: Ответ стилиста или fallback на оригинальный анализ
        """
        if not self.gemini_client:
            self.logger.warning("Gemini клиент недоступен, используем базовый анализ FastVLM")
            return multi_pass_analysis

        try:
            self.logger.info(f"Генерация креативного ответа стилиста через Gemini API (тема: {topic})")

            # Используем промпт из файла style_prompt.md
            style_prompt = self.prompts.get('style', '')
            formatted_prompt = style_prompt.replace('{fastvlm_analysis}', multi_pass_analysis).replace('{theme}', topic)

            # Логируем отправку запроса в Gemini
            self.logger.info(f"Отправка запроса в Gemini (промпт: {len(formatted_prompt)} символов, модель: {Config.STYLIST_GEMINI_MODEL})")

            gemini_request_start = time.time()

            # Создаем запрос к Gemini API
            response = self.gemini_client.models.generate_content(
                model=Config.STYLIST_GEMINI_MODEL,
                contents=[{
                    "parts": [
                        {"text": formatted_prompt}
                    ]
                }],
                config=types.GenerateContentConfig(
                    temperature=Config.STYLIST_GEMINI_TEMPERATURE,
                    max_output_tokens=Config.STYLIST_GEMINI_MAX_TOKENS,
                    thinking_config=types.ThinkingConfig(
                        thinking_budget=Config.STYLIST_GEMINI_THINKING_BUDGET
                    )
                )
            )

            if not response or not hasattr(response, 'text') or not response.text:
                raise Exception("Gemini API вернул пустой ответ")

            creative_response = response.text.strip()

            gemini_request_time = time.time() - gemini_request_start

            # Логируем успешный ответ от Gemini
            self.logger.info(f"Gemini ответил успешно: {len(creative_response)} символов за {gemini_request_time:.2f} сек")

            return creative_response

        except Exception as e:
            self.logger.error(f"Ошибка создания ответа через Gemini: {e}")
            # Fallback на оригинальный анализ FastVLM
            return multi_pass_analysis
    
    def create_stylist_response(self, multi_pass_analysis, topic='casual'):
        """
        Создает креативный ответ ИИ стилиста в зависимости от выбранного типа
        
        Логика выбора:
        1. Пытаемся использовать выбранный тип (Config.STYLIST_TYPE)
        2. Если не получилось, пробуем альтернативы
        3. Если ничего не работает, возвращаем базовый анализ FastVLM
        
        Args:
            multi_pass_analysis: Результат многопроходного анализа
            topic: Тема анализа
        
        Returns:
            str: Ответ стилиста
        """
        self.logger.info(f"Создание ответа стилиста. Выбран тип: {Config.STYLIST_TYPE}, тема: {topic}")

        # Выбираем стилиста в зависимости от конфигурации
        if Config.STYLIST_TYPE == 'ollama' and self.ollama_available:
            self.logger.info(f"Используем Ollama для создания ответа стилиста (выбранный тип: {Config.STYLIST_TYPE})")
            response = self.create_stylist_response_ollama(multi_pass_analysis, topic)
            if response and response != multi_pass_analysis:  # Проверяем, что это не fallback
                return response
            self.logger.warning("Ollama не дал качественный ответ")

        elif Config.STYLIST_TYPE == 'gemini' and self.gemini_client:
            self.logger.info(f"Используем Gemini для создания ответа стилиста (выбранный тип: {Config.STYLIST_TYPE})")
            return self.create_stylist_response_gemini(multi_pass_analysis, topic)

        # Fallback логика - пробуем все доступные варианты
        self.logger.warning(f"Выбранный стилист {Config.STYLIST_TYPE} недоступен, пробуем альтернативы")

        if self.ollama_available:
            self.logger.info("Fallback на Ollama")
            response = self.create_stylist_response_ollama(multi_pass_analysis, topic)
            if response and response != multi_pass_analysis:
                return response

        if self.gemini_client:
            self.logger.info("Fallback на Gemini")
            return self.create_stylist_response_gemini(multi_pass_analysis, topic)

        # Если ничего не сработало, возвращаем базовый анализ
        self.logger.warning("Ни Ollama, ни Gemini недоступны, используем базовый анализ FastVLM")
        return multi_pass_analysis

    
    def analyze_full(self, image_base64: str, nickname: str, topic: str = 'casual') -> dict:
        """
        Полный анализ изображения: многопроходный анализ + ответ стилиста
        
        Этот метод объединяет весь pipeline анализа:
        1. Многопроходный анализ через FastVLM (6 промптов)
        2. Объединение результатов
        3. Генерация креативного ответа стилиста
        
        Args:
            image_base64: Изображение в base64
            nickname: Имя пользователя для логирования
            topic: Тема анализа (casual, formal, etc.)
        
        Returns:
            dict: Полный результат анализа с timing
        """
        start_time = time.time()
        
        try:
            # Шаг 1: Многопроходный анализ
            self.logger.info(f"Выполняем многопроходный анализ изображения для пользователя {nickname}")
            
            multi_pass_result = self.perform_multi_pass_analysis(image_base64, nickname)
            
            # Проверяем результат
            if not isinstance(multi_pass_result, dict):
                self.update_performance_stats(time.time() - start_time, success=False)
                return {
                    'success': False,
                    'error': 'Invalid multi-pass analysis result'
                }
            
            if not multi_pass_result.get('success', False):
                self.update_performance_stats(time.time() - start_time, success=False)
                return {
                    'success': False,
                    'error': multi_pass_result.get('error', 'Multi-pass analysis failed')
                }
            
            # Шаг 2: Объединяем результаты анализа
            combined_analysis = f"""
ЧЕЛОВЕК: {multi_pass_result.get('person', 'Не определено')}
ОДЕЖДА: {multi_pass_result.get('clothing', 'Не определено')}
НОГИ: {multi_pass_result.get('legs', 'Не определено')}
ОБУВЬ: {multi_pass_result.get('shoes', 'Не определено')}
АКСЕССУАРЫ_ГОЛОВА: {multi_pass_result.get('accessories_head', 'Не определено')}
АКСЕССУАРЫ_РУКИ: {multi_pass_result.get('accessories_hand', 'Не определено')}
"""
            
            fastvlm_time = multi_pass_result.get('timing', {}).get('total', 0)
            
            # Шаг 3: Создаем креативный ответ стилиста
            stylist_start_time = time.time()
            stylist_response = self.create_stylist_response(combined_analysis, topic)
            stylist_time = time.time() - stylist_start_time
            
            total_time = time.time() - start_time
            
            # Обновляем статистику
            self.update_performance_stats(total_time, success=True)
            
            self.logger.info(f"Полный анализ завершен за {total_time:.2f}с (FastVLM: {fastvlm_time:.2f}с, стилист: {stylist_time:.2f}с)")
            
            return {
                'success': True,
                'technical_analysis': combined_analysis,
                'analysis': stylist_response,
                'model_used': 'fastvlm',
                'model_type': Config.MODEL_TYPE,
                'device': Config.DEVICE,
                'timing': {
                    'total_time': round(total_time, 2),
                    'fastvlm_time': round(fastvlm_time, 2),
                    'stylist_time': round(stylist_time, 2)
                },
                'multi_pass_results': {
                    'person': multi_pass_result.get('person', ''),
                    'clothing': multi_pass_result.get('clothing', ''),
                    'legs': multi_pass_result.get('legs', ''),
                    'shoes': multi_pass_result.get('shoes', ''),
                    'accessories_head': multi_pass_result.get('accessories_head', ''),
                    'accessories_hand': multi_pass_result.get('accessories_hand', ''),
                },
                'detailed_timings': multi_pass_result.get('timing', {})
            }
            
        except Exception as e:
            total_time = time.time() - start_time
            self.update_performance_stats(total_time, success=False)
            self.logger.error(f"Ошибка полного анализа: {e}")
            self.logger.error(traceback.format_exc())
            
            return {
                'success': False,
                'error': str(e),
                'timing': {
                    'total_time': round(total_time, 2)
                }
            }

    
    def analyze_for_test(self, image_base64: str, prompt: str, nickname: str = 'test_user') -> dict:
        """
        Технический анализ изображения для тестирования (только FastVLM, без стилиста)
        
        Используется для тестирования промптов и отладки FastVLM модели.
        Возвращает только сырой результат FastVLM без обработки стилистом.
        
        Args:
            image_base64: Изображение в base64
            prompt: Промпт для анализа
            nickname: Имя пользователя для логирования
        
        Returns:
            dict: Результат технического анализа с timing
        """
        start_time = time.time()
        
        try:
            self.logger.info(f"Выполняем технический анализ изображения для пользователя {nickname}")
            
            # Выполняем только технический анализ FastVLM
            fastvlm_start_time = time.time()
            technical_analysis, error = self.analyze_image_fastvlm(image_base64, prompt)
            fastvlm_time = time.time() - fastvlm_start_time
            
            if error:
                return {
                    'success': False,
                    'error': error,
                    'technical_analysis': '',
                    'analysis': '',
                    'timing': {
                        'total_time': round(time.time() - start_time, 2),
                        'fastvlm_time': round(fastvlm_time, 2),
                        'stylist_time': 0
                    }
                }
            
            total_time = time.time() - start_time
            
            self.logger.info(f"Технический анализ завершен за {fastvlm_time:.2f}с")
            
            return {
                'success': True,
                'technical_analysis': technical_analysis,
                'analysis': '',  # Пустая строка, так как стилист не вызывается
                'model_used': 'fastvlm',
                'model_type': Config.MODEL_TYPE,
                'device': Config.DEVICE,
                'timing': {
                    'total_time': round(total_time, 2),
                    'fastvlm_time': round(fastvlm_time, 2),
                    'stylist_time': 0
                }
            }
            
        except Exception as e:
            total_time = time.time() - start_time
            self.logger.error(f"Ошибка технического анализа: {e}")
            self.logger.error(traceback.format_exc())
            
            return {
                'success': False,
                'error': str(e),
                'technical_analysis': '',
                'analysis': '',
                'timing': {
                    'total_time': round(total_time, 2),
                    'fastvlm_time': 0,
                    'stylist_time': 0
                }
            }

    
    def analyze_gemini_direct(self, image_base64: str, nickname: str, topic: str = 'casual') -> dict:
        """
        Прямой анализ фотографии через Gemini (без FastVLM)
        
        Отправляет фото напрямую в Gemini с детальным промптом стилиста.
        Используется для сравнения подходов: FastVLM + стилист vs только Gemini.
        
        Args:
            image_base64: Изображение в base64
            nickname: Имя пользователя для логирования
            topic: Тема анализа
        
        Returns:
            dict: Результат анализа через Gemini с timing
        """
        start_time = time.time()
        
        try:
            if not self.gemini_client:
                return {
                    'success': False,
                    'error': 'Gemini клиент не инициализирован'
                }
            
            self.logger.info(f"🚀 Прямой анализ через Gemini для пользователя {nickname} (тема: {topic})")
            
            # Получаем текущую дату для учета сезона и трендов
            from datetime import datetime
            current_date = datetime.now()
            current_month = current_date.strftime('%B %Y')
            current_season = self.get_current_season(current_date.month)
            
            # Формируем детальный промпт для Gemini
            gemini_prompt = f"""Ты профессиональный AI-стилист с 15-летним опытом работы в индустрии моды. Твоя задача - проанализировать фотографию и дать экспертные рекомендации по стилю.

═══════════════════════════════════════════════════════════════
📅 КОНТЕКСТ АНАЛИЗА
═══════════════════════════════════════════════════════════════
• Текущая дата: {current_month}
• Сезон: {current_season}
• Тема анализа: {topic}
• Учитывай актуальные тренды {current_season} {current_date.year}

═══════════════════════════════════════════════════════════════
🎯 ЗАДАЧИ АНАЛИЗА
═══════════════════════════════════════════════════════════════

1️⃣ ДЕТАЛЬНОЕ ОПИСАНИЕ ОБРАЗА
   Опиши каждый элемент одежды:
   • Верхняя одежда (куртка, пальто, пиджак и т.д.)
   • Средний слой (свитер, рубашка, блузка и т.д.)
   • Низ (брюки, джинсы, юбка, шорты и т.д.)
   • Обувь (тип, цвет, стиль)
   • Аксессуары (сумка, украшения, головные уборы, очки и т.д.)

2️⃣ АНАЛИЗ ЦВЕТОВОЙ ГАММЫ
   • Основные цвета образа
   • Акцентные цвета
   • Оценка сочетаемости цветов
   • Соответствие цветовой палитры сезону {current_season}

3️⃣ ОПРЕДЕЛЕНИЕ СТИЛЯ
   • Основной стиль образа (casual, business, streetwear, smart casual, sporty и т.д.)
   • Подстиль или микс стилей (если применимо)
   • Соответствие трендам {current_season} {current_date.year}
   • Уместность для темы "{topic}"

4️⃣ ОЦЕНКА ОБРАЗА
   Оцени по шкале от 1 до 10:
   • Общая гармоничность образа
   • Сочетаемость элементов
   • Актуальность (соответствие трендам)
   • Уместность для сезона

═══════════════════════════════════════════════════════════════
💡 РЕКОМЕНДАЦИИ ПО УЛУЧШЕНИЮ
═══════════════════════════════════════════════════════════════

Дай 3-5 КОНКРЕТНЫХ рекомендаций:

✅ ЧТО РАБОТАЕТ ХОРОШО:
   • Укажи 2-3 сильные стороны образа
   • Что стоит сохранить

🔄 ЧТО МОЖНО УЛУЧШИТЬ:
   • Конкретные предложения по замене/добавлению элементов
   • Альтернативные цветовые сочетания
   • Рекомендации по аксессуарам

🎨 СТИЛИСТИЧЕСКИЕ СОВЕТЫ:
   • Как адаптировать образ под разные случаи
   • Актуальные тренды {current_season} {current_date.year}, которые можно применить
   • Сезонные рекомендации для {current_season}

🛍️ РЕКОМЕНДАЦИИ ПО ПОКУПКАМ (если нужно):
   • Какие элементы гардероба стоит добавить
   • Приоритетные покупки для улучшения образа

═══════════════════════════════════════════════════════════════
📋 ПРАВИЛА ОТВЕТА
═══════════════════════════════════════════════════════════════

✓ Пиши на русском языке
✓ Используй структурированный формат с эмодзи для читаемости
✓ Будь конкретным и практичным
✓ Учитывай актуальные тренды {current_season} {current_date.year}
✓ Давай реалистичные советы, которые легко применить
✓ Будь позитивным, но честным
✓ Объясняй ПОЧЕМУ ты даешь ту или иную рекомендацию
✓ Учитывай сезонность и погодные условия {current_season}

✗ Не используй общие фразы типа "выглядит хорошо"
✗ Не критикуй личность, только одежду
✗ Не рекомендуй дорогие бренды без необходимости
✗ Не игнорируй контекст темы "{topic}"

═══════════════════════════════════════════════════════════════

Начни анализ с краткого вступления, затем следуй структуре выше. Будь экспертом, который помогает человеку выглядеть лучше!"""
            
            self.logger.info(f"📝 Промпт для Gemini: {len(gemini_prompt)} символов")
            
            # Отправляем запрос в Gemini с изображением
            gemini_request_start = time.time()
            
            try:
                # Создаем запрос с изображением и текстом
                response = self.gemini_client.models.generate_content(
                    model=Config.STYLIST_GEMINI_MODEL,
                    contents=[{
                        "parts": [
                            {
                                "inline_data": {
                                    "mime_type": "image/jpeg",
                                    "data": image_base64
                                }
                            },
                            {"text": gemini_prompt}
                        ]
                    }],
                    config=types.GenerateContentConfig(
                        temperature=Config.STYLIST_GEMINI_TEMPERATURE,
                        max_output_tokens=Config.STYLIST_GEMINI_MAX_TOKENS,
                        thinking_config=types.ThinkingConfig(
                            thinking_budget=Config.STYLIST_GEMINI_THINKING_BUDGET
                        )
                    )
                )
                
                if not response or not hasattr(response, 'text') or not response.text:
                    raise Exception("Gemini API вернул пустой ответ")
                
                gemini_response = response.text.strip()
                gemini_time = time.time() - gemini_request_start
                
                self.logger.info(f"✅ Gemini ответил за {gemini_time:.2f}с: {len(gemini_response)} символов")
                
            except Exception as e:
                self.logger.error(f"Ошибка запроса к Gemini: {e}")
                return {
                    'success': False,
                    'error': f'Gemini API error: {str(e)}'
                }
            
            total_time = time.time() - start_time
            
            self.logger.info(f"🎯 Прямой анализ через Gemini завершен за {total_time:.2f}с")
            
            return {
                'success': True,
                'analysis': gemini_response,
                'technical_analysis': '',  # Нет технического анализа от FastVLM
                'model_used': 'gemini_direct',
                'model_type': Config.STYLIST_GEMINI_MODEL,
                'timing': {
                    'total_time': round(total_time, 2),
                    'gemini_time': round(gemini_time, 2),
                    'fastvlm_time': 0  # FastVLM не использовался
                }
            }
            
        except Exception as e:
            total_time = time.time() - start_time
            self.logger.error(f"Ошибка прямого анализа через Gemini: {e}")
            self.logger.error(traceback.format_exc())
            
            return {
                'success': False,
                'error': str(e),
                'timing': {
                    'total_time': round(total_time, 2)
                }
            }

    def save_analysis_with_nickname(self, clean_analysis: str, gemini_response: str, nickname: str, image_size: tuple, fastvlm_time: float, gemini_time: float) -> str:
        """
        Сохраняет результаты анализа FastVLM и Gemini с nickname в LOGS_DIR
        
        Args:
            clean_analysis: Технический анализ от FastVLM
            gemini_response: Ответ стилиста от Gemini
            nickname: Никнейм пользователя
            image_size: Размер изображения (width, height)
            fastvlm_time: Время обработки FastVLM
            gemini_time: Время обработки Gemini
        
        Returns:
            Путь к сохраненному файлу или None при ошибке
        """
        try:
            # Создаем директорию logs если не существует
            logs_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'logs')
            os.makedirs(logs_dir, exist_ok=True)

            # Форматируем время для имени файла
            timestamp_str = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')

            # Создаем имя файла: nickname_YYYY-MM-DD_HH-MM-SS
            safe_nickname = nickname.replace('/', '_').replace('\\', '_')[:50]  # Ограничиваем длину
            filename = f"{safe_nickname}_{timestamp_str}.json"
            filepath = os.path.join(logs_dir, filename)

            # Создаем структуру данных для сохранения
            result_data = {
                "timestamp": timestamp_str,
                "nickname": nickname,
                "image_info": {
                    "size": image_size,
                    "size_mb": round(len(str(image_size)) / (1024 * 1024), 2) if image_size else 0
                },
                "fastvlm_analysis": {
                    "response": clean_analysis,
                    "processing_time_seconds": round(fastvlm_time, 2),
                    "response_length": len(clean_analysis) if clean_analysis else 0
                },
                "gemini_analysis": {
                    "response": gemini_response,
                    "processing_time_seconds": round(gemini_time, 2) if gemini_time else 0,
                    "response_length": len(gemini_response) if gemini_response else 0
                },
                "total_processing_time": round(fastvlm_time + (gemini_time or 0), 2)
            }

            # Сохраняем в JSON файл
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(result_data, f, ensure_ascii=False, indent=2)

            self.logger.info(f"Результаты анализа сохранены: {filepath}")
            return filepath

        except Exception as e:
            self.logger.error(f"Ошибка сохранения результатов анализа: {e}")
            return None
    
    def handle_analyze_request(self, data: dict) -> tuple[dict, int]:
        """
        Обработка запроса на полный анализ изображения
        
        Args:
            data: Данные запроса (image_base64, nickname, topic)
        
        Returns:
            Tuple (result_dict, http_status_code)
        """
        try:
            # Валидация данных
            if not data or 'image_base64' not in data:
                return {
                    'success': False,
                    'error': 'No image provided'
                }, 400

            image_base64 = data['image_base64']
            nickname = data.get('nickname', 'unknown_user')
            topic = data.get('topic', 'casual')

            # Предобработка изображения
            try:
                image_data = base64.b64decode(image_base64)
                image = Image.open(io.BytesIO(image_data))

                # Быстрая предобработка для мобильных фотографий
                from image_preprocessing import fast_mobile_preprocess
                image, image_base64, metadata = fast_mobile_preprocess(
                    image.convert("RGB"),
                    target_width=1008,
                    target_height=1344,
                    quality=95
                )

                # Логируем предобработку
                original_size_mb = len(image_data) / (1024 * 1024)
                self.logger.info(f"Быстрая предобработка: {metadata['original_size']} → {metadata['final_size']} пикселей, {original_size_mb:.2f} MB → {metadata['compressed_size_mb']:.2f} MB, пользователь: {nickname}")

            except Exception as e:
                self.logger.error(f"Ошибка декодирования изображения: {e}")
                return {
                    'success': False,
                    'error': f'Invalid image data: {e}'
                }, 400

            # Выполняем полный анализ
            result = self.analyze_full(image_base64, nickname, topic)
            
            if not result.get('success'):
                return result, 500

            # Сохраняем результаты
            self.save_analysis_with_nickname(
                result['technical_analysis'],
                result['analysis'],
                nickname,
                image.size,
                result['timing']['fastvlm_time'],
                result['timing']['stylist_time']
            )

            return result, 200

        except Exception as e:
            self.logger.error(f"Ошибка анализа: {e}")
            self.logger.error(f"Traceback: {traceback.format_exc()}")
            return {
                'success': False,
                'error': str(e)
            }, 500
    
    def handle_analyze_gemini_request(self, data: dict) -> tuple[dict, int]:
        """
        Обработка запроса на прямой анализ через Gemini (без FastVLM)
        
        Args:
            data: Данные запроса (image_base64, nickname, topic)
        
        Returns:
            Tuple (result_dict, http_status_code)
        """
        try:
            # Валидация данных
            if not data or 'image_base64' not in data:
                return {
                    'success': False,
                    'error': 'No image provided'
                }, 400

            image_base64 = data['image_base64']
            nickname = data.get('nickname', 'unknown_user')
            topic = data.get('topic', 'casual')

            # Удаляем префикс data:image если есть
            if image_base64.startswith('data:image'):
                image_base64 = image_base64.split(',', 1)[1] if ',' in image_base64 else image_base64

            # Предобработка изображения
            try:
                image_data = base64.b64decode(image_base64)
                image = Image.open(io.BytesIO(image_data))

                # Быстрая предобработка для мобильных фотографий
                from image_preprocessing import fast_mobile_preprocess
                
                # Определяем ориентацию и подбираем правильные размеры
                width, height = image.size
                is_portrait = height > width
                
                if is_portrait:
                    # Для портретных фото: высота больше ширины
                    target_w, target_h = 1008, 1344
                else:
                    # Для ландшафтных фото: ширина больше высоты
                    target_w, target_h = 1344, 1008
                
                image, processed_base64, metadata = fast_mobile_preprocess(
                    image.convert("RGB"),
                    target_width=target_w,
                    target_height=target_h,
                    quality=95
                )

                original_size_mb = len(image_data) / (1024 * 1024)
                orientation = "портрет" if is_portrait else "ландшафт"
                self.logger.info(f"📸 Предобработка ({orientation}): {metadata['original_size']} → {metadata['final_size']} пикселей, {original_size_mb:.2f} MB → {metadata['compressed_size_mb']:.2f} MB")

            except Exception as e:
                self.logger.error(f"Ошибка декодирования изображения: {e}")
                return {
                    'success': False,
                    'error': f'Invalid image data: {e}'
                }, 400

            # Выполняем прямой анализ через Gemini
            result = self.analyze_gemini_direct(processed_base64, nickname, topic)
            
            if not result.get('success'):
                return result, 500

            # Сохраняем результат для сравнения
            try:
                logs_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'logs')
                os.makedirs(logs_dir, exist_ok=True)

                timestamp_str = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
                safe_nickname = nickname.replace('/', '_').replace('\\', '_')[:50]
                filename = f"gemini_direct_{safe_nickname}_{timestamp_str}.json"
                filepath = os.path.join(logs_dir, filename)

                result_data = {
                    "timestamp": timestamp_str,
                    "nickname": nickname,
                    "topic": topic,
                    "method": "gemini_direct",
                    "image_info": {
                        "original_size": metadata['original_size'],
                        "final_size": metadata['final_size'],
                        "compressed_size_mb": metadata['compressed_size_mb']
                    },
                    "gemini_response": result['analysis'],
                    "timing": result['timing'],
                    "response_length": len(result['analysis'])
                }

                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(result_data, f, ensure_ascii=False, indent=2)

                self.logger.info(f"💾 Результат сохранен: {filepath}")

            except Exception as e:
                self.logger.error(f"Ошибка сохранения результата: {e}")

            # Добавляем image_info в результат
            result['image_info'] = {
                'original_size': metadata['original_size'],
                'final_size': metadata['final_size'],
                'compressed_size_mb': metadata['compressed_size_mb']
            }

            return result, 200

        except Exception as e:
            self.logger.error(f"Ошибка прямого анализа через Gemini: {e}")
            self.logger.error(f"Traceback: {traceback.format_exc()}")
            return {
                'success': False,
                'error': str(e)
            }, 500
