#!/usr/bin/env python3
"""
Скрипт для создания коллажей из фотографий
Комбинирует верхнюю и нижнюю части разных изображений
"""

import os
import sys
import argparse
from pathlib import Path
from PIL import Image
import logging

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('collage_maker.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class CollageMaker:
    """Класс для создания коллажей из изображений"""

    def __init__(self):
        pass

    def fit_to_size(self, image: Image.Image, target_width: int, target_height: int) -> Image.Image:
        """
        Масштабирует изображение, чтобы оно заполнило весь целевой размер,
        сохраняя пропорции. Если нужно - растягивает или сжимает.

        Args:
            image: исходное изображение
            target_width: целевая ширина
            target_height: целевая высота

        Returns:
            Image.Image: обработанное изображение
        """
        # Получаем текущие размеры
        img_width, img_height = image.size

        # Вычисляем соотношения сторон
        width_ratio = target_width / img_width
        height_ratio = target_height / img_height

        # Выбираем большее соотношение для заполнения всего пространства
        scale_ratio = max(width_ratio, height_ratio)

        # Новые размеры с сохранением пропорций
        new_width = int(img_width * scale_ratio)
        new_height = int(img_height * scale_ratio)

        # Масштабируем изображение
        resized_image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)

        # Создаем новый холст целевого размера
        result_image = Image.new('RGB', (target_width, target_height), (255, 255, 255))

        # Центрируем изображение
        x_offset = (target_width - new_width) // 2
        y_offset = (target_height - new_height) // 2

        # Вставляем изображение (обрезая края если нужно)
        result_image.paste(resized_image.crop((
            max(0, -x_offset),
            max(0, -y_offset),
            min(new_width, target_width - x_offset),
            min(new_height, target_height - y_offset)
        )), (
            max(0, x_offset),
            max(0, y_offset)
        ))

        return result_image

    def create_vertical_collage(self, top_image_path: str, bottom_image_path: str,
                              output_path: str, split_ratio: float = 0.5) -> bool:
        """
        Создает вертикальный коллаж из двух изображений

        Args:
            top_image_path: путь к изображению для верхней части
            bottom_image_path: путь к изображению для нижней части
            output_path: путь для сохранения результата
            split_ratio: соотношение разрезания (0.0-1.0, где 0.5 = пополам)

        Returns:
            bool: успех операции
        """
        try:
            logger.info(f"Создаем коллаж: {top_image_path} + {bottom_image_path}")

            # Загружаем изображения
            top_img = Image.open(top_image_path)
            bottom_img = Image.open(bottom_image_path)

            # Конвертируем в RGB если нужно
            if top_img.mode != 'RGB':
                top_img = top_img.convert('RGB')
            if bottom_img.mode != 'RGB':
                bottom_img = bottom_img.convert('RGB')

            # Получаем размеры
            top_width, top_height = top_img.size
            bottom_width, bottom_height = bottom_img.size

            logger.info(f"Верхнее изображение: {top_width}x{top_height}")
            logger.info(f"Нижнее изображение: {bottom_width}x{bottom_height}")

            # Определяем общую ширину
            final_width = min(top_width, bottom_width)

            # Вычисляем координаты разреза
            top_split_y = int(top_height * split_ratio)
            bottom_split_y = int(bottom_height * split_ratio)  # Используем то же соотношение

            logger.info(f"Линия разреза на верхнем изображении: {top_split_y}")
            logger.info(f"Линия разреза на нижнем изображении: {bottom_split_y}")

            # Вычисляем итоговую высоту
            top_part_height = top_split_y
            bottom_part_height = bottom_height - bottom_split_y
            final_height = top_part_height + bottom_part_height

            logger.info(f"Итоговый размер коллажа: {final_width}x{final_height}")

            # Создаем новое изображение
            collage = Image.new('RGB', (final_width, final_height), (255, 255, 255))

            # Вырезаем верхнюю часть от верхнего изображения
            top_crop = top_img.crop((0, 0, final_width, top_split_y))
            collage.paste(top_crop, (0, 0))

            # Вырезаем нижнюю часть от нижнего изображения
            bottom_crop = bottom_img.crop((0, bottom_split_y, final_width, bottom_height))
            collage.paste(bottom_crop, (0, top_split_y))

            # Сохраняем результат
            collage.save(output_path, 'JPEG', quality=95)
            logger.info(f"Коллаж сохранен: {output_path} ({final_width}x{final_height})")

            return True

        except Exception as e:
            logger.error(f"Ошибка при создании коллажа: {e}")
            return False

    def create_fixed_size_collage(self, top_image_path: str, bottom_image_path: str,
                                 output_path: str, width: int = 500, height: int = 1000) -> bool:
        """
        Создает коллаж фиксированного размера 500x1000px (вертикальный)
        Верхняя половина (0-500px) от top_image_path (масштабируется до 500x500)
        Нижняя половина (500-1000px) от bottom_image_path (масштабируется до 500x500)

        Args:
            top_image_path: путь к изображению для верхней части
            bottom_image_path: путь к изображению для нижней части
            output_path: путь для сохранения результата
            width: ширина коллажа (по умолчанию 500)
            height: высота коллажа (по умолчанию 1000)

        Returns:
            bool: успех операции
        """
        try:
            logger.info(f"Создаем коллаж фиксированного размера {width}x{height}: {top_image_path} + {bottom_image_path}")

            # Загружаем изображения
            top_img = Image.open(top_image_path)
            bottom_img = Image.open(bottom_image_path)

            # Конвертируем в RGB если нужно
            if top_img.mode != 'RGB':
                top_img = top_img.convert('RGB')
            if bottom_img.mode != 'RGB':
                bottom_img = bottom_img.convert('RGB')

            # Получаем размеры
            top_width, top_height = top_img.size
            bottom_width, bottom_height = bottom_img.size

            logger.info(f"Верхнее изображение: {top_width}x{top_height}")
            logger.info(f"Нижнее изображение: {bottom_width}x{bottom_height}")

            # Размеры половинок (для вертикального коллажа)
            half_height = height // 2  # 500px для каждого изображения

            # Создаем холст фиксированного размера
            collage = Image.new('RGB', (width, height), (255, 255, 255))

            # Обрабатываем верхнее изображение (масштабируем до 500x500)
            top_part = self.fit_to_size(top_img, width, half_height)
            collage.paste(top_part, (0, 0))

            logger.info(f"Верхняя часть: {top_image_path} масштабирована до {width}x{half_height}")

            # Обрабатываем нижнее изображение (масштабируем до 500x500)
            bottom_part = self.fit_to_size(bottom_img, width, half_height)
            collage.paste(bottom_part, (0, half_height))

            logger.info(f"Нижняя часть: {bottom_image_path} масштабирована до {width}x{half_height}")

            # Сохраняем результат
            collage.save(output_path, 'JPEG', quality=95)
            logger.info(f"Коллаж сохранен: {output_path} ({width}x{height})")

            return True

        except Exception as e:
            logger.error(f"Ошибка при создании коллажа фиксированного размера: {e}")
            return False

    def create_smart_collage(self, top_image_path: str, bottom_image_path: str,
                           output_path: str) -> bool:
        """
        Создает коллаж с интеллектуальным определением линии разреза
        Пытается найти оптимальную линию между верхней и нижней одеждой
        """
        try:
            logger.info("Создаем умный коллаж с автоматическим определением разреза")

            # Для начала используем простой подход с разрезом пополам
            # В будущем можно добавить анализ контента для поиска линии талии
            return self.create_vertical_collage(top_image_path, bottom_image_path,
                                              output_path, split_ratio=0.5)

        except Exception as e:
            logger.error(f"Ошибка при создании умного коллажа: {e}")
            return False

