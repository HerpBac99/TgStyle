#!/usr/bin/env python3
"""
FastVLM Server - постоянный сервер для анализа изображений
Запускается один раз и держит модель в памяти
"""

import sys
import json
import base64
import tempfile
import threading
import time
from flask import Flask, request, jsonify
from PIL import Image
import io
import os

# Импортируем необходимые модули
import torch

# Импортируем FastVLM
sys.path.append('../../../ml-fastvlm')
from llava.utils import disable_torch_init
from llava.conversation import conv_templates
from llava.model.builder import load_pretrained_model
from llava.mm_utils import tokenizer_image_token, process_images, get_model_name_from_path
from llava.constants import IMAGE_TOKEN_INDEX, DEFAULT_IMAGE_TOKEN, DEFAULT_IM_START_TOKEN, DEFAULT_IM_END_TOKEN

app = Flask(__name__)

# Глобальные переменные для модели
model = None
tokenizer = None
image_processor = None
context_len = None

def load_model():
    """Загружает FastVLM модель в память"""
    global model, tokenizer, image_processor, context_len

    try:
        print("🔄 Загружаем FastVLM модель в память...")

        # Путь к модели
        current_dir = os.path.dirname(os.path.abspath(__file__))
        model_path = os.path.join(current_dir, '../../../ml-fastvlm/checkpoints/llava-fastvithd_1.5b_stage3')

        # Загружаем модель
        disable_torch_init()
        model_name = get_model_name_from_path(model_path)
        tokenizer, model, image_processor, context_len = load_pretrained_model(
            model_path, None, model_name, device="cuda" if torch.cuda.is_available() else "cpu", torch_dtype=torch.float16
        )

        print("✅ FastVLM модель загружена и готова к работе!")
        return True

    except Exception as e:
        print(f"❌ Ошибка загрузки модели: {e}")
        return False

def extract_analysis_from_output(output):
    """Извлекает текст анализа из вывода FastVLM"""
    try:
        lines = output.strip().split('\n')

        # Ищем последнюю строку с результатом
        result_lines = []
        for line in reversed(lines):
            line = line.strip()
            if line and not line.startswith('`torch_dtype`') and not line.startswith('The following'):
                # Очищаем от мусора
                clean_line = line.encode('utf-8', errors='replace').decode('utf-8', errors='replace')
                clean_line = ' '.join(clean_line.split())
                result_lines.insert(0, clean_line)

        result_text = '\n'.join(result_lines[:10])

        if not result_text:
            result_text = output.strip()

        return result_text

    except Exception as e:
        print(f"Ошибка при извлечении анализа: {e}")
        return "Ошибка при обработке результатов анализа"

@app.route('/health', methods=['GET'])
def health():
    """Проверка здоровья сервера"""
    return jsonify({
        'status': 'healthy',
        'model_loaded': model is not None,
        'timestamp': time.time()
    })

@app.route('/analyze', methods=['POST'])
def analyze():
    """Анализ изображения"""
    try:
        if model is None:
            return jsonify({
                'success': False,
                'error': 'Model not loaded'
            }), 500

        # Получаем данные
        data = request.get_json()
        if not data or 'image_base64' not in data:
            return jsonify({
                'success': False,
                'error': 'No image provided'
            }), 400

        image_base64 = data['image_base64']
        prompt = data.get('prompt', 'Опиши подробно какие предметы одежды ты видишь на этом изображении. Какой тип, цвет, стиль и материал? Пожалуйста, отвечай на русском языке, используя точные термины моды.')

        # Декодируем изображение
        image_data = base64.b64decode(image_base64)
        image = Image.open(io.BytesIO(image_data))

        # Сохраняем во временный файл
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as temp_file:
            image.save(temp_file, 'JPEG')
            temp_image_path = temp_file.name

        try:
            # Создаем промпт для модели
            qs = prompt
            if model.config.mm_use_im_start_end:
                qs = DEFAULT_IM_START_TOKEN + DEFAULT_IMAGE_TOKEN + DEFAULT_IM_END_TOKEN + '\n' + qs
            else:
                qs = DEFAULT_IMAGE_TOKEN + '\n' + qs

            conv = conv_templates["qwen_2"].copy()
            conv.append_message(conv.roles[0], qs)
            conv.append_message(conv.roles[1], None)
            prompt_full = conv.get_prompt()

            # Токенизируем промпт
            input_ids = tokenizer_image_token(prompt_full, tokenizer, IMAGE_TOKEN_INDEX, return_tensors='pt').unsqueeze(0).to(model.device)

            # Обрабатываем изображение
            image_tensor = process_images([image], image_processor, model.config)[0]

            # Выполняем анализ
            with torch.no_grad():
                output_ids = model.generate(
                    input_ids,
                    images=image_tensor.unsqueeze(0).to(model.device).half(),
                    image_sizes=[image.size],
                    do_sample=True,
                    temperature=0.2,
                    top_p=None,
                    num_beams=1,
                    max_new_tokens=256,
                    use_cache=True
                )

            # Декодируем результат
            result_text = tokenizer.batch_decode(output_ids, skip_special_tokens=True)[0].strip()

            # Извлекаем чистый анализ
            clean_analysis = extract_analysis_from_output(result_text)

            return jsonify({
                'success': True,
                'analysis': clean_analysis
            })

        finally:
            # Удаляем временный файл
            try:
                os.unlink(temp_image_path)
            except:
                pass

    except Exception as e:
        print(f"Ошибка анализа: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

def start_server():
    """Запуск Flask сервера в отдельном потоке"""
    try:
        print("🚀 Запускаем FastVLM сервер на порту 3001...")
        app.run(host='127.0.0.1', port=3001, debug=False, use_reloader=False)
    except Exception as e:
        print(f"❌ Ошибка запуска FastVLM сервера: {e}")

if __name__ == '__main__':
    import torch

    print("🤖 FastVLM Server starting...")

    # Загружаем модель
    if load_model():
        # Запускаем сервер
        start_server()
    else:
        print("❌ Не удалось загрузить модель, сервер не запущен")
        sys.exit(1)
