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

class Config:
    """Конфигурация FastVLM сервера"""

    # === Пути ===
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    
    # Доступные модели
    AVAILABLE_MODELS = {
        '1.5b': os.path.join(BASE_DIR, 'models/llava-fastvithd_1.5b_stage3'),
        '7b-int4': os.path.join(BASE_DIR, 'models/llava-fastvithd_7b_int4')
    }
    
    # Выбор модели через переменную окружения или по умолчанию
    MODEL_TYPE = os.getenv('FASTVLM_MODEL', '7b-int4')  # По умолчанию используем 7B-int4
    MODEL_PATH = AVAILABLE_MODELS.get(MODEL_TYPE, AVAILABLE_MODELS['1.5b'])
    
    LOG_DIR = os.path.join(BASE_DIR, 'logs')
    ENV_FILE = os.path.join(BASE_DIR, '.env')

    # === Настройки сервера ===
    HOST = os.getenv('FASTVLM_HOST', '127.0.0.1')
    PORT = int(os.getenv('FASTVLM_PORT', '3001'))

    # === Настройки модели ===
    # Используем GPU если доступен
    if torch.cuda.is_available():
        DEVICE = 'cuda'
        print(f"GPU доступен: {torch.cuda.get_device_name(0)}")
    else:
        print("GPU не найден, используем CPU")
        DEVICE = 'cpu'

    TORCH_DTYPE = torch.float16

    # === Настройки генерации ===
    MAX_NEW_TOKENS = int(os.getenv('MAX_NEW_TOKENS', '1024'))  # Увеличиваем для структурированных ответов
    TEMPERATURE = float(os.getenv('TEMPERATURE', '0.01'))  # Минимальная температура для строгого форматирования
    DO_SAMPLE = os.getenv('DO_SAMPLE', 'false').lower() == 'true'  # Детерминированная генерация
    TOP_P = float(os.getenv('TOP_P', '0.9'))  # Немного увеличиваем для разнообразия в рамках формата
    REPETITION_PENALTY = float(os.getenv('REPETITION_PENALTY', '1.1'))  # Умеренный штраф за повторения
    
    # === Дополнительные параметры для структурированного анализа ===
    NUM_BEAMS = int(os.getenv('NUM_BEAMS', '1'))  # Отключаем beam search для детерминизма
    EARLY_STOPPING = os.getenv('EARLY_STOPPING', 'false').lower() == 'true'  # Позволяем полную генерацию
    LENGTH_PENALTY = float(os.getenv('LENGTH_PENALTY', '0.8'))  # Небольшой штраф за длину
    NO_REPEAT_NGRAM_SIZE = int(os.getenv('NO_REPEAT_NGRAM_SIZE', '2'))  # Предотвращаем повторение 2-грамм

    # === Настройки производительности ===
    MAX_IMAGE_SIZE = int(os.getenv('MAX_IMAGE_SIZE', '2048'))
    BATCH_SIZE = int(os.getenv('BATCH_SIZE', '1'))

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
        "================================================================================\n\n",  # Завершение последнего элемента
        "SUMMARY:",
        "FINAL NOTES:"
    ]
    
    # === Специальная конфигурация для анализа одежды ===
    FASHION_ANALYSIS_CONFIG = {
        'conv_mode': 'qwen_2',
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

    # === Настройки Gemini API ===
    GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')  # Требуется API ключ
    GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-2.5-flash')
    GEMINI_TEMPERATURE = float(os.getenv('GEMINI_TEMPERATURE', '0.7'))  # Творческая температура
    GEMINI_MAX_TOKENS = int(os.getenv('GEMINI_MAX_TOKENS', '4096'))  # Увеличиваем для полных ответов
    GEMINI_THINKING_BUDGET = int(os.getenv('GEMINI_THINKING_BUDGET', '0'))  # Отключаем thinking для скорости

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
        """Валидация конфигурации"""
        if not os.path.exists(cls.MODEL_PATH):
            raise FileNotFoundError(f"Модель не найдена: {cls.MODEL_PATH}")

        if cls.PORT < 1024 or cls.PORT > 65535:
            raise ValueError(f"Некорректный порт: {cls.PORT}")
        
        # Проверяем API ключ Gemini (предупреждение, не критическая ошибка)
        if not cls.GEMINI_API_KEY:
            print("⚠️  GEMINI_API_KEY не установлен. Gemini функции будут недоступны.")

        print(f"Конфигурация загружена:")
        print(f"Порт: {cls.PORT}")
        print(f"Устройство: {cls.DEVICE}")
        print(f"Тип модели: {cls.MODEL_TYPE}")
        print(f"Модель: {os.path.basename(cls.MODEL_PATH)}")
        print(f"Gemini API: {'Настроен' if cls.GEMINI_API_KEY else 'Не настроен'}")
