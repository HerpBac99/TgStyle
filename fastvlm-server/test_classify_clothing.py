#!/usr/bin/env python3
"""
Тест классификации одежды с полным повторением логики приложения
Повторяет flow: fileToBase64 -> optimizeForClassification -> classifyClothing
"""

import os
import sys
import io
import base64
import json
from datetime import datetime
from pathlib import Path
import requests
from PIL import Image
import urllib3

# Отключаем предупреждения SSL для тестирования
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

SERVER_URL = os.environ.get("FASTVLM_URL", "http://127.0.0.1:3001")
MAIN_SERVER_URL = os.environ.get("MAIN_SERVER_URL", "https://localhost:8443")

def file_to_base64(image_path: str) -> str:
    """
    Повторяет логику fileToBase64 из utils.ts:
    1. Читает файл как в браузере (FileReader.readAsDataURL)
    2. Возвращает data:image/...;base64,... формат
    """
    with open(image_path, 'rb') as f:
        file_data = f.read()
    
    # Определяем MIME тип по расширению (как браузер)
    ext = Path(image_path).suffix.lower()
    if ext in ['.jpg', '.jpeg']:
        mime_type = 'image/jpeg'
    elif ext == '.png':
        mime_type = 'image/png'
    elif ext == '.webp':
        mime_type = 'image/webp'
    else:
        mime_type = 'image/jpeg'  # По умолчанию
    
    base64_data = base64.b64encode(file_data).decode('utf-8')
    return f'data:{mime_type};base64,{base64_data}'

def optimize_for_classification(base64_image: str) -> str:
    """
    Повторяет логику PhotoProcessor.optimizeForClassification():
    1. Максимальный размер 1200px (по большей стороне)
    2. JPEG качество 85%
    3. Сохранение пропорций
    """
    try:
        # Убираем data:image/...;base64, префикс
        if ',' in base64_image:
            base64_data = base64_image.split(',', 1)[1]
        else:
            base64_data = base64_image
        
        # Декодируем base64
        image_data = base64.b64decode(base64_data)
        
        # Открываем изображение
        img = Image.open(io.BytesIO(image_data)).convert('RGB')
        
        # Вычисляем новые размеры (логика из PhotoProcessor.ts)
        width, height = img.size
        max_size = 1200
        
        if width > max_size or height > max_size:
            if width > height:
                height = int((height * max_size) / width)
                width = max_size
            else:
                width = int((width * max_size) / height)
                height = max_size
        
        # Изменяем размер если нужно
        if (width, height) != img.size:
            img = img.resize((width, height), Image.Resampling.LANCZOS)
        
        # Сохраняем как JPEG с качеством 85%
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=85, optimize=True)
        
        # Конвертируем в base64 с префиксом
        optimized_data = base64.b64encode(buf.getvalue()).decode('utf-8')
        return f'data:image/jpeg;base64,{optimized_data}'
        
    except Exception as e:
        print(f"[ERROR] Ошибка оптимизации: {e}")
        return base64_image  # Возвращаем оригинал при ошибке

