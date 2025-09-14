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
    """Конфигурация Qwen2.5-VL сервера"""

    # === Пути ===
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

    # Доступные модели Qwen2.5-VL
    AVAILABLE_MODELS = {
        '3b': 'Qwen/Qwen2.5-VL-3B-Instruct',
        '7b': 'Qwen/Qwen2.5-VL-7B-Instruct',
        '72b': 'Qwen/Qwen2.5-VL-72B-Instruct'
    }

    # Выбор модели через переменную окружения или по умолчанию
    MODEL_TYPE = os.getenv('QWEN_MODEL', '3b')  # По умолчанию используем 3B
    MODEL_NAME = AVAILABLE_MODELS.get(MODEL_TYPE, AVAILABLE_MODELS['3b'])

    LOG_DIR = os.path.join(BASE_DIR, 'logs')
    ENV_FILE = os.path.join(BASE_DIR, '.env')

    # === Настройки сервера ===
    HOST = os.getenv('QWEN_HOST', '127.0.0.1')
    PORT = int(os.getenv('QWEN_PORT', '3002'))  # Отличный от FastVLM порт

    # === Настройки модели ===
    # Автоматическое определение устройства
    if torch.cuda.is_available():
        DEVICE = 'cuda'
        print(f"GPU доступен: {torch.cuda.get_device_name(0)}")
    else:
        print("GPU не найден, используем CPU")
        DEVICE = 'cpu'

    TORCH_DTYPE = torch.float16

    # === Настройки генерации ===
    MAX_NEW_TOKENS = int(os.getenv('MAX_NEW_TOKENS', '512'))
    TEMPERATURE = float(os.getenv('TEMPERATURE', '0.1'))
    DO_SAMPLE = os.getenv('DO_SAMPLE', 'false').lower() == 'true'
    TOP_P = float(os.getenv('TOP_P', '0.8'))

    # === Настройки производительности ===
    MAX_IMAGE_SIZE = int(os.getenv('MAX_IMAGE_SIZE', '2048'))
    BATCH_SIZE = int(os.getenv('BATCH_SIZE', '1'))

    # === Настройки логирования ===
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
    LOG_MAX_BYTES = int(os.getenv('LOG_MAX_BYTES', '10485760'))  # 10MB
    LOG_BACKUP_COUNT = int(os.getenv('LOG_BACKUP_COUNT', '5'))

    # === Настройки Gemini API ===
    GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
    GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-2.5-flash')
    GEMINI_TEMPERATURE = float(os.getenv('GEMINI_TEMPERATURE', '0.7'))
    GEMINI_MAX_TOKENS = int(os.getenv('GEMINI_MAX_TOKENS', '4096'))
    GEMINI_THINKING_BUDGET = int(os.getenv('GEMINI_THINKING_BUDGET', '0'))

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
        if cls.PORT < 1024 or cls.PORT > 65535:
            raise ValueError(f"Некорректный порт: {cls.PORT}")

        # Проверяем API ключ Gemini (предупреждение, не критическая ошибка)
        if not cls.GEMINI_API_KEY:
            print("⚠️  GEMINI_API_KEY не установлен. Gemini функции будут недоступны.")

        print(f"Конфигурация Qwen2.5-VL загружена:")
        print(f"Порт: {cls.PORT}")
        print(f"Устройство: {cls.DEVICE}")
        print(f"Тип модели: {cls.MODEL_TYPE}")
        print(f"Модель: {cls.MODEL_NAME}")
        print(f"Gemini API: {'Настроен' if cls.GEMINI_API_KEY else 'Не настроен'}")
