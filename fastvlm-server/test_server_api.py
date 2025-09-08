#!/usr/bin/env python3
"""
Улучшенный скрипт для тестирования FastVLM Server API
- Берет фотографию из директории проекта
- Тестирует производительность GPU vs CPU
- Отправляет на сервер по API и получает детальную статистику
- Логирует время выполнения и использование ресурсов
- Сравнивает производительность разных конфигураций
"""

import os
import sys
import json
import time
import base64
import logging
import requests
import statistics
from pathlib import Path
from dataclasses import dataclass
from typing import List, Optional, Dict, Any

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
TEST_IMAGE_PATH = "2.jpg"  # Путь к тестовому изображению
PERFORMANCE_TESTS = True   # Включить тесты производительности
WARMUP_ITERATIONS = 1      # Разогрев модели
TEST_ITERATIONS = 3        # Количество тестов для статистики

@dataclass
class PerformanceResult:
    """Результат теста производительности"""
    device: str
    total_time: float
    inference_time: float
    preprocessing_time: float
    gpu_memory_used: Optional[float]
    success: bool
    analysis_length: int = 0

class FastVLMTester:
    def __init__(self, server_url="http://127.0.0.1:3001"):
        self.server_url = server_url
        self.analyze_endpoint = f"{server_url}/analyze"
        self.health_endpoint = f"{server_url}/health"
        self.stats_endpoint = f"{server_url}/stats"
        self.gpu_endpoint = f"{server_url}/gpu"

    def check_server_health(self) -> bool:
        """Проверка доступности сервера"""
        try:
            logger.info("Checking server availability...")
            response = requests.get(self.health_endpoint, timeout=10)
            if response.status_code == 200:
                health_data = response.json()
                logger.info("✅ Server available")
                logger.info(f"   Model loaded: {health_data.get('model_loaded')}")
                logger.info(f"   Device: {health_data.get('device')}")
                logger.info(f"   GPU available: {health_data.get('gpu_available')}")
                logger.info(f"   Torch version: {health_data.get('torch_version')}")
                return True
            else:
                logger.error(f"❌ Server returned status {response.status_code}")
                return False
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Connection error: {e}")
            return False

    def get_server_stats(self) -> Optional[Dict[str, Any]]:
        """Получение детальной статистики сервера"""
        try:
            response = requests.get(self.stats_endpoint, timeout=10)
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Failed to get stats: {response.status_code}")
                return None
        except requests.exceptions.RequestException as e:
            logger.error(f"Stats request error: {e}")
            return None

    def get_gpu_info(self) -> Optional[Dict[str, Any]]:
        """Получение информации о GPU"""
        try:
            response = requests.get(self.gpu_endpoint, timeout=10)
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Failed to get GPU info: {response.status_code}")
                return None
        except requests.exceptions.RequestException as e:
            logger.error(f"GPU info request error: {e}")
            return None

    def load_image_as_base64(self, image_path: str) -> Optional[str]:
        """Загрузка изображения и конвертация в base64"""
        try:
            with open(image_path, 'rb') as f:
                image_data = f.read()
            encoded = base64.b64encode(image_data).decode('utf-8')
            logger.info(f"📸 Image loaded: {os.path.basename(image_path)} ({len(image_data)} bytes)")
            return encoded
        except Exception as e:
            logger.error(f"❌ Error loading image {os.path.basename(image_path)}: {e}")
            return None

    def load_prompt_from_file(self) -> str:
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
            return "Describe in detail what clothing items you see in this image. What type, color, style and material? Please answer in Russian using precise fashion terminology."

        except Exception as e:
            logger.error(f"Ошибка загрузки промпта: {e}. Используется промпт по умолчанию")
            return "Describe in detail what clothing items you see in this image. What type, color, style and material? Please answer in Russian using precise fashion terminology."

    def test_image_analysis(self, image_path: str, prompt: Optional[str] = None, 
                           force_gpu: Optional[bool] = None) -> Optional[PerformanceResult]:
        """Тестирование анализа изображения с детальной статистикой"""
        if prompt is None:
            prompt = self.load_prompt_from_file()

        # Загрузка изображения
        image_base64 = self.load_image_as_base64(image_path)
        if not image_base64:
            return None

        # Подготовка данных для запроса
        data = {
            'prompt': prompt,
            'image_base64': image_base64
        }
        
        if force_gpu is not None:
            data['force_gpu'] = force_gpu

        # Отправка запроса
        device_str = "GPU" if force_gpu else "CPU" if force_gpu is False else "Auto"
        logger.info(f"🚀 Sending analysis request ({device_str}): {os.path.basename(image_path)}")
        
        start_time = time.time()

        try:
            response = requests.post(
                self.analyze_endpoint,
                json=data,
                timeout=300  # 5 минут таймаут для больших изображений
            )

            end_time = time.time()
            request_time = end_time - start_time

            if response.status_code == 200:
                result = response.json()
                
                # Извлекаем информацию о времени выполнения
                timing = result.get('timing', {})
                total_time = timing.get('total_time', request_time)
                inference_time = timing.get('inference_time', 0)
                preprocessing_time = timing.get('preprocessing_time', 0)
                
                # Создаем результат
                perf_result = PerformanceResult(
                    device=result.get('device', 'unknown'),
                    total_time=total_time,
                    inference_time=inference_time,
                    preprocessing_time=preprocessing_time,
                    gpu_memory_used=result.get('gpu_memory_used'),
                    success=True,
                    analysis_length=len(result.get('analysis', ''))
                )
                
                logger.info(f"✅ Analysis completed successfully")
                logger.info(f"   Total time: {total_time:.2f}s")
                logger.info(f"   Inference time: {inference_time:.2f}s")
                logger.info(f"   Device: {result.get('device')}")
                if perf_result.gpu_memory_used:
                    logger.info(f"   GPU memory: {perf_result.gpu_memory_used}MB")
                
                return perf_result
                
            else:
                logger.error(f"❌ Server error: {response.status_code}")
                logger.error(f"Response: {response.text}")
                return PerformanceResult(
                    device='unknown',
                    total_time=request_time,
                    inference_time=0,
                    preprocessing_time=0,
                    gpu_memory_used=None,
                    success=False
                )

        except requests.exceptions.Timeout:
            logger.error("❌ Request timeout")
            return None
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Network error: {e}")
            return None

    def run_performance_comparison(self, image_path: str) -> Dict[str, List[PerformanceResult]]:
        """Запуск сравнительных тестов производительности GPU vs CPU"""
        logger.info("=" * 60)
        logger.info("🏁 PERFORMANCE COMPARISON TEST")
        logger.info("=" * 60)
        
        results = {
            'gpu': [],
            'cpu': [],
            'auto': []
        }
        
        # Получаем информацию о системе
        gpu_info = self.get_gpu_info()
        if gpu_info and gpu_info.get('gpu_available'):
            logger.info(f"🎮 GPU: {gpu_info.get('gpu_name')}")
            logger.info(f"   Memory: {gpu_info.get('gpu_memory_total_mb', 0)/1024:.1f}GB")
        
        test_configs = [
            ('auto', None, "🤖 Auto-detect"),
            ('gpu', True, "🎮 Force GPU"),
            ('cpu', False, "🖥️  Force CPU")
        ]
        
        for config_name, force_gpu, description in test_configs:
            logger.info(f"\n{description} Tests:")
            logger.info("-" * 40)
            
            # Warmup
            if WARMUP_ITERATIONS > 0:
                logger.info(f"🔥 Warmup ({WARMUP_ITERATIONS} iterations)...")
                for i in range(WARMUP_ITERATIONS):
                    self.test_image_analysis(image_path, force_gpu=force_gpu)
            
            # Основные тесты
            logger.info(f"📊 Performance tests ({TEST_ITERATIONS} iterations)...")
            for i in range(TEST_ITERATIONS):
                result = self.test_image_analysis(image_path, force_gpu=force_gpu)
                if result and result.success:
                    results[config_name].append(result)
                    logger.info(f"   Test {i+1}: {result.total_time:.2f}s ({result.device})")
                else:
                    logger.error(f"   Test {i+1}: FAILED")
        
        return results

    def analyze_performance_results(self, results: Dict[str, List[PerformanceResult]]):
        """Анализ и вывод результатов производительности"""
        logger.info("\n" + "=" * 60)
        logger.info("📈 PERFORMANCE ANALYSIS")
        logger.info("=" * 60)
        
        for config_name, test_results in results.items():
            if not test_results:
                logger.info(f"\n❌ {config_name.upper()}: No successful tests")
                continue
                
            times = [r.total_time for r in test_results]
            inference_times = [r.inference_time for r in test_results]
            
            logger.info(f"\n🎯 {config_name.upper()} Results:")
            logger.info(f"   Successful tests: {len(test_results)}")
            logger.info(f"   Average total time: {statistics.mean(times):.2f}s")
            logger.info(f"   Average inference time: {statistics.mean(inference_times):.2f}s")
            if len(times) > 1:
                logger.info(f"   Std deviation: {statistics.stdev(times):.2f}s")
            logger.info(f"   Min time: {min(times):.2f}s")
            logger.info(f"   Max time: {max(times):.2f}s")
            
            # Информация о устройстве
            devices = list(set(r.device for r in test_results))
            logger.info(f"   Devices used: {', '.join(devices)}")
            
            # GPU память
            gpu_memories = [r.gpu_memory_used for r in test_results if r.gpu_memory_used]
            if gpu_memories:
                logger.info(f"   Avg GPU memory: {statistics.mean(gpu_memories):.1f}MB")
        
        # Сравнение производительности
        self.compare_configurations(results)

    def compare_configurations(self, results: Dict[str, List[PerformanceResult]]):
        """Сравнение производительности между конфигурациями"""
        logger.info(f"\n🆚 PERFORMANCE COMPARISON:")
        logger.info("-" * 40)
        
        # Вычисляем средние времена
        avg_times = {}
        for config_name, test_results in results.items():
            if test_results:
                avg_times[config_name] = statistics.mean([r.total_time for r in test_results])
        
        if len(avg_times) < 2:
            logger.info("❌ Not enough data for comparison")
            return
        
        # Сортируем по производительности
        sorted_configs = sorted(avg_times.items(), key=lambda x: x[1])
        
        fastest_config, fastest_time = sorted_configs[0]
        logger.info(f"🏆 Fastest: {fastest_config.upper()} ({fastest_time:.2f}s)")
        
        for config_name, avg_time in sorted_configs[1:]:
            speedup = avg_time / fastest_time
            logger.info(f"   {config_name.upper()}: {avg_time:.2f}s ({speedup:.1f}x slower)")
        
        # Рекомендации
        logger.info(f"\n💡 RECOMMENDATIONS:")
        if 'gpu' in avg_times and 'cpu' in avg_times:
            gpu_time = avg_times['gpu']
            cpu_time = avg_times['cpu']
            if gpu_time < cpu_time:
                speedup = cpu_time / gpu_time
                logger.info(f"   🎮 Use GPU for {speedup:.1f}x performance improvement")
            else:
                logger.info(f"   🖥️  CPU performance is adequate for this model")

