#!/usr/bin/env python3
"""
Тест FastVLM сервера
"""

import requests
import base64
from PIL import Image
import io

def test_fastvlm_server():
    print("🧪 Тестирование FastVLM сервера...")

    # Создаем тестовое изображение
    img = Image.new('RGB', (100, 100), color='red')
    buffer = io.BytesIO()
    img.save(buffer, format='JPEG')
    img_base64 = base64.b64encode(buffer.getvalue()).decode()

    # Тест health endpoint
    try:
        response = requests.get('http://127.0.0.1:3001/health')
        print(f"Health check: {response.status_code}")
        print(f"Response: {response.json()}")
    except Exception as e:
        print(f"Health check failed: {e}")

    # Тест analyze endpoint
    try:
        data = {
            'image_base64': img_base64,
            'prompt': 'Describe this image'
        }

        response = requests.post('http://127.0.0.1:3001/analyze', json=data)
        print(f"Analyze status: {response.status_code}")
        print(f"Response: {response.json()}")
    except Exception as e:
        print(f"Analyze failed: {e}")

if __name__ == '__main__':
    test_fastvlm_server()
