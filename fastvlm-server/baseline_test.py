#!/usr/bin/env python3
"""
BASELINE TEST - Измерение производительности FastVLM до оптимизаций
"""

import requests
import base64
import time
import json
import concurrent.futures
import threading
import statistics
from datetime import datetime
import psutil

# GPUtil опционально
try:
    import GPUtil
    GPUTIL_AVAILABLE = True
except ImportError:
    GPUTIL_AVAILABLE = False
    print("[WARNING] GPUtil не установлен. GPU статистика недоступна. Установите: pip install gputil")

class FastVLMBaselineTester:
    def __init__(self, server_url="http://127.0.0.1:3001", image_path="../1.jpg"):
        self.server_url = server_url.rstrip('/')
        self.image_path = image_path
        self.image_base64 = None
        self.results = []

        # Статистика
        self.stats = {
            'test_info': {
                'timestamp': datetime.now().isoformat(),
                'server_url': server_url,
                'image_path': image_path,
                'gpu_info': self.get_gpu_info(),
                'system_info': self.get_system_info()
            },
            'performance': {}
        }

        # Лок для потокобезопасности
        self.lock = threading.Lock()

    def get_gpu_info(self):
        """Получить информацию о GPU"""
        if not GPUTIL_AVAILABLE:
            return {'gpu_available': False, 'reason': 'GPUtil не установлен'}

        try:
            gpus = GPUtil.getGPUs()
            if gpus:
                gpu = gpus[0]
                return {
                    'name': gpu.name,
                    'memory_total': gpu.memoryTotal,
                    'memory_used': gpu.memoryUsed,
                    'memory_free': gpu.memoryFree,
                    'temperature': gpu.temperature,
                    'uuid': gpu.uuid
                }
        except Exception as e:
            return {'gpu_available': False, 'error': str(e)}

        return {'gpu_available': False}

    def get_system_info(self):
        """Получить информацию о системе"""
        memory = psutil.virtual_memory()
        return {
            'cpu_count': psutil.cpu_count(),
            'cpu_percent': psutil.cpu_percent(interval=1),
            'memory_total_gb': round(memory.total / (1024**3), 2),
            'memory_used_gb': round(memory.used / (1024**3), 2),
            'platform': 'windows'  # hardcoded for now
        }

    def encode_image(self):
        """Кодирование изображения"""
        try:
            with open(self.image_path, 'rb') as f:
                image_data = f.read()

            # Проверяем изображение
            from PIL import Image
            import io
            image = Image.open(io.BytesIO(image_data))
            image.verify()

            self.image_base64 = base64.b64encode(image_data).decode('utf-8')
            print(f"[BASELINE] Изображение закодировано: {len(self.image_base64)} символов")

            return True
        except Exception as e:
            print(f"[ERROR] Ошибка обработки изображения: {e}")
            return False

    def send_single_request(self, request_id, concurrent_count):
        """Отправка одного запроса"""
        start_time = time.time()

        try:
            payload = {
                'image_base64': self.image_base64,
                'nickname': f'baseline_test_{request_id}',
                'topic': 'casual'
            }

            response = requests.post(
                f"{self.server_url}/analyze",
                json=payload,
                timeout=300  # 5 минут таймаут
            )

            response_time = time.time() - start_time

            result = {
                'request_id': request_id,
                'concurrent_requests': concurrent_count,
                'status_code': response.status_code,
                'response_time': response_time,
                'success': False,
                'error': None,
                'response_size': len(response.text) if response.text else 0,
                'analysis': {},
                'gpu_memory_before': None,
                'gpu_memory_after': None
            }

            # Получаем GPU память до анализа
            if GPUTIL_AVAILABLE:
                try:
                    gpus = GPUtil.getGPUs()
                    if gpus:
                        result['gpu_memory_before'] = gpus[0].memoryUsed
                except:
                    pass

            if response.status_code == 200:
                try:
                    data = response.json()
                    result['success'] = data.get('success', False)

                    if result['success']:
                        timing = data.get('timing', {})
                        result['analysis'] = {
                            'fastvlm_time': timing.get('fastvlm_time', 0),
                            'stylist_time': timing.get('stylist_time', 0),
                            'total_time': timing.get('total_time', 0),
                            'technical_analysis_length': len(data.get('technical_analysis', '')),
                            'stylist_analysis_length': len(data.get('analysis', ''))
                        }

                        # Сохраняем пример ответа для оценки качества
                        if request_id == 0:  # Только для первого запроса
                            result['sample_response'] = {
                                'technical': data.get('technical_analysis', ''),
                                'stylist': data.get('analysis', '')
                            }
                    else:
                        result['error'] = data.get('error', 'Unknown error')

                except json.JSONDecodeError as e:
                    result['error'] = f"Invalid JSON response: {e}"
            else:
                result['error'] = f"HTTP {response.status_code}: {response.text[:200]}"

            # Получаем GPU память после анализа
            if GPUTIL_AVAILABLE:
                try:
                    gpus = GPUtil.getGPUs()
                    if gpus:
                        result['gpu_memory_after'] = gpus[0].memoryUsed
                except:
                    pass

            return result

        except requests.exceptions.Timeout:
            return {
                'request_id': request_id,
                'concurrent_requests': concurrent_count,
                'status_code': None,
                'response_time': time.time() - start_time,
                'success': False,
                'error': 'Timeout (5 minutes)',
                'response_size': 0,
                'analysis': {},
                'gpu_memory_before': None,
                'gpu_memory_after': None
            }
        except Exception as e:
            return {
                'request_id': request_id,
                'concurrent_requests': concurrent_count,
                'status_code': None,
                'response_time': time.time() - start_time,
                'success': False,
                'error': str(e),
                'response_size': 0,
                'analysis': {},
                'gpu_memory_before': None,
                'gpu_memory_after': None
            }

    def worker_thread(self, request_id, concurrent_count):
        """Рабочая функция для потока"""
        result = self.send_single_request(request_id, concurrent_count)

        with self.lock:
            self.results.append(result)

    def run_baseline_test(self):
        """Запуск базового тестирования"""
        print("=" * 60)
        print("FASTVLM BASELINE TEST - Текущая производительность")
        print("=" * 60)

        # Проверяем сервер
        print("[BASELINE] Проверяем сервер...")
        try:
            health_response = requests.get(f"{self.server_url}/health", timeout=10)
            if health_response.status_code == 200:
                health_data = health_response.json()
                print(f"[OK] Сервер работает: модель {health_data.get('model_loaded', False)}")
                self.stats['test_info']['server_health'] = health_data
            else:
                print(f"[WARNING] Сервер вернул {health_response.status_code}")
                return False
        except Exception as e:
            print(f"[ERROR] Сервер недоступен: {e}")
            return False

        # Кодируем изображение
        if not self.encode_image():
            return False

        # Тестовые сценарии
        test_scenarios = [
            {'concurrent': 1, 'requests': 5, 'name': '1 одновременный'},
            {'concurrent': 3, 'requests': 9, 'name': '3 одновременных'},
            {'concurrent': 5, 'requests': 15, 'name': '5 одновременных'},
            {'concurrent': 10, 'requests': 20, 'name': '10 одновременных'}
        ]

        all_results = []

        for scenario in test_scenarios:
            print(f"\n[BASELINE] Тестируем: {scenario['name']} запросов")
            print("-" * 40)

            self.results = []
            start_time = time.time()

            # Запускаем одновременные запросы
            with concurrent.futures.ThreadPoolExecutor(max_workers=scenario['concurrent']) as executor:
                futures = [
                    executor.submit(self.worker_thread, i, scenario['concurrent'])
                    for i in range(scenario['requests'])
                ]
                concurrent.futures.wait(futures)

            total_scenario_time = time.time() - start_time

            # Анализируем результаты сценария
            successful = [r for r in self.results if r['success']]
            failed = [r for r in self.results if not r['success']]

            scenario_stats = {
                'scenario': scenario,
                'total_time': total_scenario_time,
                'throughput': len(self.results) / total_scenario_time if total_scenario_time > 0 else 0,
                'successful_requests': len(successful),
                'failed_requests': len(failed),
                'success_rate': len(successful) / len(self.results) * 100 if self.results else 0,
                'response_times': [r['response_time'] for r in self.results],
                'errors': [r['error'] for r in failed if r['error']],
                'gpu_memory_usage': [],
                'analysis_times': []
            }

            # Собираем детальную статистику
            if successful:
                fastvlm_times = [r['analysis'].get('fastvlm_time', 0) for r in successful]
                stylist_times = [r['analysis'].get('stylist_time', 0) for r in successful]

                scenario_stats.update({
                    'avg_fastvlm_time': statistics.mean(fastvlm_times) if fastvlm_times else 0,
                    'avg_stylist_time': statistics.mean(stylist_times) if stylist_times else 0,
                    'avg_total_analysis_time': statistics.mean([r['analysis'].get('total_time', 0) for r in successful])
                })

            # GPU память
            gpu_usage = []
            for r in self.results:
                if r['gpu_memory_before'] is not None and r['gpu_memory_after'] is not None:
                    gpu_usage.append(r['gpu_memory_after'] - r['gpu_memory_before'])

            if gpu_usage:
                scenario_stats['avg_gpu_memory_delta'] = statistics.mean(gpu_usage)

            # Вывод результатов сценария
            print(f"Успешных: {len(successful)}/{len(self.results)} ({scenario_stats['success_rate']:.1f}%)")
            print(f"Пропускная способность: {scenario_stats['throughput']:.2f} req/sec")
            print(f"Общее время: {total_scenario_time:.2f} сек")

            if successful:
                response_times = scenario_stats['response_times']
                print(f"Время ответа: {min(response_times):.1f}-{max(response_times):.1f} сек (avg: {statistics.mean(response_times):.1f})")

                if 'avg_fastvlm_time' in scenario_stats:
                    print(f"FastVLM: {scenario_stats['avg_fastvlm_time']:.1f} сек")
                    print(f"Стилист: {scenario_stats['avg_stylist_time']:.1f} сек")

            if failed:
                print(f"Ошибки ({len(failed)}):")
                error_counts = {}
                for error in scenario_stats['errors']:
                    error_counts[error] = error_counts.get(error, 0) + 1

                for error, count in sorted(error_counts.items(), key=lambda x: x[1], reverse=True)[:3]:
                    print(f"   {count}x: {error[:60]}...")

            all_results.append(scenario_stats)

        # Сохраняем результаты
        self.stats['performance'] = all_results

        # Сохраняем пример ответа для оценки качества
        sample_responses = []
        for result in self.results:
            if 'sample_response' in result:
                sample_responses.append(result['sample_response'])
                break

        if sample_responses:
            self.stats['sample_quality'] = sample_responses[0]

        # Финальный отчет
        self.print_final_report(all_results)

        # Сохраняем в файл
        self.save_results()

        return True

    def print_final_report(self, all_results):
        """Печать финального отчета"""
        print("\n" + "="*60)
        print("BASELINE РЕЗУЛЬТАТЫ")
        print("="*60)

        print("Текущая производительность FastVLM:")
        print()

        for i, result in enumerate(all_results, 1):
            scenario = result['scenario']
            print(f"{i}. {scenario['name']}:")
            print(f"   Пропускная способность: {result['throughput']:.2f} req/sec")
            print(f"   Успешность: {result['success_rate']:.1f}%")
            print(f"   Время выполнения: {result['total_time']:.1f} сек")
            if result['successful_requests'] > 0:
                print(f"   Среднее время ответа: {statistics.mean(result['response_times']):.1f} сек")
            print()

        print("Выводы:")
        print("• Максимальная стабильная нагрузка: определим после анализа")
        print("• GPU память используется эффективно: да/нет")
        print("• Качество ответов: высокое/среднее/низкое")
        print("• Требуются оптимизации: да/нет")

    def save_results(self):
        """Сохранение результатов в файл"""
        timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
        filename = f"baseline_results_{timestamp}.json"

        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(self.stats, f, indent=2, ensure_ascii=False, default=str)

        print(f"\nРезультаты сохранены: {filename}")

        # Также сохраняем краткий отчет
        summary_filename = f"baseline_summary_{timestamp}.txt"
        with open(summary_filename, 'w', encoding='utf-8') as f:
            f.write("FASTVLM BASELINE TEST SUMMARY\n")
            f.write("="*40 + "\n\n")

            f.write(f"Тест проведен: {self.stats['test_info']['timestamp']}\n")
            f.write(f"Сервер: {self.stats['test_info']['server_url']}\n")
            f.write(f"Изображение: {self.stats['test_info']['image_path']}\n\n")

            gpu_info = self.stats['test_info']['gpu_info']
            if gpu_info.get('name'):
                f.write(f"GPU: {gpu_info['name']} ({gpu_info['memory_total']}MB)\n")
            else:
                f.write("GPU: Не доступен\n")

            sys_info = self.stats['test_info']['system_info']
            f.write(f"CPU: {sys_info['cpu_count']} ядер\n")
            f.write(f"RAM: {sys_info['memory_total_gb']}GB\n\n")

            f.write("РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ:\n")
            f.write("-"*30 + "\n")

            for result in self.stats['performance']:
                scenario = result['scenario']
                f.write(f"\n{scenario['name']}:\n")
                f.write(f"   Пропускная способность: {result['throughput']:.2f} req/sec\n")
                f.write(f"   Успешность: {result['success_rate']:.1f}%\n")
                f.write(f"   Время выполнения: {result['total_time']:.1f} сек\n")
                f.write(f"   Всего запросов: {scenario['requests']}\n")

                if result['successful_requests'] > 0:
                    f.write(f"   Среднее время ответа: {statistics.mean(result['response_times']):.1f} сек\n")
                    if 'avg_gpu_memory_delta' in result:
                        f.write(f"   GPU память: {result['avg_gpu_memory_delta']:.1f} MB\n")

        print(f"Краткий отчет сохранен: {summary_filename}")

def main():
    print("[BASELINE] Начинаем baseline тестирование FastVLM...")

    tester = FastVLMBaselineTester()

    if tester.run_baseline_test():
        print("\n[SUCCESS] Baseline тест завершен!")
        print("\nСледующие шаги:")
        print("1. Проанализируйте результаты в baseline_results_*.json")
        print("2. Оцените качество ответов в sample_quality")
        print("3. Решите какую оптимизацию применить первой")
        print("4. Повторите тест после оптимизации для сравнения")
    else:
        print("\n[FAILED] Baseline тест провален")
        exit(1)

if __name__ == '__main__':
    main()
