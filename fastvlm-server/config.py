import os
import torch

class Config:
    """Конфигурация FastVLM сервера"""

    # === Пути ===
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    MODEL_PATH = os.path.join(BASE_DIR, '../ml-fastvlm/checkpoints/llava-fastvithd_1.5b_stage3')
    LOG_DIR = os.path.join(BASE_DIR, 'logs')
    ENV_FILE = os.path.join(BASE_DIR, '.env')

    # === Настройки сервера ===
    HOST = os.getenv('FASTVLM_HOST', '127.0.0.1')
    PORT = int(os.getenv('FASTVLM_PORT', '3001'))

    # === Настройки модели ===
    # Принудительное использование GPU если доступен
    if torch.cuda.is_available():
        DEVICE = 'cuda'
        print(f"GPU доступен: {torch.cuda.get_device_name(0)}")
    else:
        print("GPU не найден, используем CPU")
        DEVICE = 'cpu'

    TORCH_DTYPE = torch.float16

    # === Настройки генерации ===
    MAX_NEW_TOKENS = int(os.getenv('MAX_NEW_TOKENS', '256'))
    TEMPERATURE = float(os.getenv('TEMPERATURE', '0.2'))
    DO_SAMPLE = os.getenv('DO_SAMPLE', 'true').lower() == 'true'

    # === Настройки производительности ===
    MAX_IMAGE_SIZE = int(os.getenv('MAX_IMAGE_SIZE', '2048'))
    BATCH_SIZE = int(os.getenv('BATCH_SIZE', '1'))

    # === Настройки логирования ===
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
    LOG_MAX_BYTES = int(os.getenv('LOG_MAX_BYTES', '10485760'))  # 10MB
    LOG_BACKUP_COUNT = int(os.getenv('LOG_BACKUP_COUNT', '5'))

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

        print(f"✅ Конфигурация загружена:")
        print(f"   Порт: {cls.PORT}")
        print(f"   Устройство: {cls.DEVICE}")
        print(f"   Модель: {os.path.basename(cls.MODEL_PATH)}")
