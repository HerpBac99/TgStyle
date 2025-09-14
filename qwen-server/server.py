#!/usr/bin/env python3
"""
Qwen2.5-VL Server - отдельный сервер для анализа изображений
Использует модель Qwen2.5-VL от Alibaba Cloud

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

# Импортируем конфигурацию
from config import Config

# Импортируем необходимые модули для Qwen2.5-VL
import torch
from transformers import AutoProcessor, AutoModelForVision2Seq
from qwen_vl_utils import process_vision_info

# Импортируем Gemini API
try:
    from google import genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    print("Google GenAI library not available. Install with: pip install google-genai")

app = Flask(__name__)

# Глобальные переменные для модели
model = None
processor = None

# Глобальные переменные для Gemini
gemini_client = None

# Глобальная переменная для промпта
default_prompt = None
style_prompt = None

# Директория для сохранения результатов Qwen2.5-VL
QWEN_RESULTS_DIR = os.path.join(os.path.dirname(__file__), 'results')

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
    log_file = os.path.join(Config.LOG_DIR, 'qwen.log')

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
        default_prompt = 'Find elements of clothing and accessories in the picture. Describe the clothing and accessories in MAXIMUM DETAIL. It is FORBIDDEN to omit even the smallest details.'
        app.logger.warning(f"Файл промпта не найден: {prompt_file}. Используется промпт по умолчанию")

    except Exception as e:
        default_prompt = 'Find elements of clothing and accessories in the picture. Describe the clothing and accessories in MAXIMUM DETAIL. It is FORBIDDEN to omit even the smallest details.'
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

def create_stylist_response(qwen_analysis):
    """Создает креативный ответ ИИ стилиста на основе анализа Qwen2.5-VL через Gemini"""
    global gemini_client, style_prompt

    if not gemini_client:
        app.logger.debug("Gemini API недоступен, используем базовый анализ Qwen2.5-VL")
        return qwen_analysis

    try:
        app.logger.debug("Генерация креативного ответа стилиста через Gemini API")

        # Используем промпт из файла style_prompt.md
        # Экранируем JSON для безопасной вставки в промпт
        safe_analysis = str(qwen_analysis).replace('{', '{{').replace('}', '}}')
        formatted_prompt = style_prompt.replace('{fastvlm_analysis}', qwen_analysis)

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
        creative_response = response.text.strip()
        return creative_response

    except Exception as e:
        app.logger.error(f"Ошибка создания креативного ответа: {e}")
        # Fallback на оригинальный анализ Qwen2.5-VL
        return qwen_analysis

def load_model():
    """Загружает Qwen2.5-VL модель в память с оптимизацией для GPU/CPU"""
    global model, processor, performance_stats

    try:
        app.logger.debug("Загружаем Qwen2.5-VL модель в память...")
        app.logger.debug("Начало загрузки модели")
        start_time = time.time()

        # Определяем устройство
        device = 'cuda' if torch.cuda.is_available() else 'cpu'

        app.logger.debug(f"Загрузка на устройство: {device}")
        if torch.cuda.is_available():
            app.logger.debug(f"GPU: {torch.cuda.get_device_name(0)}")
            app.logger.debug(f"Память GPU: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f}GB")

        # Загружаем модель и процессор
        with gpu_memory_manager():
            model = AutoModelForVision2Seq.from_pretrained(
                Config.MODEL_NAME,
                torch_dtype=Config.TORCH_DTYPE,
                device_map="auto" if device == 'cuda' else None,
                trust_remote_code=True
            )

            processor = AutoProcessor.from_pretrained(
                Config.MODEL_NAME,
                trust_remote_code=True
            )

        load_time = time.time() - start_time
        performance_stats['gpu_enabled'] = torch.cuda.is_available()
        performance_stats['model_loaded_at'] = time.time()

        app.logger.info(f"🤖 Qwen2.5-VL модель загружена: {Config.MODEL_NAME} на {device}")
        app.logger.info(f"⚡ Модель готова к работе! Время загрузки: {load_time:.1f}с в {time.strftime('%H:%M:%S')}")

        # Выводим информацию о памяти GPU
        if torch.cuda.is_available():
            allocated = torch.cuda.memory_allocated() / 1024**3
            reserved = torch.cuda.memory_reserved() / 1024**3
            app.logger.debug(f"Память GPU: выделено {allocated:.1f}GB, зарезервировано {reserved:.1f}GB")

        return True

    except Exception as e:
        error_msg = f"Ошибка загрузки модели: {e}"
        app.logger.debug(f"Ошибка загрузки модели: {e}")
        app.logger.error(error_msg, )
        app.logger.error(f"Traceback: {traceback.format_exc()}")
        return False

def save_qwen_result(clean_analysis, raw_output, image_debug):
    """Сохраняет результат Qwen2.5-VL в JSON файл"""
    try:
        # Создаем директорию если не существует
        os.makedirs(QWEN_RESULTS_DIR, exist_ok=True)

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
        filename = f"qwen_result_{timestamp}.json"
        filepath = os.path.join(QWEN_RESULTS_DIR, filename)

        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(result_data, f, ensure_ascii=False, indent=2)

        app.logger.debug(f"Результат Qwen2.5-VL сохранен: {filepath}")
        return filepath

    except Exception as e:
        app.logger.error(f"Ошибка сохранения результата Qwen2.5-VL: {e}")
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
        if model is None or processor is None:
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

        decode_start_time = time.time()
        app.logger.info(f"🚀 Начало анализа изображения (устройство: {model.device}) в {time.strftime('%H:%M:%S')}")

        # Декодируем изображение
        try:
            image_data = base64.b64decode(image_base64)
            image = Image.open(io.BytesIO(image_data))
            decode_time = time.time() - decode_start_time
            app.logger.debug(f"📸 Декодирование изображения: {decode_time:.3f}с")

        except Exception as e:
            update_performance_stats(time.time() - analysis_start_time, success=False)
            app.logger.error(f"Ошибка декодирования изображения: {e}")
            return jsonify({
                'success': False,
                'error': f'Invalid image data: {e}'
            }), 400

        # Сохраняем во временный файл
        save_start_time = time.time()
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as temp_file:
            image.save(temp_file, 'JPEG')
            temp_image_path = temp_file.name
        save_time = time.time() - save_start_time
        app.logger.debug(f"💾 Сохранение временного файла: {save_time:.3f}с")

        try:
            inference_start_time = time.time()
            app.logger.info(f"⚡ Начало inference в {time.strftime('%H:%M:%S')}")

            # Подготавливаем сообщения для Qwen2.5-VL
            messages = [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "image": temp_image_path,
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ]

            # Обрабатываем входные данные
            process_start_time = time.time()
            image_inputs, video_inputs, video_kwargs = process_vision_info(messages, return_video_kwargs=True)
            process_time = time.time() - process_start_time
            app.logger.debug(f"🔄 Обработка vision info: {process_time:.3f}с")

            # Подготавливаем входные данные для модели
            processor_start_time = time.time()
            inputs = processor(
                text=[processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)],
                images=image_inputs,
                videos=video_inputs,
                return_tensors="pt",
                padding=True,
            ).to(model.device)
            processor_time = time.time() - processor_start_time
            app.logger.debug(f"🎛️ Обработка процессором: {processor_time:.3f}с")

            # Выполняем анализ с управлением памятью
            generation_start_time = time.time()
            app.logger.info(f"🧠 Начало генерации в {time.strftime('%H:%M:%S')}")
            with gpu_memory_manager():
                with torch.no_grad():
                    generated_ids = model.generate(
                        **inputs,
                        max_new_tokens=Config.MAX_NEW_TOKENS,
                        temperature=Config.TEMPERATURE,
                        do_sample=Config.DO_SAMPLE,
                        top_p=Config.TOP_P if Config.DO_SAMPLE else None,
                        use_cache=True,
                        pad_token_id=processor.tokenizer.eos_token_id,
                    )
            generation_time = time.time() - generation_start_time
            app.logger.info(f"✨ Генерация завершена: {generation_time:.2f}с")

            # Декодируем результат
            decode_start_time = time.time()
            generated_ids_trimmed = [
                out_ids[len(in_ids) :] for in_ids, out_ids in zip(inputs.input_ids, generated_ids)
            ]
            result_text = processor.batch_decode(
                generated_ids_trimmed, skip_special_tokens=True, clean_up_tokenization_spaces=False
            )[0]
            decode_response_time = time.time() - decode_start_time
            app.logger.debug(f"📝 Декодирование ответа: {decode_response_time:.3f}с")

            # Извлекаем чистый анализ
            clean_analysis = result_text.strip()

            # Рассчитываем время инференса
            inference_time = time.time() - inference_start_time

            # Сохраняем результат Qwen2.5-VL для отладки
            image_debug = {
                'size': image.size,
                'mode': image.mode,
                'filename': temp_image_path.split('\\')[-1] if temp_image_path else 'unknown'
            }
            save_qwen_result(clean_analysis, result_text, image_debug)

            # Создаем креативный ответ стилиста через Gemini API
            stylist_response = create_stylist_response(clean_analysis)

            # Рассчитываем общее время
            total_time = time.time() - analysis_start_time
            
            # Финальное логирование времени
            app.logger.info(f"🏁 Анализ завершен в {time.strftime('%H:%M:%S')}")
            app.logger.info(f"⏱️ Общее время: {total_time:.2f}с | Inference: {inference_time:.2f}с | Генерация: {generation_time:.2f}с")

            # Обновляем статистику
            update_performance_stats(total_time, success=True)

            app.logger.debug(f"Анализ успешно завершен за {total_time:.2f}с (инференс: {inference_time:.2f}с)")

            response_data = {
                'success': True,
                'technical_analysis': clean_analysis,
                'analysis': stylist_response,  # Только креативный ответ стилиста
                'model_used': Config.MODEL_NAME,
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
        app.logger.error(error_msg, )

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
            'model_name': Config.MODEL_NAME,
            'device': str(model.device),
            'torch_dtype': str(Config.TORCH_DTYPE),
            'model_path': Config.MODEL_NAME
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
    """Запуск Flask сервера"""
    try:
        app.logger.debug(f"Запускаем Qwen2.5-VL сервер на {Config.HOST}:{Config.PORT}...")
        app.logger.debug(f"Server starting on {Config.HOST}:{Config.PORT}")

        app.run(
            host=Config.HOST,
            port=Config.PORT,
            debug=False,
            use_reloader=False
        )
    except Exception as e:
        error_msg = f"Ошибка запуска Qwen2.5-VL сервера: {e}"
        app.logger.debug(error_msg)
        app.logger.error(error_msg, )

if __name__ == '__main__':
    # Загружаем переменные окружения
    Config.load_env()

    # Создаем необходимые директории
    Config.ensure_directories()

    # Настраиваем логирование
    setup_logging()

    app.logger.debug("Qwen2.5-VL Server starting...")

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
