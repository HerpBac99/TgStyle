#!/usr/bin/env python3
"""
Быстрая предобработка изображений для FastVLM
Оптимизировано для мобильных фотографий - просто сжатие до нужного размера
"""

from PIL import Image
import io
import logging

logger = logging.getLogger(__name__)

def fast_mobile_preprocess(image: Image.Image, target_width: int = 1008, target_height: int = 1344,
                          quality: int = 95) -> tuple:
    """
    Быстрая предобработка для мобильных фотографий
    Просто сжимает до целевого размера и оптимизирует качество

    Args:
        image: PIL Image
        target_width: целевая ширина
        target_height: целевая высота
        quality: качество JPEG (0-100)

    Returns:
        tuple: (обработанное изображение, base64 строка, метаданные)
    """
    original_size = image.size
    original_mode = image.mode

    # Конвертируем в RGB если нужно
    if image.mode != 'RGB':
        image = image.convert('RGB')

    # Вычисляем новый размер с сохранением пропорций
    # Подгоняем так, чтобы изображение вписывалось в целевой размер
    original_width, original_height = image.size
    width_ratio = target_width / original_width
    height_ratio = target_height / original_height
    
    # Выбираем минимальное соотношение, чтобы изображение вписалось в рамки
    scale_ratio = min(width_ratio, height_ratio)
    
    # Вычисляем новые размеры
    new_width = int(original_width * scale_ratio)
    new_height = int(original_height * scale_ratio)
    
    # Масштабируем изображение (может как увеличивать, так и уменьшать)
    if (new_width, new_height) != original_size:
        image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)

    # Сохраняем в base64 с оптимизацией
    buffer = io.BytesIO()
    image.save(buffer, format='JPEG', quality=quality, optimize=True, subsampling=0)
    image_base64 = buffer.getvalue()

    # Метаданные
    metadata = {
        'original_size': original_size,
        'final_size': image.size,
        'original_mode': original_mode,
        'final_mode': image.mode,
        'jpeg_quality': quality,
        'compressed_size_mb': round(len(image_base64) / (1024 * 1024), 2),
        'resized': image.size != original_size,
        'scale_ratio': round(scale_ratio, 2)
    }

    # Конвертируем в base64 строку (чистые данные без префикса)
    base64_string = __import__('base64').b64encode(image_base64).decode('utf-8')

    logger.debug(f"Изображение обработано: {original_size} → {image.size} (масштаб: {scale_ratio:.2f}x), {metadata['compressed_size_mb']:.2f} MB")

    return image, base64_string, metadata

# Для обратной совместимости
def smart_preprocess_image(image: Image.Image, optimal_max_size: int = 1344, min_size: int = 896,
                          max_file_size_mb: float = 5.0) -> tuple:
    """
    Упрощенная версия smart_preprocess_image для совместимости
    """
    # Быстрая обработка для мобильных фото
    processed_image, _, metadata = fast_mobile_preprocess(image, target_width=1008, target_height=1344)

    # Преобразуем метаданные в старый формат
    quality_info = {
        'quality_score': 7,  # Предполагаем хорошее качество для мобильных фото
        'preprocessing_applied': 'fast_mobile',
        'compressed': metadata['compressed_size_mb'] < max_file_size_mb,
        'final_size': processed_image.size,
        'size_after_compression_mb': metadata['compressed_size_mb']
    }

    return processed_image, quality_info

# Для обратной совместимости
def normalize_and_enhance_image(image: Image.Image, optimal_max_size: int = 1344, min_size: int = 896) -> Image.Image:
    """
    Упрощенная версия для обратной совместимости
    """
    processed_image, _, _ = fast_mobile_preprocess(image, target_width=optimal_max_size, target_height=int(optimal_max_size * 0.75))
    return processed_image
