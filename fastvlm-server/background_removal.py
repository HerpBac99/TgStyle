#!/usr/bin/env python3
"""
Скрипт для обрезки заднего фона на фотографиях
Использует rembg с нейронной сетью U2Net для высокого качества

ИНСТРУКЦИЯ ПО ЗАПУСКУ:
======================

1. Установка зависимостей:
   pip install rembg opencv-python onnxruntime-gpu==1.16.3

2. Запуск на одном изображении:
   python background_removal.py --input photo.jpg --output result_bg.jpg

3. Пакетная обработка директории:
   python background_removal.py --input ./photos/ --output ./results/ --batch

4. GPU режим:
   python background_removal.py --input photo.jpg --output result_bg.jpg --gpu

5. CPU режим (по умолчанию):
   python background_removal.py --input photo.jpg --output result_bg.jpg

ПАРАМЕТРЫ:
==========
--input, -i: Путь к изображению или директории
--output, -o: Путь для сохранения результата
--batch, -b: Пакетная обработка директории
--gpu: Использовать GPU
--cpu: Использовать CPU (по умолчанию)
--no-postprocess: Отключить постобработку краев
--no-crop: Отключить автоматическое обрезание до границ объекта
--crop-top: Обрезать сверху N пикселей (для удаления вешалок)

ПРИМЕРЫ:
========
# Обработать одно фото
python background_removal.py -i 1.jpg -o 1_bg.jpg

# Обработать все фото в директории
python background_removal.py -i ./ -o ./results/ -b

# Использовать CPU вместо GPU
python background_removal.py -i 1.jpg -o 1_bg.jpg --cpu
"""

import os
import sys
import glob
import time
import logging
from pathlib import Path
from typing import Tuple, Optional, List
import argparse

