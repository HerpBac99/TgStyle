#!/usr/bin/env python3
"""
FastVLM Server - отдельный сервер для анализа изображений
Запускается в отдельном процессе от основного приложения

Особенности:
- GPU/CPU автоопределение и переключение
- Мониторинг производительности
- Graceful shutdown с очисткой памяти
- Детальное логирование
"""

import sys
import json
import base64
import tempfile
import signal
import time
import logging
import traceback
import uuid
import gc
from logging.handlers import RotatingFileHandler
from flask import Flask, request, jsonify
from PIL import Image
import io
import os
import psutil
from contextlib import contextmanager

# Импортируем waitress для многопоточного сервера
from waitress import serve

# Импортируем конфигурацию
from config import Config

# Импортируем необходимые модули для FastVLM
import torch

# Импортируем FastVLM
sys.path.append('./models/ml-fastvlm')
from llava.utils import disable_torch_init
from llava.conversation import conv_templates
from llava.model.builder import load_pretrained_model
from llava.mm_utils import tokenizer_image_token, process_images, get_model_name_from_path
from llava.constants import IMAGE_TOKEN_INDEX, DEFAULT_IMAGE_TOKEN, DEFAULT_IM_START_TOKEN, DEFAULT_IM_END_TOKEN

# Импортируем Gemini API

# Импортируем модуль умной предобработки изображений
from image_preprocessing import smart_preprocess_image

# Импортируем модуль удаления фона
from background_removal import BackgroundRemover

try:
    from google import genai
    from google.genai import types
    GEMINI_AVAILABLE = True
    print("✅ Google GenAI library loaded successfully")
except ImportError as e:
    GEMINI_AVAILABLE = False
    print(f"⚠️  Google GenAI library not available: {e}")
    print("Install with: pip install google-genai")

# Импортируем requests для Ollama API
try:
    import requests
    REQUESTS_AVAILABLE = True
    print("✅ Requests library loaded successfully")
except ImportError as e:
    REQUESTS_AVAILABLE = False
    print(f"⚠️  Requests library not available: {e}")
    print("Install with: pip install requests")

app = Flask(__name__)

# Глобальные переменные для модели
model = None
tokenizer = None
image_processor = None
context_len = None

# Глобальные переменные для Gemini
gemini_client = None

# Глобальные переменные для Ollama
ollama_available = False
ollama_url = "http://127.0.0.1:11434"
ollama_model = "gemma3:4b"  # Лучшая модель для стилистики - баланс скорости и качества

# Глобальная переменная для BackgroundRemover
background_remover = None

# Глобальные переменные для промптов
default_prompt = None
style_prompt = None
person_prompt = None
clothing_prompt = None
legs_prompt = None
shoes_prompt = None
accessories_head_prompt = None
accessories_hand_prompt = None
class_prompt = None

# Директория для сохранения результатов FastVLM
FASTVLM_RESULTS_DIR = os.path.join(os.path.dirname(__file__), 'results')

# Статистика производительности
performance_stats = {
    'total_requests': 0,
    'successful_requests': 0,
    'failed_requests': 0,
    'total_processing_time': 0.0,
    'average_processing_time': 0.0,
    'gpu_enabled': False,
    'model_loaded_at': None
}

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
                app.logger.debug(f"GPU memory freed: {(final_memory - initial_memory) / 1024**2:.1f}MB")

def update_performance_stats(processing_time, success=True):
    """Обновление статистики производительности"""
    global performance_stats
    
    performance_stats['total_requests'] += 1
    if success:
        performance_stats['successful_requests'] += 1
        performance_stats['total_processing_time'] += processing_time
        performance_stats['average_processing_time'] = (
            performance_stats['total_processing_time'] / performance_stats['successful_requests']
        )
    else:
        performance_stats['failed_requests'] += 1

def setup_logging():
    """Настройка логирования для FastVLM сервера (унифицированная версия)"""
    Config.ensure_directories()
    log_file = os.path.join(Config.LOG_DIR, 'fastvlm.log')

    # Создаем форматтер
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    # Создаем ротирующий обработчик
    handler = RotatingFileHandler(
        log_file,
        maxBytes=Config.LOG_MAX_BYTES,
        backupCount=Config.LOG_BACKUP_COUNT,
        encoding='utf-8'
    )
    handler.setFormatter(formatter)

    # Отключаем Flask's default handlers
    app.logger.handlers.clear()

    # Создаем консольный handler только для вывода в терминал (без дублирования в файл)
    console_formatter = logging.Formatter('%(levelname)s:%(name)s:%(message)s')
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(console_formatter)
    console_handler.setLevel(logging.INFO)

    # Настраиваем логгер приложения с файловым и консольным handler'ами
    app.logger.addHandler(handler)
    app.logger.addHandler(console_handler)
    app.logger.setLevel(getattr(logging, Config.LOG_LEVEL))

    # Настраиваем корневой логгер только с файловым handler'ом
    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(getattr(logging, Config.LOG_LEVEL))

    app.logger.debug(f"Логирование FastVLM настроено: {log_file}")

def load_prompts():
    """Загрузка промптов для анализа"""
    global default_prompt, style_prompt, person_prompt, clothing_prompt, legs_prompt, shoes_prompt, accessories_head_prompt, accessories_hand_prompt, class_prompt

    try:
        # Загружаем промпты для многопроходного анализа
        prompt_dir = os.path.join(os.path.dirname(__file__), 'prompt')

        # PERSON промпт
        person_file = os.path.join(prompt_dir, 'PERSON_PROMPT.md')
        if os.path.exists(person_file):
            with open(person_file, 'r', encoding='utf-8') as f:
                person_prompt = f.read().strip()
        else:
            person_prompt = "Describe the person in the photograph. Provide the person's approximate age and gender."
            app.logger.warning(f"PERSON промпт не найден: {person_file}")

        # CLOTHING промпт
        clothing_file = os.path.join(prompt_dir, 'CLOTHING_PROMPT.md')
        if os.path.exists(clothing_file):
            with open(clothing_file, 'r', encoding='utf-8') as f:
                clothing_prompt = f.read().strip()
        else:
            clothing_prompt = "Describe the clothing on the person."
            app.logger.warning(f"CLOTHING промпт не найден: {clothing_file}")

        # LEG промпт
        leg_file = os.path.join(prompt_dir, 'LEG_PROMPT.md')
        if os.path.exists(leg_file):
            with open(leg_file, 'r', encoding='utf-8') as f:
                legs_prompt = f.read().strip()
        else:
            legs_prompt = "Describe the clothing on the person's legs."
            app.logger.warning(f"LEG промпт не найден: {leg_file}")

        # SHOES промпт
        shoes_file = os.path.join(prompt_dir, 'SHOES_PROMPT.md')
        if os.path.exists(shoes_file):
            with open(shoes_file, 'r', encoding='utf-8') as f:
                shoes_prompt = f.read().strip()
        else:
            shoes_prompt = "Describe the shoes on the person."
            app.logger.warning(f"SHOES промпт не найден: {shoes_file}")

        # ACCESSORIES HEAD промпт
        accessories_head_file = os.path.join(prompt_dir, 'ACCESSORIES_HEAD_PROMPT.md')
        if os.path.exists(accessories_head_file):
            with open(accessories_head_file, 'r', encoding='utf-8') as f:
                accessories_head_prompt = f.read().strip()
        else:
            accessories_head_prompt = "Focus on the person's head, face, ears, and neck area and LIST all VISIBLE accessories (glasses, earrings, necklace)."
            app.logger.warning(f"ACCESSORIES HEAD промпт не найден: {accessories_head_file}")

        # ACCESSORIES HAND промпт
        accessories_hand_file = os.path.join(prompt_dir, 'ACCESSORIES_HAND_PROMPT.md')
        if os.path.exists(accessories_hand_file):
            with open(accessories_hand_file, 'r', encoding='utf-8') as f:
                accessories_hand_prompt = f.read().strip()
        else:
            accessories_hand_prompt = "Focus on the person's wrists, hands, and fingers area and LIST all VISIBLE accessories (watch, rings, bracelets)."
            app.logger.warning(f"ACCESSORIES HAND промпт не найден: {accessories_hand_file}")

        # Основной промпт (для обратной совместимости)
        default_prompt = "Analyze the clothing and style in this image."

        # Стилевой промпт
        style_prompt_file = os.path.join(os.path.dirname(__file__), 'style_prompt.md')
        if os.path.exists(style_prompt_file):
            with open(style_prompt_file, 'r', encoding='utf-8') as f:
                style_prompt = f.read().strip()
        else:
            style_prompt = default_prompt
            app.logger.warning(f"Файл стиля промпта не найден: {style_prompt_file}. Используется основной промпт")

        # CLASS промпт для классификации одежды
        class_prompt_file = os.path.join(prompt_dir, 'CLASS_PROMPT.md')
        if os.path.exists(class_prompt_file):
            with open(class_prompt_file, 'r', encoding='utf-8') as f:
                class_prompt = f.read().strip()
        else:
            class_prompt = "Analyze the clothing item in the photograph and provide a strict answer in this format:\n1. [Type of clothing]\n2. [Subtype of clothing]\n3. [Color]\n4. [Material]\n5. [Fit]\n6. [Style]"
            app.logger.warning(f"CLASS промпт не найден: {class_prompt_file}")

        app.logger.info("Промпты загружены успешно")

    except Exception as e:
        app.logger.error(f"Ошибка загрузки промптов: {e}")
        default_prompt = "Describe the clothing in this image." 
        clothing_prompt = "Describe the clothing on the person."
        shoes_prompt = "Describe the shoes on the person."
        accessories_head_prompt = "Focus on the person's head, face, ears, and neck area and LIST all VISIBLE accessories (glasses, earrings, necklace)."
        accessories_hand_prompt = "Focus on the person's wrists, hands, and fingers area and LIST all VISIBLE accessories (watch, rings, bracelets)."
        style_prompt = default_prompt
        person_prompt = "Describe the person."
        class_prompt = "Analyze the clothing item in the photograph and provide a strict answer in this format:\n1. [Type of clothing]\n2. [Subtype of clothing]\n3. [Color]\n4. [Material]\n5. [Fit]\n6. [Style]"


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

def perform_multi_pass_analysis(image_base64: str, nickname: str) -> dict:
    """Выполняет многопроходный анализ изображения через FastVLM"""
    global person_prompt, clothing_prompt, legs_prompt, shoes_prompt, accessories_head_prompt, accessories_hand_prompt

    app.logger.info(f"Начинаем многопроходный анализ для пользователя {nickname}")

    # Временные переменные для результатов
    person_result = ""
    clothing_result = ""
    legs_result = ""
    shoes_result = ""
    accessories_head_result = ""
    accessories_hand_result = ""
    timing = {"person": 0, "clothing": 0, "legs": 0, "shoes": 0, "accessories_head": 0, "accessories_hand": 0, "total": 0}

    total_start_time = time.time()

    try:
        # Pass 1: Person analysis
        if person_prompt:
            pass1_start = time.time()
            person_response, error = analyze_image_fastvlm(image_base64, person_prompt)
            if error:
                person_response = "Не удалось определить информацию о человеке"
            person_result = extract_text(person_response)
            timing["person"] = time.time() - pass1_start

        # Pass 2: Top clothing analysis
        if clothing_prompt:
            pass2_start = time.time()
            clothing_response, error = analyze_image_fastvlm(image_base64, clothing_prompt)
            if error:
                clothing_response = "Не удалось определить верхнюю одежду"
            clothing_result = extract_text(clothing_response)
            timing["clothing"] = time.time() - pass2_start

        # Pass 3: Legs clothing analysis
        if legs_prompt:
            pass3_start = time.time()
            legs_response, error = analyze_image_fastvlm(image_base64, legs_prompt)
            if error:
                legs_response = "Не удалось определить одежду на ногах"
            legs_result = extract_text(legs_response)
            timing["legs"] = time.time() - pass3_start
        else:
            app.logger.warning(f"legs_prompt is falsy: '{legs_prompt}' (type: {type(legs_prompt)})")

        # Pass 4: Shoes analysis
        if shoes_prompt:
            pass4_start = time.time()
            shoes_response, error = analyze_image_fastvlm(image_base64, shoes_prompt)
            if error:
                shoes_response = "Не удалось определить обувь"
            shoes_result = extract_text(shoes_response)
            timing["shoes"] = time.time() - pass4_start

        # Pass 5: Head accessories analysis
        if accessories_head_prompt:
            pass5_start = time.time()
            accessories_head_response, error = analyze_image_fastvlm(image_base64, accessories_head_prompt)
            if error:
                accessories_head_response = "Не удалось определить аксессуары на голове/шее"
            accessories_head_result = extract_text(accessories_head_response)
            timing["accessories_head"] = time.time() - pass5_start

        # Pass 6: Hand accessories analysis
        if accessories_hand_prompt:
            pass6_start = time.time()
            accessories_hand_response, error = analyze_image_fastvlm(image_base64, accessories_hand_prompt)
            if error:
                accessories_hand_response = "Не удалось определить аксессуары на руках/запястьях"
            accessories_hand_result = extract_text(accessories_hand_response)
            timing["accessories_hand"] = time.time() - pass6_start

        timing["total"] = time.time() - total_start_time

        app.logger.info(f"Многопроходный анализ завершен за {timing['total']:.2f}с")

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
        app.logger.error(f"Ошибка в многопроходном анализе: {e}")
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

def analyze_image_fastvlm(image_base64, prompt_text=None, force_structured=False):
    """Анализ изображения с помощью FastVLM модели (унифицированная версия)"""
    try:
        if not all([model, tokenizer, image_processor]):
            return None, "Модель не загружена"

        # Используем промпт или дефолтный
        if not prompt_text:
            prompt_text = default_prompt

        # Декодируем изображение
        image_data = base64.b64decode(image_base64)
        image = Image.open(io.BytesIO(image_data)).convert('RGB')

        # Подготавливаем промпт
        qs = prompt_text
        if model.config.mm_use_im_start_end:
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
            prompt, tokenizer, IMAGE_TOKEN_INDEX, return_tensors='pt'
        ).unsqueeze(0).to(Config.DEVICE)

        # Обработка изображения
        image_tensor = process_images([image], image_processor, model.config)[0]

        # Очищаем кеш модели для предсказуемых результатов
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        
        # Генерация с оптимизациями
        with gpu_memory_manager():
            with torch.inference_mode():
                output_ids = model.generate(
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
                    pad_token_id=tokenizer.pad_token_id,
                    eos_token_id=tokenizer.eos_token_id
                )

        # Декодируем результат
        outputs = tokenizer.batch_decode(output_ids, skip_special_tokens=True)[0].strip()

        # Очищаем результат от исходного промпта
        if prompt in outputs:
            outputs = outputs.replace(prompt, "").strip()

        # Удаляем стоп-последовательности
        for stop_seq in Config.STOP_SEQUENCES:
            if stop_seq in outputs:
                outputs = outputs.split(stop_seq)[0].strip()

        return outputs, None

    except Exception as e:
        app.logger.error(f"Ошибка анализа изображения: {e}")
        app.logger.error(traceback.format_exc())
        return None, str(e)

