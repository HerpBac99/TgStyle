import os
import torch

# Загружаем переменные окружения из .env файла
def load_env_file():
    """Загрузка переменных окружения из .env файла"""
    env_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
    if os.path.exists(env_file):
        try:
            with open(env_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, value = line.split('=', 1)
                        os.environ[key.strip()] = value.strip()
        except (UnicodeDecodeError, OSError):
            # Если есть проблемы с кодировкой или другими ошибками, пропустим загрузку
            print("⚠️  Предупреждение: Не удалось загрузить .env файл. Используются значения по умолчанию.")
            pass

# Вызываем загрузку переменных окружения
load_env_file()

class Config:
    """Универсальная конфигурация FastVLM сервера - поддержка 1.5B и 7B моделей"""

    # === Пути ===
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

    # Читаем модель из .env файла
    model_type = '1.5b'  # по умолчанию

    env_file = os.path.join(BASE_DIR, '.env')
    if os.path.exists(env_file):
        try:
            with open(env_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line.startswith('FASTVLM_MODEL='):
                        model_type = line.split('=')[1].strip()
                        print(f"🎯 Загружена модель из .env файла: {model_type}")
                        break
        except UnicodeDecodeError:
            # Если проблемы с кодировкой, пробуем cp1251
            try:
                with open(env_file, 'r', encoding='cp1251') as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith('FASTVLM_MODEL='):
                            model_type = line.split('=')[1].strip()
                            print(f"🎯 Загружена модель из .env файла (cp1251): {model_type}")
                            break
            except Exception as e:
                print(f"⚠️  Не удалось прочитать .env файл: {e}")

    # Определяем путь к модели
    if model_type.lower() == '7b':
        MODEL_PATH = os.path.join(BASE_DIR, 'models/llava-fastvithd_7b_stage3/llava-fastvithd_7b_stage3')
        MODEL_TYPE = '7b'
    else:
        MODEL_PATH = os.path.join(BASE_DIR, 'models/llava-fastvithd_1.5b_stage3')
        MODEL_TYPE = '1.5b'  # По умолчанию 1.5b

    print(f"✅ Используется модель: {MODEL_TYPE.upper()} ({MODEL_PATH})")

    # Определяем тип модели для оптимизаций
    IS_7B_MODEL = MODEL_TYPE.startswith('7b')
    IS_1_5B_MODEL = MODEL_TYPE == '1.5b'
    
    # Директория логов зависит от типа модели
    if IS_7B_MODEL:
        LOG_DIR = os.path.join(BASE_DIR, 'logs/7b')
    else:
        LOG_DIR = os.path.join(BASE_DIR, 'logs')

    ENV_FILE = os.path.join(BASE_DIR, '.env')

    # === Настройки сервера ===
    HOST = os.getenv('FASTVLM_HOST', '127.0.0.1')
    PORT = int(os.getenv('FASTVLM_PORT', '3001'))

    # === Настройки многопоточности (адаптированы под тип модели) ===
    if IS_7B_MODEL:
        # Меньше потоков для 7B модели чтобы не перегружать GPU память
        THREADS = int(os.getenv('FASTVLM_THREADS', '4'))  # Уменьшено с 8 до 4
        CONNECTION_LIMIT = int(os.getenv('FASTVLM_CONNECTION_LIMIT', '512'))  # Уменьшено с 1024
        CONNECTION_TIMEOUT = int(os.getenv('FASTVLM_CONNECTION_TIMEOUT', '120'))  # Увеличено до 2 минут
    else:
        # Для 1.5B модели можно использовать больше потоков
        THREADS = int(os.getenv('FASTVLM_THREADS', '8'))
        CONNECTION_LIMIT = int(os.getenv('FASTVLM_CONNECTION_LIMIT', '1024'))
        CONNECTION_TIMEOUT = int(os.getenv('FASTVLM_CONNECTION_TIMEOUT', '60'))

    # === Настройки модели ===
    # Проверка GPU памяти и автоматическая настройка
    if torch.cuda.is_available():
        DEVICE = 'cuda'
        gpu_memory = torch.cuda.get_device_properties(0).total_memory / 1024**3  # GB
        print(f"GPU доступен: {torch.cuda.get_device_name(0)}")
        print(f"GPU память: {gpu_memory:.1f} GB")
    else:
        print("GPU не найден, используем CPU")
        DEVICE = 'cpu'

    # Оптимизированный dtype в зависимости от модели и GPU
    if torch.cuda.is_available():
        gpu_memory_gb = torch.cuda.get_device_properties(0).total_memory / 1024**3
        if IS_7B_MODEL:
            if gpu_memory_gb < 12:
                TORCH_DTYPE = torch.float16  # Для квантизованных моделей
            else:
                TORCH_DTYPE = torch.float16  # FP16 для экономии памяти
        else:
            # Для 1.5B модели всегда используем FP16
            TORCH_DTYPE = torch.float16
    else:
        TORCH_DTYPE = torch.float32  # CPU использует FP32

    # === Настройки генерации для FastVLM (адаптированы под тип модели) ===
    if IS_7B_MODEL:
        # Оптимизированные настройки для 7B модели
        MAX_NEW_TOKENS = int(os.getenv('MAX_NEW_TOKENS', '2048'))  # Уменьшено для стабильности
        TEMPERATURE = float(os.getenv('TEMPERATURE_FASTVLM', '0.1'))  # Более консервативная температура
        DO_SAMPLE = os.getenv('DO_SAMPLE', 'true').lower() == 'true'
        TOP_P = float(os.getenv('TOP_P', '0.8'))  # Немного более фокусированное sampling
        TOP_K = int(os.getenv('TOP_K', '50'))  # Новый параметр для разнообразия
        REPETITION_PENALTY = float(os.getenv('REPETITION_PENALTY', '1.05'))  # Меньший штраф
        NUM_BEAMS = int(os.getenv('NUM_BEAMS', '1'))  # Beam search отключен для скорости
        EARLY_STOPPING = os.getenv('EARLY_STOPPING', 'true').lower() == 'true'
        LENGTH_PENALTY = float(os.getenv('LENGTH_PENALTY', '1.0'))
        NO_REPEAT_NGRAM_SIZE = int(os.getenv('NO_REPEAT_NGRAM_SIZE', '3'))
    else:
        # Оптимизированные настройки для 1.5B модели (новые параметры пользователя)
        MAX_NEW_TOKENS = int(os.getenv('MAX_NEW_TOKENS', '2048'))
        TEMPERATURE = float(os.getenv('TEMPERATURE_FASTVLM', '0.01'))  # Очень низкая температура для точности
        DO_SAMPLE = os.getenv('DO_SAMPLE', 'true').lower() == 'true'  # Sampling включен
        TOP_P = float(os.getenv('TOP_P', '0.95'))  # Высокий top_p для качества
        TOP_K = int(os.getenv('TOP_K', '50'))  # Средний top_k для разнообразия
        REPETITION_PENALTY = float(os.getenv('REPETITION_PENALTY', '1.2'))  # Высокий штраф за повторения
        NUM_BEAMS = int(os.getenv('NUM_BEAMS', '5'))  # Beam search включен для качества
        EARLY_STOPPING = os.getenv('EARLY_STOPPING', 'true').lower() == 'true'  # Раннее завершение
        LENGTH_PENALTY = float(os.getenv('LENGTH_PENALTY', '1.0'))
        NO_REPEAT_NGRAM_SIZE = int(os.getenv('NO_REPEAT_NGRAM_SIZE', '3'))

    # === Настройки производительности ===
    if IS_7B_MODEL:
        MAX_IMAGE_SIZE = int(os.getenv('MAX_IMAGE_SIZE', '2048'))  # Уменьшено для экономии памяти 7B
        BATCH_SIZE = int(os.getenv('BATCH_SIZE', '1'))  # Только по одному изображению для 7B
    else:
        MAX_IMAGE_SIZE = int(os.getenv('MAX_IMAGE_SIZE', '2048'))  # Для 1.5B тоже уменьшаем
        BATCH_SIZE = int(os.getenv('BATCH_SIZE', '1'))

    # === Настройки квантизации для 8GB GPU ===
    # Автоматически включаем 4-bit квантизацию для GPU с памятью < 12GB
    if torch.cuda.is_available() and IS_7B_MODEL:
        gpu_memory_gb = torch.cuda.get_device_properties(0).total_memory / 1024**3
        USE_4BIT = gpu_memory_gb < 12
        USE_8BIT = False  # 4-bit более эффективна
        if USE_4BIT:
            print(f"GPU память {gpu_memory_gb:.1f}GB < 12GB, включаем 4-bit квантизацию")
    else:
        USE_4BIT = False
        USE_8BIT = False

    # === Настройки логирования ===
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
    LOG_MAX_BYTES = int(os.getenv('LOG_MAX_BYTES', '10485760'))  # 10MB
    LOG_BACKUP_COUNT = int(os.getenv('LOG_BACKUP_COUNT', '5'))

    # === Стоп-последовательности для структурированного анализа ===
    STOP_SEQUENCES = [
        "END ANALYSIS",
        "ANALYSIS COMPLETE",
        "\n\n\n\n",  # Четыре переноса подряд
        "In conclusion",
        "Overall,",
        "The analysis",
        "<|endoftext|>",
        "<|im_end|>",  # Qwen2 specific
        "================================================================================\n\n",  # Завершение последнего элемента
        "SUMMARY:",
        "FINAL NOTES:"
    ]

    # === Специальная конфигурация для FastVLM ===
    FASHION_ANALYSIS_CONFIG = {
        'conv_mode': 'qwen_2',  # Qwen2 conversation mode для обеих моделей
        'max_new_tokens': MAX_NEW_TOKENS,
        'temperature': TEMPERATURE,
        'do_sample': DO_SAMPLE,
        'top_p': TOP_P,
        'top_k': TOP_K,
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

    # === Настройки ИИ стилиста ===
    # Выбор типа стилиста: ollama, gemini
    stylist_type_env = os.getenv('FASTVLM_STYLIST_TYPE', 'ollama')
    STYLIST_TYPE = stylist_type_env.lower()

    # Параметры для стилиста Ollama
    STYLIST_OLLAMA_TEMPERATURE = float(os.getenv('FASTVLM_STYLIST_OLLAMA_TEMPERATURE', '0.5'))
    STYLIST_OLLAMA_TOP_P = float(os.getenv('FASTVLM_STYLIST_OLLAMA_TOP_P', '0.8'))
    STYLIST_OLLAMA_MAX_TOKENS = int(os.getenv('FASTVLM_STYLIST_OLLAMA_MAX_TOKENS', '1200'))
    STYLIST_OLLAMA_REPEAT_PENALTY = float(os.getenv('FASTVLM_STYLIST_OLLAMA_REPEAT_PENALTY', '1.15'))
    STYLIST_OLLAMA_TOP_K = int(os.getenv('FASTVLM_STYLIST_OLLAMA_TOP_K', '40'))

    # Параметры для стилиста Gemini
    STYLIST_GEMINI_TEMPERATURE = float(os.getenv('FASTVLM_STYLIST_GEMINI_TEMPERATURE', '0.6'))
    STYLIST_GEMINI_MAX_TOKENS = int(os.getenv('FASTVLM_STYLIST_GEMINI_MAX_TOKENS', '1000'))
    STYLIST_GEMINI_THINKING_BUDGET = int(os.getenv('FASTVLM_STYLIST_GEMINI_THINKING_BUDGET', '1024'))

    # === Настройки памяти для моделей ===
    TORCH_COMPILE = os.getenv('TORCH_COMPILE', 'false').lower() == 'true'  # Отключено по умолчанию
    GRADIENT_CHECKPOINTING = IS_7B_MODEL  # Включено только для 7B модели
    ATTENTION_IMPLEMENTATION = "flash_attention_2"  # Оптимизированное внимание для обеих моделей

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
        """Валидация конфигурации для модели"""
        if not os.path.exists(cls.MODEL_PATH):
            raise FileNotFoundError(f"Модель не найдена: {cls.MODEL_PATH}")

        # Выводим информацию о выбранной модели
        print(f"Модель: {os.path.basename(cls.MODEL_PATH)}")
        print(f"Тип модели: {cls.MODEL_TYPE}")

        if cls.IS_7B_MODEL:
            # Проверяем наличие всех файлов модели для 7B
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

        # Проверяем API ключ Gemini
        if not cls.GEMINI_API_KEY:
            print("GEMINI_API_KEY не установлен. Gemini функции будут недоступны.")

        # Проверяем настройки стилиста
        if cls.STYLIST_TYPE not in ['ollama', 'gemini']:
            raise ValueError(f"Некорректный тип стилиста: {cls.STYLIST_TYPE}. Допустимые значения: ollama, gemini")

        # Валидация параметров Ollama стилиста
        if not (0.0 <= cls.STYLIST_OLLAMA_TEMPERATURE <= 2.0):
            raise ValueError(f"Некорректная температура Ollama стилиста: {cls.STYLIST_OLLAMA_TEMPERATURE}")
        if not (0.0 <= cls.STYLIST_OLLAMA_TOP_P <= 1.0):
            raise ValueError(f"Некорректный top_p Ollama стилиста: {cls.STYLIST_OLLAMA_TOP_P}")
        if not (1 <= cls.STYLIST_OLLAMA_MAX_TOKENS <= 5000):
            raise ValueError(f"Некорректное максимальное количество токенов Ollama: {cls.STYLIST_OLLAMA_MAX_TOKENS}")
        if not (0.8 <= cls.STYLIST_OLLAMA_REPEAT_PENALTY <= 2.0):
            raise ValueError(f"Некорректный repeat_penalty Ollama: {cls.STYLIST_OLLAMA_REPEAT_PENALTY}")
        if not (1 <= cls.STYLIST_OLLAMA_TOP_K <= 100):
            raise ValueError(f"Некорректный top_k Ollama: {cls.STYLIST_OLLAMA_TOP_K}")

        # Валидация параметров Gemini стилиста
        if not (0.0 <= cls.STYLIST_GEMINI_TEMPERATURE <= 2.0):
            raise ValueError(f"Некорректная температура Gemini стилиста: {cls.STYLIST_GEMINI_TEMPERATURE}")
        if not (1 <= cls.STYLIST_GEMINI_MAX_TOKENS <= 5000):
            raise ValueError(f"Некорректное максимальное количество токенов Gemini: {cls.STYLIST_GEMINI_MAX_TOKENS}")
        if not (0 <= cls.STYLIST_GEMINI_THINKING_BUDGET <= 4096):
            raise ValueError(f"Некорректный thinking_budget Gemini: {cls.STYLIST_GEMINI_THINKING_BUDGET}")

        print("FastVLM сервер запускается:")
        print(f"  Модель: {os.path.basename(cls.MODEL_PATH)}")
        print(f"  Порт: {cls.PORT}")
        print(f"  Потоки (threads): {cls.THREADS}")
        print(f"  Ограничение соединений: {cls.CONNECTION_LIMIT}")
        print(f"  Таймаут соединений: {cls.CONNECTION_TIMEOUT}с")

        # Параметры генерации для текущей модели
        print(f"\n⚙️  Параметры генерации ({cls.MODEL_TYPE}):")
        print(f"   - Температура: {cls.TEMPERATURE}")
        print(f"   - Top-p: {cls.TOP_P}")
        print(f"   - Top-k: {cls.TOP_K}")
        print(f"   - Repetition penalty: {cls.REPETITION_PENALTY}")
        print(f"   - Num beams: {cls.NUM_BEAMS}")
        print(f"   - Early stopping: {cls.EARLY_STOPPING}")
