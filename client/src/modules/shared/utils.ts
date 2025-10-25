/**
 * Общие утилиты
 */

import { ClothingCategory } from '@/types/wardrobe';

/**
 * Конвертировать файл в base64
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Конвертировать строку в ClothingCategory
 */
export function stringToClothingCategory(category: string): ClothingCategory {
  const normalized = category.toUpperCase().trim();

  if (normalized in ClothingCategory) {
    return ClothingCategory[normalized as keyof typeof ClothingCategory];
  }

  // Fallback на BODYWEAR
  return ClothingCategory.BODYWEAR;
}

/**
 * Нормализовать путь (заменить обратные слеши на прямые)
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Оптимизировать изображение перед отправкой на сервер
 * Уменьшает размер для ускорения загрузки
 * Всегда использует PNG для сохранения прозрачности
 * 
 * @param base64Image - изображение в формате base64
 * @param maxWidth - максимальная ширина (по умолчанию 1200px)
 * @returns оптимизированное изображение в base64 (PNG)
 */
export async function optimizeImageForUpload(
  base64Image: string,
  maxWidth: number = 1200
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      // Вычисляем новые размеры с сохранением пропорций
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      // Создаем canvas для ресайза
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      // Рисуем изображение с новыми размерами
      ctx.drawImage(img, 0, 0, width, height);

      // Всегда используем PNG для сохранения прозрачности
      const optimizedBase64 = canvas.toDataURL('image/png');

      resolve(optimizedBase64);
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for optimization'));
    };

    img.src = base64Image;
  });
}