import numpy as np
import cv2
from PIL import Image, ImageFilter

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('background_removal.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class BackgroundRemover:
    """Класс для удаления заднего фона с использованием rembg"""

    def __init__(self, use_gpu: bool = True):
        self.use_gpu = use_gpu
        self.rembg_session = None
        self.device_info = self._check_device()

        # Инициализация rembg модели
        self._init_rembg()

    def _init_rembg(self):
        """Инициализация rembg модели"""
        try:
            from rembg import new_session
            logger.info(f"Инициализация rembg модели на {self.device_info}...")

            # Настройка провайдеров для GPU
            providers = []
            if self.use_gpu:
                try:
                    import onnxruntime as ort
                    if 'CUDAExecutionProvider' in ort.get_available_providers():
                        providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
                        logger.info("[GPU] CUDA поддержка включена")
                    else:
                        logger.warning("[WARNING] CUDA не доступен, используем CPU")
                        providers = ['CPUExecutionProvider']
                except ImportError:
                    logger.warning("[WARNING] onnxruntime-gpu не установлен, используем CPU")
                    providers = ['CPUExecutionProvider']
            else:
                providers = ['CPUExecutionProvider']
                logger.info("[CPU] Используем CPU режим")

            self.rembg_session = new_session(providers=providers)
            logger.info("rembg модель загружена")
        except ImportError:
            logger.error("rembg не установлен. Установите: pip install rembg")
            raise

    def _check_device(self) -> str:
        """Проверка доступных устройств"""
        try:
            import onnxruntime as ort
            providers = ort.get_available_providers()
            if 'CUDAExecutionProvider' in providers:
                return "GPU (CUDA)"
            elif 'TensorrtExecutionProvider' in providers:
                return "GPU (TensorRT)"
            else:
                return "CPU"
        except ImportError:
            return "CPU (no onnxruntime)"

    def _rembg_remove(self, image: Image.Image) -> Tuple[Image.Image, float]:
        """Удаление фона с помощью rembg (U2Net модель)"""
        if self.rembg_session is None:
            raise ImportError("rembg не инициализирован")

        start_time = time.time()
        from rembg import remove

        # Конвертируем в RGBA для прозрачности
        if image.mode != 'RGBA':
            image = image.convert('RGBA')

        # Удаляем фон с оптимальными параметрами
        result = remove(
            image, 
            session=self.rembg_session,
            only_mask=False,  # Возвращаем изображение с альфа-каналом
            post_process_mask=True,  # Включаем постобработку для сглаживания
            bgcolor=None  # Прозрачный фон
        )

        processing_time = time.time() - start_time
        logger.info(f"rembg обработка завершена за {processing_time:.2f}с")
        return result, processing_time

    def remove_background(self, image: Image.Image, upscale: bool = True) -> Tuple[Image.Image, float]:
        """
        Удалить задний фон с помощью rembg с опциональным upscaling для лучшего качества

        Args:
            image: PIL изображение
            upscale: Увеличить разрешение перед обработкой для лучшего качества краев

        Returns:
            Tuple[Image.Image, float]: результат и время обработки
        """
        original_size = image.size
        max_dimension = max(image.width, image.height)
        
        # Определяем нужен ли upscale
        # Upscale только если изображение меньше 2000px по большей стороне
        should_upscale = upscale and max_dimension < 3000
        
        if should_upscale:
            # Вычисляем scale_factor чтобы большая сторона стала ~2000px
            target_size = 3000
            scale_factor = target_size / max_dimension
            upscaled_size = (int(image.width * scale_factor), int(image.height * scale_factor))
            
            logger.info(f"Upscaling image: {original_size} -> {upscaled_size} (scale: {scale_factor:.2f}x)")
            image = image.resize(upscaled_size, Image.Resampling.LANCZOS)
        
        # Удаляем фон
        result, processing_time = self._rembg_remove(image)
        
        # Downscale обратно к исходному размеру если делали upscale
        if should_upscale:
            logger.info(f"Downscaling result: {result.size} -> {original_size}")
            result = result.resize(original_size, Image.Resampling.LANCZOS)
        
        return result, processing_time

    def post_process_mask(self, image: Image.Image, feather: int = 2) -> Image.Image:
        """Постобработка для улучшения краев"""
        # Применяем feather (размытие краев)
        if feather > 0:
            # Разделяем альфа-канал
            alpha = image.split()[-1]

            # Размываем альфа-канал
            alpha = alpha.filter(ImageFilter.GaussianBlur(feather))

            # Собираем изображение обратно
            rgb = image.convert('RGB')
            image = Image.merge('RGBA', rgb.split() + (alpha,))

        return image

    def crop_to_content_smart(self, image: Image.Image, padding: int = 10) -> Image.Image:
        """
        Умное обрезание с использованием OpenCV для анализа контуров

        Args:
            image: PIL изображение (RGBA с альфа-каналом)
            padding: отступ от границ в пикселях

        Returns:
            Image.Image: обрезанное изображение
        """
        try:
            # Работаем с альфа-каналом для определения foreground
            if image.mode == 'RGBA':
                # Используем альфа-канал как маску
                alpha = np.array(image.split()[-1])  # Берем альфа-канал
                mask = (alpha > 128).astype(np.uint8) * 255  # Порог для foreground
            else:
                # Fallback для RGB изображений
                img_array = np.array(image)
                gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
                _, mask = cv2.threshold(gray, 250, 255, cv2.THRESH_BINARY_INV)

            # Морфологические операции для очистки маски
            kernel = np.ones((3, 3), np.uint8)
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)

            # Находим контуры
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            if not contours:
                logger.warning("Не найдены контуры, возвращаем оригинал")
                return image

            # Сортируем контуры по площади
            contours_sorted = sorted(contours, key=cv2.contourArea, reverse=True)

            # Находим главный объект (самый большой контур)
            main_contour = contours_sorted[0]
            x, y, w, h = cv2.boundingRect(main_contour)

            # Проверяем пропорции - если объект слишком узкий и близко к верху,
            # возможно это вешалка, попробуем найти следующий по величине контур
            aspect_ratio = w / h if h > 0 else 0
            if aspect_ratio > 3 and y < 100:  # Узкий объект близко к верху
                logger.info(f"Найден потенциально ненужный элемент (aspect_ratio={aspect_ratio:.2f}, y={y})")

                # Ищем следующий подходящий контур
                for contour in contours_sorted[1:]:
                    area = cv2.contourArea(contour)
                    if area > cv2.contourArea(main_contour) * 0.1:  # Минимум 10% от площади главного
                        cx, cy, cw, ch = cv2.boundingRect(contour)
                        if cy > max(y + h * 0.3, 50):  # Ниже главного объекта
                            main_contour = contour
                            x, y, w, h = cx, cy, cw, ch
                            logger.info(f"Используем альтернативный контур: ({x}, {y}, {w}, {h})")
                            break

            # Добавляем padding
            left = max(0, x - padding)
            top = max(0, y - padding)
            right = min(image.width, x + w + padding)
            bottom = min(image.height, y + h + padding)

            # Проверяем минимальный размер
            if (right - left) < 50 or (bottom - top) < 50:
                logger.warning("Обрезание слишком сильное, возвращаем оригинал")
                return image

            # Обрезаем
            cropped = image.crop((left, top, right, bottom))

            logger.info(f"Smart обрезание: {image.size} -> {cropped.size}")
            logger.info(f"Главный объект: ({x}, {y}, {w}, {h})")

            return cropped

        except Exception as e:
            logger.error(f"Ошибка при smart обрезании: {e}")
            # Fallback на простое обрезание
            return self.crop_to_content_simple(image, padding)

    def crop_to_content_simple(self, image: Image.Image, padding: int = 10) -> Image.Image:
        """
        Простое обрезание на основе белого фона
        """
        try:
            if image.mode != 'RGB':
                image = image.convert('RGB')

            img_array = np.array(image)

            # Создаем маску белого фона
            white_mask = (
                (img_array[:, :, 0] > 245) &
                (img_array[:, :, 1] > 245) &
                (img_array[:, :, 2] > 245)
            )

            # Находим границы непрозрачных областей
            rows = ~np.all(white_mask, axis=1)
            cols = ~np.all(white_mask, axis=0)

            if not np.any(rows) or not np.any(cols):
                return image

            top = np.argmax(rows)
            bottom = len(rows) - np.argmax(rows[::-1]) - 1
            left = np.argmax(cols)
            right = len(cols) - np.argmax(cols[::-1]) - 1

            # Добавляем padding
            left = max(0, left - padding)
            top = max(0, top - padding)
            right = min(image.width, right + padding)
            bottom = min(image.height, bottom + padding)

            if (right - left) < 50 or (bottom - top) < 50:
                return image

            cropped = image.crop((left, top, right, bottom))
            logger.info(f"Simple обрезание: {image.size} -> {cropped.size}")

            return cropped

        except Exception as e:
            logger.error(f"Ошибка при simple обрезании: {e}")
            return image

    def crop_to_content(self, image: Image.Image, padding: int = 10) -> Image.Image:
        """
        Основная функция обрезания - пробует smart, fallback на simple
        """
        try:
            return self.crop_to_content_smart(image, padding)
        except Exception:
            logger.warning("Smart обрезание не удалось, использую simple")
            return self.crop_to_content_simple(image, padding)

