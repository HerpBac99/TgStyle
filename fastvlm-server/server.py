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
try:
    from google import genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    app.logger.warning("Google GenAI library not available. Install with: pip install google-genai")

app = Flask(__name__)

# Глобальные переменные для модели
model = None
tokenizer = None
image_processor = None
context_len = None

# Глобальные переменные для Gemini
gemini_client = None

# Глобальная переменная для промпта
default_prompt = None
style_prompt = None

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
        backupCount=Config.LOG_BACKUP_COUNT,
        encoding='utf-8'
    )
    handler.setFormatter(formatter)

    # Настраиваем логгер приложения
    app.logger.addHandler(handler)
    app.logger.setLevel(getattr(logging, Config.LOG_LEVEL))

    # Настраиваем корневой логгер
    root_logger = logging.getLogger()
    root_logger.addHandler(handler)
    root_logger.setLevel(getattr(logging, Config.LOG_LEVEL))

    app.logger.debug(f"Логирование настроено: {log_file}")

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

        app.logger.debug(f"Промпт загружен из файла: {prompt_file}")

    except FileNotFoundError:
        default_prompt = 'Describe in detail the clothing items you see in this image. What type, color, style, and material? Please answer in Russian, using precise fashion terminology.'
        app.logger.warning(f"Файл промпта не найден: {prompt_file}. Используется промпт по умолчанию")

    except Exception as e:
        default_prompt = 'Опиши подробно какие предметы одежды ты видишь на этом изображении. Какой тип, цвет, стиль и материал? Пожалуйста, отвечай на русском языке, используя точные термины моды.'
        app.logger.error(f"Ошибка загрузки промпта: {e}. Используется промпт по умолчанию")

def load_style_prompt():
    """Загружает промпт стилиста из файла style_prompt.md"""
    global style_prompt
    prompt_file = os.path.join(os.path.dirname(__file__), 'style_prompt.md')

    try:
        with open(prompt_file, 'r', encoding='utf-8') as f:
            content = f.read()

        # Ищем промпт между ``` блоками
        import re
        prompt_match = re.search(r'```\s*(.*?)\s*```', content, re.DOTALL)
        if prompt_match:
            style_prompt = prompt_match.group(1).strip()
        else:
            # Если нет ``` блоков, берем весь контент
            style_prompt = content.strip()

        app.logger.debug(f"Промпт стилиста загружен из файла: {prompt_file}")

    except FileNotFoundError:
        style_prompt = '''Ты профессиональный ИИ стилист и консультант по моде.

На основе технического анализа одежды ниже, создай креативный, дружелюбный и экспертный ответ от лица стилиста.

ТЕХНИЧЕСКЙ АНАЛИЗ:
{fastvlm_analysis}

Преобразуй анализ в живой совет стилиста с рекомендациями по сочетаниям и стилю. Используй эмодзи и пиши на русском языке максимум 800 символов.'''
        app.logger.warning(f"Файл промпта стилиста не найден: {prompt_file}. Используется промпт по умолчанию")

    except Exception as e:
        style_prompt = '''Ты профессиональный стилист. На основе анализа одежды {fastvlm_analysis} дай креативный совет по стилю на русском языке.'''
        app.logger.error(f"Ошибка загрузки промпта стилиста: {e}. Используется промпт по умолчанию")

def initialize_gemini():
    """Инициализация Gemini API клиента"""
    global gemini_client
    
    try:
        if not GEMINI_AVAILABLE:
            app.logger.warning("Google GenAI library not available. Install with: pip install google-genai")
            return False
        
        if not Config.GEMINI_API_KEY:
            app.logger.warning("GEMINI_API_KEY не установлен. Gemini функции недоступны.")
            return False
        
        # Создаем клиента Gemini
        gemini_client = genai.Client(api_key=Config.GEMINI_API_KEY)
        app.logger.debug(f"Gemini API клиент инициализирован (модель: {Config.GEMINI_MODEL})")
        return True
        
    except Exception as e:
        app.logger.error(f"Ошибка инициализации Gemini API: {e}")
        return False