def main():
    """Основная функция"""
    parser = argparse.ArgumentParser(description='Создание коллажей из фотографий')
    parser.add_argument('--top', '-t', required=True,
                       help='Путь к изображению для верхней части (кофта)')
    parser.add_argument('--bottom', '-b', required=True,
                       help='Путь к изображению для нижней части (штаны)')
    parser.add_argument('--output', '-o', required=True,
                       help='Путь для сохранения коллажа')
    parser.add_argument('--ratio', '-r', type=float, default=0.5,
                       help='Соотношение разреза (0.0-1.0, по умолчанию 0.5)')
    parser.add_argument('--smart', '-s', action='store_true',
                       help='Использовать умное определение линии разреза')
    parser.add_argument('--fixed', '-f', action='store_true',
                       help='Создать коллаж фиксированного размера 500x1000px')
    parser.add_argument('--width', type=int, default=500,
                       help='Ширина коллажа для режима --fixed (по умолчанию 500)')
    parser.add_argument('--height', type=int, default=1000,
                       help='Высота коллажа для режима --fixed (по умолчанию 1000)')

    args = parser.parse_args()

    # Создаем коллаж
    maker = CollageMaker()

    if args.fixed:
        success = maker.create_fixed_size_collage(args.top, args.bottom, args.output,
                                                 args.width, args.height)
    elif args.smart:
        success = maker.create_smart_collage(args.top, args.bottom, args.output)
    else:
        success = maker.create_vertical_collage(args.top, args.bottom, args.output, args.ratio)

    if success:
        print(f"Коллаж успешно создан: {args.output}")
    else:
        print("Ошибка при создании коллажа")
        sys.exit(1)

if __name__ == "__main__":
    main()