def process_single_image(input_path: str, output_path: str,
                        post_process: bool = True, use_gpu: bool = True, auto_crop: bool = True) -> bool:
    """Обработать одно изображение"""
    start_time = time.time()
    logger.info(f"[START] НАЧАЛО ОБРАБОТКИ: {input_path} в {time.strftime('%H:%M:%S')}")

    try:
        # Загружаем изображение
        image = Image.open(input_path)

        # Инициализируем remover
        remover = BackgroundRemover(use_gpu=use_gpu)

        # Удаляем фон
        result, processing_time = remover.remove_background(image)

        # Постобработка
        if post_process:
            result = remover.post_process_mask(result)

        # Автоматическое обрезание до границ объекта (ДО применения белого фона)
        if auto_crop and result.mode == 'RGBA':
            result = remover.crop_to_content(result)

        # Сохраняем результат
        if output_path.lower().endswith('.png'):
            # Сохраняем как PNG с прозрачностью
            if result.mode == 'RGBA':
                result.save(output_path, 'PNG')
            else:
                # Конвертируем в RGBA для прозрачности
                result = result.convert('RGBA')
                result.save(output_path, 'PNG')
        else:
            # Сохраняем как JPG с белым фоном
            if result.mode == 'RGBA':
                # Создаем белый фон и накладываем изображение
                background = Image.new('RGB', result.size, (255, 255, 255))
                background.paste(result, mask=result.split()[-1])  # Используем альфа-канал как маску
                result = background
            result.save(output_path, 'JPEG', quality=95)  # JPG с высоким качеством

        total_time = time.time() - start_time
        logger.info(f"[SUCCESS] ЗАВЕРШЕНО: {output_path}")
        logger.info(f"[TIME] ОБЩЕЕ ВРЕМЯ: {total_time:.2f}с (обработка: {processing_time:.2f}с)")
        logger.info(f"[END] КОНЕЦ: {time.strftime('%H:%M:%S')}")
        return True

    except Exception as e:
        total_time = time.time() - start_time
        logger.error(f"[ERROR] ОШИБКА при обработке {input_path}: {e}")
        logger.error(f"[TIME] ВРЕМЯ ДО ОШИБКИ: {total_time:.2f}с")
        return False

