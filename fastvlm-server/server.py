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

# Импортируем модуль инициализации
from core import ServerInitializer

# Импортируем необходимые модули для FastVLM
import torch

# Импортируем FastVLM
sys.path.append('./models/ml-fastvlm')
from llava.utils import disable_torch_init
from llava.conversation import conv_templates
from llava.model.builder import load_pretrained_model
from llava.mm_utils import tokenizer_image_token, process_images, get_model_name_from_path
from llava.constants import IMAGE_TOKEN_INDEX, DEFAULT_IMAGE_TOKEN, DEFAULT_IM_START_TOKEN, DEFAULT_IM_END_TOKEN

# Импортируем FashionCLIP для embeddings
try:
    from transformers import CLIPProcessor, CLIPModel
    import open_clip
    FASHION_CLIP_AVAILABLE = True
    print("✅ FashionCLIP libraries loaded successfully")
except ImportError as e:
    FASHION_CLIP_AVAILABLE = False
    print(f"⚠️  FashionCLIP libraries not available: {e}")
    print("Install with: pip install open-clip-torch transformers")

# Импортируем Gemini API

# Импортируем модуль умной предобработки изображений
from image_preprocessing import smart_preprocess_image

# Импортируем модуль удаления фона
from background_removal import BackgroundRemover

# Импортируем модули маппинга классификации
from mapper.classification_mappers import map_color_to_russian, map_material_to_russian, map_style_to_enum
from mapper.subtype_mapper import map_subtype_to_russian

# Импортируем сервисы
from core.analysis import AnalysisService
from core.classification import ClothingClassifier
from core.capsule_generation import CapsuleGenerationService

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

# Глобальные переменные для FashionCLIP
fashion_clip_model = None
fashion_clip_processor = None

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

# Статистика производительности (DEPRECATED - используется AnalysisService)
performance_stats = {
    'total_requests': 0,
    'successful_requests': 0,
    'failed_requests': 0,
    'total_processing_time': 0.0,
    'average_processing_time': 0.0,
    'gpu_enabled': False,
    'model_loaded_at': None
}

# Глобальные экземпляры сервисов (инициализируются после загрузки моделей)
analysis_service = None
clothing_classifier = None
capsule_service = None

# DEPRECATED: Методы анализа перенесены в core/analysis.py (AnalysisService)


# DEPRECATED: Методы перенесены в core/analysis.py и core/classification.py

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
    """Анализ изображения через AnalysisService"""
    try:
        if analysis_service is None:
            return jsonify({
                'success': False,
                'error': 'Analysis service not initialized'
            }), 500

        data = request.get_json()
        result, status_code = analysis_service.handle_analyze_request(data)
        return jsonify(result), status_code

    except Exception as e:
        app.logger.error(f"Ошибка в endpoint /analyze: {e}")
        app.logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/analyze_for_test', methods=['POST'])