def create_stylist_response(fastvlm_analysis):
    """Создает креативный ответ ИИ стилиста на основе анализа FastVLM через Gemini"""
    global gemini_client, style_prompt

    if not gemini_client:
        app.logger.debug("Gemini API недоступен, используем базовый анализ FastVLM")
        app.logger.info("Gemini API недоступен, используем базовый анализ FastVLM")
        return fastvlm_analysis

    try:
        app.logger.debug("Генерация креативного ответа стилиста через Gemini API")
        app.logger.info("Генерация креативного ответа через Gemini API")

        # Используем промпт из файла style_prompt.md
        # Экранируем JSON для безопасной вставки в промпт
        safe_analysis = str(fastvlm_analysis).replace('{', '{{').replace('}', '}}')
        formatted_prompt = style_prompt.replace('{fastvlm_analysis}', fastvlm_analysis)

        # Логируем отправку запроса в Gemini
        app.logger.info(f"Отправка запроса в Gemini (промпт: {len(formatted_prompt)} символов)")

        gemini_request_start = time.time()
        response = gemini_client.models.generate_content(
            model=Config.GEMINI_MODEL,
            contents=formatted_prompt,
            config=genai.types.GenerateContentConfig(
                temperature=Config.GEMINI_TEMPERATURE,
                max_output_tokens=Config.GEMINI_MAX_TOKENS,
                thinking_config=genai.types.ThinkingConfig(
                    thinking_budget=Config.GEMINI_THINKING_BUDGET
                ) if Config.GEMINI_THINKING_BUDGET > 0 else None
            )
        )

        gemini_request_time = time.time() - gemini_request_start
        creative_response = response.text.strip()

        # Логируем успешный ответ от Gemini
        app.logger.info(f"Gemini ответил успешно: {len(creative_response)} символов за {gemini_request_time:.2f} сек")

        return creative_response

    except Exception as e:
        app.logger.error(f"Ошибка создания креативного ответа: {e}")
        app.logger.error(f"Ошибка Gemini API: {str(e)}")
        # Fallback на оригинальный анализ FastVLM
        return fastvlm_analysis

def load_model():
    """Загружает FastVLM модель в память с оптимизацией для GPU/CPU"""
    global model, tokenizer, image_processor, context_len, performance_stats

    try:
        app.logger.debug("Загружаем FastVLM модель в память...")
        app.logger.debug("Начало загрузки модели")
        start_time = time.time()

        # Проверяем существование модели
        if not os.path.exists(Config.MODEL_PATH):
            raise FileNotFoundError(f"Модель не найдена: {Config.MODEL_PATH}")

        # Проверяем доступность GPU
        gpu_available = torch.cuda.is_available()
        device = 'cuda' if gpu_available else 'cpu'
        
        app.logger.debug(f"Загрузка на устройство: {device}")
        if gpu_available:
            app.logger.debug(f"GPU: {torch.cuda.get_device_name(0)}")
            app.logger.debug(f"Память GPU: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f}GB")
        
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
        
        app.logger.debug(f"FastVLM модель загружена: {model_name} на {device} за {load_time:.1f}с")
        app.logger.debug(f"FastVLM модель загружена и готова к работе! (загрузка: {load_time:.1f}с)")
        
        # Выводим информацию о памяти GPU
        if gpu_available:
            allocated = torch.cuda.memory_allocated() / 1024**3
            reserved = torch.cuda.memory_reserved() / 1024**3
            app.logger.debug(f"Память GPU: выделено {allocated:.1f}GB, зарезервировано {reserved:.1f}GB")
        
        return True

    except Exception as e:
        error_msg = f"Ошибка загрузки модели: {e}"
        app.logger.debug(f"Ошибка загрузки модели: {e}")
        app.logger.error(error_msg)
        app.logger.error(f"Traceback: {traceback.format_exc()}")
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