def process_batch(input_dir: str, output_dir: str,
                 pattern: str = "*.jpg", post_process: bool = True, use_gpu: bool = True, auto_crop: bool = True) -> Tuple[int, int]:
    """Обработать пакет изображений"""
    # Создаем выходную директорию
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    # Находим все изображения
    image_paths = glob.glob(os.path.join(input_dir, pattern))
    logger.info(f"Найдено изображений: {len(image_paths)}")

    success_count = 0
    total_count = len(image_paths)

    for input_path in image_paths:
        # Определяем имя выходного файла
        filename = Path(input_path).name
        name_without_ext = Path(input_path).stem
        output_path = os.path.join(output_dir, f"{name_without_ext}_bg.jpg")

        # Обрабатываем
        if process_single_image(input_path, output_path, post_process, use_gpu, auto_crop):
            success_count += 1

    logger.info(f"Обработка завершена: {success_count}/{total_count} успешно")
    return success_count, total_count

def main():
    """Основная функция"""
    parser = argparse.ArgumentParser(description='Удаление заднего фона на фотографиях с помощью rembg')
    parser.add_argument('--input', '-i', required=True,
                       help='Путь к изображению или директории')
    parser.add_argument('--output', '-o', required=True,
                       help='Путь для сохранения результата')
    parser.add_argument('--batch', '-b', action='store_true',
                       help='Обработать все изображения в директории')
    parser.add_argument('--no-postprocess', action='store_true',
                       help='Отключить постобработку краев')
    parser.add_argument('--no-crop', action='store_true',
                       help='Отключить автоматическое обрезание до границ объекта')
    parser.add_argument('--gpu', action='store_true',
                       help='Использовать GPU')
    parser.add_argument('--cpu', action='store_true', default=True,
                       help='Использовать CPU (по умолчанию)')

    args = parser.parse_args()

    # Настройка параметров
    post_process = not args.no_postprocess
    auto_crop = not args.no_crop
    use_gpu = args.gpu  # GPU включается только если явно указан --gpu

    if use_gpu:
        print("[GPU] Используем GPU режим")
    else:
        print("[CPU] Используем CPU режим")

    if args.batch:
        # Пакетная обработка
        success, total = process_batch(args.input, args.output, post_process=post_process, use_gpu=use_gpu, auto_crop=auto_crop)
        print(f"Результат: {success}/{total} изображений обработано успешно")
    else:
        # Обработка одного изображения
        success = process_single_image(args.input, args.output, post_process, use_gpu, auto_crop)
        if success:
            print(f"Изображение обработано успешно: {args.output}")
        else:
            print("Ошибка при обработке изображения")
            sys.exit(1)

if __name__ == "__main__":
    main()
