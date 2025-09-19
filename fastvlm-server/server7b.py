#!/usr/bin/env python3
"""
FastVLM 7B Server - сервер для анализа изображений с 7B моделью
Оптимизированная версия для большой модели FastVLM

Особенности 7B версии:
- Оптимизированное управление GPU памятью
- Flash Attention для ускорения
- Gradient Checkpointing для экономии памяти
- Меньше параллельных запросов
- Больший таймаут для обработки
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

# Импортируем конфигурацию 7B
from config7b import Config7B as Config

# Импортируем необходимые модули для FastVLM
import torch

# Оптимизации для 7B модели
if torch.cuda.is_available():
    # Очищаем cache перед загрузкой
    torch.cuda.empty_cache()
    # Устанавливаем максимальное использование памяти
    torch.cuda.set_per_process_memory_fraction(0.9)

# Импортируем FastVLM
sys.path.append('./models/ml-fastvlm')
from llava.utils import disable_torch_init
from llava.conversation import conv_templates
from llava.model.builder import load_pretrained_model
from llava.mm_utils import tokenizer_image_token, process_images, get_model_name_from_path
from llava.constants import IMAGE_TOKEN_INDEX, DEFAULT_IMAGE_TOKEN, DEFAULT_IM_START_TOKEN, DEFAULT_IM_END_TOKEN

# Импортируем Gemini API
try:
    from google import genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False

# Импортируем requests для Ollama API
try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False

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
ollama_model = "gemma3:4b"

# Глобальные переменные для промптов
default_prompt = None
style_prompt = None

# Директория для сохранения результатов FastVLM 7B
FASTVLM_RESULTS_DIR = os.path.join(os.path.dirname(__file__), 'results/7b')

# Статистика производительности
performance_stats = {
    'total_requests': 0,
    'successful_requests': 0,
    'failed_requests': 0,
    'avg_response_time': 0.0,
    'gpu_memory_usage': 0.0,
    'model_loading_time': 0.0
}


def setup_logging():
    """Настройка системы логирования для 7B сервера"""
    Config.ensure_directories()
    
    # Основной лог файл
    log_file = os.path.join(Config.LOG_DIR, 'fastvlm7b.log')
    
    # Создаем форматтер для логов
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Настраиваем ротацию логов
    handler = RotatingFileHandler(
        log_file, 
        maxBytes=Config.LOG_MAX_BYTES, 
        backupCount=Config.LOG_BACKUP_COUNT,
        encoding='utf-8'
    )
    handler.setFormatter(formatter)
    
    # Настраиваем логгер приложения
    app.logger.setLevel(getattr(logging, Config.LOG_LEVEL))
    app.logger.addHandler(handler)
    
    # Настраиваем консольный вывод
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    app.logger.addHandler(console_handler)
    
    app.logger.info("Система логирования FastVLM 7B инициализирована")


@contextmanager
def gpu_memory_management():
    """Контекстный менеджер для управления GPU памятью в 7B модели"""
    if torch.cuda.is_available():
        # Очищаем cache перед операцией
        torch.cuda.empty_cache()
        initial_memory = torch.cuda.memory_allocated()
        
        try:
            yield
        finally:
            # Принудительная очистка после операции
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                gc.collect()
                final_memory = torch.cuda.memory_allocated()
                app.logger.debug(f"GPU память: {initial_memory/1024**2:.1f}MB -> {final_memory/1024**2:.1f}MB")
    else:
        yield


def load_prompts():
    """Загрузка промптов для анализа"""
    global default_prompt, style_prompt
    
    try:
        # Основной промпт
        prompt_file = os.path.join(os.path.dirname(__file__), 'prompt.md')
        if os.path.exists(prompt_file):
            with open(prompt_file, 'r', encoding='utf-8') as f:
                default_prompt = f.read().strip()
        else:
            default_prompt = "Describe the clothing in this image in detail."
        
        # Стилевой промпт
        style_prompt_file = os.path.join(os.path.dirname(__file__), 'style_prompt.md')
        if os.path.exists(style_prompt_file):
            with open(style_prompt_file, 'r', encoding='utf-8') as f:
                style_prompt = f.read().strip()
        else:
            style_prompt = default_prompt
            
        app.logger.info("Промпты загружены успешно")
        
    except Exception as e:
        app.logger.error(f"Ошибка загрузки промптов: {e}")
        default_prompt = "Describe the clothing in this image."
        style_prompt = default_prompt


def load_model():
    """Загрузка FastVLM 7B модели с оптимизациями"""
    global model, tokenizer, image_processor, context_len
    
    try:
        app.logger.info("Начинаем загрузку FastVLM 7B модели...")
        start_time = time.time()
        
        # Отключаем инициализацию torch
        disable_torch_init()
        
        # Получаем имя модели
        model_name = get_model_name_from_path(Config.MODEL_PATH)
        app.logger.info(f"Загружаем модель: {model_name}")
        
        # Загружаем модель с автоматической квантизацией для 8GB GPU
        app.logger.info(f"4-bit квантизация: {Config.USE_4BIT}")
        app.logger.info(f"8-bit квантизация: {Config.USE_8BIT}")
        
        with gpu_memory_management():
            tokenizer, model, image_processor, context_len = load_pretrained_model(
                model_path=Config.MODEL_PATH,
                model_base=None,
                model_name=model_name,
                device=Config.DEVICE,
                load_4bit=Config.USE_4BIT,  # Автоматически для GPU < 12GB
                load_8bit=Config.USE_8BIT
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
        
        app.logger.info(f"FastVLM 7B модель загружена успешно за {loading_time:.2f}с")
        app.logger.info(f"Контекстная длина: {context_len}")
        
        if torch.cuda.is_available():
            memory_mb = torch.cuda.memory_allocated() / 1024 / 1024
            app.logger.info(f"GPU память занята: {memory_mb:.1f} MB")
            
        return True
        
    except Exception as e:
        app.logger.error(f"Ошибка загрузки FastVLM 7B модели: {e}")
        app.logger.error(traceback.format_exc())
        return False


def analyze_image_fastvlm(image_base64, prompt_text=None):
    """Анализ изображения с помощью FastVLM 7B модели"""
    try:
        if not all([model, tokenizer, image_processor]):
            return None, "Модель не загружена"
        
        # Используем промпт или дефолтный
        if not prompt_text:
            prompt_text = style_prompt if style_prompt else default_prompt
        
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
        
        # Генерация с оптимизациями для 7B модели
        with gpu_memory_management():
            with torch.inference_mode():
                output_ids = model.generate(
                    input_ids,
                    images=image_tensor.unsqueeze(0).to(dtype=Config.TORCH_DTYPE, device=Config.DEVICE),
                    image_sizes=[image.size],
                    do_sample=Config.FASHION_ANALYSIS_CONFIG['do_sample'],
                    temperature=Config.FASHION_ANALYSIS_CONFIG['temperature'],
                    top_p=Config.FASHION_ANALYSIS_CONFIG['top_p'],
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
        
        app.logger.info(f"FastVLM 7B анализ завершен, длина ответа: {len(outputs)} символов")
        return outputs, None
        
    except Exception as e:
        app.logger.error(f"Ошибка анализа изображения: {e}")
        app.logger.error(traceback.format_exc())
        return None, str(e)


# === API Эндпоинты ===

@app.route('/health', methods=['GET'])
def health_check():
    """Проверка здоровья FastVLM 7B сервера"""
    try:
        gpu_info = {}
        if torch.cuda.is_available():
            gpu_info = {
                'gpu_name': torch.cuda.get_device_name(0),
                'gpu_memory_allocated_mb': torch.cuda.memory_allocated() / 1024 / 1024,
                'gpu_memory_reserved_mb': torch.cuda.memory_reserved() / 1024 / 1024,
                'gpu_memory_total_mb': torch.cuda.get_device_properties(0).total_memory / 1024 / 1024
            }
        
        return jsonify({
            'status': 'healthy',
            'model_type': '7B',
            'model_loaded': model is not None,
            'model_path': os.path.basename(Config.MODEL_PATH),
            'device': Config.DEVICE,
            'torch_version': torch.__version__,
            'timestamp': time.time(),
            'port': Config.PORT,
            'performance_stats': performance_stats,
            **gpu_info
        })
    except Exception as e:
        app.logger.error(f"Ошибка health check: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/analyze', methods=['POST'])
def analyze_endpoint():
    """Анализ изображения с помощью FastVLM 7B"""
    start_time = time.time()
    performance_stats['total_requests'] += 1
    
    try:
        data = request.get_json()
        if not data or 'image_base64' not in data:
            return jsonify({'success': False, 'error': 'Отсутствует image_base64'}), 400
        
        image_base64 = data['image_base64']
        prompt_text = data.get('prompt', None)
        
        # Анализируем изображение
        analysis, error = analyze_image_fastvlm(image_base64, prompt_text)
        
        response_time = time.time() - start_time
        
        if error:
            performance_stats['failed_requests'] += 1
            app.logger.error(f"Ошибка анализа: {error}")
            return jsonify({
                'success': False,
                'error': error,
                'response_time': response_time
            }), 500
        
        performance_stats['successful_requests'] += 1
        # Обновляем среднее время ответа
        performance_stats['avg_response_time'] = (
            (performance_stats['avg_response_time'] * (performance_stats['successful_requests'] - 1) + response_time) 
            / performance_stats['successful_requests']
        )
        
        app.logger.info(f"Анализ завершен за {response_time:.2f}с")
        
        return jsonify({
            'success': True,
            'analysis': analysis,
            'model_used': 'fastvlm_7b',
            'device': Config.DEVICE,
            'response_time': response_time,
            'model_type': '7B'
        })
        
    except Exception as e:
        performance_stats['failed_requests'] += 1
        app.logger.error(f"Ошибка в analyze_endpoint: {e}")
        app.logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/load', methods=['GET'])
def system_load():
    """Информация о нагрузке системы"""
    try:
        gpu_memory = 0
        gpu_memory_total = 0
        
        if torch.cuda.is_available():
            gpu_memory = torch.cuda.memory_allocated() / 1024 / 1024  # MB
            gpu_memory_total = torch.cuda.get_device_properties(0).total_memory / 1024 / 1024
        
        return jsonify({
            'cpu_percent': psutil.cpu_percent(),
            'memory_percent': psutil.virtual_memory().percent,
            'memory_used_gb': psutil.virtual_memory().used / 1024**3,
            'memory_total_gb': psutil.virtual_memory().total / 1024**3,
            'gpu_memory_mb': gpu_memory,
            'gpu_memory_total_mb': gpu_memory_total,
            'gpu_utilization': gpu_memory / gpu_memory_total * 100 if gpu_memory_total > 0 else 0,
            'timestamp': time.time()
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/gpu', methods=['GET'])
def gpu_info():
    """Информация о GPU"""
    try:
        if not torch.cuda.is_available():
            return jsonify({
                'gpu_available': False,
                'message': 'CUDA не доступен'
            })
        
        return jsonify({
            'gpu_available': True,
            'gpu_name': torch.cuda.get_device_name(0),
            'gpu_memory_allocated_mb': torch.cuda.memory_allocated() / 1024 / 1024,
            'gpu_memory_reserved_mb': torch.cuda.memory_reserved() / 1024 / 1024,
            'gpu_memory_total_mb': torch.cuda.get_device_properties(0).total_memory / 1024 / 1024,
            'device': Config.DEVICE,
            'cuda_version': torch.version.cuda,
            'torch_version': torch.__version__
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/model', methods=['GET'])
def model_info():
    """Информация о загруженной модели"""
    try:
        return jsonify({
            'loaded': model is not None,
            'model_name': 'FastVLM-7B',
            'model_path': Config.MODEL_PATH,
            'device': Config.DEVICE,
            'context_length': context_len,
            'torch_dtype': str(Config.TORCH_DTYPE),
            'config': Config.FASHION_ANALYSIS_CONFIG,
            'model_type': '7B',
            'quantization': 'FP16'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


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
        
        # Загрузка модели
        app.logger.info("Запуск FastVLM 7B сервера...")
        if not load_model():
            app.logger.error("Не удалось загрузить модель, выходим")
            sys.exit(1)
        
        app.logger.info(f"FastVLM 7B сервер запускается на {Config.HOST}:{Config.PORT}")
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