def extract_analysis_from_output(output):
    """Извлекает структурированный анализ из вывода FastVLM (обновлено для английского промпта)"""
    try:
        lines = output.strip().split('\n')
        
        # Английские маркеры для нового промпта
        start_markers = [
            '### main debugrmation',
            '**gender:**',
            '**age:**', 
            '### head',
            '**hair length:**',
            '**hair:**',
            '### torso',
            '### legs'
        ]
        
        # Стоп-маркеры для завершения анализа
        stop_markers = [
            'end analysis',
            'analysis complete',
            '<|endoftext|>',
            '<|im_end|>',
            'the analysis shows',
            'in conclusion',
            'overall,',
            'the clothing'
        ]
        
        start_idx = 0
        end_idx = len(lines)
        
        # Находим начало структурированного анализа
        for i, line in enumerate(lines):
            line_lower = line.lower().strip()
            if any(marker in line_lower for marker in start_markers):
                start_idx = i
                break
            # Альтернативно: пропускаем строки с промптом
            if line.strip() and not any(skip in line_lower for skip in [
                'user:', 'system:', '<|im_start|>user', 'analyze the clothing', 
                'you are a fashion', 'assistant:'
            ]):
                start_idx = i
                break
        
        # Находим конец анализа
        for i, line in enumerate(lines[start_idx:], start_idx):
            line_lower = line.lower().strip()
            if any(marker in line_lower for marker in stop_markers):
                end_idx = i
                break
        
        # Извлекаем только структурированную часть
        analysis_lines = lines[start_idx:end_idx]
        
        # Очищаем от мусора и служебных токенов
        cleaned_lines = []
        for line in analysis_lines:
            line = line.strip()
            
            # Пропускаем служебные токены
            if any(skip in line for skip in [
                '<|im_end|>', '<|im_start|>', '`torch_dtype`', 'The following',
                '<|endoftext|>'
            ]):
                continue
            
            # Пропускаем пустые строки и строки с промптом
            if line and not any(skip in line.lower() for skip in [
                'user:', 'assistant:', 'system:', 'analyze the image',
                'you are a fashion'
            ]):
                # Очищаем кодировку
                clean_line = line.encode('utf-8', errors='replace').decode('utf-8', errors='replace')
                clean_line = ' '.join(clean_line.split())  # Нормализуем пробелы
                cleaned_lines.append(clean_line)
        
        # Объединяем очищенные строки
        result_text = '\n'.join(cleaned_lines)
        
        # Если результат пустой, возвращаем исходный вывод
        if not result_text.strip():
            app.logger.warning("Не удалось извлечь структурированный анализ, возвращаем исходный текст")
            result_text = output.strip()
        
        app.logger.debug(f"Извлечен анализ длиной {len(result_text)} символов")
        return result_text

    except Exception as e:
        app.logger.error(f"Ошибка при извлечении анализа: {e}")
        return output.strip()  # Возвращаем исходный текст при ошибке

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

        app.logger.debug(f"Начало анализа изображения (устройство: {model.device})")

        # Декодируем изображение
        try:
            image_data = base64.b64decode(image_base64)
            image = Image.open(io.BytesIO(image_data))

            # Логируем информацию о полученном изображении
            image_size_mb = len(image_data) / (1024 * 1024)
            app.logger.info(f"Пришла фотография: {image.size[0]}x{image.size[1]} пикселей, вес: {image_size_mb:.2f} MB, пользователь: {nickname}")

        except Exception as e:
            update_performance_stats(time.time() - analysis_start_time, success=False)
            app.logger.error(f"Ошибка декодирования изображения: {e}")
            return jsonify({
                'success': False,
                'error': f'Invalid image data: {e}'
            }), 400

        # Сохраняем во временный файл с максимальным качеством
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as temp_file:
            # Сохраняем с качеством 100% для сохранения деталей
            image.save(temp_file, 'JPEG', quality=100, optimize=False, subsampling=0)
            temp_image_path = temp_file.name

        # Логируем качество сохранения
        app.logger.info(f"Сохранил изображение с качеством 100%: {image.size[0]}x{image.size[1]}")

        try:
            # Логируем запуск FastVLM анализа
            app.logger.info(f"Запустил первый анализ FastVLM для пользователя {nickname}")

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
                app.logger.info(f"Оригинальный размер изображения перед обработкой: {image.size[0]}x{image.size[1]}")
                image_tensor = process_images([image], image_processor, model.config)[0]
                app.logger.info(f"Размер тензора после process_images: {image_tensor.shape}")

                # Установка seed для детерминизма
                torch.manual_seed(42)
                if torch.cuda.is_available():
                    torch.cuda.manual_seed_all(42)
                
                # Выполняем анализ с оптимизированными параметрами
                with torch.no_grad():
                    # Создаем attention_mask
                    attention_mask = torch.ones_like(input_ids)

                    output_ids = model.generate(
                        input_ids,
                        attention_mask=attention_mask,
                        images=image_tensor.unsqueeze(0).to(model.device).half(),
                        image_sizes=[image.size],
                        do_sample=Config.DO_SAMPLE,
                        temperature=Config.TEMPERATURE,
                        top_p=Config.TOP_P if Config.DO_SAMPLE else None,
                        repetition_penalty=Config.REPETITION_PENALTY,
                        max_new_tokens=Config.MAX_NEW_TOKENS,
                        use_cache=True,
                        pad_token_id=tokenizer.eos_token_id,
                        eos_token_id=tokenizer.eos_token_id
                    )

            # Декодируем результат
            result_text = tokenizer.batch_decode(output_ids, skip_special_tokens=True)[0].strip()
            # Извлекаем чистый анализ
            # clean_analysis = extract_analysis_from_output(result_text)
            clean_analysis = (result_text)

            # Рассчитываем время инференса
            inference_time = time.time() - inference_start_time

            # Логируем ответ FastVLM
            app.logger.info(f"Ответ LLM: длина {len(clean_analysis)} символов, время: {inference_time:.2f} сек")

            # Сохраняем результат FastVLM для отладки
            image_debug = {
                'size': image.size,
                'mode': image.mode,
                'filename': temp_image_path.split('\\')[-1] if temp_image_path else 'unknown'
            }
            save_fastvlm_result(clean_analysis, result_text, image_debug)

            # Создаем креативный ответ стилиста через Gemini API
            app.logger.info(f"Отправляем в Gemini для пользователя {nickname}")
            gemini_start_time = time.time()
            stylist_response = create_stylist_response(clean_analysis)
            gemini_time = time.time() - gemini_start_time
            app.logger.info(f"Ответ от GEMINI получен: длина {len(stylist_response)} символов, время: {gemini_time:.2f} сек")

            # Рассчитываем общее время
            total_time = time.time() - analysis_start_time

            # Сохраняем результаты анализа с nickname
            save_analysis_with_nickname(
                clean_analysis,
                stylist_response,
                nickname,
                f"{image.size[0]}x{image.size[1]}",
                inference_time,
                gemini_time
            )

            # Обновляем статистику
            update_performance_stats(total_time, success=True)

            app.logger.debug(f"Анализ успешно завершен за {total_time:.2f}с (инференс: {inference_time:.2f}с)")

            response_data = {
                'success': True,
                'technical_analysis': clean_analysis,
                'analysis': stylist_response,  # Только креативный ответ стилиста
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

def signal_handler(signum, frame):
    """Обработка сигналов завершения"""
    app.logger.debug("Получен сигнал завершения, останавливаем сервер...")
    app.logger.debug("Server shutdown initiated")

    if model and torch.cuda.is_available():
        # Очистка GPU памяти
        torch.cuda.empty_cache()
        app.logger.debug("GPU memory cleared")

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
    # Загружаем переменные окружения
    Config.load_env()

    # Создаем необходимые директории
    Config.ensure_directories()

    # Настраиваем логирование
    setup_logging()

    app.logger.debug("FastVLM Server starting...")

    # Валидируем конфигурацию
    try:
        Config.validate_config()
    except Exception as e:
        app.logger.debug(f"Ошибка конфигурации: {e}")
        sys.exit(1)

    # Устанавливаем обработчики сигналов
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Загружаем промпт
    load_prompt()
    
    # Загружаем промпт стилиста 
    load_style_prompt()

    # Инициализируем Gemini API
    initialize_gemini()

    # Загружаем модель
    if load_model():
        # Запускаем сервер
        start_server()
    else:
        app.logger.debug("Не удалось загрузить модель, сервер не запущен")
        sys.exit(1)