def check_ollama_availability():
    """Проверяет доступность Ollama API"""
    global ollama_available

    try:
        if not REQUESTS_AVAILABLE:
            app.logger.warning("Requests library недоступна. Ollama функции отключены.")
            ollama_available = False
            return False

        # Проверяем доступность Ollama API
        response = requests.get(f"{ollama_url}/api/tags", timeout=5)
        if response.status_code == 200:
            models = response.json().get('models', [])
            model_names = [model['name'] for model in models]
            if ollama_model in model_names:
                ollama_available = True
                app.logger.info(f"Ollama доступен. Модель {ollama_model} найдена. Доступные модели: {model_names}")
                return True
            else:
                app.logger.warning(f"Ollama доступен, но модель {ollama_model} не найдена. Доступные модели: {model_names}")
                ollama_available = False
                return False
        else:
            app.logger.warning(f"Ollama API недоступен (статус: {response.status_code})")
            ollama_available = False
            return False

    except Exception as e:
        app.logger.error(f"Ошибка проверки Ollama: {e}")
        ollama_available = False
        return False

def create_stylist_response_ollama(multi_pass_analysis, topic='casual'):
    """Создает креативный ответ ИИ стилиста через Ollama"""
    global ollama_available, ollama_url, ollama_model, style_prompt

    if not ollama_available:
        app.logger.warning("Ollama недоступен, используем базовый анализ FastVLM")
        return multi_pass_analysis

    try:
        app.logger.info(f"Генерация креативного ответа стилиста через Ollama API (тема: {topic})")

        # Используем промпт из файла style_prompt.md
        formatted_prompt = style_prompt.replace('{fastvlm_analysis}', multi_pass_analysis).replace('{theme}', topic)

        # Логируем отправку запроса в Ollama
        app.logger.info(f"Отправка запроса в Ollama (промпт: {len(formatted_prompt)} символов, модель: {ollama_model})")

        ollama_request_start = time.time()

        # Создаем запрос к Ollama API
        payload = {
            "model": ollama_model,
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
            f"{ollama_url}/api/generate",
            json=payload,
            timeout=60
        )

        if response.status_code != 200:
            raise Exception(f"Ollama API error: {response.status_code} - {response.text}")

        result = response.json()
        creative_response = result.get('response', '').strip()

        ollama_request_time = time.time() - ollama_request_start

        # Логируем успешный ответ от Ollama
        app.logger.info(f"Ollama ответил успешно: {len(creative_response)} символов за {ollama_request_time:.2f} сек")

        return creative_response

    except Exception as e:
        app.logger.error(f"Ошибка создания ответа через Ollama: {e}")
        # Fallback на оригинальный анализ FastVLM
        return multi_pass_analysis

def initialize_gemini():
    """Инициализация Gemini API клиента"""
    global gemini_client

    try:
        if not GEMINI_AVAILABLE:
            app.logger.warning("Google GenAI library not available. Install with: pip install google-genai")
            return False

        if not Config.STYLIST_GEMINI_API_KEY:
            app.logger.warning("FASTVLM_STYLIST_GEMINI_API_KEY не установлен. Gemini функции недоступны.")
            return False

        # Создаем клиента Gemini
        gemini_client = genai.Client(api_key=Config.STYLIST_GEMINI_API_KEY)
        app.logger.debug(f"Gemini API клиент инициализирован (модель: {Config.STYLIST_GEMINI_MODEL})")
        return True

    except Exception as e:
        app.logger.error(f"Ошибка инициализации Gemini API: {e}")
        return False

