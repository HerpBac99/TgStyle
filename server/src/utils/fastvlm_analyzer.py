#!/usr/bin/env python3
"""
FastVLM Analyzer Module для TgStyle
Исправленная версия - принимает данные через stdin, избегая ENAMETOOLONG
"""

import sys
import json
import base64
import tempfile
import subprocess
import os
from PIL import Image
import io

def extract_analysis_from_output(output):
    """
    Извлекает текст анализа из вывода FastVLM с исправлением кодировки
    """
    try:
        lines = output.strip().split('\n')

        # Ищем последнюю строку с результатом (пропускаем предупреждения)
        result_lines = []
        for line in reversed(lines):
            line = line.strip()
            if line and not line.startswith('`torch_dtype`') and not line.startswith('The following'):
                # Исправляем кодировку - заменяем мусорные символы
                clean_line = line.encode('utf-8', errors='replace').decode('utf-8', errors='replace')
                # Убираем повторяющиеся символы
                clean_line = ' '.join(clean_line.split())
                result_lines.insert(0, clean_line)

        # Берем последние несколько строк как результат
        result_text = '\n'.join(result_lines[:10])  # Максимум 10 строк

        if not result_text:
            # Если не нашли, берем весь вывод
            result_text = output.strip()

        return result_text

    except Exception as e:
        print(f"Ошибка при извлечении анализа: {e}")
        return "Ошибка при обработке результатов анализа"

def main():
    try:
        # Читаем JSON данные из stdin
        input_data = json.loads(sys.stdin.read())
        
        image_base64 = input_data['image_base64']
        prompt = input_data.get('prompt', 'Опиши подробно какие предметы одежды ты видишь на этом изображении. Какой тип, цвет, стиль и материал? Пожалуйста, отвечай на русском языке, используя точные термины моды.')
        
        # Декодируем base64 в изображение
        image_data = base64.b64decode(image_base64)
        image = Image.open(io.BytesIO(image_data))
        
        # Сохраняем изображение во временный файл
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as temp_file:
            image.save(temp_file, 'JPEG')
            temp_image_path = temp_file.name
        
        try:
            # Определяем пути
            current_dir = os.path.dirname(os.path.abspath(__file__))
            project_root = os.path.join(current_dir, '../../..')
            fastvlm_path = os.path.join(project_root, 'ml-fastvlm')
            python_env = os.path.join(project_root, 'fastvlm_env', 'Scripts', 'python.exe')
            
            # Запускаем FastVLM через subprocess
            cmd = [
                python_env,
                os.path.join(fastvlm_path, 'predict.py'),
                '--image-file', temp_image_path,
                '--prompt', prompt
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                cwd=fastvlm_path,
                timeout=60  # 60 секунд таймаут
            )
            
            if result.returncode == 0:
                # Извлекаем результат из вывода
                analysis_text = extract_analysis_from_output(result.stdout)
                
                # Возвращаем успешный результат
                response = {
                    'success': True,
                    'analysis': analysis_text
                }
            else:
                # Возвращаем ошибку
                response = {
                    'success': False,
                    'error': f'FastVLM process failed: {result.stderr}'
                }
            
        finally:
            # Удаляем временный файл
            try:
                os.unlink(temp_image_path)
            except:
                pass
        
        # Выводим результат в stdout
        print(json.dumps(response, ensure_ascii=False))
        
    except Exception as e:
        # В случае любой ошибки возвращаем JSON с ошибкой
        error_response = {
            'success': False,
            'error': str(e)
        }
        print(json.dumps(error_response, ensure_ascii=False))

if __name__ == '__main__':
    main()
