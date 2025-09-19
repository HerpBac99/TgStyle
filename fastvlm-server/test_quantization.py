#!/usr/bin/env python3
"""
Тест квантизации FastVLM 7B модели
Проверяет возможность загрузки с 4-bit квантизацией
"""

import torch
import psutil
import os
import sys
from pathlib import Path

def check_gpu_memory():
    """Проверка GPU памяти"""
    if not torch.cuda.is_available():
        print("❌ CUDA не доступен")
        return False, 0
    
    gpu_props = torch.cuda.get_device_properties(0)
    gpu_memory_gb = gpu_props.total_memory / 1024**3
    gpu_name = gpu_props.name
    
    print(f"✅ GPU: {gpu_name}")
    print(f"   Память: {gpu_memory_gb:.1f} GB")
    
    if gpu_memory_gb < 6:
        print("❌ Недостаточно GPU памяти для 7B модели (минимум 6GB)")
        return False, gpu_memory_gb
    elif gpu_memory_gb < 12:
        print("⚠️  GPU память < 12GB, потребуется квантизация")
        return True, gpu_memory_gb
    else:
        print("✅ Достаточно GPU памяти для 7B модели")
        return True, gpu_memory_gb

def check_bitsandbytes():
    """Проверка bitsandbytes"""
    try:
        import bitsandbytes as bnb
        print(f"✅ BitsAndBytes версия: {bnb.__version__}")
        
        # Проверяем поддержку 4-bit
        if hasattr(bnb, 'nn') and hasattr(bnb.nn, 'Linear4bit'):
            print("✅ 4-bit квантизация поддерживается")
            return True
        else:
            print("❌ 4-bit квантизация не поддерживается")
            return False
            
    except ImportError:
        print("❌ BitsAndBytes не установлен")
        print("   Установите: pip install bitsandbytes>=0.41.0")
        return False

def test_model_loading():
    """Тест загрузки модели"""
    model_path = Path(__file__).parent / "models" / "llava-fastvithd_7b_stage3" / "llava-fastvithd_7b_stage3"
    
    if not model_path.exists():
        print(f"❌ Модель не найдена: {model_path}")
        return False
    
    print(f"✅ Модель найдена: {model_path}")
    
    # Проверяем файлы модели
    required_files = [
        'config.json',
        'model-00001-of-00004.safetensors',
        'model-00004-of-00004.safetensors'
    ]
    
    for file in required_files:
        if not (model_path / file).exists():
            print(f"❌ Отсутствует файл: {file}")
            return False
    
    print("✅ Все файлы модели присутствуют")
    return True

def test_memory_calculation():
    """Расчет требований памяти"""
    print("\n📊 Расчет памяти для FastVLM 7B:")
    
    # Параметры модели
    model_params = 7e9  # 7 миллиардов параметров
    
    # Размеры в различных форматах
    fp32_size = model_params * 4 / 1024**3  # GB
    fp16_size = model_params * 2 / 1024**3  # GB
    int8_size = model_params * 1 / 1024**3  # GB
    int4_size = model_params * 0.5 / 1024**3  # GB
    
    print(f"FP32 (полная точность): {fp32_size:.1f} GB")
    print(f"FP16 (половинная точность): {fp16_size:.1f} GB")
    print(f"INT8 (8-bit квантизация): {int8_size:.1f} GB")
    print(f"INT4 (4-bit квантизация): {int4_size:.1f} GB")
    
    # Добавляем overhead для активаций и прочего
    overhead = 1.5  # примерно 1.5GB
    
    print(f"\nС учетом overhead (~{overhead}GB):")
    print(f"FP16 + overhead: {fp16_size + overhead:.1f} GB")
    print(f"INT8 + overhead: {int8_size + overhead:.1f} GB")
    print(f"INT4 + overhead: {int4_size + overhead:.1f} GB")
    
    # Рекомендации
    gpu_available, gpu_memory = check_gpu_memory()
    if gpu_available:
        print(f"\n💡 Рекомендации для вашей GPU ({gpu_memory:.1f}GB):")
        
        if gpu_memory >= fp16_size + overhead:
            print("✅ Можно использовать FP16 без квантизации")
        elif gpu_memory >= int8_size + overhead:
            print("⚠️  Рекомендуется 8-bit квантизация")
        elif gpu_memory >= int4_size + overhead:
            print("⚠️  Требуется 4-bit квантизация")
        else:
            print("❌ Недостаточно памяти даже для 4-bit квантизации")

def test_quantization_config():
    """Тест конфигурации квантизации"""
    print("\n🔧 Тест конфигурации квантизации:")
    
    try:
        from transformers import BitsAndBytesConfig
        
        # 4-bit конфигурация
        bnb_config_4bit = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.float16,
            bnb_4bit_use_double_quant=True,
        )
        
        print("✅ 4-bit конфигурация создана успешно")
        print(f"   Тип квантизации: {bnb_config_4bit.bnb_4bit_quant_type}")
        print(f"   Compute dtype: {bnb_config_4bit.bnb_4bit_compute_dtype}")
        print(f"   Double quant: {bnb_config_4bit.bnb_4bit_use_double_quant}")
        
        return True
        
    except ImportError as e:
        print(f"❌ Ошибка импорта: {e}")
        return False
    except Exception as e:
        print(f"❌ Ошибка конфигурации: {e}")
        return False

def main():
    """Основная функция"""
    print("🧪 Тест квантизации FastVLM 7B")
    print("=" * 50)
    
    tests = [
        ("GPU память", lambda: check_gpu_memory()[0]),
        ("BitsAndBytes", check_bitsandbytes),
        ("Файлы модели", test_model_loading),
        ("Конфигурация квантизации", test_quantization_config)
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        print(f"\n🔍 Тест: {test_name}")
        try:
            if test_func():
                passed += 1
                print(f"✅ {test_name}: ПРОЙДЕН")
            else:
                print(f"❌ {test_name}: НЕ ПРОЙДЕН")
        except Exception as e:
            print(f"❌ {test_name}: ОШИБКА - {e}")
    
    # Расчет памяти (всегда выполняется)
    test_memory_calculation()
    
    print("\n" + "=" * 50)
    print(f"📊 Результат: {passed}/{total} тестов пройдено")
    
    if passed == total:
        print("🎉 Все тесты пройдены! Квантизация должна работать.")
        print("\n💡 Следующие шаги:")
        print("   1. Убедитесь что установлен bitsandbytes: pip install bitsandbytes>=0.41.0")
        print("   2. Запустите сервер: python start_7b.py")
        print("   3. Протестируйте: python test_7b.py")
    else:
        print("⚠️  Некоторые тесты не пройдены. Проверьте ошибки выше.")
        
        if passed < total // 2:
            print("❌ Критические проблемы. Квантизация может не работать.")
        else:
            print("⚠️  Минорные проблемы. Попробуйте запустить сервер.")

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n🛑 Тестирование прервано")
    except Exception as e:
        print(f"\n💥 Критическая ошибка: {e}")
        sys.exit(1)