def analyze_for_test():
    """Технический анализ изображения для тестирования через AnalysisService"""
    try:
        if analysis_service is None:
            return jsonify({
                'success': False,
                'error': 'Analysis service not initialized'
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

        # Конвертируем изображение в RGB если нужно
        try:
            image_data = base64.b64decode(image_base64)
            image = Image.open(io.BytesIO(image_data))
            
            # Конвертируем в RGB если нужно (для PNG с прозрачностью или palette режима)
            if image.mode in ('RGBA', 'LA', 'P'):
                # Создаем белый фон для прозрачных изображений
                background = Image.new('RGB', image.size, (255, 255, 255))
                if image.mode == 'P':
                    image = image.convert('RGBA')
                background.paste(image, mask=image.split()[-1] if image.mode in ('RGBA', 'LA') else None)
                image = background
            elif image.mode != 'RGB':
                image = image.convert('RGB')
            
            # Конвертируем обратно в base64
            output_buffer = io.BytesIO()
            image.save(output_buffer, format='JPEG', quality=100, optimize=False, subsampling=0)
            image_base64 = base64.b64encode(output_buffer.getvalue()).decode('utf-8')
                
        except Exception as e:
            app.logger.error(f"Ошибка декодирования изображения: {e}")
            return jsonify({
                'success': False,
                'error': f'Invalid image data: {e}'
            }), 400

        # Выполняем технический анализ через AnalysisService
        result = analysis_service.analyze_for_test(image_base64, prompt, nickname)
        
        if not result.get('success'):
            return jsonify(result), 500

        return jsonify(result)

    except Exception as e:
        app.logger.error(f"Ошибка анализа: {e}")
        app.logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            'success': False,
            'error': str(e),
            'technical_analysis': '',
            'analysis': '',
            'timing': {
                'total_time': 0,
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

# DEPRECATED: Методы классификации перенесены в core/classification.py (ClothingClassifier)


@app.route('/classify_clothing', methods=['POST'])
def classify_clothing():
    """Классификация одежды через ClothingClassifier"""
    app.logger.debug('[DEBUG] FastVLM /classify_clothing - START')

    try:
        if clothing_classifier is None:
            return jsonify({
                'success': False,
                'error': 'Clothing classifier not initialized'
            }), 500

        # Получаем данные
        data = request.get_json()
        if not data or 'image_base64' not in data:
            return jsonify({
                'success': False,
                'error': 'No image provided'
            }), 400

        image_base64 = data['image_base64']
        app.logger.debug(f'[DEBUG] FastVLM /classify_clothing - received image_base64 size: {len(image_base64) if image_base64 else 0}')

        # Правильная обработка base64: удаляем префикс data:image если есть
        if image_base64.startswith('data:image'):
            image_base64 = image_base64.split(',', 1)[1] if ',' in image_base64 else image_base64

        # Загружаем 6 промптов из файлов
        prompt_dir = os.path.join(os.path.dirname(__file__), 'prompt', 'Classify')
        
        prompts = {}
        prompt_files = {
            'category': 'Category_prompt.md',
            'type': 'Type_prompt.md',
            'color': 'Color_prompt.md',
            'material': 'Material_prompt.md',
            'style': 'Style_prompt.md',
            'season': 'Season_prompt.md'
        }
        
        for key, filename in prompt_files.items():
            filepath = os.path.join(prompt_dir, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    prompts[key] = f.read().strip()
                app.logger.debug(f"Загружен промпт {key}: {len(prompts[key])} символов")
            except Exception as e:
                app.logger.error(f"Ошибка загрузки промпта {key}: {e}")
                return jsonify({
                    'success': False,
                    'error': f'Failed to load prompt {key}: {e}'
                }), 500

        # Выполняем классификацию через ClothingClassifier
        result = clothing_classifier.classify_clothing(image_base64, prompts)
        
        if not result.get('success'):
            return jsonify(result), 500

        # Генерируем embedding через ClothingClassifier
        embedding_start = time.time()
        embedding, embedding_error = clothing_classifier.generate_fashion_embedding(result['processed_image'])
        embedding_time = time.time() - embedding_start
        
        if embedding_error:
            app.logger.warning(f"Не удалось сгенерировать embedding: {embedding_error}")
            embedding = None
        else:
            app.logger.info(f"Embedding сгенерирован за {embedding_time:.2f}с")

        result['classification']['embedding'] = embedding
        result['timing']['embedding_time'] = round(embedding_time, 2)

        # Формируем ответ
        return jsonify({
            'success': True,
            'classification': result['classification'],
            'processed_image_base64': f'data:image/png;base64,{result["processed_image_base64"]}',
            'raw_analysis': result['raw_analysis'],
            'timing': result['timing'],
            'image_info': result['image_info']
        })

    except Exception as e:
        error_msg = f"Ошибка классификации: {e}"
        app.logger.error(error_msg)
        app.logger.error(f"Traceback: {traceback.format_exc()}")

        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/embed-clothing', methods=['POST'])
def embed_clothing():
    """Генерация embedding вектора для изображения одежды"""
    start_time = time.time()

    try:
        if clothing_classifier is None:
            return jsonify({
                'success': False,
                'error': 'Clothing classifier not initialized'
            }), 500

        # Получаем данные
        data = request.get_json()
        if not data or 'image_base64' not in data:
            return jsonify({
                'success': False,
                'error': 'No image provided'
            }), 400

        image_base64 = data['image_base64']
        preprocess = data.get('preprocess', True)

        # Правильная обработка base64: удаляем префикс data:image если есть
        if image_base64.startswith('data:image'):
            image_base64 = image_base64.split(',', 1)[1] if ',' in image_base64 else image_base64

        # Декодируем изображение
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

        # Опциональная предобработка (удаление фона)
        processed_image = image
        preprocessing_time = 0
        
        if preprocess and background_remover is not None:
            preprocessing_start = time.time()
            processed_image, _ = background_remover.remove_background(image, upscale=True)
            processed_image = background_remover.crop_to_content(processed_image, padding=10)
            preprocessing_time = time.time() - preprocessing_start
            app.logger.info(f"Предобработка завершена за {preprocessing_time:.2f}с")

        # Генерируем embedding через ClothingClassifier
        embedding_start = time.time()
        embedding, error = clothing_classifier.generate_fashion_embedding(processed_image)
        embedding_time = time.time() - embedding_start

        if error:
            app.logger.error(f"Ошибка генерации embedding: {error}")
            return jsonify({
                'success': False,
                'error': error
            }), 500

        total_time = time.time() - start_time

        app.logger.info(f"✅ Embedding сгенерирован за {total_time:.2f}с")
        app.logger.info(f"📊 Детализация времени:")
        app.logger.info(f"   - Предобработка: {preprocessing_time:.2f}с")
        app.logger.info(f"   - Генерация embedding: {embedding_time:.2f}с")

        return jsonify({
            'success': True,
            'embedding': embedding,
            'embedding_dimension': len(embedding) if embedding else 0,
            'model_used': 'patrickjohncyh/fashion-clip',
            'timing': {
                'total_time': round(total_time, 2),
                'preprocessing_time': round(preprocessing_time, 2),
                'embedding_time': round(embedding_time, 2)
            },
            'image_info': {
                'original_size': f'{image.size[0]}x{image.size[1]}',
                'processed_size': f'{processed_image.size[0]}x{processed_image.size[1]}'
            }
        })

    except Exception as e:
        total_time = time.time() - start_time
        error_msg = f"Ошибка генерации embedding: {e}"
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

        # Удаляем фон с upscaling для лучшего качества краев
        # upscale=True увеличивает разрешение в 2x перед обработкой, затем возвращает к исходному
        result_image, processing_time = background_remover.remove_background(image, upscale=True)
        app.logger.info(f"Фон удален за {processing_time:.2f}с (с upscaling)")

        # НЕ применяем дополнительное размытие - используем встроенную постобработку rembg
        # result_image = background_remover.post_process_mask(result_image, feather=0)
        
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


@app.route('/analyze_gemini', methods=['POST'])
def analyze_gemini():
    """Прямой анализ фотографии через Gemini (без FastVLM) через AnalysisService"""
    try:
        if analysis_service is None:
            return jsonify({
                'success': False,
                'error': 'Analysis service not initialized'
            }), 500

        data = request.get_json()
        result, status_code = analysis_service.handle_analyze_gemini_request(data)
        return jsonify(result), status_code

    except Exception as e:
        app.logger.error(f"Ошибка в endpoint /analyze_gemini: {e}")
        app.logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# ============================================================================
# CAPSULE GENERATION ENDPOINTS
# ============================================================================

@app.route('/generate-capsules', methods=['POST'])
def generate_capsules():
    """Генерация капсул через Gemini API"""
    try:
        if capsule_service is None:
            return jsonify({
                'success': False,
                'error': 'Capsule service not initialized'
            }), 500
        
        data = request.get_json()
        result, status_code = capsule_service.handle_generate_capsules_request(data)
        return jsonify(result), status_code
    
    except Exception as e:
        app.logger.error(f"Ошибка в endpoint /generate-capsules: {e}")
        app.logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/generate-capsules-mock', methods=['POST'])
def generate_capsules_mock():
    """Mock генерация капсул по алгоритму (без Gemini)"""
    try:
        if capsule_service is None:
            return jsonify({
                'success': False,
                'error': 'Capsule service not initialized'
            }), 500
        
        data = request.get_json()
        result, status_code = capsule_service.handle_generate_capsules_mock_request(data)
        return jsonify(result), status_code
    
    except Exception as e:
        app.logger.error(f"Ошибка в endpoint /generate-capsules-mock: {e}")
        app.logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            'success': False,
            'error': str(e)
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

if __name__ == '__main__':
    # Регистрируем обработчики сигналов
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        # Валидация конфигурации
        Config.validate_config()

        # Создание директорий
        os.makedirs(FASTVLM_RESULTS_DIR, exist_ok=True)

        # Инициализация всех компонентов через ServerInitializer
        initializer = ServerInitializer(app)
        initializer.setup_logging()
        
        if not initializer.initialize_all():
            app.logger.error("Критическая ошибка инициализации, выходим")
            sys.exit(1)

        # Получаем состояние компонентов
        state = initializer.get_state()
        
        # Устанавливаем глобальные переменные для использования в endpoints
        model = state['model']
        tokenizer = state['tokenizer']
        image_processor = state['image_processor']
        context_len = state['context_len']
        fashion_clip_model = state['fashion_clip_model']
        fashion_clip_processor = state['fashion_clip_processor']
        gemini_client = state['gemini_client']
        ollama_available = state['ollama_available']
        ollama_url = state['ollama_url']
        ollama_model = state['ollama_model']
        
        # Устанавливаем промпты
        default_prompt = state['prompts']['default']
        style_prompt = state['prompts']['style']
        person_prompt = state['prompts']['person']
        clothing_prompt = state['prompts']['clothing']
        legs_prompt = state['prompts']['legs']
        shoes_prompt = state['prompts']['shoes']
        accessories_head_prompt = state['prompts']['accessories_head']
        accessories_hand_prompt = state['prompts']['accessories_hand']
        class_prompt = state['prompts']['class']

        # Инициализируем Background Remover (ТОЛЬКО CPU)
        try:
            background_remover = BackgroundRemover(use_gpu=False)
            app.logger.info("✅ Background Remover инициализирован успешно (CPU)")
        except Exception as e:
            app.logger.error(f"Ошибка инициализации Background Remover: {e}")
            background_remover = None

        # Инициализируем AnalysisService
        try:
            analysis_service = AnalysisService(
                model=model,
                tokenizer=tokenizer,
                image_processor=image_processor,
                gemini_client=gemini_client,
                ollama_config={
                    'available': ollama_available,
                    'url': ollama_url,
                    'model': ollama_model
                },
                prompts=state['prompts'],
                logger=app.logger
            )
            app.logger.info("✅ AnalysisService инициализирован успешно")
        except Exception as e:
            app.logger.error(f"Ошибка инициализации AnalysisService: {e}")
            sys.exit(1)

        # Инициализируем ClothingClassifier
        try:
            clothing_classifier = ClothingClassifier(
                analysis_service=analysis_service,
                background_remover=background_remover,
                fashion_clip_model=fashion_clip_model,
                fashion_clip_processor=fashion_clip_processor,
                config=Config,
                logger=app.logger
            )
            app.logger.info("✅ ClothingClassifier инициализирован успешно")
        except Exception as e:
            app.logger.error(f"Ошибка инициализации ClothingClassifier: {e}")
            sys.exit(1)

        # Инициализируем CapsuleGenerationService
        try:
            capsule_service = CapsuleGenerationService(
                gemini_client=gemini_client,
                config=Config,
                logger=app.logger
            )
            app.logger.info("✅ CapsuleGenerationService инициализирован успешно")
        except Exception as e:
            app.logger.error(f"Ошибка инициализации CapsuleGenerationService: {e}")
            sys.exit(1)


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