def create_stylist_response_gemini(multi_pass_analysis, topic='casual'):
    """Создает креативный ответ ИИ стилиста через Gemini API"""
    global gemini_client, style_prompt

    if not gemini_client:
        app.logger.warning("Gemini клиент недоступен, используем базовый анализ FastVLM")
        return multi_pass_analysis

    try:
        app.logger.info(f"Генерация креативного ответа стилиста через Gemini API (тема: {topic})")

        # Используем промпт из файла style_prompt.md
        formatted_prompt = style_prompt.replace('{fastvlm_analysis}', multi_pass_analysis).replace('{theme}', topic)

        # Логируем отправку запроса в Gemini
        app.logger.info(f"Отправка запроса в Gemini (промпт: {formatted_prompt}, модель: {Config.STYLIST_GEMINI_MODEL})")

        gemini_request_start = time.time()

        # Создаем запрос к Gemini API
        response = gemini_client.models.generate_content(
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

        app.logger.info(f"Ответ от Gemini: {creative_response}")

        gemini_request_time = time.time() - gemini_request_start

        # Логируем успешный ответ от Gemini
        app.logger.info(f"Gemini ответил успешно: {len(creative_response)} символов за {gemini_request_time:.2f} сек")

        return creative_response

    except Exception as e:
        app.logger.error(f"Ошибка создания ответа через Gemini: {e}")
        # Fallback на оригинальный анализ FastVLM
        return multi_pass_analysis

def create_stylist_response(multi_pass_analysis, topic='casual'):
    """Создает креативный ответ ИИ стилиста в зависимости от выбранного типа"""
    global ollama_available, gemini_client, style_prompt

    app.logger.info(f"Создание ответа стилиста. Выбран тип: {Config.STYLIST_TYPE}, тема: {topic}")

    # Выбираем стилиста в зависимости от конфигурации
    if Config.STYLIST_TYPE == 'ollama' and ollama_available:
        app.logger.info(f"Используем Ollama для создания ответа стилиста (выбранный тип: {Config.STYLIST_TYPE})")
        response = create_stylist_response_ollama(multi_pass_analysis, topic)
        if response and response != multi_pass_analysis:  # Проверяем, что это не fallback
            return response
        app.logger.warning("Ollama не дал качественный ответ")

    elif Config.STYLIST_TYPE == 'gemini' and gemini_client:
        app.logger.info(f"Используем Gemini для создания ответа стилиста (выбранный тип: {Config.STYLIST_TYPE})")
        return create_stylist_response_gemini(multi_pass_analysis, topic)


    # Fallback логика - пробуем все доступные варианты
    app.logger.warning(f"Выбранный стилист {Config.STYLIST_TYPE} недоступен, пробуем альтернативы")

    if ollama_available:
        app.logger.info("Fallback на Ollama")
        response = create_stylist_response_ollama(multi_pass_analysis, topic)
        if response and response != multi_pass_analysis:
            return response

    if gemini_client:
        app.logger.info("Fallback на Gemini")
        return create_stylist_response_gemini(multi_pass_analysis, topic)

    # Если ничего не сработало, возвращаем базовый анализ
    app.logger.warning("Ни Ollama, ни Gemini недоступны, используем базовый анализ FastVLM")
    return multi_pass_analysis

def load_model():
    """Загрузка FastVLM модели с оптимизациями (унифицированная версия)"""
    global model, tokenizer, image_processor, context_len

    try:
        app.logger.info("Начинаем загрузку FastVLM модели...")
        start_time = time.time()

        # Отключаем инициализацию torch
        disable_torch_init()

        # Получаем имя модели
        model_name = get_model_name_from_path(Config.MODEL_PATH)
        app.logger.info(f"Загружаем модель: {model_name}")

        # Загружаем модель с автоматической квантизацией для 8GB GPU
        app.logger.info(f"4-bit квантизация: {getattr(Config, 'USE_4BIT', False)}")
        app.logger.info(f"8-bit квантизация: {getattr(Config, 'USE_8BIT', False)}")

        with gpu_memory_manager():
            tokenizer, model, image_processor, context_len = load_pretrained_model(
                model_path=Config.MODEL_PATH,
                model_base=None,
                model_name=model_name,
                device=Config.DEVICE,
                load_4bit=getattr(Config, 'USE_4BIT', False),  # Автоматически для GPU < 12GB
                load_8bit=getattr(Config, 'USE_8BIT', False)
            )

        # Настройки модели для оптимизации
        if hasattr(model.config, 'use_cache'):
            model.config.use_cache = True

        # Устанавливаем pad_token_id для генерации
        if hasattr(model, 'generation_config') and model.generation_config:
            model.generation_config.pad_token_id = tokenizer.pad_token_id

        # Переводим модель в режим inference
        model.eval()

        # Flash Attention если доступен
        if hasattr(model.config, 'attn_implementation'):
            model.config.attn_implementation = Config.ATTENTION_IMPLEMENTATION
            app.logger.info(f"Использование Flash Attention: {Config.ATTENTION_IMPLEMENTATION}")

        loading_time = time.time() - start_time
        performance_stats['model_loading_time'] = loading_time

        app.logger.info(f"FastVLM модель загружена успешно за {loading_time:.2f}с")
        app.logger.info(f"Контекстная длина: {context_len}")

        if torch.cuda.is_available():
            memory_mb = torch.cuda.memory_allocated() / 1024 / 1024
            app.logger.debug(f"GPU память занята: {memory_mb:.1f} MB")

        return True

    except Exception as e:
        app.logger.error(f"Ошибка загрузки FastVLM модели: {e}")
        app.logger.error(traceback.format_exc())
        return False

def save_fastvlm_result(clean_analysis, raw_output, image_debug):
    """Сохраняет результат FastVLM в JSON файл"""
    try:
        # Создаем директорию если не существует
        os.makedirs(FASTVLM_RESULTS_DIR, exist_ok=True)

        # Парсим clean_analysis как JSON если это строка
        try:
            if isinstance(clean_analysis, str):
                result_data = json.loads(clean_analysis)
            else:
                result_data = clean_analysis
        except json.JSONDecodeError:
            # Если не JSON, сохраняем как есть
            result_data = {"raw_text": clean_analysis}

        # Сохраняем в JSON файл
        timestamp = int(time.time())
        filename = f"fastvlm_result_{timestamp}.json"
        filepath = os.path.join(FASTVLM_RESULTS_DIR, filename)

        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(result_data, f, ensure_ascii=False, indent=2)

        app.logger.debug(f"Результат FastVLM сохранен: {filepath}")
        return filepath

    except Exception as e:
        app.logger.error(f"Ошибка сохранения результата FastVLM: {e}")
        return None

def save_analysis_with_nickname(clean_analysis, gemini_response, nickname, image_size, fastvlm_time, gemini_time):
    """Сохраняет результаты анализа FastVLM и Gemini с nickname в LOGS_DIR"""
    try:
        # Создаем директорию logs если не существует
        logs_dir = os.path.join(os.path.dirname(__file__), 'logs')
        os.makedirs(logs_dir, exist_ok=True)

        # Форматируем время для имени файла
        from datetime import datetime
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
                "size_mb": round(len(image_size) / (1024 * 1024), 2) if image_size else 0
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

        app.logger.info(f"Результаты анализа сохранены: {filepath}")
        return filepath

    except Exception as e:
        app.logger.error(f"Ошибка сохранения результатов анализа: {e}")
        return None

@app.route('/health', methods=['GET'])
def health():
    """Проверка здоровья сервера"""
    try:
        # Определяем текущее устройство модели
        current_device = 'unknown'
        if model is not None:
            current_device = str(model.device) if hasattr(model, 'device') else 'cpu'
        
        health_data = {
            'status': 'healthy',
            'model_loaded': model is not None,
            'timestamp': time.time(),
            'device': current_device,
            'gpu_available': torch.cuda.is_available(),
            'torch_version': torch.__version__,
            'performance': performance_stats
        }

        app.logger.debug("Health check requested")
        return jsonify(health_data)

    except Exception as e:
        app.logger.error(f"Health check error: {e}")
        return jsonify({
            'status': 'error',
            'error': str(e),
            'timestamp': time.time()
        }), 500

@app.route('/stats', methods=['GET'])
def get_stats():
    """Подробная статистика сервера"""
    try:
        current_device = 'unknown'
        if model is not None:
            current_device = str(model.device) if hasattr(model, 'device') else 'cpu'
        
        uptime = time.time() - performance_stats.get('model_loaded_at', time.time())
        
        stats = {
            'server_status': {
                'uptime_seconds': uptime,
                'model_loaded': model is not None,
                'current_device': current_device,
                'gpu_available': torch.cuda.is_available()
            },
            'performance': performance_stats,
            'system': {
                'cpu_percent': psutil.cpu_percent(interval=1),
                'memory_percent': psutil.virtual_memory().percent,
                'memory_used_gb': round(psutil.virtual_memory().used / (1024**3), 2),
                'memory_total_gb': round(psutil.virtual_memory().total / (1024**3), 2)
            }
        }
        
        # Добавляем GPU статистику если доступно
        if torch.cuda.is_available():
            stats['gpu'] = {
                'name': torch.cuda.get_device_name(0),
                'memory_allocated_gb': round(torch.cuda.memory_allocated(0) / (1024**3), 2),
                'memory_reserved_gb': round(torch.cuda.memory_reserved(0) / (1024**3), 2),
                'memory_total_gb': round(torch.cuda.get_device_properties(0).total_memory / (1024**3), 2)
            }
        
        return jsonify(stats)
        
    except Exception as e:
        app.logger.error(f"Stats error: {e}")
        return jsonify({
            'error': str(e),
            'timestamp': time.time()
        }), 500

@app.route('/analyze', methods=['POST'])
def analyze():
    """Анализ изображения с мониторингом производительности"""
    analysis_start_time = time.time()

    try:
        if model is None:
            update_performance_stats(0, success=False)
            return jsonify({
                'success': False,
                'error': 'Model not loaded'
            }), 500

        # Получаем данные
        data = request.get_json()
        if not data or 'image_base64' not in data:
            update_performance_stats(0, success=False)
            return jsonify({
                'success': False,
                'error': 'No image provided'
            }), 400

        image_base64 = data['image_base64']
        prompt = data.get('prompt', default_prompt)
        use_gpu = data.get('force_gpu', torch.cuda.is_available())
        nickname = data.get('nickname', 'unknown_user')  # Получаем nickname из запроса
        topic = data.get('topic', 'casual')  # Получаем тему анализа

        app.logger.debug(f"Начало анализа изображения (устройство: {model.device})")

        # Декодируем изображение
        try:
            image_data = base64.b64decode(image_base64)
            image = Image.open(io.BytesIO(image_data))

            # Быстрая предобработка для мобильных фотографий
            from image_preprocessing import fast_mobile_preprocess
            image, image_base64, metadata = fast_mobile_preprocess(
                image.convert("RGB"),
                target_width=1344,
                target_height=1008,
                quality=95
            )

            # Логируем быструю обработку
            original_size_mb = len(image_data) / (1024 * 1024)
            app.logger.info(f"Быстрая предобработка: {metadata['original_size']} → {metadata['final_size']} пикселей, {original_size_mb:.2f} MB → {metadata['compressed_size_mb']:.2f} MB, пользователь: {nickname}")


        except Exception as e:
            update_performance_stats(time.time() - analysis_start_time, success=False)
            app.logger.error(f"Ошибка декодирования изображения: {e}")
            return jsonify({
                'success': False,
                'error': f'Invalid image data: {e}'
            }), 400

        # Выполняем многопроходный анализ изображения
        app.logger.info(f"Выполняем многопроходный анализ изображения для пользователя {nickname}")

        # Выполняем анализ по 3 промптам для детального разбора
        multi_pass_result = perform_multi_pass_analysis(image_base64, nickname)

        # Проверяем, что результат является словарем
        if not isinstance(multi_pass_result, dict):
            update_performance_stats(time.time() - analysis_start_time, success=False)
            app.logger.error(f"Multi-pass analysis returned invalid result: {type(multi_pass_result)}")
            return jsonify({
                'success': False,
                'error': 'Invalid multi-pass analysis result'
            }), 500

        if not multi_pass_result.get('success', False):
            update_performance_stats(time.time() - analysis_start_time, success=False)
            return jsonify({
                'success': False,
                'error': multi_pass_result.get('error', 'Multi-pass analysis failed')
            }), 500

        # Объединяем результаты анализа
        combined_analysis = f"""
ЧЕЛОВЕК: {multi_pass_result.get('person', 'Не определено')}
ОДЕЖДА: {multi_pass_result.get('clothing', 'Не определено')}
НОГИ: {multi_pass_result.get('legs', 'Не определено')}
ОБУВЬ: {multi_pass_result.get('shoes', 'Не определено')}
АКСЕССУАРЫ_ГОЛОВА: {multi_pass_result.get('accessories_head', 'Не определено')}
АКСЕССУАРЫ_РУКИ: {multi_pass_result.get('accessories_hand', 'Не определено')}
"""

        fastvlm_time = multi_pass_result.get('timing', {}).get('total', 0)

        # Создаем креативный ответ стилиста
        gemini_start_time = time.time()
        stylist_response = create_stylist_response(combined_analysis, topic)
        gemini_time = time.time() - gemini_start_time

        total_time = time.time() - analysis_start_time

        performance_stats['successful_requests'] += 1
        # Обновляем среднее время ответа
        performance_stats['average_processing_time'] = (
            (performance_stats['average_processing_time'] * (performance_stats['successful_requests'] - 1) + total_time)
            / performance_stats['successful_requests']
        )

        app.logger.info(f"Полный анализ завершен за {total_time:.2f}с (FastVLM: {fastvlm_time:.2f}с, стилист: {gemini_time:.2f}с)")

        save_analysis_with_nickname(combined_analysis, stylist_response, nickname, image.size, fastvlm_time, gemini_time)

        return jsonify({
            'success': True,
            'technical_analysis': combined_analysis,  # Технический анализ FastVLM
            'analysis': stylist_response,  # Креативный ответ стилиста
            'model_used': 'fastvlm',
            'model_type': Config.MODEL_TYPE,
            'device': Config.DEVICE,
            'timing': {
                'total_time': round(total_time, 2),
                'fastvlm_time': round(fastvlm_time, 2),
                'stylist_time': round(gemini_time, 2)
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
        })


    except Exception as e:
        # Определяем переменные времени если они существуют
        total_time = time.time() - analysis_start_time

        update_performance_stats(total_time, success=False)
        error_msg = f"Ошибка анализа: {e}"
        app.logger.error(error_msg)
        app.logger.error(f"Traceback: {traceback.format_exc()}")

        # Собираем информацию о времени
        timing_debug = {'total_time': round(total_time, 2)}
        try:
            if 'inference_time' in locals():
                timing_debug['inference_time'] = round(inference_time, 2)
        except:
            pass

        return jsonify({
            'success': False,
            'error': str(e),
            'timing': timing_debug
        }), 500

@app.route('/analyze_for_test', methods=['POST'])
def analyze_for_test():
    """Анализ изображения для тестирования (только технический анализ FastVLM)"""
    analysis_start_time = time.time()

    try:
        if model is None:
            return jsonify({
                'success': False,
                'error': 'Model not loaded'
            }), 500

        # Получаем данные
        data = request.get_json()
        if not data or 'image_base64' not in data or 'prompt' not in data:
            return jsonify({
                'success': False,
                'error': 'No image or prompt provided'
            }), 400

        image_base64 = data['image_base64']
        prompt = data['prompt']
        nickname = data.get('nickname', 'test_user')

        # Декодируем изображение
        try:
            image_data = base64.b64decode(image_base64)
            image = Image.open(io.BytesIO(image_data))
        except Exception as e:
            app.logger.error(f"Ошибка декодирования изображения: {e}")
            return jsonify({
                'success': False,
                'error': f'Invalid image data: {e}'
            }), 400

        # Сохраняем во временный файл
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as temp_file:
            image.save(temp_file, 'JPEG', quality=100, optimize=False, subsampling=0)
            temp_image_path = temp_file.name

            # Выполняем только технический анализ FastVLM
            app.logger.info(f"Выполняем технический анализ изображения для пользователя {nickname}")

            fastvlm_start_time = time.time()
            technical_analysis, error = analyze_image_fastvlm(image_base64, prompt)
            fastvlm_time = time.time() - fastvlm_start_time

            if error:
                return jsonify({
                    'success': False,
                    'error': error,
                    'technical_analysis': '',
                    'analysis': '',
                    'timing': {
                        'total_time': round(time.time() - analysis_start_time, 2),
                        'fastvlm_time': round(fastvlm_time, 2),
                        'stylist_time': 0
                    }
                }), 500

            total_time = time.time() - analysis_start_time

            app.logger.info(f"Технический анализ завершен за {fastvlm_time:.2f}с")

            return jsonify({
                'success': True,
                'technical_analysis': technical_analysis,  # Результат FastVLM анализа
                'analysis': '',  # Пустая строка, так как стилист не вызывается
                'model_used': 'fastvlm',
                'model_type': Config.MODEL_TYPE,
                'device': Config.DEVICE,
                'timing': {
                    'total_time': round(total_time, 2),
                    'fastvlm_time': round(fastvlm_time, 2),
                    'stylist_time': 0  # Время стилиста = 0, так как он не вызывается
                }
            })


    except Exception as e:
        total_time = time.time() - analysis_start_time
        error_msg = f"Ошибка анализа: {e}"
        app.logger.error(error_msg)
        app.logger.error(f"Traceback: {traceback.format_exc()}")

        return jsonify({
            'success': False,
            'error': str(e),
            'technical_analysis': '',
            'analysis': '',
            'timing': {
                'total_time': round(total_time, 2),
                'fastvlm_time': 0,
                'stylist_time': 0
            }
        }), 500

@app.route('/load', methods=['GET'])
def get_load():
    """Проверка нагрузки сервера"""
    try:
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()

        load_data = {
            'cpu_percent': cpu_percent,
            'memory_percent': memory.percent,
            'memory_used_gb': round(memory.used / (1024**3), 2),
            'memory_total_gb': round(memory.total / (1024**3), 2),
            'timestamp': time.time()
        }

        app.logger.debug(f"Load check: CPU {cpu_percent}%, Memory {memory.percent}%")
        return jsonify(load_data)

    except Exception as e:
        app.logger.error(f"Load check error: {e}")
        return jsonify({
            'error': str(e),
            'timestamp': time.time()
        }), 500

@app.route('/gpu', methods=['GET'])
def get_gpu_debug():
    """Проверка работы на GPU"""
    try:
        if not torch.cuda.is_available():
            return jsonify({
                'gpu_available': False,
                'message': 'GPU не доступен',
                'device': 'cpu'
            })

        gpu_debug = {
            'gpu_available': True,
            'gpu_name': torch.cuda.get_device_name(0),
            'gpu_memory_allocated_mb': round(torch.cuda.memory_allocated(0) / (1024**2), 2),
            'gpu_memory_reserved_mb': round(torch.cuda.memory_reserved(0) / (1024**2), 2),
            'gpu_memory_total_mb': round(torch.cuda.get_device_properties(0).total_memory / (1024**2), 2),
            'device': 'cuda'
        }

        app.logger.debug(f"GPU debug: {gpu_debug['gpu_name']}")
        return jsonify(gpu_debug)

    except Exception as e:
        app.logger.error(f"GPU check error: {e}")
        return jsonify({
            'gpu_available': False,
            'error': str(e),
            'device': 'cpu'
        }), 500

@app.route('/model', methods=['GET'])
def get_model_debug():
    """Информация о загруженной модели"""
    try:
        if model is None:
            return jsonify({
                'loaded': False,
                'message': 'Модель не загружена'
            })

        model_debug = {
            'loaded': True,
            'model_name': model.config.model_type,
            'device': str(model.device),
            'context_length': context_len,
            'torch_dtype': str(Config.TORCH_DTYPE),
            'model_path': Config.MODEL_PATH
        }

        app.logger.debug(f"Model debug: {model_debug['model_name']}")
        return jsonify(model_debug)

    except Exception as e:
        app.logger.error(f"Model debug error: {e}")
        return jsonify({
            'loaded': False,
            'error': str(e)
        }), 500



def map_color_to_russian(color_input: str) -> str:
    """
    Маппинг английского цвета на русский язык

    Args:
        color_input: Цвет на английском (может содержать оттенок: dark blue, light gray, etc.)

    Returns:
        Цвет на русском языке с оттенком
    """
    normalized = color_input.lower().strip()

    # Color mapping dictionary
    color_map = {
        # Основные цвета
        'black': 'Черный',
        'white': 'Белый',
        'red': 'Красный',
        'blue': 'Синий',
        'green': 'Зеленый',
        'yellow': 'Желтый',
        'orange': 'Оранжевый',
        'purple': 'Фиолетовый',
        'pink': 'Розовый',
        'brown': 'Коричневый',
        'gray': 'Серый',
        'grey': 'Серый',
        'beige': 'Бежевый',
        'navy': 'Темно-синий',
        'maroon': 'Бордовый',
        'turquoise': 'Бирюзовый',
        'olive': 'Оливковый',
        'cream': 'Кремовый',
        'gold': 'Золотый',
        'silver': 'Серебряный',
        'bronze': 'Бронзовый',
        'khaki': 'Хаки',
        'coral': 'Коралловый',
        'lavender': 'Лавандовый',
        'mint': 'Мятный',
        'peach': 'Персиковый',
        'burgundy': 'Бургунди',
        'teal': 'Сине-зеленый',
        'indigo': 'Индиго',
        'violet': 'Фиолетовый',
        'magenta': 'Пурпурный',
        'cyan': 'Голубой',
        'tan': 'Желтовато-коричневый',
        'ivory': 'Слоновая кость',
        'coral': 'Коралловый',
        'olive green': 'Оливково-зеленый',
        'greenish-grey': 'Серо-зеленый'
    }

    # Паттерны с оттенками (dark, light, bright, pale)
    if 'dark' in normalized:
        base_color = normalized.replace('dark', '').strip()
        russian_base = color_map.get(base_color, base_color)
        return f'Темно-{russian_base}'

    if 'light' in normalized:
        base_color = normalized.replace('light', '').strip()
        russian_base = color_map.get(base_color, base_color)
        return f'Светло-{russian_base}'

    if 'bright' in normalized:
        base_color = normalized.replace('bright', '').strip()
        russian_base = color_map.get(base_color, base_color)
        return f'Ярко-{russian_base}'

    if 'pale' in normalized:
        base_color = normalized.replace('pale', '').strip()
        russian_base = color_map.get(base_color, base_color)
        return f'Бледно-{russian_base}'

    if 'navy' in normalized:
        base_color = normalized.replace('navy', '').strip()
        russian_base = color_map.get(base_color, base_color)
        return f'Темно-{russian_base}'

    # Простые цвета без оттенков
    return color_map.get(normalized, color_input)


def map_subtype_to_russian(subtype_input: str) -> str:
    """
    Маппинг английского подтипа одежды на русский язык

    Args:
        subtype_input: Подтип одежды на английском

    Returns:
        Подтип на русском языке
    """
    normalized = subtype_input.lower().strip()

    # Subtype mapping dictionary - расширенная версия
    subtype_map = {
        # === ВЕРХНЯЯ ОДЕЖДА (OUTERWEAR) ===
        'coat': 'Пальто',
        'overcoat': 'Пальто',
        'winter coat': 'Зимнее пальто',
        'wool coat': 'Шерстяное пальто',
        'peacoat': 'Бушлат',
        'trench coat': 'Тренч',
        'trenchcoat': 'Тренч',
        'raincoat': 'Дождевик',
        'mac': 'Макинтош',
        
        'jacket': 'Куртка',
        'blazer': 'Блейзер',
        'sport coat': 'Спортивный пиджак',
        'suit jacket': 'Пиджак от костюма',
        'bomber': 'Бомбер',
        'bomber jacket': 'Бомбер',
        'flight jacket': 'Летная куртка',
        'parka': 'Парка',
        'anorak': 'Анорак',
        'windbreaker': 'Ветровка',
        'windcheater': 'Ветровка',
        'track jacket': 'Спортивная куртка',
        'varsity jacket': 'Университетская куртка',
        'letterman jacket': 'Университетская куртка',
        
        'denim jacket': 'Джинсовая куртка',
        'jean jacket': 'Джинсовая куртка',
        'leather jacket': 'Кожаная куртка',
        'moto jacket': 'Мотокуртка',
        'biker jacket': 'Байкерская куртка',
        'motorcycle jacket': 'Мотокуртка',
        'suede jacket': 'Замшевая куртка',
        
        'vest': 'Жилет',
        'waistcoat': 'Жилет',
        'gilet': 'Жилет',
        'puffer vest': 'Пуховый жилет',
        'down vest': 'Пуховый жилет',
        'fleece vest': 'Флисовый жилет',
        
        'puffer jacket': 'Пуховик',
        'down jacket': 'Пуховик',
        'quilted jacket': 'Стеганая куртка',
        'padded jacket': 'Утепленная куртка',
        'insulated jacket': 'Утепленная куртка',
        
        # === СВИТЕРЫ И КОФТЫ (INNERWEAR) ===
        'sweater': 'Свитер',
        'jumper': 'Свитер',
        'pullover': 'Пуловер',
        'knit': 'Вязаная кофта',
        'knitwear': 'Трикотаж',
        'knit sweater': 'Вязаный свитер',
        
        'cardigan': 'Кардиган',
        'open cardigan': 'Кардиган на пуговицах',
        'button cardigan': 'Кардиган на пуговицах',
        'zip cardigan': 'Кардиган на молнии',
        'long cardigan': 'Длинный кардиган',
        
        'hoodie': 'Худи',
        'hooded sweatshirt': 'Худи',
        'zip hoodie': 'Худи на молнии',
        'pullover hoodie': 'Худи без молнии',
        'sweatshirt': 'Свитшот',
        'crew sweatshirt': 'Свитшот',
        'fleece': 'Флиска',
        'fleece sweatshirt': 'Флисовый свитшот',
        
        'turtleneck': 'Водолазка',
        'turtle neck': 'Водолазка',
        'mock neck': 'Водолазка с невысоким воротом',
        'mock turtleneck': 'Водолазка с невысоким воротом',
        'high neck': 'Высокий ворот',
        
        'crewneck': 'Свитер с круглым вырезом',
        'crew neck': 'Свитер с круглым вырезом',
        'round neck': 'Круглый вырез',
        'v-neck': 'V-образный вырез',
        'v neck': 'V-образный вырез',
        'scoop neck': 'Глубокий вырез',
        'boat neck': 'Лодочка',
        'cowl neck': 'Воротник-хомут',
        
        # === РУБАШКИ И ТОПЫ (BODYWEAR) ===
        't-shirt': 'Футболка',
        'tshirt': 'Футболка',
        'tee': 'Футболка',
        'graphic tee': 'Футболка с принтом',
        'printed tee': 'Футболка с принтом',
        'basic tee': 'Базовая футболка',
        'oversized tee': 'Оверсайз футболка',
        'fitted tee': 'Приталенная футболка',
        'crop tee': 'Укороченная футболка',
        
        'polo': 'Поло',
        'polo shirt': 'Рубашка поло',
        'golf shirt': 'Рубашка поло',
        'tennis shirt': 'Теннисная рубашка',
        
        'shirt': 'Рубашка',
        'dress shirt': 'Классическая рубашка',
        'button-up': 'Рубашка на пуговицах',
        'button up': 'Рубашка на пуговицах',
        'button-down': 'Рубашка с воротником на пуговицах',
        'button down': 'Рубашка с воротником на пуговицах',
        'oxford shirt': 'Оксфордская рубашка',
        'flannel shirt': 'Фланелевая рубашка',
        'flannel': 'Фланель',
        'denim shirt': 'Джинсовая рубашка',
        'chambray shirt': 'Рубашка из шамбре',
        'linen shirt': 'Льняная рубашка',
        'hawaiian shirt': 'Гавайская рубашка',
        'camp shirt': 'Рубашка в стиле кэмп',
        
        'blouse': 'Блузка',
        'silk blouse': 'Шелковая блузка',
        'chiffon blouse': 'Шифоновая блузка',
        'peasant blouse': 'Блузка в крестьянском стиле',
        
        'top': 'Топ',
        'tank top': 'Майка',
        'tank': 'Майка',
        'camisole': 'Камисоль',
        'cami': 'Камисоль',
        'spaghetti strap': 'Топ на тонких бретелях',
        'halter top': 'Топ-халтер',
        'bandeau': 'Бандо',
        'tube top': 'Топ-труба',
        'crop top': 'Укороченный топ',
        'cropped top': 'Укороченный топ',
        'bralette': 'Бралетт',
        'bustier': 'Бюстье',
        'corset': 'Корсет',
        
        'henley': 'Хенли',
        'raglan': 'Реглан',
        'baseball tee': 'Бейсбольная футболка',
        'ringer tee': 'Футболка с контрастной отделкой',
        
        # === ПЛАТЬЯ И КОМБИНЕЗОНЫ (FULLBODY) ===
        'dress': 'Платье',
        'gown': 'Вечернее платье',
        'evening dress': 'Вечернее платье',
        'cocktail dress': 'Коктейльное платье',
        'party dress': 'Платье для вечеринки',
        'formal dress': 'Официальное платье',
        'casual dress': 'Повседневное платье',
        'summer dress': 'Летнее платье',
        'sundress': 'Сарафан',
        'maxi dress': 'Макси платье',
        'midi dress': 'Миди платье',
        'mini dress': 'Мини платье',
        'knee-length dress': 'Платье до колена',
        'floor-length dress': 'Платье в пол',
        'a-line dress': 'Платье А-силуэта',
        'fit and flare': 'Приталенное платье с расклешенной юбкой',
        'bodycon dress': 'Облегающее платье',
        'shift dress': 'Платье-шифт',
        'wrap dress': 'Платье с запахом',
        'shirt dress': 'Платье-рубашка',
        'sweater dress': 'Платье-свитер',
        'knit dress': 'Вязаное платье',
        'slip dress': 'Платье-комбинация',
        'off-shoulder dress': 'Платье с открытыми плечами',
        'strapless dress': 'Платье без бретелей',
        'halter dress': 'Платье-халтер',
        'backless dress': 'Платье с открытой спиной',
        
        'jumpsuit': 'Комбинезон',
        'overall': 'Комбинезон',
        'overalls': 'Комбинезон',
        'coverall': 'Рабочий комбинезон',
        'romper': 'Ромпер',
        'playsuit': 'Комбинезон-шорты',
        'catsuit': 'Комбинезон-кэтсьют',
        'bodysuit': 'Боди',
        'leotard': 'Купальник-боди',
        'unitard': 'Комбинезон-трико',
        
        'skirt': 'Юбка',
        'mini skirt': 'Мини-юбка',
        'midi skirt': 'Миди-юбка',
        'maxi skirt': 'Макси-юбка',
        'a-line skirt': 'Юбка А-силуэта',
        'pencil skirt': 'Юбка-карандаш',
        'pleated skirt': 'Плиссированная юбка',
        'circle skirt': 'Юбка-солнце',
        'wrap skirt': 'Юбка с запахом',
        'denim skirt': 'Джинсовая юбка',
        'leather skirt': 'Кожаная юбка',
        
        # === ШТАНЫ И БРЮКИ (LEGWEAR) ===
        'pants': 'Брюки',
        'trousers': 'Брюки',
        'slacks': 'Брюки',
        'dress pants': 'Классические брюки',
        'formal pants': 'Официальные брюки',
        'suit pants': 'Брюки от костюма',
        'tailored pants': 'Брюки по фигуре',
        'straight pants': 'Прямые брюки',
        'wide-leg pants': 'Широкие брюки',
        'palazzo pants': 'Брюки-палаццо',
        'bootcut pants': 'Брюки с расклешенным низом',
        'flare pants': 'Расклешенные брюки',
        'cropped pants': 'Укороченные брюки',
        'capri pants': 'Капри',
        'ankle pants': 'Брюки до щиколотки',
        'high-waisted pants': 'Брюки с высокой талией',
        'low-rise pants': 'Брюки с низкой посадкой',
        
        'jeans': 'Джинсы',
        'denim': 'Джинсы',
        'skinny jeans': 'Узкие джинсы',
        'slim jeans': 'Зауженные джинсы',
        'straight jeans': 'Прямые джинсы',
        'bootcut jeans': 'Джинсы с расклешенным низом',
        'flare jeans': 'Расклешенные джинсы',
        'wide-leg jeans': 'Широкие джинсы',
        'boyfriend jeans': 'Джинсы бойфренд',
        'girlfriend jeans': 'Джинсы гёрлфренд',
        'mom jeans': 'Джинсы мом',
        'dad jeans': 'Джинсы дэд',
        'high-waisted jeans': 'Джинсы с высокой талией',
        'low-rise jeans': 'Джинсы с низкой посадкой',
        'ripped jeans': 'Рваные джинсы',
        'distressed jeans': 'Потертые джинсы',
        'raw denim': 'Сырой деним',
        'selvedge denim': 'Селвидж деним',
        
        'chinos': 'Чиносы',
        'khakis': 'Хаки',
        'cargo pants': 'Карго',
        'cargo': 'Карго',
        'utility pants': 'Утилитарные брюки',
        'tactical pants': 'Тактические брюки',
        
        'joggers': 'Джоггеры',
        'sweatpants': 'Спортивные штаны',
        'track pants': 'Спортивные брюки',
        'athletic pants': 'Спортивные брюки',
        'yoga pants': 'Брюки для йоги',
        'workout pants': 'Тренировочные брюки',
        
        'leggings': 'Леггинсы',
        'tights': 'Колготки',
        'compression leggings': 'Компрессионные леггинсы',
        'yoga leggings': 'Леггинсы для йоги',
        'athletic leggings': 'Спортивные леггинсы',
        
        'shorts': 'Шорты',
        'bermuda shorts': 'Бермуды',
        'cargo shorts': 'Шорты карго',
        'denim shorts': 'Джинсовые шорты',
        'jean shorts': 'Джинсовые шорты',
        'athletic shorts': 'Спортивные шорты',
        'running shorts': 'Беговые шорты',
        'basketball shorts': 'Баскетбольные шорты',
        'swim shorts': 'Плавательные шорты',
        'board shorts': 'Бордшорты',
        'cycling shorts': 'Велосипедные шорты',
        'bike shorts': 'Велошорты',
        'hot pants': 'Горячие шорты',
        'mini shorts': 'Мини-шорты',
        'high-waisted shorts': 'Шорты с высокой талией',
        
        # === ОБУВЬ (FOOTWEAR) ===
        'shoes': 'Обувь',
        'footwear': 'Обувь',
        
        'sneakers': 'Кроссовки',
        'trainers': 'Кроссовки',
        'Brown suede': 'Ботинки',
        'athletic shoes': 'Спортивная обувь',
        'running shoes': 'Беговые кроссовки',
        'tennis shoes': 'Теннисные кроссовки',
        'basketball shoes': 'Баскетбольные кроссовки',
        'skate shoes': 'Скейтерские кроссовки',
        'canvas shoes': 'Кеды',
        'high-top sneakers': 'Высокие кроссовки',
        'low-top sneakers': 'Низкие кроссовки',
        'slip-on sneakers': 'Слипоны',
        
        'boots': 'Ботинки',
        'ankle boots': 'Ботильоны',
        'chelsea boots': 'Челси',
        'combat boots': 'Берцы',
        'work boots': 'Рабочие ботинки',
        'hiking boots': 'Треккинговые ботинки',
        'cowboy boots': 'Ковбойские сапоги',
        'western boots': 'Вестерн сапоги',
        'knee-high boots': 'Сапоги до колена',
        'thigh-high boots': 'Ботфорты',
        'over-the-knee boots': 'Ботфорты',
        'rain boots': 'Резиновые сапоги',
        'wellington boots': 'Веллингтоны',
        'snow boots': 'Зимние сапоги',
        'ugg boots': 'Угги',
        'desert boots': 'Дезерты',
        'chukka boots': 'Чукка',
        'doc martens': 'Доктор Мартинс',
        'dr martens': 'Доктор Мартинс',
        
        'dress shoes': 'Классическая обувь',
        'formal shoes': 'Официальная обувь',
        'oxfords': 'Оксфорды',
        'brogues': 'Броги',
        'derbies': 'Дерби',
        'loafers': 'Лоферы',
        'penny loafers': 'Пенни лоферы',
        'tassel loafers': 'Лоферы с кисточками',
        'boat shoes': 'Топсайдеры',
        'deck shoes': 'Палубная обувь',
        'moccasins': 'Мокасины',
        'driving shoes': 'Мокасины для вождения',
        
        'heels': 'Туфли на каблуке',
        'high heels': 'Высокий каблук',
        'stilettos': 'Шпильки',
        'pumps': 'Лодочки',
        'kitten heels': 'Низкий каблук',
        'block heels': 'Устойчивый каблук',
        'wedges': 'Танкетка',
        'platform shoes': 'Платформа',
        
        'flats': 'Балетки',
        'ballet flats': 'Балетки',
        'pointed flats': 'Балетки с острым носом',
        'round toe flats': 'Балетки с круглым носом',
        'mary janes': 'Мэри Джейн',
        
        'sandals': 'Сандалии',
        'flip-flops': 'Вьетнамки',
        'slides': 'Шлепанцы',
        'gladiator sandals': 'Гладиаторы',
        'strappy sandals': 'Сандалии с ремешками',
        'platform sandals': 'Сандалии на платформе',
        'wedge sandals': 'Сандалии на танкетке',
        'espadrilles': 'Эспадрильи',
        
        'slippers': 'Тапочки',
        'house shoes': 'Домашняя обувь',
        'mules': 'Мюли',
        'clogs': 'Сабо',
        
        # === ГОЛОВНЫЕ УБОРЫ (HEADWEAR) ===
        'hat': 'Шляпа',
        'cap': 'Кепка',
        'beanie': 'Шапка',
        'knit hat': 'Вязаная шапка',
        'winter hat': 'Зимняя шапка',
        'wool hat': 'Шерстяная шапка',
        'baseball cap': 'Бейсболка',
        'snapback': 'Снэпбэк',
        'trucker hat': 'Кепка дальнобойщика',
        'dad hat': 'Кепка дэд',
        'bucket hat': 'панама',
        'sun hat': 'Шляпа от солнца',
        'wide-brim hat': 'Широкополая шляпа',
        'fedora': 'Федора',
        'panama hat': 'Панама',
        'cowboy hat': 'Ковбойская шляпа',
        'beret': 'Берет',
        'newsboy cap': 'Кепка газетчика',
        'flat cap': 'Плоская кепка',
        'visor': 'Козырек',
        'headband': 'Повязка на голову',
        'bandana': 'Бандана',
        'turban': 'Тюрбан',
        'hijab': 'Хиджаб',
        'scarf': 'Платок',
        'head scarf': 'Головной платок',
        
        # === АКСЕССУАРЫ (ACCESSORIES) ===
        'bag': 'Сумка',
        'handbag': 'Сумочка',
        'purse': 'Кошелек-сумочка',
        'tote bag': 'Сумка-тоут',
        'shoulder bag': 'Сумка через плечо',
        'crossbody bag': 'Сумка через плечо',
        'messenger bag': 'Мессенджер',
        'satchel': 'Портфель',
        'briefcase': 'Дипломат',
        'backpack': 'Рюкзак',
        'daypack': 'Дневной рюкзак',
        'hiking backpack': 'Туристический рюкзак',
        'laptop bag': 'Сумка для ноутбука',
        'duffel bag': 'Спортивная сумка',
        'gym bag': 'Спортивная сумка',
        'travel bag': 'Дорожная сумка',
        'weekend bag': 'Сумка выходного дня',
        'clutch': 'Клатч',
        'evening bag': 'Вечерняя сумочка',
        'fanny pack': 'Поясная сумка',
        'belt bag': 'Поясная сумка',
        'waist bag': 'Поясная сумка',
        
        'belt': 'Ремень',
        'leather belt': 'Кожаный ремень',
        'fabric belt': 'Тканевый ремень',
        'chain belt': 'Цепочка-ремень',
        'wide belt': 'Широкий ремень',
        'skinny belt': 'Тонкий ремень',
        'dress belt': 'Классический ремень',
        'casual belt': 'Повседневный ремень',
        
        'scarf': 'Шарф',
        'neck scarf': 'Шейный платок',
        'silk scarf': 'Шелковый платок',
        'winter scarf': 'Зимний шарф',
        'infinity scarf': 'Шарф-снуд',
        'pashmina': 'Пашмина',
        'shawl': 'Шаль',
        'wrap': 'Накидка',
        'stole': 'Палантин',
        
        'sunglasses': 'Солнцезащитные очки',
        'glasses': 'Очки',
        'eyeglasses': 'Очки для зрения',
        'reading glasses': 'Очки для чтения',
        'aviators': 'Авиаторы',
        'wayfarers': 'Вейфареры',
        'cat-eye glasses': 'Очки кошачий глаз',
        
        'watch': 'Часы',
        'wristwatch': 'Наручные часы',
        'smartwatch': 'Умные часы',
        'digital watch': 'Цифровые часы',
        'analog watch': 'Аналоговые часы',
        'sports watch': 'Спортивные часы',
        'dress watch': 'Классические часы',
        
        'gloves': 'Перчатки',
        'mittens': 'Варежки',
        'fingerless gloves': 'Перчатки без пальцев',
        'leather gloves': 'Кожаные перчатки',
        'wool gloves': 'Шерстяные перчатки',
        'winter gloves': 'Зимние перчатки',
        'driving gloves': 'Перчатки для вождения',
        
        'jewelry': 'Украшения',
        'necklace': 'Ожерелье',
        'chain': 'Цепочка',
        'pendant': 'Кулон',
        'choker': 'Чокер',
        'earrings': 'Серьги',
        'studs': 'Гвоздики',
        'hoops': 'Кольца',
        'drop earrings': 'Висячие серьги',
        'bracelet': 'Браслет',
        'bangle': 'Жесткий браслет',
        'charm bracelet': 'Браслет с подвесками',
        'ring': 'Кольцо',
        'wedding ring': 'Обручальное кольцо',
        'engagement ring': 'Помолвочное кольцо',
        'brooch': 'Брошь',
        'pin': 'Значок',
        
        'tie': 'Галстук',
        'necktie': 'Галстук',
        'bow tie': 'Бабочка',
        'ascot': 'Аскот',
        'cravat': 'Шейный платок',
        'pocket square': 'Нагрудный платок',
        
        'socks': 'Носки',
        'ankle socks': 'Короткие носки',
        'crew socks': 'Носки до середины голени',
        'knee-high socks': 'Гольфы',
        'thigh-high socks': 'Чулки',
        'stockings': 'Чулки',
        'pantyhose': 'Колготки',
        'tights': 'Плотные колготки',
        'compression socks': 'Компрессионные носки',
        'athletic socks': 'Спортивные носки',
        'dress socks': 'Классические носки',
        'wool socks': 'Шерстяные носки',
        'cotton socks': 'Хлопковые носки',
        
        # === НИЖНЕЕ БЕЛЬЕ ===
        'underwear': 'Нижнее белье',
        'undergarments': 'Нижнее белье',
        'bra': 'Бюстгальтер',
        'sports bra': 'Спортивный бюстгальтер',
        'push-up bra': 'Пуш-ап бюстгальтер',
        'strapless bra': 'Бюстгальтер без бретелей',
        'panties': 'Трусики',
        'briefs': 'Трусы',
        'boxers': 'Боксеры',
        'boxer briefs': 'Боксеры-брифы',
        'thong': 'Стринги',
        'g-string': 'Стринги',
        'bikini briefs': 'Трусики-бикини',
        'boyshorts': 'Шортики',
        'slip': 'Комбинация',
        'camisole': 'Камисоль',
        'undershirt': 'Майка',
        'tank undershirt': 'Майка-алкоголичка',
        'thermal underwear': 'Термобелье',
        'long johns': 'Кальсоны',
        
        # === СПОРТИВНАЯ ОДЕЖДА ===
        'activewear': 'Спортивная одежда',
        'sportswear': 'Спортивная одежда',
        'athletic wear': 'Спортивная одежда',
        'workout clothes': 'Одежда для тренировок',
        'gym clothes': 'Одежда для спортзала',
        'running gear': 'Беговая экипировка',
        'yoga wear': 'Одежда для йоги',
        'fitness wear': 'Фитнес одежда',
        
        'tracksuit': 'Спортивный костюм',
        'sweat suit': 'Спортивный костюм',
        'warm-up suit': 'Разминочный костюм',
        'jogging suit': 'Костюм для бега',
        
        'jersey': 'Джерси',
        'sports jersey': 'Спортивная майка',
        'football jersey': 'Футбольная майка',
        'basketball jersey': 'Баскетбольная майка',
        'baseball jersey': 'Бейсбольная майка',
        'hockey jersey': 'Хоккейская майка',
        
        'compression shirt': 'Компрессионная рубашка',
        'compression top': 'Компрессионный топ',
        'base layer': 'Базовый слой',
        'thermal top': 'Термо-топ',
        'moisture-wicking shirt': 'Влагоотводящая рубашка',
        
        # === КУПАЛЬНАЯ ОДЕЖДА ===
        'swimwear': 'Купальная одежда',
        'bathing suit': 'Купальник',
        'swimsuit': 'Купальник',
        'bikini': 'Бикини',
        'one-piece': 'Слитный купальник',
        'two-piece': 'Раздельный купальник',
        'tankini': 'Танкини',
        'monokini': 'Монокини',
        'swim trunks': 'Плавки',
        'board shorts': 'Бордшорты',
        'swim briefs': 'Плавки-брифы',
        'speedo': 'Спидо',
        'rash guard': 'Рашгард',
        'swim shirt': 'Рубашка для плавания',
        'cover-up': 'Пляжная накидка',
        'sarong': 'Саронг',
        'beach dress': 'Пляжное платье',
        'kaftan': 'Кафтан',
        
        # === ФОРМАЛЬНАЯ ОДЕЖДА ===
        'formal wear': 'Официальная одежда',
        'evening wear': 'Вечерняя одежда',
        'black tie': 'Смокинг',
        'white tie': 'Фрак',
        'tuxedo': 'Смокинг',
        'dinner jacket': 'Смокинг',
        'morning coat': 'Сюртук',
        'tailcoat': 'Фрак',
        
        'suit': 'Костюм',
        'business suit': 'Деловой костюм',
        'three-piece suit': 'Костюм-тройка',
        'two-piece suit': 'Костюм-двойка',
        'pinstripe suit': 'Костюм в полоску',
        'navy suit': 'Темно-синий костюм',
        'charcoal suit': 'Угольно-серый костюм',
        'wedding suit': 'Свадебный костюм',
        
        # === РАБОЧАЯ ОДЕЖДА ===
        'workwear': 'Рабочая одежда',
        'uniform': 'Униформа',
        'coveralls': 'Комбинезон',
        'work shirt': 'Рабочая рубашка',
        'safety vest': 'Сигнальный жилет',
        'hi-vis vest': 'Светоотражающий жилет',
        'hard hat': 'Каска',
        'work boots': 'Рабочие ботинки',
        'steel toe boots': 'Ботинки с металлическим носком',
        'safety boots': 'Защитная обувь',
        
        # === ВИНТАЖНАЯ И РЕТРО ОДЕЖДА ===
        'vintage': 'Винтаж',
        'retro': 'Ретро',
        'antique': 'Антиквариат',
        '50s style': 'Стиль 50-х',
        '60s style': 'Стиль 60-х',
        '70s style': 'Стиль 70-х',
        '80s style': 'Стиль 80-х',
        '90s style': 'Стиль 90-х',
        'mod': 'Мод',
        'bohemian': 'Богемный',
        'boho': 'Бохо',
        'hippie': 'Хиппи',
        'grunge': 'Гранж',
        'punk': 'Панк',
        'goth': 'Готический',
        'rockabilly': 'Рокабилли',
        'pin-up': 'Пин-ап'
    }

    # Проверяем точное совпадение
    if normalized in subtype_map:
        return subtype_map[normalized]

    # Проверяем частичное совпадение (если в описании есть ключевое слово)
    for eng, rus in subtype_map.items():
        if eng in normalized:
            return rus

    # Если не нашли перевод, возвращаем оригинал
    return subtype_input


def map_material_to_russian(material_input: str) -> str:
    """
    Маппинг английского материала на русский язык

    Args:
        material_input: Материал на английском

    Returns:
        Материал на русском языке
    """
    normalized = material_input.lower().strip()

    # Material mapping dictionary
    material_map = {
        # Ткани и материалы одежды
        'cotton': 'Хлопок',
        'wool': 'Шерсть',
        'silk': 'Шелк',
        'linen': 'Лен',
        'polyester': 'Полиэстер',
        'nylon': 'Нейлон',
        'spandex': 'Спандекс',
        'elastane': 'Эластан',
        'lycra': 'Лайкра',
        'rayon': 'Вискоза',
        'viscose': 'Вискоза',
        'acetate': 'Ацетат',
        'acrylic': 'Акрил',
        'cashmere': 'Кашемир',
        'angora': 'Ангora',
        'mohair': 'Мохер',
        'alpaca': 'Альпака',
        'merino': 'Мерино',
        'bamboo': 'Бамбук',
        'modal': 'Модал',
        'tencel': 'Тенсел',
        'lyocell': 'Лиоцел',

        # Кожа и замша
        'leather': 'Кожа',
        'genuine leather': 'Натуральная кожа',
        'faux leather': 'Искусственная кожа',
        'suede': 'Замша',
        'velvet': 'Бархат',
        'velour': 'Велюр',
        'fur': 'Мех',
        'faux fur': 'Искусственный мех',

        # Джинс и деним
        'denim': 'Деним',
        'jean': 'Джинсовая ткань',
        'jeans': 'Джинсы',

        # Трикотаж
        'knit': 'Трикотаж',
        'knit fabric': 'Трикотаж',
        'jersey': 'Джерси',
        'sweater knit': 'Трикотаж для свитеров',
        'rib knit': 'Ребристый трикотаж',
        'interlock': 'Интерлок',
        'fleece': 'Флис',
        'polar fleece': 'Полар флис',

        # Другие материалы
        'chiffon': 'Шифон',
        'satin': 'Сатин',
        'taffeta': 'Тафта',
        'organza': 'Органза',
        'lace': 'Кружево',
        'mesh': 'Сетка',
        'tulle': 'Фатин',
        'crepe': 'Креп',
        'poplin': 'Поплин',
        'broadcloth': 'Батист',
        'oxford': 'Оксфорд',
        'twill': 'Твил',
        'canvas': 'Холст',
        'gabardine': 'Габардин',
        'corduroy': 'Вельвет',
        'plush': 'Плюш',
        'chenille': 'Шенилл',
        'boucle': 'Букле'
    }

    # Простые материалы без модификаторов
    return material_map.get(normalized, material_input)


def map_to_clothing_category(type_description: str) -> str:
    """
    Маппинг описания типа одежды на ClothingCategory enum

    Args:
        type_description: Описание типа одежды от LLM (первый пункт ответа)

    Returns:
        Нормализованная категория (OUTERWEAR, INNERWEAR, LEGWEAR, FOOTWEAR, HEADWEAR, ACCESSORIES)
    """
    text = type_description.lower().strip()

    # OUTERWEAR - jackets, coats, trench coats, bombers, blazers, vests
    if any(keyword in text for keyword in [
        'outerwear', 'jacket', 'jackets', 'coat', 'coats', 'trench', 'trench coat', 'trench coats', 'bomber', 'bombers', 'blazer', 'blazers', 'vest', 'vests',
        'parka', 'parkas', 'windbreaker', 'windbreakers', 'leather jacket', 'leather jackets', 'denim jacket', 'denim jackets', 'wool coat', 'wool coats',
        'raincoat', 'raincoats', 'peacoat', 'peacoats', 'cardigan', 'cardigans', 'blouse', 'blouses', 'tunic', 'tunics', 'overcoat', 'overcoats'
    ]):
        return 'OUTERWEAR'

    # SWEATERS - sweaters, turtlenecks, hoodies, cardigans, pullovers
    if any(keyword in text for keyword in [
        'sweater', 'sweaters', 'turtleneck', 'turtlenecks', 'hoodie', 'hoodies', 'cardigan', 'cardigans', 'pullover', 'pullovers',
        'crewneck', 'crewsnecks', 'v-neck', 'v-necks', 'mock neck', 'mock necks', 'cable knit', 'cable knits', 'chunky knit', 'chunky knits',
        'cashmere sweater', 'cashmere sweaters', 'wool sweater', 'wool sweaters', 'cotton sweater', 'cotton sweaters',
        'sweatshirt', 'sweatshirts'
    ]):
        return 'INNERWEAR'

    # BODYWEAR - t-shirts, shirts, blouses, tops, tank tops
    if any(keyword in text for keyword in [
        'bodywear', 't-shirt', 't-shirts', 'shirt', 'shirts', 'blouse', 'blouses', 'top', 'tops', 'tank top', 'tank tops', 'crop top', 'crop tops',
        'long-sleeve shirt', 'long-sleeve shirts', 'polo shirt', 'polo shirts', 'button-up shirt', 'button-up shirts', 'dress shirt', 'dress shirts',
        'graphic tee', 'graphic tees', 'henley shirt', 'henley shirts', 'thermal shirt', 'thermal shirts', 'athletic shirt', 'athletic shirts', 'sleeveless top', 'sleeveless tops'
    ]):
        return 'BODYWEAR'

    # FULLBODY - dresses, jumpsuits, rompers, suits, tracksuits
    if any(keyword in text for keyword in [
        'fullbody', 'dress', 'dresses', 'jumpsuit', 'jumpsuits', 'romper', 'rompers', 'suit', 'suits', 'tracksuit', 'tracksuits', 'sportswear set', 'sportswear sets',
        'overall', 'overalls', 'coverall', 'coveralls', 'bodysuit', 'bodysuits', 'unitard', 'unitards', 'leotard', 'leotards', 'wedding dress', 'wedding dresses',
        'cocktail dress', 'cocktail dresses', 'maxi dress', 'maxi dresses', 'midi dress', 'midi dresses', 'mini dress', 'mini dresses'
    ]):
        return 'FULLBODY'

    # PANTS - pants, trousers, jeans, shorts, capris, joggers, leggings
    if any(keyword in text for keyword in [
        'pant','pants', 'trouser', 'trousers', 'jean', 'jeans', 'short', 'shorts', 'capri', 'capris', 'jogger', 'joggers', 'legging', 'leggings',
        'chino', 'chinos', 'khaki', 'khakis', 'cargo pant', 'cargo pants', 'wide-leg pant', 'wide-leg pants', 'skinny jean', 'skinny jeans',
        'bootcut jean', 'bootcut jeans', 'straight-leg pant', 'straight-leg pants', 'athletic short', 'athletic shorts'
    ]):
        return 'LEGWEAR'

    # SHOES - all types of footwear
    if any(keyword in text for keyword in [
        'shoe', 'shoes', 'boot', 'boots', 'sneaker', 'sneakers', 'sandal', 'sandals', 'heel', 'heels', 'flat', 'flats',
        'loafer', 'loafers', 'oxford', 'oxfords', 'running shoe', 'running shoes', 'hiking boot', 'hiking boots', 'ankle boot', 'ankle boots',
        'knee-high boot', 'knee-high boots', 'cowboy boot', 'cowboy boots', 'flip-flop', 'flip-flops', 'espadrille', 'espadrilles'
    ]):
        return 'FOOTWEAR'

    # HEADWEAR - all headwear
    if any(keyword in text for keyword in [
        'headwear', 'hat', 'hats', 'cap', 'caps', 'beanie', 'beanies', 'scarf', 'scarves', 'headband', 'headbands', 'beret', 'berets',
        'fedora', 'fedoras', 'baseball cap', 'baseball caps', 'bucket hat', 'bucket hats', 'sun hat', 'sun hats', 'knitted hat', 'knitted hats', 'wool hat', 'wool hats'
    ]):
        return 'HEADWEAR'

    # ACCESSORIES - bags, belts, jewelry, watches, gloves, sunglasses, scarves
    if any(keyword in text for keyword in [
        'accessories', 'bag', 'bags', 'belt', 'belts', 'jewelry', 'watch', 'watches', 'glove', 'gloves',
        'sunglass', 'sunglasses', 'scarf', 'scarves', 'tie', 'ties', 'bowtie', 'bowties', 'cufflink', 'cufflinks'
    ]):
        return 'ACCESSORIES'

    # По умолчанию возвращаем ACCESSORIES
    app.logger.warning(f"Не удалось определить категорию для: {type_description}")
    return 'ACCESSORIES'


def map_style_to_enum(style_input: str) -> str:
    """
    Маппинг стиля одежды на нормализованный enum (на русском)

    Args:
        style_input: Стиль от FastVLM (может быть на английском)

    Returns:
        Нормализованный стиль на русском языке
    """
    normalized = style_input.lower().strip()

    # Style mapping dictionary (FastVLM → Русский enum)
    style_map = {
        # Casual
        'casual': 'Повседневный',
        'everyday': 'Повседневный',
        'relaxed': 'Повседневный',
        'comfortable': 'Повседневный',

        # Business
        'business': 'Деловой',
        'office': 'Деловой',
        'professional': 'Деловой',
        'corporate': 'Деловой',
        'work': 'Деловой',

        # Sport
        'sport': 'Спортивный',
        'athletic': 'Спортивный',
        'sportswear': 'Спортивный',
        'activewear': 'Спортивный',
        'gym': 'Спортивный',

        # Streetwear
        'streetwear': 'Уличный',
        'street': 'Уличный',
        'urban': 'Уличный',
        'hip-hop': 'Уличный',

        # Formal
        'formal': 'Официальный',
        'evening': 'Официальный',
        'elegant': 'Официальный',
        'dressy': 'Официальный',
        'cocktail': 'Официальный',

        # Smart Casual
        'smart casual': 'Деловой повседневный',
        'smart-casual': 'Деловой повседневный',
        'business casual': 'Деловой повседневный',
        'business-casual': 'Деловой повседневный',
        'semi-formal': 'Деловой повседневный',

        # Bohemian
        'bohemian': 'Бохо',
        'boho': 'Бохо',
        'hippie': 'Бохо',
        'ethnic': 'Бохо',

        # Vintage
        'vintage': 'Винтаж',
        'retro': 'Винтаж',
        'classic': 'Винтаж',

        # Minimalist
        'minimalist': 'Минимализм',
        'minimal': 'Минимализм',
        'simple': 'Минимализм',
        'clean': 'Минимализм',

        # Romantic
        'romantic': 'Романтический',
        'feminine': 'Романтический',
        'delicate': 'Романтический'
    }

    # Проверяем точное совпадение
    if normalized in style_map:
        return style_map[normalized]

    # Проверяем частичное совпадение
    for eng, rus in style_map.items():
        if eng in normalized:
            return rus

    # Если не нашли, возвращаем оригинал с заглавной буквы
    return style_input.capitalize()


def detect_category_from_subtype(subtype: str) -> str:
    """
    Определяет категорию одежды на основе подтипа (более точный метод)
    
    Args:
        subtype: Детальное описание одежды (пункт 2 от FastVLM)
    
    Returns:
        Нормализованная категория
    """
    text = subtype.lower().strip()
    
    # INNERWEAR - свитеры, кофты, водолазки (приоритет!)
    if any(keyword in text for keyword in [
        'sweater', 'sweatshirt', 'pullover', 'hoodie', 'cardigan',
        'turtleneck', 'crewneck', 'v-neck', 'mock neck',
        'knit', 'кофта', 'свитер', 'водолазка', 'худи'
    ]):
        return 'INNERWEAR'
    
    # OUTERWEAR - куртки, пальто, жакеты
    if any(keyword in text for keyword in [
        'jacket', 'coat', 'blazer', 'vest', 'bomber', 'parka',
        'trench', 'windbreaker', 'raincoat', 'peacoat', 'overcoat',
        'куртка', 'пальто', 'жакет', 'плащ'
    ]):
        return 'OUTERWEAR'
    
    # BODYWEAR - футболки, рубашки, блузки, топы
    if any(keyword in text for keyword in [
        't-shirt', 'shirt', 'blouse', 'top', 'tank', 'polo',
        'tee', 'henley', 'crop', 'camisole',
        'футболка', 'рубашка', 'блузка', 'топ', 'майка'
    ]):
        return 'BODYWEAR'
    
    # FULLBODY - платья, комбинезоны, костюмы
    if any(keyword in text for keyword in [
        'dress', 'jumpsuit', 'romper', 'suit', 'tracksuit',
        'overall', 'coverall', 'bodysuit', 'unitard',
        'платье', 'комбинезон', 'костюм'
    ]):
        return 'FULLBODY'
    
    # LEGWEAR - штаны, джинсы, шорты
    if any(keyword in text for keyword in [
        'pant', 'trouser', 'jean', 'short', 'legging',
        'chino', 'khaki', 'jogger', 'capri',
        'штаны', 'брюки', 'джинсы', 'шорты'
    ]):
        return 'LEGWEAR'
    
    # FOOTWEAR - обувь
    if any(keyword in text for keyword in [
        'shoe', 'boot', 'sneaker', 'sandal', 'heel',
        'loafer', 'oxford', 'slipper', 'moccasin',
        'обувь', 'ботинки', 'кроссовки', 'туфли'
    ]):
        return 'FOOTWEAR'
    
    # HEADWEAR - головные уборы
    if any(keyword in text for keyword in [
        'hat', 'cap', 'beanie', 'beret', 'fedora',
        'headband', 'turban', 'шапка', 'кепка', 'шляпа'
    ]):
        return 'HEADWEAR'
    
    # ACCESSORIES - аксессуары
    if any(keyword in text for keyword in [
        'bag', 'belt', 'watch', 'jewelry', 'glove',
        'scarf', 'tie', 'sunglass', 'wallet',
        'сумка', 'ремень', 'часы', 'очки', 'перчатки'
    ]):
        return 'ACCESSORIES'
    
    return None  # Не удалось определить


def validate_and_correct_category(raw_type: str, subtype: str) -> str:
    """
    Валидирует и корректирует категорию на основе подтипа
    
    Логика:
    1. Пытаемся определить категорию из subtype (более точно)
    2. Если не получилось, используем raw_type
    3. Если raw_type противоречит subtype, приоритет у subtype
    
    Args:
        raw_type: Категория из пункта 1 (может быть неточной)
        subtype: Детальное описание из пункта 2 (обычно точнее)
    
    Returns:
        Корректная категория
    """
    # Сначала пытаемся определить по subtype (приоритет)
    category_from_subtype = detect_category_from_subtype(subtype)
    
    if category_from_subtype:
        # Проверяем конфликт
        raw_type_normalized = raw_type.upper().strip()
        if raw_type_normalized in ['OUTERWEAR', 'INNERWEAR', 'BODYWEAR', 'FULLBODY', 'LEGWEAR', 'FOOTWEAR', 'HEADWEAR', 'ACCESSORIES']:
            if raw_type_normalized != category_from_subtype:
                app.logger.warning(f"Категория скорректирована: {raw_type_normalized} → {category_from_subtype} (на основе subtype: {subtype})")
        
        return category_from_subtype
    
    # Если не удалось определить по subtype, используем raw_type
    raw_type_normalized = raw_type.upper().strip()
    if raw_type_normalized in ['OUTERWEAR', 'INNERWEAR', 'BODYWEAR', 'FULLBODY', 'LEGWEAR', 'FOOTWEAR', 'HEADWEAR', 'ACCESSORIES']:
        return raw_type_normalized
    
    # Fallback: пытаемся определить по raw_type как по subtype
    category_from_raw = detect_category_from_subtype(raw_type)
    if category_from_raw:
        return category_from_raw
    
    # По умолчанию ACCESSORIES
    app.logger.warning(f"Не удалось определить категорию для: type={raw_type}, subtype={subtype}")
    return 'ACCESSORIES'


@app.route('/classify_clothing', methods=['POST'])
def classify_clothing():
    """Классификация одежды: удаление фона + анализ через FastVLM"""
    start_time = time.time()

    try:
        if background_remover is None or model is None:
            return jsonify({
                'success': False,
                'error': 'Background remover or model not initialized'
            }), 500

        # Получаем данные
        data = request.get_json()
        if not data or 'image_base64' not in data:
            return jsonify({
                'success': False,
                'error': 'No image provided'
            }), 400

        image_base64 = data['image_base64']

        # Получаем prompt (по умолчанию используем глобальный class_prompt)
        prompt = data.get('prompt', class_prompt)

        # Правильная обработка base64: удаляем префикс data:image если есть
        if image_base64.startswith('data:image'):
            image_base64 = image_base64.split(',', 1)[1] if ',' in image_base64 else image_base64

        app.logger.info(f"Промпт для классификации: {prompt}")

        # Шаг 1: Декодируем изображение
        try:
            image_data = base64.b64decode(image_base64)
            image = Image.open(io.BytesIO(image_data)).convert('RGB')
            app.logger.info(f"Изображение декодировано: {image.size}")
        except Exception as e:
            app.logger.error(f"Ошибка декодирования изображения: {e}")
            return jsonify({
                'success': False,
                'error': f'Invalid image data: {e}'
            }), 400

        # Шаг 2: Удаляем фон
        bg_removal_start = time.time()
        result_image, bg_processing_time = background_remover.remove_background(image)
        result_image = background_remover.post_process_mask(result_image, feather=2)
        result_image = background_remover.crop_to_content(result_image, padding=10)
        bg_removal_time = time.time() - bg_removal_start
        app.logger.info(f"Фон удален за {bg_removal_time:.2f}с")

        # Конвертируем результат в base64 для анализа
        output_buffer = io.BytesIO()
        result_image.save(output_buffer, format='PNG')
        processed_image_base64 = base64.b64encode(output_buffer.getvalue()).decode('utf-8')

        # Шаг 3: Проверяем prompt
        if prompt is None:
            app.logger.error("Prompt не задан")
            return jsonify({
                'success': False,
                'error': 'Classification prompt not provided'
            }), 500

        app.logger.debug(f"Используем prompt: {prompt[:100]}...")

        # Шаг 4: Анализируем через FastVLM
        analysis_start = time.time()
        classification_text, error = analyze_image_fastvlm(processed_image_base64, prompt)
        analysis_time = time.time() - analysis_start

        if error:
            app.logger.error(f"Ошибка анализа: {error}")
            return jsonify({
                'success': False,
                'error': error
            }), 500

        app.logger.info(f"Анализ завершен за {analysis_time:.2f}с")
        app.logger.info(f"Результат анализа: {classification_text}")

        # Шаг 5: Парсим результат
        parsing_start = time.time()
        try:
            lines = [line.strip() for line in classification_text.strip().split('\n') if line.strip()]

            # Извлекаем значения (формат: "1. Value")
            parsed_data = {}
            for line in lines:
                if '. ' in line:
                    parts = line.split('. ', 1)
                    if len(parts) == 2:
                        index = parts[0].strip()
                        value = parts[1].strip()
                        parsed_data[index] = value

            parsing_time = time.time() - parsing_start

            # Новый формат ответа (9 пунктов):
            # 1. Тип одежды (для определения категории)
            # 2. Подтип одежды (ключевое слово)
            # 3. Цвет
            # 4. Материал
            # 5. Посадка (fit)
            # 6. Стиль
            # 7. Сезон
            # 8. Паттерн/узор
            # 9. Описание (полное предложение)

            raw_type = parsed_data.get('1', 'Unknown')  # Тип одежды для определения категории
            raw_subtype = parsed_data.get('2', 'Unknown')  # Подтип одежды (ключевое слово)
            raw_color = parsed_data.get('3', 'Unknown')  # Цвет
            raw_material = parsed_data.get('4', 'Unknown')  # Материал
            raw_fit = parsed_data.get('5', 'Unknown')  # Посадка
            raw_style = parsed_data.get('6', 'Unknown')  # Стиль
            raw_season = parsed_data.get('7', 'Unknown')  # Сезон
            raw_pattern = parsed_data.get('8', 'Unknown')  # Паттерн
            raw_description = parsed_data.get('9', 'Unknown')  # Описание

            # Валидируем и корректируем категорию на основе subtype
            mapping_start = time.time()
            normalized_category = validate_and_correct_category(raw_type, raw_subtype)
            mapping_time = time.time() - mapping_start

            # Переводим subtype на русский
            subtype_start = time.time()
            subtype_russian = map_subtype_to_russian(raw_subtype) if raw_subtype != 'Unknown' else 'Неизвестно'
            subtype_time = time.time() - subtype_start

            # Цвет на английском от LLM - переводим на русский
            color_start = time.time()
            color_russian = map_color_to_russian(raw_color) if raw_color != 'Unknown' else 'Неизвестно'
            color_time = time.time() - color_start

            # Материал на английском от LLM - переводим на русский
            material_start = time.time()
            material_russian = map_material_to_russian(raw_material) if raw_material != 'Unknown' else 'Неизвестно'
            material_time = time.time() - material_start

            # Нормализуем стиль на русский enum
            style_start = time.time()
            style_russian = map_style_to_enum(raw_style) if raw_style != 'Unknown' else 'Неизвестно'
            style_time = time.time() - style_start

            # Логируем переводы для отладки
            app.logger.debug(f"Переводы: subtype '{raw_subtype}' → '{subtype_russian}', style '{raw_style}' → '{style_russian}'")

            classification = {
                'category': normalized_category,  # Нормализованная категория (OUTERWEAR, INNERWEAR, etc.)
                'type': raw_type,  # Оригинальный тип от LLM (для отладки)
                'subtype': subtype_russian,  # Подтип одежды на русском
                'color': color_russian,  # Цвет на русском языке
                'material': material_russian,  # Материал на русском языке
                'fit': raw_fit,  # Посадка (оставляем как есть)
                'style': style_russian,  # Стиль на русском (нормализованный)
                'season': raw_season,  # Сезон (оставляем как есть)
                'pattern': raw_pattern,  # Паттерн/узор (оставляем как есть)
                'description': raw_description  # Полное описание от LLM (пункт 9)
            }

            app.logger.info(f"Классификация распарсена: {classification}")

        except Exception as e:
            app.logger.error(f"Ошибка парсинга результата: {e}")
            classification = {
                'category': 'ACCESSORIES',
                'type': 'Unknown',
                'subtype': 'Неизвестно',
                'color': 'Неизвестно',
                'material': 'Неизвестно',
                'fit': 'Unknown',
                'style': 'Неизвестно',
                'season': 'Unknown',
                'pattern': 'Unknown',
                'raw_text': classification_text
            }

        total_time = time.time() - start_time
        post_processing_time = total_time - bg_removal_time - analysis_time
        
        app.logger.info(f"✅ Классификация завершена за {total_time:.2f}с")
        app.logger.info(f"📊 Детализация времени:")
        app.logger.info(f"   - Удаление фона: {bg_removal_time:.2f}с ({bg_removal_time/total_time*100:.1f}%)")
        app.logger.info(f"   - LLM анализ: {analysis_time:.2f}с ({analysis_time/total_time*100:.1f}%)")
        app.logger.info(f"   - Постобработка: {post_processing_time:.2f}с ({post_processing_time/total_time*100:.1f}%)")

        # Возвращаем результат с изображением без фона
        return jsonify({
            'success': True,
            'classification': classification,
            'processed_image_base64': f'data:image/png;base64,{processed_image_base64}',
            'raw_analysis': classification_text,
            'timing': {
                'total_time': round(total_time, 2),
                'background_removal_time': round(bg_removal_time, 2),
                'analysis_time': round(analysis_time, 2),
                'post_processing_time': round(post_processing_time, 2)
            },
            'image_info': {
                'original_size': f'{image.size[0]}x{image.size[1]}',
                'processed_size': f'{result_image.size[0]}x{result_image.size[1]}'
            }
        })

    except Exception as e:
        total_time = time.time() - start_time
        error_msg = f"Ошибка классификации: {e}"
        app.logger.error(error_msg)
        app.logger.error(f"Traceback: {traceback.format_exc()}")

        return jsonify({
            'success': False,
            'error': str(e),
            'timing': {
                'total_time': round(total_time, 2)
            }
        }), 500

@app.route('/remove-background', methods=['POST'])
def remove_background():
    """Удаление фона с изображения"""
    start_time = time.time()
    
    try:
        if background_remover is None:
            return jsonify({
                'success': False,
                'error': 'Background remover not initialized'
            }), 500

        # Получаем данные
        data = request.get_json()
        if not data or 'image_base64' not in data:
            return jsonify({
                'success': False,
                'error': 'No image provided'
            }), 400

        image_base64 = data['image_base64']
        
        # Удаляем префикс data:image если есть
        if ',' in image_base64:
            image_base64 = image_base64.split(',')[1]

        app.logger.info("Начинаем удаление фона с изображения")

        # Декодируем изображение
        try:
            image_data = base64.b64decode(image_base64)
            image = Image.open(io.BytesIO(image_data)).convert('RGB')
            app.logger.debug(f"Изображение декодировано: {image.size}")
        except Exception as e:
            app.logger.error(f"Ошибка декодирования изображения: {e}")
            return jsonify({
                'success': False,
                'error': f'Invalid image data: {e}'
            }), 400

        # Удаляем фон
        result_image, processing_time = background_remover.remove_background(image)
        app.logger.info(f"Фон удален за {processing_time:.2f}с")

        # Постобработка краев
        result_image = background_remover.post_process_mask(result_image, feather=2)
        
        # Обрезаем до содержимого
        result_image = background_remover.crop_to_content(result_image, padding=10)
        app.logger.debug(f"Изображение обрезано: {result_image.size}")

        # Конвертируем результат в base64 PNG (с прозрачностью)
        output_buffer = io.BytesIO()
        result_image.save(output_buffer, format='PNG')
        output_base64 = base64.b64encode(output_buffer.getvalue()).decode('utf-8')

        total_time = time.time() - start_time
        app.logger.info(f"Удаление фона завершено за {total_time:.2f}с")

        return jsonify({
            'success': True,
            'image_base64': f'data:image/png;base64,{output_base64}',
            'timing': {
                'total_time': round(total_time, 2),
                'processing_time': round(processing_time, 2)
            },
            'image_info': {
                'original_size': f'{image.size[0]}x{image.size[1]}',
                'result_size': f'{result_image.size[0]}x{result_image.size[1]}'
            }
        })

    except Exception as e:
        total_time = time.time() - start_time
        error_msg = f"Ошибка удаления фона: {e}"
        app.logger.error(error_msg)
        app.logger.error(f"Traceback: {traceback.format_exc()}")

        return jsonify({
            'success': False,
            'error': str(e),
            'timing': {
                'total_time': round(total_time, 2)
            }
        }), 500


@app.route('/simple_analyze', methods=['POST'])
def simple_analyze():
    """Простой эндпоинт: фото + промпт = ответ LLM"""
    start_time = time.time()
    
    try:
        if model is None:
            return jsonify({
                'success': False,
                'error': 'Model not loaded'
            }), 500

        # Получаем данные
        data = request.get_json()
        if not data or 'image_base64' not in data:
            return jsonify({
                'success': False,
                'error': 'No image provided'
            }), 400

        image_base64 = data['image_base64']
        prompt = data.get('prompt')
        
        if not prompt:
            return jsonify({
                'success': False,
                'error': 'No prompt provided'
            }), 400

        # Удаляем префикс data:image если есть
        if ',' in image_base64:
            image_base64 = image_base64.split(',')[1]

        app.logger.info("Простой анализ: отправляем фото и промпт в LLM")

        # Анализируем через FastVLM
        answer, error = analyze_image_fastvlm(image_base64, prompt)
        
        if error:
            app.logger.error(f"Ошибка анализа: {error}")
            return jsonify({
                'success': False,
                'error': error
            }), 500

        total_time = time.time() - start_time
        app.logger.info(f"Анализ завершен за {total_time:.2f}с")

        return jsonify({
            'success': True,
            'answer': answer,
            'time': round(total_time, 2)
        })

    except Exception as e:
        total_time = time.time() - start_time
        error_msg = f"Ошибка простого анализа: {e}"
        app.logger.error(error_msg)
        app.logger.error(f"Traceback: {traceback.format_exc()}")

        return jsonify({
            'success': False,
            'error': str(e),
            'time': round(total_time, 2)
        }), 500


def build_capsule_generation_prompt(wardrobe_items, current_season, current_month, existing_capsules):
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


def parse_gemini_capsule_response(response_text):
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
            app.logger.error("Ответ Gemini не содержит поле 'capsules'")
            return None
        
        capsules = data['capsules']
        
        # Валидируем каждую капсулу
        for capsule in capsules:
            required_fields = ['name', 'description', 'reasoning', 'recommendations', 'itemIds']
            for field in required_fields:
                if field not in capsule:
                    app.logger.error(f"Капсула не содержит обязательное поле '{field}'")
                    return None
            
            # Проверяем что itemIds - это список
            if not isinstance(capsule['itemIds'], list):
                app.logger.error("itemIds должен быть списком")
                return None
        
        return capsules
    
    except json.JSONDecodeError as e:
        app.logger.error(f"Ошибка парсинга JSON от Gemini: {e}")
        app.logger.error(f"Ответ: {response_text}")
        return None
    except Exception as e:
        app.logger.error(f"Ошибка обработки ответа Gemini: {e}")
        return None


def create_capsules_with_gemini(prompt):
    """
    Вызывает Gemini API для создания 3 капсул
    
    Args:
        prompt: Промпт для генерации капсул
    
    Returns:
        Список капсул или None при ошибке
    """
    global gemini_client
    
    if not gemini_client:
        raise Exception("Gemini клиент не инициализирован")
    
    try:
        app.logger.info("Отправка запроса в Gemini для генерации капсул")
        
        response = gemini_client.models.generate_content(
            model=Config.STYLIST_GEMINI_MODEL,
            contents=[{"parts": [{"text": prompt}]}],
            config=types.GenerateContentConfig(
                temperature=Config.STYLIST_GEMINI_TEMPERATURE,
                max_output_tokens=Config.STYLIST_GEMINI_MAX_TOKENS,
                response_mime_type="application/json"
            )
        )
        
        if not response or not hasattr(response, 'text') or not response.text:
            raise Exception("Gemini API вернул пустой ответ")
        
        app.logger.info(f"Получен ответ от Gemini: {len(response.text)} символов")
        
        # Парсим ответ
        capsules = parse_gemini_capsule_response(response.text)
        
        if capsules is None:
            raise Exception("Не удалось распарсить ответ Gemini")
        
        app.logger.info(f"Успешно сгенерировано {len(capsules)} капсул")
        return capsules
    
    except Exception as e:
        app.logger.error(f"Ошибка вызова Gemini API: {e}")
        raise


@app.route('/generate-capsules', methods=['POST'])
def generate_capsules():
    """Генерация капсул через Gemini API"""
    start_time = time.time()
    
    try:
        if not gemini_client:
            return jsonify({
                'success': False,
                'error': 'Gemini клиент не инициализирован'
            }), 500
        
        # Получаем данные
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        wardrobe_items = data.get('wardrobeItems', [])
        current_season = data.get('currentSeason', 'summer')
        current_month = data.get('currentMonth', 'июнь')
        existing_capsules = data.get('existingCapsules', [])
        exclude_combinations = data.get('excludeCombinations', [])
        
        # Валидация
        if not wardrobe_items:
            return jsonify({
                'success': False,
                'error': 'Нет вещей в гардеробе'
            }), 400
        
        if len(wardrobe_items) < 3:
            return jsonify({
                'success': False,
                'error': 'Недостаточно вещей в гардеробе (минимум 3)'
            }), 400
        
        app.logger.info(f"Генерация капсул: {len(wardrobe_items)} вещей, сезон: {current_season} ({current_month})")
        
        # Строим промпт
        prompt = build_capsule_generation_prompt(
            wardrobe_items,
            current_season,
            current_month,
            existing_capsules
        )
        
        # Вызываем Gemini
        capsules = create_capsules_with_gemini(prompt)
        
        total_time = time.time() - start_time
        
        app.logger.info(f"Генерация капсул завершена за {total_time:.2f}с")
        
        return jsonify({
            'success': True,
            'capsules': capsules,
            'timing': {
                'total_time': round(total_time, 2)
            }
        })
    
    except Exception as e:
        total_time = time.time() - start_time
        error_msg = f"Ошибка генерации капсул: {e}"
        app.logger.error(error_msg)
        app.logger.error(f"Traceback: {traceback.format_exc()}")
        
        return jsonify({
            'success': False,
            'error': str(e),
            'timing': {
                'total_time': round(total_time, 2)
            }
        }), 500


@app.route('/generate-capsules-mock', methods=['POST'])
def generate_capsules_mock():
    """Mock генерация капсул по алгоритму (без Gemini)"""
    start_time = time.time()
    
    try:
        # Получаем данные
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        wardrobe_items = data.get('wardrobeItems', [])
        current_season = data.get('currentSeason', 'summer')
        current_month = data.get('currentMonth', 'июнь')
        existing_capsules = data.get('existingCapsules', [])
        exclude_combinations = data.get('excludeCombinations', [])
        
        # Валидация
        if not wardrobe_items:
            return jsonify({
                'success': False,
                'error': 'Нет вещей в гардеробе'
            }), 400
        
        if len(wardrobe_items) < 3:
            return jsonify({
                'success': False,
                'error': 'Недостаточно вещей в гардеробе (минимум 3)'
            }), 400
        
        app.logger.info(f"Mock генерация капсул: {len(wardrobe_items)} вещей, сезон: {current_season} ({current_month})")
        
        # Генерируем капсулы алгоритмически
        capsules = generate_capsules_algorithmically(
            wardrobe_items,
            current_season,
            current_month,
            existing_capsules,
            exclude_combinations
        )
        
        total_time = time.time() - start_time
        
        app.logger.info(f"Mock генерация капсул завершена за {total_time:.2f}с, создано {len(capsules)} капсул")
        
        return jsonify({
            'success': True,
            'capsules': capsules,
            'timing': {
                'total_time': round(total_time, 2)
            }
        })
    
    except Exception as e:
        total_time = time.time() - start_time
        error_msg = f"Ошибка mock генерации капсул: {e}"
        app.logger.error(error_msg)
        app.logger.error(f"Traceback: {traceback.format_exc()}")
        
        return jsonify({
            'success': False,
            'error': str(e),
            'timing': {
                'total_time': round(total_time, 2)
            }
        }), 500


def generate_capsules_algorithmically(wardrobe_items, current_season, current_month, existing_capsules, exclude_combinations):
    """
    Алгоритмическая генерация 3 капсул на основе правил стиля
    """
    import random
    from collections import defaultdict
    
    # Группируем вещи по категориям
    items_by_category = defaultdict(list)
    for item in wardrobe_items:
        category = item.get('category', 'UNKNOWN')
        items_by_category[category].append(item)
    
    # Определяем базовые правила сочетаемости цветов
    color_compatibility = {
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
    
    # Определяем стилевую совместимость
    style_compatibility = {
        'casual': ['casual', 'streetwear', 'sporty'],
        'formal': ['formal', 'business', 'elegant'],
        'streetwear': ['streetwear', 'casual', 'sporty'],
        'sporty': ['sporty', 'casual', 'streetwear'],
        'elegant': ['elegant', 'formal', 'business'],
        'business': ['business', 'formal', 'elegant']
    }
    
    # Сезонные приоритеты
    season_priorities = {
        'winter': ['OUTERWEAR', 'INNERWEAR', 'BODYWEAR', 'LEGWEAR', 'FOOTWEAR'],
        'spring': ['BODYWEAR', 'INNERWEAR', 'LEGWEAR', 'OUTERWEAR', 'FOOTWEAR'],
        'summer': ['BODYWEAR', 'LEGWEAR', 'FOOTWEAR', 'INNERWEAR'],
        'autumn': ['INNERWEAR', 'BODYWEAR', 'OUTERWEAR', 'LEGWEAR', 'FOOTWEAR']
    }
    
    def get_color_score(color1, color2):
        """Оценка совместимости цветов (0-1)"""
        if not color1 or not color2:
            return 0.5
        
        color1_clean = color1.lower().strip()
        color2_clean = color2.lower().strip()
        
        if color1_clean == color2_clean:
            return 0.3  # Одинаковые цвета - низкий приоритет
        
        if color2_clean in color_compatibility.get(color1_clean, []):
            return 1.0
        
        return 0.2
    
    def get_style_score(style1, style2):
        """Оценка совместимости стилей (0-1)"""
        if not style1 or not style2:
            return 0.5
        
        style1_clean = style1.lower().strip()
        style2_clean = style2.lower().strip()
        
        if style1_clean == style2_clean:
            return 1.0
        
        if style2_clean in style_compatibility.get(style1_clean, []):
            return 0.8
        
        return 0.3
    
    def get_season_score(item_season, current_season):
        """Оценка сезонной уместности (0-1)"""
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
    
    def calculate_item_priority(item, current_season):
        """Вычисляет приоритет вещи для текущего сезона"""
        usage_count = item.get('usageCount', 0)
        
        # Приоритет по использованию (как в спецификации)
        if 1 <= usage_count <= 3:
            usage_score = 3  # Высокий приоритет
        elif usage_count > 3:
            usage_score = 2  # Средний приоритет
        else:
            usage_score = 1  # Низкий приоритет
        
        # Сезонная уместность
        season_score = get_season_score(item.get('season'), current_season)
        
        # Итоговый приоритет
        return usage_score * 0.6 + season_score * 0.4
    
    def create_capsule_combination(base_items, strategy='balanced', used_combinations=None):
        """Создает комбинацию вещей для капсулы"""
        if used_combinations is None:
            used_combinations = []
        
        combination = []
        used_categories = set()
        
        # Сортируем по приоритету категорий для сезона
        category_priority = season_priorities.get(current_season, ['BODYWEAR', 'LEGWEAR', 'FOOTWEAR'])
        
        # Добавляем случайность в порядок категорий для разнообразия
        if strategy == 'experimental':
            category_priority = category_priority.copy()
            random.shuffle(category_priority)
        
        max_items = 4 if strategy == 'experimental' else 5  # Экспериментальные капсулы короче
        
        for category in category_priority:
            if category in items_by_category and len(items_by_category[category]) > 0:
                available_items = [
                    item for item in items_by_category[category] 
                    if item['id'] not in [c['id'] for c in combination]
                ]
                
                if not available_items:
                    continue
                
                # Выбираем вещь в зависимости от стратегии
                if strategy == 'popular':
                    # Приоритет популярным вещам (usageCount > 3)
                    popular_items = [item for item in available_items if item.get('usageCount', 0) > 3]
                    if popular_items:
                        selected = random.choice(popular_items)
                    else:
                        selected = max(available_items, key=lambda x: x.get('usageCount', 0))
                        
                elif strategy == 'experimental':
                    # Приоритет новым вещам (usageCount = 0)
                    new_items = [item for item in available_items if item.get('usageCount', 0) == 0]
                    rarely_used = [item for item in available_items if 1 <= item.get('usageCount', 0) <= 2]
                    
                    if new_items and len([c for c in combination if c.get('usageCount', 0) == 0]) < 2:
                        selected = random.choice(new_items)
                    elif rarely_used:
                        selected = random.choice(rarely_used)
                    else:
                        selected = random.choice(available_items)
                        
                else:  # balanced
                    # Сбалансированный выбор (приоритет usageCount 1-3)
                    balanced_items = [item for item in available_items if 1 <= item.get('usageCount', 0) <= 3]
                    if balanced_items:
                        selected = random.choice(balanced_items)
                    else:
                        priorities = [calculate_item_priority(item, current_season) for item in available_items]
                        max_priority = max(priorities)
                        best_items = [
                            item for item, priority in zip(available_items, priorities) 
                            if priority >= max_priority * 0.8
                        ]
                        selected = random.choice(best_items)
                
                combination.append(selected)
                used_categories.add(category)
                
                # Ограничиваем количество вещей в капсуле
                if len(combination) >= max_items:
                    break
        
        # Если мало вещей, добавляем из других категорий
        if len(combination) < 3:
            for category, items in items_by_category.items():
                if category not in used_categories:
                    available = [
                        item for item in items 
                        if item['id'] not in [c['id'] for c in combination]
                    ]
                    if available:
                        combination.append(random.choice(available))
                        if len(combination) >= 3:
                            break
        
        # Проверяем уникальность комбинации
        combination_ids = set(item['id'] for item in combination)
        for used_combo in used_combinations:
            used_ids = set(used_combo)
            # Если совпадает больше 70% вещей, пытаемся изменить
            if len(combination_ids & used_ids) / len(combination_ids | used_ids) > 0.7:
                # Заменяем одну вещь на случайную из той же категории
                if len(combination) > 3:
                    item_to_replace = random.choice(combination)
                    category = item_to_replace.get('category')
                    if category in items_by_category:
                        alternatives = [
                            item for item in items_by_category[category]
                            if item['id'] not in combination_ids
                        ]
                        if alternatives:
                            combination.remove(item_to_replace)
                            combination.append(random.choice(alternatives))
                break
        
        return combination
    
    def generate_capsule_name(items, strategy):
        """Генерирует название капсулы"""
        names_by_strategy = {
            'balanced': ['Casual Mix', 'Daily Look', 'Комфорт Стиль'],
            'popular': ['Проверенный', 'Любимый Лук', 'Классика'],
            'experimental': ['Новый Образ', 'Эксперимент', 'Свежий Взгляд']
        }
        
        return random.choice(names_by_strategy.get(strategy, ['Стильный Образ']))
    
    def generate_capsule_description(items, strategy, season):
        """Генерирует описание капсулы"""
        season_names = {
            'winter': 'зимний',
            'spring': 'весенний', 
            'summer': 'летний',
            'autumn': 'осенний'
        }
        
        strategy_descriptions = {
            'balanced': f'Сбалансированный {season_names.get(season, "")} образ',
            'popular': f'Проверенная комбинация для {season_names.get(season, "любого")} сезона',
            'experimental': f'Экспериментальный {season_names.get(season, "")} лук'
        }
        
        return strategy_descriptions.get(strategy, f'Стильный образ для {season_names.get(season, "любого сезона")}')
    
    def generate_recommendations(items, season):
        """Генерирует рекомендации для капсулы"""
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
    
    # Генерируем 3 капсулы с разными стратегиями
    strategies = ['balanced', 'popular', 'experimental']
    capsules = []
    used_combinations = []  # Отслеживаем уже созданные комбинации
    
    for i, strategy in enumerate(strategies):
        # Создаем комбинацию с учетом уже использованных
        items = create_capsule_combination(wardrobe_items, strategy, used_combinations)
        
        if len(items) < 3:
            continue  # Пропускаем если недостаточно вещей
        
        # Добавляем комбинацию в список использованных
        used_combinations.append([item['id'] for item in items])
        
        # Создаем капсулу
        capsule = {
            'id': f'mock_{i+1}',
            'name': generate_capsule_name(items, strategy),
            'description': generate_capsule_description(items, strategy, current_season),
            'reasoning': f'Стратегия "{strategy}": комбинация из {len(items)} вещей с учетом сезона {current_season}',
            'recommendations': generate_recommendations(items, current_season),
            'itemIds': [item['id'] for item in items],
            'items': items,
            'strategy': strategy
        }
        
        capsules.append(capsule)
    
    # Если получилось меньше 3 капсул, дополняем случайными
    attempts = 0
    while len(capsules) < 3 and attempts < 5:
        items = create_capsule_combination(wardrobe_items, 'balanced', used_combinations)
        if len(items) >= 3:
            used_combinations.append([item['id'] for item in items])
            capsule = {
                'id': f'mock_{len(capsules)+1}',
                'name': f'Образ {len(capsules)+1}',
                'description': f'Дополнительный образ для {current_season}',
                'reasoning': 'Автоматически сгенерированная комбинация',
                'recommendations': generate_recommendations(items, current_season),
                'itemIds': [item['id'] for item in items],
                'items': items,
                'strategy': 'auto'
            }
            capsules.append(capsule)
        attempts += 1
    
    return capsules[:3]  # Возвращаем максимум 3 капсулы


def cleanup_resources():
    """Очистка ресурсов при завершении"""
    global model, tokenizer, image_processor

    try:
        app.logger.info("Начинаем очистку ресурсов...")

        # Очищаем модель
        if model is not None:
            del model
            model = None

        if tokenizer is not None:
            del tokenizer
            tokenizer = None

        if image_processor is not None:
            del image_processor
            image_processor = None

        # Очищаем GPU память
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.synchronize()

        # Принудительная сборка мусора
        gc.collect()

        app.logger.info("Ресурсы успешно очищены")

    except Exception as e:
        app.logger.error(f"Ошибка при очистке ресурсов: {e}")


def signal_handler(signum, frame):
    """Обработчик сигналов для graceful shutdown"""
    app.logger.info(f"Получен сигнал {signum}, завершаем работу...")
    cleanup_resources()
    sys.exit(0)

def start_server():
    """Запуск FastVLM сервера через waitress (многопоточный режим)"""
    try:
        app.logger.debug(f"Запускаем FastVLM сервер через waitress на {Config.HOST}:{Config.PORT}...")
        app.logger.debug(f"Многопоточный режим: {Config.THREADS} потоков")
        app.logger.debug(f"Ограничение соединений: {Config.CONNECTION_LIMIT}")
        app.logger.debug(f"Таймаут соединений: {Config.CONNECTION_TIMEOUT}с")
        app.logger.debug(f"Server starting on {Config.HOST}:{Config.PORT}")

        # Запускаем сервер через waitress с многопоточным режимом
        serve(
            app,
            host=Config.HOST,
            port=Config.PORT,
            threads=Config.THREADS,
            # Основные настройки для производительности
            connection_limit=Config.CONNECTION_LIMIT,
            max_request_body_size=104857600,  # 100MB максимальный размер тела запроса
            max_request_header_size=8192,     # 8KB максимальный размер заголовков
        )
    except Exception as e:
        error_msg = f"Ошибка запуска FastVLM сервера: {e}"
        app.logger.debug(error_msg)
        app.logger.error(error_msg)
        app.logger.error(f"Traceback: {traceback.format_exc()}")

if __name__ == '__main__':
    # Регистрируем обработчики сигналов
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        # Валидация конфигурации
        Config.validate_config()

        # Настройка логирования
        setup_logging()

        # Создание директорий
        os.makedirs(FASTVLM_RESULTS_DIR, exist_ok=True)

        # Загрузка промптов
        load_prompts()

        # Проверяем доступность Ollama
        check_ollama_availability()

        # Инициализируем Gemini API
        initialize_gemini()

        # Инициализируем Background Remover (ТОЛЬКО CPU для лучшей производительности)
        try:
            app.logger.info("Инициализация Background Remover на CPU...")
            background_remover = BackgroundRemover(use_gpu=False)
            app.logger.info("Background Remover инициализирован успешно (CPU)")
        except Exception as e:
            app.logger.error(f"Ошибка инициализации Background Remover: {e}")
            background_remover = None

        # Загрузка модели
        app.logger.info("Запуск FastVLM сервера...")
        if not load_model():
            app.logger.error("Не удалось загрузить модель, выходим")
            sys.exit(1)

        app.logger.info(f"FastVLM сервер запускается на {Config.HOST}:{Config.PORT}")
        app.logger.info(f"Конфигурация: {Config.THREADS} потоков, {Config.CONNECTION_LIMIT} соединений")

        # Запуск сервера с помощью waitress
        serve(
            app,
            host=Config.HOST,
            port=Config.PORT,
            threads=Config.THREADS,
            connection_limit=Config.CONNECTION_LIMIT,
            cleanup_interval=30,
            channel_timeout=Config.CONNECTION_TIMEOUT
        )

    except KeyboardInterrupt:
        app.logger.info("Получен сигнал прерывания")
    except Exception as e:
        app.logger.error(f"Критическая ошибка: {e}")
        app.logger.error(traceback.format_exc())
    finally:
        cleanup_resources()
