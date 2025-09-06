#!/usr/bin/env python3
"""
Скрипт для тестирования FastVLM Server API
- Берет фотографию из директории проекта
- Отправляет на сервер по API
- Получает ответ и выводит его
- Логирует время выполнения запроса
"""

import os
import sys
import json
import time
import base64
import logging
import requests
from pathlib import Path

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('api_test.log'),
        logging.StreamHandler(sys.stdout)
    ],
    encoding='utf-8'
)
logger = logging.getLogger(__name__)

# Конфигурация тестирования
TEST_IMAGE_PATH = "1.jpg"  # Путь к тестовому изображению

def load_prompt_from_file():
    """Загружает промпт из файла prompt.md"""
    prompt_file = os.path.join(os.path.dirname(__file__), 'prompt.md')

    try:
        with open(prompt_file, 'r', encoding='utf-8') as f:
            content = f.read()

        # Ищем основной промпт между ``` блоками
        import re
        prompt_match = re.search(r'```\s*(.*?)\s*```', content, re.DOTALL)
        if prompt_match:
            return prompt_match.group(1).strip()
        else:
            # Если нет ``` блоков, берем весь контент
            return content.strip()

    except FileNotFoundError:
        logger.warning(f"Файл промпта не найден: {prompt_file}. Используется промпт по умолчанию")
        return "Describe in detail what clothing items you see in this image. What type, color, style and material? Please answer in English using precise fashion terminology."

    except Exception as e:
        logger.error(f"Ошибка загрузки промпта: {e}. Используется промпт по умолчанию")
        return "Describe in detail what clothing items you see in this image. What type, color, style and material? Please answer in English using precise fashion terminology."

class FastVLMTester:
    def __init__(self, server_url="http://127.0.0.1:3001"):
        self.server_url = server_url
        self.analyze_endpoint = f"{server_url}/analyze"
        self.health_endpoint = f"{server_url}/health"

    def check_server_health(self):
        """Проверка доступности сервера"""
        try:
            logger.info("Checking server availability...")
            response = requests.get(self.health_endpoint, timeout=10)
            if response.status_code == 200:
                health_data = response.json()
                logger.info("Server available")
                return True
            else:
                logger.error(f"Server returned status {response.status_code}")
                return False
        except requests.exceptions.RequestException as e:
            logger.error(f"Connection error: {e}")
            return False

    def load_image_as_base64(self, image_path):
        """Загрузка изображения и конвертация в base64"""
        try:
            with open(image_path, 'rb') as f:
                image_data = f.read()
            encoded = base64.b64encode(image_data).decode('utf-8')
            logger.info(f"Image loaded: {os.path.basename(image_path)} ({len(image_data)} bytes)")
            return encoded
        except Exception as e:
            logger.error(f"Error loading image {os.path.basename(image_path)}: {e}")
            return None

    def test_image_analysis(self, image_path, prompt=None):
        """Тестирование анализа изображения"""
        if prompt is None:
            prompt = load_prompt_from_file()

        # Загрузка изображения
        image_base64 = self.load_image_as_base64(image_path)
        if not image_base64:
            return None

        # Подготовка данных для запроса
        data = {
            'prompt': prompt,
            'image_base64': image_base64
        }

        # Отправка запроса
        logger.info(f"Sending analysis request for: {os.path.basename(image_path)}")
        start_time = time.time()

        try:
            response = requests.post(
                self.analyze_endpoint,
                json=data,
                timeout=300  # 5 минут таймаут для больших изображений
            )

            end_time = time.time()
            execution_time = end_time - start_time

            logger.info(f"Execution time: {execution_time:.2f} seconds")

            if response.status_code == 200:
                result = response.json()
                logger.info("Analysis completed successfully")
                logger.debug(f"Result: {json.dumps(result, ensure_ascii=False, indent=2)}")
                # Добавляем время выполнения в результат
                result['execution_time'] = f"{execution_time:.2f} seconds"
                return result
            else:
                logger.error(f"Server error: {response.status_code}")
                logger.error(f"Response: {response.text}")
                return None

        except requests.exceptions.Timeout:
            logger.error("Request timeout")
            return None
        except requests.exceptions.RequestException as e:
            logger.error(f"Network error: {e}")
            return None

def find_test_images(project_root):
    """Поиск тестовых изображений в корне проекта"""
    image_extensions = ['.jpg', '.jpeg', '.png', '.bmp', '.webp']
    images = []

    for ext in image_extensions:
        pattern = f"*{ext}"
        for img_file in Path(project_root).glob(pattern):
            if img_file.is_file():
                images.append(str(img_file))

    return images

def main():
    """Главная функция"""
    logger.info("Starting FastVLM Server API test")

    # Инициализация тестера
    tester = FastVLMTester()

    # Проверка доступности сервера
    if not tester.check_server_health():
        logger.error("Server unavailable. Make sure server is running.")
        sys.exit(1)

    # Использование только указанного изображения
    project_root = Path(__file__).parent.parent
    test_image = project_root / TEST_IMAGE_PATH

    if not test_image.exists():
        logger.error(f"Test image not found: {test_image}")
        sys.exit(1)

    logger.info(f"Testing with image: {test_image}")

    result = tester.test_image_analysis(str(test_image))

    if result:
        logger.info("Test completed successfully!")
        # Вывод краткого резюме
        if 'analysis' in result:
            print(f"\nFull Analysis:")
            print("-" * 50)
            print(result['analysis'])
            print("-" * 50)
        if 'device' in result:
            print(f"Device: {result['device']}")
        if 'model_used' in result:
            print(f"Model: {result['model_used']}")
        print(f"Execution time: {result.get('execution_time', 'N/A')}")
    else:
        logger.error("Test failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
