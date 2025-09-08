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
from logging.handlers import RotatingFileHandler
from flask import Flask, request, jsonify
from PIL import Image
import io
import os
import psutil
from contextlib import contextmanager

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

app = Flask(__name__)

# Глобальные переменные для модели
model = None
tokenizer = None
image_processor = None
context_len = None

# Глобальная переменная для промпта
default_prompt = None

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
    """Настройка логирования"""
    log_file = os.path.join(Config.LOG_DIR, 'fastvlm.log')

    # Создаем форматтер
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    # Создаем ротирующий обработчик
    handler = RotatingFileHandler(
        log_file,
        maxBytes=Config.LOG_MAX_BYTES,
        backupCount=Config.LOG_BACKUP_COUNT
    )
    handler.setFormatter(formatter)

    # Настраиваем логгер приложения
    app.logger.addHandler(handler)
    app.logger.setLevel(getattr(logging, Config.LOG_LEVEL))

    # Настраиваем корневой логгер
    root_logger = logging.getLogger()
    root_logger.addHandler(handler)
    root_logger.setLevel(getattr(logging, Config.LOG_LEVEL))

    print(f"Логирование настроено: {log_file}")

def load_prompt():
    """Загружает промпт из файла prompt.md"""
    global default_prompt
    prompt_file = os.path.join(os.path.dirname(__file__), 'prompt.md')

    try:
        with open(prompt_file, 'r', encoding='utf-8') as f:
            content = f.read()

        # Ищем основной промпт между ``` блоками
        import re
        prompt_match = re.search(r'```\s*(.*?)\s*```', content, re.DOTALL)
        if prompt_match:
            default_prompt = prompt_match.group(1).strip()
        else:
            # Если нет ``` блоков, берем весь контент
            default_prompt = content.strip()

        app.logger.info(f"Промпт загружен из файла: {prompt_file}")
        print(f"Промпт загружен из файла: {len(default_prompt)} символов")

    except FileNotFoundError:
        default_prompt = 'Опиши подробно какие предметы одежды ты видишь на этом изображении. Какой тип, цвет, стиль и материал? Пожалуйста, отвечай на русском языке, используя точные термины моды.'
        app.logger.warning(f"Файл промпта не найден: {prompt_file}. Используется промпт по умолчанию")
        print(f"Файл промпта не найден. Используется промпт по умолчанию")

    except Exception as e:
        default_prompt = 'Опиши подробно какие предметы одежды ты видишь на этом изображении. Какой тип, цвет, стиль и материал? Пожалуйста, отвечай на русском языке, используя точные термины моды.'
        app.logger.error(f"Ошибка загрузки промпта: {e}. Используется промпт по умолчанию")
        print(f"Ошибка загрузки промпта. Используется промпт по умолчанию")

def load_model():
    """Загружает FastVLM модель в память с оптимизацией для GPU/CPU"""
    global model, tokenizer, image_processor, context_len, performance_stats

    try:
        print("Загружаем FastVLM модель в память...")
        app.logger.info("Начало загрузки модели")
        start_time = time.time()

        # Проверяем существование модели
        if not os.path.exists(Config.MODEL_PATH):
            raise FileNotFoundError(f"Модель не найдена: {Config.MODEL_PATH}")

        # Проверяем доступность GPU
        gpu_available = torch.cuda.is_available()
        device = 'cuda' if gpu_available else 'cpu'
        
        print(f"Загрузка на устройство: {device}")
        if gpu_available:
            print(f"GPU: {torch.cuda.get_device_name(0)}")
            print(f"Память GPU: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f}GB")
        
        # Загружаем модель
        disable_torch_init()
        model_name = get_model_name_from_path(Config.MODEL_PATH)
        
        with gpu_memory_manager():
            tokenizer, model, image_processor, context_len = load_pretrained_model(
                Config.MODEL_PATH, None, model_name,
                device=device,
                torch_dtype=Config.TORCH_DTYPE
            )

        load_time = time.time() - start_time
        performance_stats['gpu_enabled'] = gpu_available
        performance_stats['model_loaded_at'] = time.time()
        
        app.logger.info(f"FastVLM модель загружена: {model_name} на {device} за {load_time:.1f}с")
        print(f"FastVLM модель загружена и готова к работе! (загрузка: {load_time:.1f}с)")
        
        # Выводим информацию о памяти GPU
        if gpu_available:
            allocated = torch.cuda.memory_allocated() / 1024**3
            reserved = torch.cuda.memory_reserved() / 1024**3
            print(f"Память GPU: выделено {allocated:.1f}GB, зарезервировано {reserved:.1f}GB")
        
        return True

    except Exception as e:
        error_msg = f"Ошибка загрузки модели: {e}"
        print(f"Ошибка загрузки модели: {e}")
        app.logger.error(error_msg, exc_info=True)
        app.logger.error(f"Traceback: {traceback.format_exc()}")
        return False

