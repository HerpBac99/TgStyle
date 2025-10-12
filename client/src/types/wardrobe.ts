/**
 * Типы для гардероба
 * Единый источник правды для всех модулей
 */

/**
 * Категории одежды
 */
export enum ClothingCategory {
  OUTERWEAR = 'OUTERWEAR',       // Верхняя одежда
  INNERWEAR = 'INNERWEAR',       // Нижнее белье
  BODYWEAR = 'BODYWEAR',         // Основная одежда (футболки, рубашки)
  FULLBODY = 'FULLBODY',         // Платья, комбинезоны
  LEGWEAR = 'LEGWEAR',           // Брюки, юбки
  FOOTWEAR = 'FOOTWEAR',         // Обувь
  HEADWEAR = 'HEADWEAR',         // Головные уборы
  ACCESSORIES = 'ACCESSORIES'    // Аксессуары
}

/**
 * Элемент гардероба
 */
export interface WardrobeItem {
  id: number;
  imageUrl: string;
  name?: string;
  category?: string;
  color?: string;
  material?: string;
  style?: string;
  fit?: string;
  description?: string;
  tags?: string[];
  createdAt: string;
}

/**
 * Данные для создания элемента гардероба
 */
export interface CreateWardrobeItemDto {
  imageBase64: string;
  category?: string;
  color?: string;
  material?: string;
  style?: string;
  fit?: string;
  description?: string;
}

/**
 * Результат классификации одежды
 */
export interface ClassificationResult {
  category: ClothingCategory;
  color: string;
  material: string;
  style: string;
  fit: string;
  description: string;
}
