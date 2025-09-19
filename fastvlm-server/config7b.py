import os
import torch

# Загружаем переменные окружения из .env файла
def load_env_file():
    """Загрузка переменных окружения из .env файла"""
    env_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
    if os.path.exists(env_file):
        with open(env_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key.strip()] = value.strip()

# Вызываем загрузку переменных окружения
load_env_file()

class Config7B:
    """Конфигурация FastVLM 7B сервера - оптимизированная для больших моделей"""

    # === Пути ===
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    
    # Путь к 7B модели (исправленный путь с двойной вложенностью)
    MODEL_PATH = os.path.join(BASE_DIR, 'models/llava-fastvithd_7b_stage3/llava-fastvithd_7b_stage3')
    
    LOG_DIR = os.path.join(BASE_DIR, 'logs/7b')
    ENV_FILE = os.path.join(BASE_DIR, '.env')

    # === Настройки сервера ===
    HOST = os.getenv('FASTVLM7B_HOST', '127.0.0.1')
    PORT = int(os.getenv('FASTVLM7B_PORT', '3002'))  # Отдельный порт для 7B модели

    # === Настройки многопоточности (оптимизированы для 7B) ===
    # Меньше потоков для 7B модели чтобы не перегружать GPU память
    THREADS = int(os.getenv('FASTVLM7B_THREADS', '4'))  # Уменьшено с 8 до 4
    CONNECTION_LIMIT = int(os.getenv('FASTVLM7B_CONNECTION_LIMIT', '512'))  # Уменьшено с 1024
    CONNECTION_TIMEOUT = int(os.getenv('FASTVLM7B_CONNECTION_TIMEOUT', '120'))  # Увеличено до 2 минут

    # === Настройки модели ===
    # Проверка GPU памяти для 7B модели
    if torch.cuda.is_available():
        DEVICE = 'cuda'
        gpu_memory = torch.cuda.get_device_properties(0).total_memory / 1024**3  # GB
        print(f"GPU доступен: {torch.cuda.get_device_name(0)}")
        print(f"GPU память: {gpu_memory:.1f} GB")
        
        if gpu_memory < 12:
            print("⚠️  ВНИМАНИЕ: Для 7B модели рекомендуется минимум 12GB GPU памяти")
            print(f"   Доступно: {gpu_memory:.1f} GB. Возможны проблемы с OOM.")
    else:
        print("GPU не найден, используем CPU (будет очень медленно для 7B модели)")
        DEVICE = 'cpu'

    # Оптимизированный dtype для 7B
    # Для квантизованных моделей используем float16, для обычных - в зависимости от устройства
    if torch.cuda.is_available():
        gpu_memory_gb = torch.cuda.get_device_properties(0).total_memory / 1024**3
        if gpu_memory_gb < 12:
            TORCH_DTYPE = torch.float16  # Для квантизованных моделей
        else:
            TORCH_DTYPE = torch.float16  # FP16 для экономии памяти
    else:
        TORCH_DTYPE = torch.float32  # CPU использует FP32

    # === Настройки генерации для FastVLM 7B ===
    MAX_NEW_TOKENS = int(os.getenv('MAX_NEW_TOKENS_7B', '2048'))  # Уменьшено для стабильности
    TEMPERATURE = float(os.getenv('TEMPERATURE_7B', '0.1'))  # Более консервативная температура
    DO_SAMPLE = os.getenv('DO_SAMPLE_7B', 'true').lower() == 'true'
    TOP_P = float(os.getenv('TOP_P_7B', '0.8'))  # Немного более фокусированное sampling
    REPETITION_PENALTY = float(os.getenv('REPETITION_PENALTY_7B', '1.05'))  # Меньший штраф

    # === Оптимизированные параметры для 7B ===
    NUM_BEAMS = int(os.getenv('NUM_BEAMS_7B', '1'))  # Beam search отключен
    EARLY_STOPPING = os.getenv('EARLY_STOPPING_7B', 'true').lower() == 'true'
    LENGTH_PENALTY = float(os.getenv('LENGTH_PENALTY_7B', '1.0'))
    NO_REPEAT_NGRAM_SIZE = int(os.getenv('NO_REPEAT_NGRAM_SIZE_7B', '3'))

    # === Настройки производительности для 7B ===
    MAX_IMAGE_SIZE = int(os.getenv('MAX_IMAGE_SIZE_7B', '2048'))  # Уменьшено для экономии памяти
    BATCH_SIZE = int(os.getenv('BATCH_SIZE_7B', '1'))  # Только по одному изображению

    # === Настройки квантизации для 8GB GPU ===
    # Автоматически включаем 4-bit квантизацию для GPU с памятью < 12GB
    if torch.cuda.is_available():
        gpu_memory_gb = torch.cuda.get_device_properties(0).total_memory / 1024**3
        USE_4BIT = gpu_memory_gb < 12
        USE_8BIT = False  # 4-bit более эффективна
        if USE_4BIT:
            print(f"GPU память {gpu_memory_gb:.1f}GB < 12GB, включаем 4-bit квантизацию")
    else:
        USE_4BIT = False
        USE_8BIT = False

    # === Настройки логирования ===
    LOG_LEVEL = os.getenv('LOG_LEVEL_7B', 'INFO')
    LOG_MAX_BYTES = int(os.getenv('LOG_MAX_BYTES_7B', '10485760'))  # 10MB
    LOG_BACKUP_COUNT = int(os.getenv('LOG_BACKUP_COUNT_7B', '5'))

    # === Стоп-последовательности для 7B модели ===
    STOP_SEQUENCES = [
        "END ANALYSIS",
        "ANALYSIS COMPLETE", 
        "\n\n\n\n",
        "In conclusion",
        "Overall,",
        "The analysis",
        "<|endoftext|>",
        "<|im_end|>",  # Qwen2 specific
        "SUMMARY:",
        "FINAL NOTES:"
    ]
    
    # === Специальная конфигурация для FastVLM 7B ===
    FASHION_ANALYSIS_CONFIG = {
        'conv_mode': 'qwen_2',  # Qwen2 conversation mode для 7B модели
        'max_new_tokens': MAX_NEW_TOKENS,
        'temperature': TEMPERATURE,
        'do_sample': DO_SAMPLE,
        'top_p': TOP_P,
        'repetition_penalty': REPETITION_PENALTY,
        'num_beams': NUM_BEAMS,
        'early_stopping': EARLY_STOPPING,
        'length_penalty': LENGTH_PENALTY,
        'no_repeat_ngram_size': NO_REPEAT_NGRAM_SIZE,
    }

    # === Настройки Gemini API (те же что и для основного сервера) ===
    GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
    GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-2.5-flash')
    GEMINI_TEMPERATURE = float(os.getenv('GEMINI_TEMPERATURE', '0.7'))
    GEMINI_MAX_TOKENS = int(os.getenv('GEMINI_MAX_TOKENS', '4096'))
    GEMINI_THINKING_BUDGET = int(os.getenv('GEMINI_THINKING_BUDGET', '0'))

    # === Настройки памяти для 7B ===
    TORCH_COMPILE = os.getenv('TORCH_COMPILE_7B', 'false').lower() == 'true'  # Отключено по умолчанию
    GRADIENT_CHECKPOINTING = True  # Включено для экономии памяти
    ATTENTION_IMPLEMENTATION = "flash_attention_2"  # Оптимизированное внимание

    @classmethod
    def load_env(cls):
        """Загрузка переменных окружения из .env файла"""
        if os.path.exists(cls.ENV_FILE):
            with open(cls.ENV_FILE, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, value = line.split('=', 1)
                        os.environ[key.strip()] = value.strip()

    @classmethod
    def ensure_directories(cls):
        """Создание необходимых директорий"""
        os.makedirs(cls.LOG_DIR, exist_ok=True)

    @classmethod
    def validate_config(cls):
        """Валидация конфигурации для 7B модели"""
        if not os.path.exists(cls.MODEL_PATH):
            raise FileNotFoundError(f"7B модель не найдена: {cls.MODEL_PATH}")

        # Проверяем наличие всех файлов модели
        required_files = [
            'config.json',
            'model-00001-of-00004.safetensors',
            'model-00002-of-00004.safetensors', 
            'model-00003-of-00004.safetensors',
            'model-00004-of-00004.safetensors',
            'model.safetensors.index.json',
            'tokenizer_config.json'
        ]
        
        for file in required_files:
            file_path = os.path.join(cls.MODEL_PATH, file)
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"Отсутствует файл модели: {file_path}")

        if cls.PORT < 1024 or cls.PORT > 65535:
            raise ValueError(f"Некорректный порт: {cls.PORT}")
        
        # Проверка конфликта портов
        if cls.PORT == 3001:
            raise ValueError("Порт 3001 занят основным FastVLM сервером. Используйте другой порт.")
        
        # Проверяем API ключ Gemini
        if not cls.GEMINI_API_KEY:
            print("GEMINI_API_KEY не установлен. Gemini функции будут недоступны.")

        print(f"Конфигурация FastVLM 7B загружена:")
        print(f"Порт: {cls.PORT}")
        print(f"Устройство: {cls.DEVICE}")
        print(f"Модель: {os.path.basename(cls.MODEL_PATH)}")
        print(f"Потоки (threads): {cls.THREADS}")
        print(f"Ограничение соединений: {cls.CONNECTION_LIMIT}")
        print(f"Таймаут соединений: {cls.CONNECTION_TIMEOUT}с")
        print(f"Максимальные токены: {cls.MAX_NEW_TOKENS}")
        print(f"Температура: {cls.TEMPERATURE}")
        print(f"Gemini API: {'Настроен' if cls.GEMINI_API_KEY else 'Не настроен'}")
        
        # Дополнительные предупреждения для 7B
        print(f"\n🚀 FastVLM 7B оптимизации:")
        print(f"   - Flash Attention: {cls.ATTENTION_IMPLEMENTATION}")
        print(f"   - Gradient Checkpointing: {cls.GRADIENT_CHECKPOINTING}")
        print(f"   - Torch Compile: {cls.TORCH_COMPILE}")
        print(f"   - Max Image Size: {cls.MAX_IMAGE_SIZE}")
