"""
Модуль инициализации FastVLM сервера

Содержит функции для:
- Настройки логирования
- Загрузки промптов
- Загрузки ML моделей (FastVLM, FashionCLIP)
- Инициализации AI сервисов (Gemini, Ollama)
"""

import os
import sys
import time
import logging
import traceback
from logging.handlers import RotatingFileHandler

import torch

# Добавляем путь к fastvlm-server в sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
server_dir = os.path.dirname(current_dir)
if server_dir not in sys.path:
    sys.path.insert(0, server_dir)

# Импортируем конфигурацию
from config import Config

# Импортируем FastVLM
fastvlm_path = os.path.join(server_dir, 'models', 'ml-fastvlm')
if fastvlm_path not in sys.path:
    sys.path.append(fastvlm_path)

from llava.utils import disable_torch_init
from llava.model.builder import load_pretrained_model
from llava.mm_utils import get_model_name_from_path

# Импортируем FashionCLIP
try:
    from transformers import CLIPProcessor, CLIPModel
    FASHION_CLIP_AVAILABLE = True
except ImportError:
    FASHION_CLIP_AVAILABLE = False

# Импортируем Gemini
try:
    from google import genai
    from google.genai import types
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False

# Импортируем requests для Ollama
try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False


class ServerInitializer:
    """Класс для инициализации всех компонентов FastVLM сервера"""
    
    def __init__(self, app):
        """
        Args:
            app: Flask application instance
        """
        self.app = app
        self.logger = None
        
        # Модели
        self.model = None
        self.tokenizer = None
        self.image_processor = None
        self.context_len = None
        
        # FashionCLIP
        self.fashion_clip_model = None
        self.fashion_clip_processor = None
        
        # AI сервисы
        self.gemini_client = None
        self.ollama_available = False
        self.ollama_url = "http://127.0.0.1:11434"
        self.ollama_model = "gemma3:4b"
        
        # Промпты
        self.prompts = {
            'default': None,
            'style': None,
            'person': None,
            'clothing': None,
            'legs': None,
            'shoes': None,
            'accessories_head': None,
            'accessories_hand': None,
            'class': None
        }
        
        # Статистика производительности
        self.performance_stats = {
            'model_loading_time': 0.0,
            'model_loaded_at': None
        }
    
    def setup_logging(self):
        """Настройка логирования для FastVLM сервера"""
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
        self.app.logger.handlers.clear()

        # Создаем консольный handler только для вывода в терминал
        console_formatter = logging.Formatter('%(levelname)s:%(name)s:%(message)s')
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(console_formatter)
        console_handler.setLevel(logging.INFO)

        # Настраиваем логгер приложения
        self.app.logger.addHandler(handler)
        self.app.logger.addHandler(console_handler)
        self.app.logger.setLevel(getattr(logging, Config.LOG_LEVEL))

        # Настраиваем корневой логгер
        root_logger = logging.getLogger()
        root_logger.handlers.clear()
        root_logger.addHandler(handler)
        root_logger.setLevel(getattr(logging, Config.LOG_LEVEL))

        self.logger = self.app.logger
        self.logger.debug(f"Логирование FastVLM настроено: {log_file}")
    
    def load_prompts(self):
        """Загрузка промптов для анализа"""
        try:
            prompt_dir = os.path.join(os.path.dirname(__file__), '..', 'prompt')

            # PERSON промпт
            person_file = os.path.join(prompt_dir, 'PERSON_PROMPT.md')
            if os.path.exists(person_file):
                with open(person_file, 'r', encoding='utf-8') as f:
                    self.prompts['person'] = f.read().strip()
            else:
                self.prompts['person'] = "Describe the person in the photograph."
                self.logger.warning(f"PERSON промпт не найден: {person_file}")

            # CLOTHING промпт
            clothing_file = os.path.join(prompt_dir, 'CLOTHING_PROMPT.md')
            if os.path.exists(clothing_file):
                with open(clothing_file, 'r', encoding='utf-8') as f:
                    self.prompts['clothing'] = f.read().strip()
            else:
                self.prompts['clothing'] = "Describe the clothing on the person."
                self.logger.warning(f"CLOTHING промпт не найден: {clothing_file}")

            # LEG промпт
            leg_file = os.path.join(prompt_dir, 'LEG_PROMPT.md')
            if os.path.exists(leg_file):
                with open(leg_file, 'r', encoding='utf-8') as f:
                    self.prompts['legs'] = f.read().strip()
            else:
                self.prompts['legs'] = "Describe the clothing on the person's legs."
                self.logger.warning(f"LEG промпт не найден: {leg_file}")

            # SHOES промпт
            shoes_file = os.path.join(prompt_dir, 'SHOES_PROMPT.md')
            if os.path.exists(shoes_file):
                with open(shoes_file, 'r', encoding='utf-8') as f:
                    self.prompts['shoes'] = f.read().strip()
            else:
                self.prompts['shoes'] = "Describe the shoes on the person."
                self.logger.warning(f"SHOES промпт не найден: {shoes_file}")

            # ACCESSORIES HEAD промпт
            accessories_head_file = os.path.join(prompt_dir, 'ACCESSORIES_HEAD_PROMPT.md')
            if os.path.exists(accessories_head_file):
                with open(accessories_head_file, 'r', encoding='utf-8') as f:
                    self.prompts['accessories_head'] = f.read().strip()
            else:
                self.prompts['accessories_head'] = "Focus on the person's head and LIST all VISIBLE accessories."
                self.logger.warning(f"ACCESSORIES HEAD промпт не найден: {accessories_head_file}")

            # ACCESSORIES HAND промпт
            accessories_hand_file = os.path.join(prompt_dir, 'ACCESSORIES_HAND_PROMPT.md')
            if os.path.exists(accessories_hand_file):
                with open(accessories_hand_file, 'r', encoding='utf-8') as f:
                    self.prompts['accessories_hand'] = f.read().strip()
            else:
                self.prompts['accessories_hand'] = "Focus on the person's hands and LIST all VISIBLE accessories."
                self.logger.warning(f"ACCESSORIES HAND промпт не найден: {accessories_hand_file}")

            # Основной промпт
            self.prompts['default'] = "Analyze the clothing and style in this image."

            # Стилевой промпт для Gemini/Ollama
            style_prompt_file = os.path.join(prompt_dir, 'STYLIST_PROMPT.md')
            if os.path.exists(style_prompt_file):
                with open(style_prompt_file, 'r', encoding='utf-8') as f:
                    self.prompts['style'] = f.read().strip()
            else:
                self.prompts['style'] = self.prompts['default']
                self.logger.warning(f"STYLIST промпт не найден: {style_prompt_file}")

            # Промпты для классификации одежды загружаются отдельно в /classify_clothing endpoint
            # Используются 6 промптов из папки Classify/: Category, Type, Color, Material, Style, Season
            self.logger.info("✅ Промпты загружены успешно")
            return True

        except Exception as e:
            self.logger.error(f"Ошибка загрузки промптов: {e}")
            # Устанавливаем дефолтные значения
            self.prompts['default'] = "Describe the clothing in this image."
            self.prompts['clothing'] = "Describe the clothing on the person."
            self.prompts['shoes'] = "Describe the shoes on the person."
            self.prompts['accessories_head'] = "LIST all VISIBLE accessories on head."
            self.prompts['accessories_hand'] = "LIST all VISIBLE accessories on hands."
            self.prompts['style'] = self.prompts['default']
            self.prompts['person'] = "Describe the person."
            self.prompts['legs'] = "Describe the clothing on the person's legs."
            self.prompts['class'] = None  # Не используется
            return False
    
    def load_model(self):
        """Загрузка FastVLM модели с оптимизациями"""
        try:
            start_time = time.time()

            # Отключаем инициализацию torch
            disable_torch_init()

            # Получаем имя модели
            model_name = get_model_name_from_path(Config.MODEL_PATH)

            # Загружаем модель

            self.tokenizer, self.model, self.image_processor, self.context_len = load_pretrained_model(
                model_path=Config.MODEL_PATH,
                model_base=None,
                model_name=model_name,
                device=Config.DEVICE,
                load_4bit=getattr(Config, 'USE_4BIT', False),
                load_8bit=getattr(Config, 'USE_8BIT', False)
            )

            # Настройки модели для оптимизации
            if hasattr(self.model.config, 'use_cache'):
                self.model.config.use_cache = True

            # Устанавливаем pad_token_id
            if hasattr(self.model, 'generation_config') and self.model.generation_config:
                self.model.generation_config.pad_token_id = self.tokenizer.pad_token_id

            # Переводим модель в режим inference
            self.model.eval()

            # Flash Attention если доступен
            if hasattr(self.model.config, 'attn_implementation'):
                self.model.config.attn_implementation = Config.ATTENTION_IMPLEMENTATION
                self.logger.info(f"Использование Flash Attention: {Config.ATTENTION_IMPLEMENTATION}")

            loading_time = time.time() - start_time
            self.performance_stats['model_loading_time'] = loading_time
            self.performance_stats['model_loaded_at'] = time.time()

            if torch.cuda.is_available():
                memory_mb = torch.cuda.memory_allocated() / 1024 / 1024
                self.logger.warning(f"GPU память занята: {memory_mb:.1f} MB")

            return True

        except Exception as e:
            self.logger.error(f"Ошибка загрузки FastVLM модели: {e}")
            self.logger.error(traceback.format_exc())
            return False
    
    def load_fashion_clip(self):
        """Загрузка FashionCLIP модели для генерации embeddings"""
        try:
            if not FASHION_CLIP_AVAILABLE:
                self.logger.warning("FashionCLIP библиотеки недоступны")
                return False

            # Отключаем warning про symlinks на Windows
            os.environ['HF_HUB_DISABLE_SYMLINKS_WARNING'] = '1'
            start_time = time.time()

            # Используем специализированную fashion модель
            model_name = "patrickjohncyh/fashion-clip"
            
            try:
                self.fashion_clip_processor = CLIPProcessor.from_pretrained(model_name)
                self.fashion_clip_model = CLIPModel.from_pretrained(model_name)
                self.logger.info(f"✅ Загружена модель {model_name} через HuggingFace")
            except Exception as hf_error:
                self.logger.warning(f"Не удалось загрузить {model_name}: {hf_error}")
                # Fallback на стандартную CLIP модель
                model_name = "openai/clip-vit-base-patch32"
                self.fashion_clip_processor = CLIPProcessor.from_pretrained(model_name)
                self.fashion_clip_model = CLIPModel.from_pretrained(model_name)
                self.logger.info(f"Загружена fallback модель {model_name}")

            # GPU оптимизация
            if torch.cuda.is_available() and Config.DEVICE == 'cuda':
                self.fashion_clip_model = self.fashion_clip_model.to('cuda')
            else:
                self.logger.info("✅ FashionCLIP загружена на CPU")

            self.fashion_clip_model.eval()

            loading_time = time.time() - start_time

            return True

        except Exception as e:
            self.logger.error(f"Ошибка загрузки FashionCLIP модели: {e}")
            self.logger.error(traceback.format_exc())
            return False
    
    def initialize_gemini(self):
        """Инициализация Gemini API клиента"""
        try:
            if not GEMINI_AVAILABLE:
                self.logger.warning("Google GenAI library not available")
                return False

            if not Config.STYLIST_GEMINI_API_KEY:
                self.logger.warning("FASTVLM_STYLIST_GEMINI_API_KEY не установлен")
                return False

            # Создаем клиента Gemini
            self.gemini_client = genai.Client(api_key=Config.STYLIST_GEMINI_API_KEY)
            self.logger.debug(f"✅ Gemini API клиент инициализирован (модель: {Config.STYLIST_GEMINI_MODEL})")
            return True

        except Exception as e:
            self.logger.error(f"Ошибка инициализации Gemini API: {e}")
            return False
    
    def check_ollama_availability(self):
        """Проверяет доступность Ollama API"""
        try:
            if not REQUESTS_AVAILABLE:
                self.logger.warning("Requests library недоступна. Ollama функции отключены.")
                self.ollama_available = False
                return False

            # Проверяем доступность Ollama API
            response = requests.get(f"{self.ollama_url}/api/tags", timeout=5)
            if response.status_code == 200:
                models = response.json().get('models', [])
                model_names = [model['name'] for model in models]
                if self.ollama_model in model_names:
                    self.ollama_available = True
                    self.logger.info(f"Ollama доступен. Модель {self.ollama_model} найдена")
                    return True
                else:
                    self.logger.warning(f"Ollama доступен, но модель {self.ollama_model} не найдена")
                    self.ollama_available = False
                    return False
            else:
                self.logger.warning(f"Ollama API недоступен (статус: {response.status_code})")
                self.ollama_available = False
                return False

        except Exception as e:
            self.logger.error(f"Ошибка проверки Ollama: {e}")
            self.ollama_available = False
            return False
    
    def initialize_all(self):
        """Инициализация всех компонентов сервера"""
        
        results = {
            'logging': True,  # Уже настроено
            'prompts': self.load_prompts(),
            'model': self.load_model(),
            'fashion_clip': self.load_fashion_clip(),
            'gemini': self.initialize_gemini(),
            'ollama': self.check_ollama_availability()
        }
        
        self.logger.info("=" * 60)
        self.logger.info("Результаты инициализации:")
        self.logger.info(f"✅ Логирование: настроено")
        self.logger.info(f"{'✅' if results['prompts'] else '✗'} Промпты: {'загружены' if results['prompts'] else 'ошибка'}")
        self.logger.info(f"{'✅' if results['model'] else '✗'} FastVLM модель: {'загружена' if results['model'] else 'ошибка'}")
        self.logger.info(f"{'✅' if results['fashion_clip'] else '✗'} FashionCLIP: {'загружена' if results['fashion_clip'] else 'недоступна'}")
        self.logger.info(f"{'✅' if results['gemini'] else '✗'} Gemini API: {'инициализирован' if results['gemini'] else 'недоступен'}")
        self.logger.info(f"{'✅' if results['ollama'] else '✗'} Ollama API: {'доступен' if results['ollama'] else 'недоступен'}")
        self.logger.info("=" * 60)
        
        # Критические компоненты
        if not results['model']:
            self.logger.error("КРИТИЧЕСКАЯ ОШИБКА: FastVLM модель не загружена!")
            return False
        
        return True
    
    def get_state(self):
        """Возвращает текущее состояние всех компонентов"""
        return {
            'model': self.model,
            'tokenizer': self.tokenizer,
            'image_processor': self.image_processor,
            'context_len': self.context_len,
            'fashion_clip_model': self.fashion_clip_model,
            'fashion_clip_processor': self.fashion_clip_processor,
            'gemini_client': self.gemini_client,
            'ollama_available': self.ollama_available,
            'ollama_url': self.ollama_url,
            'ollama_model': self.ollama_model,
            'prompts': self.prompts,
            'performance_stats': self.performance_stats
        }