def test_direct_fastvlm(image_b64: str):
    """Прямой запрос к FastVLM серверу (как раньше)"""
    try:
        payload = {
            "image_base64": image_b64
        }

        resp = requests.post(
            f"{SERVER_URL}/classify_clothing",
            json=payload,
            timeout=120
        )
        resp.raise_for_status()
        result = resp.json()

        if result.get("success"):
            classification = result.get("classification", {})
            embedding = classification.get("embedding")
            
            return {
                "success": True,
                "embedding": embedding,
                "classification": classification,
                "timing": result.get("timing", {}),
                "full_result": result
            }
        else:
            return {
                "success": False,
                "error": result.get("error", "Server error")
            }

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def test_through_main_server(image_b64: str):
    """Запрос через основной сервер (как в приложении)"""
    try:
        payload = {
            "image_base64": image_b64
        }

        resp = requests.post(
            f"{MAIN_SERVER_URL}/api/classify-clothing",
            json=payload,
            timeout=120,
            verify=False  # Отключаем проверку SSL для тестирования
        )
        resp.raise_for_status()
        result = resp.json()

        if result.get("success"):
            classification = result.get("classification", {})
            embedding = classification.get("embedding")
            
            return {
                "success": True,
                "embedding": embedding,
                "classification": classification,
                "timing": result.get("timing", {}),
                "full_result": result
            }
        else:
            return {
                "success": False,
                "error": result.get("error", "Server error")
            }

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def compare_embeddings(emb1, emb2, name1="Embedding 1", name2="Embedding 2"):
    """Сравнивает два embedding вектора"""
    if not emb1 or not emb2:
        print(f"[ERROR] Один из embedding векторов пустой")
        return False
    
    if len(emb1) != len(emb2):
        print(f"[ERROR] Разная размерность: {len(emb1)} vs {len(emb2)}")
        return False
    
    # Вычисляем различия
    differences = [abs(a - b) for a, b in zip(emb1, emb2)]
    max_diff = max(differences)
    avg_diff = sum(differences) / len(differences)
    
    # Косинусное сходство
    import math
    dot_product = sum(a * b for a, b in zip(emb1, emb2))
    norm1 = math.sqrt(sum(a * a for a in emb1))
    norm2 = math.sqrt(sum(b * b for b in emb2))
    cosine_similarity = dot_product / (norm1 * norm2) if norm1 > 0 and norm2 > 0 else 0
    
    print(f"\n🔍 СРАВНЕНИЕ EMBEDDING ВЕКТОРОВ:")
    print(f"📊 {name1}: размерность {len(emb1)}")
    print(f"📊 {name2}: размерность {len(emb2)}")
    print(f"📈 Максимальная разность: {max_diff:.6f}")
    print(f"📈 Средняя разность: {avg_diff:.6f}")
    print(f"📈 Косинусное сходство: {cosine_similarity:.6f}")
    
    # Проверяем идентичность
    is_identical = max_diff < 1e-10
    is_very_similar = cosine_similarity > 0.999
    
    if is_identical:
        print("✅ ВЕКТОРЫ ИДЕНТИЧНЫ!")
        return True
    elif is_very_similar:
        print("✅ ВЕКТОРЫ ОЧЕНЬ ПОХОЖИ (косинусное сходство > 0.999)")
        return True
    else:
        print("❌ ВЕКТОРЫ РАЗЛИЧАЮТСЯ")
        return False