def find_test_images(project_root: Path) -> List[str]:
    """Поиск тестовых изображений в корне проекта"""
    image_extensions = ['.jpg', '.jpeg', '.png', '.bmp', '.webp']
    images = []

    for ext in image_extensions:
        pattern = f"*{ext}"
        for img_file in project_root.glob(pattern):
            if img_file.is_file():
                images.append(str(img_file))

    return images

def main():
    """Главная функция"""
    logger.info("🚀 Starting Enhanced FastVLM Server API Test")
    logger.info(f"Performance tests: {'ON' if PERFORMANCE_TESTS else 'OFF'}")

    # Инициализация тестера
    tester = FastVLMTester()

    # Проверка доступности сервера
    if not tester.check_server_health():
        logger.error("❌ Server unavailable. Make sure server is running.")
        sys.exit(1)

    # Получение статистики сервера
    stats = tester.get_server_stats()
    if stats:
        logger.info(f"📊 Server uptime: {stats.get('server_status', {}).get('uptime_seconds', 0):.1f}s")
        logger.info(f"📊 Total requests: {stats.get('performance', {}).get('total_requests', 0)}")

    # Поиск тестового изображения
    project_root = Path(__file__).parent.parent
    test_image = project_root / TEST_IMAGE_PATH

    if not test_image.exists():
        logger.error(f"❌ Test image not found: {test_image}")
        sys.exit(1)

    logger.info(f"📸 Testing with image: {test_image}")

    if PERFORMANCE_TESTS:
        # Запуск тестов производительности
        results = tester.run_performance_comparison(str(test_image))
        tester.analyze_performance_results(results)
    else:
        # Простой тест
        result = tester.test_image_analysis(str(test_image))
        if result and result.success:
            logger.info("✅ Test completed successfully!")
        else:
            logger.error("❌ Test failed")
            sys.exit(1)

    # Финальная статистика
    final_stats = tester.get_server_stats()
    if final_stats:
        perf = final_stats.get('performance', {})
        logger.info(f"\n📈 Final server stats:")
        logger.info(f"   Total requests: {perf.get('total_requests', 0)}")
        logger.info(f"   Success rate: {perf.get('successful_requests', 0)}/{perf.get('total_requests', 0)}")
        if perf.get('average_processing_time'):
            logger.info(f"   Average processing time: {perf.get('average_processing_time', 0):.2f}s")

if __name__ == "__main__":
    main()