def extract_analysis_from_output(output):
    """Извлекает текст анализа из вывода FastVLM"""
    try:
        lines = output.strip().split('\n')

        # Ищем последнюю строку с результатом
        result_lines = []
        for line in reversed(lines):
            line = line.strip()
            if line and not line.startswith('`torch_dtype`') and not line.startswith('The following'):
                # Очищаем от мусора
                clean_line = line.encode('utf-8', errors='replace').decode('utf-8', errors='replace')
                clean_line = ' '.join(clean_line.split())
                result_lines.insert(0, clean_line)

        result_text = '\n'.join(result_lines[:10])

        if not result_text:
            result_text = output.strip()

        return result_text

    except Exception as e:
        app.logger.error(f"Ошибка при извлечении анализа: {e}")
        return "Ошибка при обработке результатов анализа"

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

        app.logger.info(f"Начало анализа изображения (устройство: {model.device})")

        # Декодируем изображение
        try:
            image_data = base64.b64decode(image_base64)
            image = Image.open(io.BytesIO(image_data))
            app.logger.debug(f"Изображение загружено: {image.size}, режим: {image.mode}")
        except Exception as e:
            update_performance_stats(time.time() - analysis_start_time, success=False)
            app.logger.error(f"Ошибка декодирования изображения: {e}")
            return jsonify({
                'success': False,
                'error': f'Invalid image data: {e}'
            }), 400

        # Сохраняем во временный файл
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as temp_file:
            image.save(temp_file, 'JPEG')
            temp_image_path = temp_file.name

        try:
            inference_start_time = time.time()
            
            # Создаем промпт для модели
            qs = prompt
            if model.config.mm_use_im_start_end:
                qs = DEFAULT_IM_START_TOKEN + DEFAULT_IMAGE_TOKEN + DEFAULT_IM_END_TOKEN + '\n' + qs
            else:
                qs = DEFAULT_IMAGE_TOKEN + '\n' + qs

            conv = conv_templates["qwen_2"].copy()
            conv.append_message(conv.roles[0], qs)
            conv.append_message(conv.roles[1], None)
            prompt_full = conv.get_prompt()

            # Выполняем анализ с управлением памятью
            with gpu_memory_manager():
                # Токенизируем промпт
                input_ids = tokenizer_image_token(prompt_full, tokenizer, IMAGE_TOKEN_INDEX, return_tensors='pt').unsqueeze(0).to(model.device)

                # Обрабатываем изображение
                image_tensor = process_images([image], image_processor, model.config)[0]

                # Выполняем анализ
                with torch.no_grad():
                    output_ids = model.generate(
                        input_ids,
                        images=image_tensor.unsqueeze(0).to(model.device).half(),
                        image_sizes=[image.size],
                        do_sample=Config.DO_SAMPLE,
                        temperature=Config.TEMPERATURE,
                        top_p=None,
                        num_beams=1,
                        max_new_tokens=Config.MAX_NEW_TOKENS,
                        use_cache=True
                    )

            # Декодируем результат
            result_text = tokenizer.batch_decode(output_ids, skip_special_tokens=True)[0].strip()

            # Извлекаем чистый анализ
            clean_analysis = extract_analysis_from_output(result_text)
            
            inference_time = time.time() - inference_start_time
            total_time = time.time() - analysis_start_time
            
            # Обновляем статистику
            update_performance_stats(total_time, success=True)

            app.logger.info(f"Анализ успешно завершен за {total_time:.2f}с (инференс: {inference_time:.2f}с)")

            response_data = {
                'success': True,
                'analysis': clean_analysis,
                'model_used': model.config.model_type,
                'device': str(model.device),
                'timing': {
                    'total_time': round(total_time, 2),
                    'inference_time': round(inference_time, 2),
                    'preprocessing_time': round(inference_start_time - analysis_start_time, 2)
                }
            }
            
            # Добавляем информацию о GPU если используется
            if torch.cuda.is_available() and 'cuda' in str(model.device):
                response_data['gpu_memory_used'] = round(torch.cuda.memory_allocated() / 1024**2, 1)  # MB

            return jsonify(response_data)

        finally:
            # Удаляем временный файл
            try:
                os.unlink(temp_image_path)
            except:
                pass

    except Exception as e:
        total_time = time.time() - analysis_start_time
        update_performance_stats(total_time, success=False)
        error_msg = f"Ошибка анализа: {e}"
        app.logger.error(error_msg, exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e),
            'timing': {
                'total_time': round(total_time, 2)
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
def get_gpu_info():
    """Проверка работы на GPU"""
    try:
        if not torch.cuda.is_available():
            return jsonify({
                'gpu_available': False,
                'message': 'GPU не доступен',
                'device': 'cpu'
            })

        gpu_info = {
            'gpu_available': True,
            'gpu_name': torch.cuda.get_device_name(0),
            'gpu_memory_allocated_mb': round(torch.cuda.memory_allocated(0) / (1024**2), 2),
            'gpu_memory_reserved_mb': round(torch.cuda.memory_reserved(0) / (1024**2), 2),
            'gpu_memory_total_mb': round(torch.cuda.get_device_properties(0).total_memory / (1024**2), 2),
            'device': 'cuda'
        }

        app.logger.debug(f"GPU info: {gpu_info['gpu_name']}")
        return jsonify(gpu_info)

    except Exception as e:
        app.logger.error(f"GPU check error: {e}")
        return jsonify({
            'gpu_available': False,
            'error': str(e),
            'device': 'cpu'
        }), 500

@app.route('/model', methods=['GET'])
def get_model_info():
    """Информация о загруженной модели"""
    try:
        if model is None:
            return jsonify({
                'loaded': False,
                'message': 'Модель не загружена'
            })

        model_info = {
            'loaded': True,
            'model_name': model.config.model_type,
            'device': str(model.device),
            'context_length': context_len,
            'torch_dtype': str(Config.TORCH_DTYPE),
            'model_path': Config.MODEL_PATH
        }

        app.logger.debug(f"Model info: {model_info['model_name']}")
        return jsonify(model_info)

    except Exception as e:
        app.logger.error(f"Model info error: {e}")
        return jsonify({
            'loaded': False,
            'error': str(e)
        }), 500

def signal_handler(signum, frame):
    """Обработка сигналов завершения"""
    print("Получен сигнал завершения, останавливаем сервер...")
    app.logger.info("Server shutdown initiated")

    if model and torch.cuda.is_available():
        # Очистка GPU памяти
        torch.cuda.empty_cache()
        app.logger.info("GPU memory cleared")

    sys.exit(0)

def start_server():
    """Запуск Flask сервера"""
    try:
        print(f"Запускаем FastVLM сервер на {Config.HOST}:{Config.PORT}...")
        app.logger.info(f"Server starting on {Config.HOST}:{Config.PORT}")

        app.run(
            host=Config.HOST,
            port=Config.PORT,
            debug=False,
            use_reloader=False
        )
    except Exception as e:
        error_msg = f"Ошибка запуска FastVLM сервера: {e}"
        print(error_msg)
        app.logger.error(error_msg, exc_info=True)

if __name__ == '__main__':
    # Загружаем переменные окружения
    Config.load_env()

    # Создаем необходимые директории
    Config.ensure_directories()

    # Настраиваем логирование
    setup_logging()

    print("FastVLM Server starting...")

    # Валидируем конфигурацию
    try:
        Config.validate_config()
    except Exception as e:
        print(f"Ошибка конфигурации: {e}")
        sys.exit(1)

    # Устанавливаем обработчики сигналов
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Загружаем промпт
    load_prompt()

    # Загружаем модель
    if load_model():
        # Запускаем сервер
        start_server()
    else:
        print("Не удалось загрузить модель, сервер не запущен")
        sys.exit(1)
