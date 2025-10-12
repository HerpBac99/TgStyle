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
