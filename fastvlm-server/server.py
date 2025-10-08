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
    global default_prompt, style_prompt, person_prompt, clothing_prompt, legs_prompt, shoes_prompt, accessories_head_prompt, accessories_hand_prompt

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

def analyze_image_fastvlm(image_base64, prompt_text=None):
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