def main():
    if len(sys.argv) >= 2:
        image_path = sys.argv[1]
    else:
        # Свитер по умолчанию
        image_path = str(Path(__file__).parent.parent / "server" / "uploads" / "stock" / "Embedding" / "футболка1.jpeg")

    if not os.path.exists(image_path):
        print(f"Image not found: {image_path}")
        sys.exit(1)

    print("🧪 ТЕСТ ПОЛНОГО ПОВТОРЕНИЯ ЛОГИКИ ПРИЛОЖЕНИЯ")
    print("=" * 80)
    print(f"📁 Изображение: {image_path}")
    
    # Читаем оригинальные данные файла
    with open(image_path, 'rb') as f:
        original_data = f.read()
    print(f"📏 Размер файла: {len(original_data)} байт")
    
    # ШАГ 1: fileToBase64 (как в приложении)
    print("\n🔄 ШАГ 1: fileToBase64 (как в приложении)")
    original_base64 = file_to_base64(image_path)
    print(f"📏 Размер base64: {len(original_base64)} символов")
    print(f"🏷️  Префикс: {original_base64[:50]}...")
    
    # ШАГ 2: БЕЗ ОПТИМИЗАЦИИ (как в реальном приложении!)
    print("\n🔄 ШАГ 2: optimizeForClassification (как в обновленном приложении)")
    optimized_base64 = optimize_for_classification(original_base64)
    print(f"📏 Размер после оптимизации: {len(optimized_base64)} символов")
    print(f"🏷️  Префикс: {optimized_base64[:50]}...")
    
    # Показываем разность размеров
    size_reduction = len(original_base64) - len(optimized_base64)
    reduction_percent = (size_reduction / len(original_base64)) * 100
    print(f"📉 Сжатие: -{size_reduction} символов ({reduction_percent:.1f}%)")
    
    # ШАГ 3: Тестируем оба пути с ОРИГИНАЛЬНЫМ изображением
    print("\n🔄 ШАГ 3: Сравнение двух путей классификации (ОРИГИНАЛЬНОЕ изображение)")
    
    # Путь A: Прямо к FastVLM (ОРИГИНАЛЬНОЕ изображение)
    print("\n� ПУТЬе A: Прямо к FastVLM (ОРИГИНАЛЬНОЕ изображение)")
    result_direct = test_direct_fastvlm(optimized_base64)
    
    # Путь B: Через основной сервер (ОПТИМИЗИРОВАННОЕ изображение)
    print("\n🚀 ПУТЬ B: Через основной сервер (ОПТИМИЗИРОВАННОЕ изображение)")
    result_main = test_through_main_server(optimized_base64)
    
    # Анализируем результаты
    print("\n📊 РЕЗУЛЬТАТЫ:")
    print("=" * 80)
    
    if result_direct.get("success") and result_main.get("success"):
        emb_direct = result_direct.get("embedding")
        emb_main = result_main.get("embedding")
        
        print("✅ Оба запроса успешны")
        
        if emb_direct and emb_main:
            # Сравниваем embedding векторы
            vectors_match = compare_embeddings(
                emb_direct, emb_main, 
                "Прямой FastVLM", "Через основной сервер"
            )
            
            if vectors_match:
                print("\n🎉 УСПЕХ: Векторы совпадают!")
                # Сохраняем результат
                save_embedding_to_json(image_path, emb_direct, result_direct.get("full_result"))
            else:
                print("\n⚠️  ВНИМАНИЕ: Векторы различаются")
                
        else:
            print("❌ Один или оба embedding вектора отсутствуют")
            if not emb_direct:
                print("   - Прямой FastVLM: embedding отсутствует")
            if not emb_main:
                print("   - Основной сервер: embedding отсутствует")
    else:
        print("❌ Один или оба запроса завершились ошибкой")
        if not result_direct.get("success"):
            print(f"   - Прямой FastVLM: {result_direct.get('error')}")
        if not result_main.get("success"):
            print(f"   - Основной сервер: {result_main.get('error')}")
    
    print("\n" + "=" * 80)

def save_embedding_to_json(image_path, embedding, full_result):
    """Сохраняет полный embedding в JSON файл"""
    try:
        # Создаем директорию для результатов
        results_dir = Path(__file__).parent / "embedding_results"
        results_dir.mkdir(exist_ok=True)
        
        # Генерируем имя файла с timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        image_name = Path(image_path).stem
        filename = f"embedding_app_flow_{image_name}_{timestamp}.json"
        filepath = results_dir / filename
        
        # Получаем classification без embedding чтобы избежать дублирования
        classification = full_result.get("classification", {}).copy()
        classification.pop("embedding", None)  # Удаляем embedding из classification
        
        # Формируем данные для сохранения
        data = {
            "test_type": "app_flow_replication",
            "timestamp": datetime.now().isoformat(),
            "image_path": str(image_path),
            "image_name": image_name,
            "processing_steps": [
                "1. file_to_base64() - как FileReader.readAsDataURL в браузере",
                "2. optimize_for_classification() - как PhotoProcessor.optimizeForClassification()",
                "3. classify_clothing API - через основной сервер или прямо к FastVLM"
            ],
            "embedding": {
                "vector": embedding,
                "dimension": len(embedding),
                "min_value": min(embedding),
                "max_value": max(embedding),
                "mean_value": sum(embedding) / len(embedding)
            },
            "classification": classification,  # Без embedding
            "timing": full_result.get("timing", {}),
            "model_info": {
                "fashion_clip_model": "patrickjohncyh/fashion-clip",
                "embedding_method": "app_flow_replication",
                "optimization": "800px_max_jpeg_80_quality"
            }
        }
        
        # Сохраняем в JSON файл
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        print(f"💾 Embedding сохранен в: {filepath.name}")
        print(f"📁 Полный путь: {filepath.absolute()}")
        
    except Exception as e:
        print(f"❌ Ошибка сохранения embedding: {e}")

if __name__ == "__main__":
    main()
