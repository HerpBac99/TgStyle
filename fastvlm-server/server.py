#!/usr/bin/env python3
"""
FastVLM Server - отдельный сервер для анализа изображений
Запускается в отдельном процессе от основного приложения
"""

import sys
import json
import base64
import tempfile
import signal
import time
import logging
from logging.handlers import RotatingFileHandler
from flask import Flask, request, jsonify
from PIL import Image
import io
import os
import psutil

# Импортируем конфигурацию
from config import Config

# Импортируем необходимые модули для FastVLM
import torch

# Импортируем FastVLM
sys.path.append('../ml-fastvlm')
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

    print(f"📝 Логирование настроено: {log_file}")

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

        app.logger.info(f"✅ Промпт загружен из файла: {prompt_file}")
        print(f"📝 Промпт загружен из файла: {len(default_prompt)} символов")

    except FileNotFoundError:
        default_prompt = 'Опиши подробно какие предметы одежды ты видишь на этом изображении. Какой тип, цвет, стиль и материал? Пожалуйста, отвечай на русском языке, используя точные термины моды.'
        app.logger.warning(f"⚠️ Файл промпта не найден: {prompt_file}. Используется промпт по умолчанию")
        print(f"⚠️ Файл промпта не найден. Используется промпт по умолчанию")

    except Exception as e:
        default_prompt = 'Опиши подробно какие предметы одежды ты видишь на этом изображении. Какой тип, цвет, стиль и материал? Пожалуйста, отвечай на русском языке, используя точные термины моды.'
        app.logger.error(f"❌ Ошибка загрузки промпта: {e}. Используется промпт по умолчанию")
        print(f"❌ Ошибка загрузки промпта. Используется промпт по умолчанию")

def load_model():
    """Загружает FastVLM модель в память"""
    global model, tokenizer, image_processor, context_len

    try:
        print("🔄 Загружаем FastVLM модель в память...")
        app.logger.info("Начало загрузки модели")

        # Проверяем существование модели
        if not os.path.exists(Config.MODEL_PATH):
            raise FileNotFoundError(f"Модель не найдена: {Config.MODEL_PATH}")

        # Загружаем модель
        disable_torch_init()
        model_name = get_model_name_from_path(Config.MODEL_PATH)
        tokenizer, model, image_processor, context_len = load_pretrained_model(
            Config.MODEL_PATH, None, model_name,
            device=Config.DEVICE,
            torch_dtype=Config.TORCH_DTYPE
        )

        app.logger.info(f"FastVLM модель загружена: {model_name} на {Config.DEVICE}")
        print("FastVLM модель загружена и готова к работе!")
        return True

    except Exception as e:
        error_msg = f"Ошибка загрузки модели: {e}"
        print(f"Ошибка загрузки модели: {e}")
        app.logger.error(error_msg, exc_info=True)
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
        health_data = {
            'status': 'healthy',
            'model_loaded': model is not None,
            'timestamp': time.time(),
            'device': Config.DEVICE,
            'torch_version': torch.__version__
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

@app.route('/analyze', methods=['POST'])
def analyze():
    """Анализ изображения"""
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
        prompt = data.get('prompt', default_prompt)

        app.logger.info("Начало анализа изображения")

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
            image.save(temp_file, 'JPEG')
            temp_image_path = temp_file.name

        try:
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

            app.logger.info("Анализ успешно завершен")

            return jsonify({
                'success': True,
                'analysis': clean_analysis,
                'model_used': model.config.model_type,
                'device': str(model.device)
            })

        finally:
            # Удаляем временный файл
            try:
                os.unlink(temp_image_path)
            except:
                pass

    except Exception as e:
        error_msg = f"Ошибка анализа: {e}"
        app.logger.error(error_msg, exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
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
        print(f"🚀 Запускаем FastVLM сервер на {Config.HOST}:{Config.PORT}...")
        app.logger.info(f"Server starting on {Config.HOST}:{Config.PORT}")

        app.run(
            host=Config.HOST,
            port=Config.PORT,
            debug=False,
            use_reloader=False
        )
    except Exception as e:
        error_msg = f"❌ Ошибка запуска FastVLM сервера: {e}"
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
        print(f"❌ Ошибка конфигурации: {e}")
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
        print("❌ Не удалось загрузить модель, сервер не запущен")
        sys.exit(1)
