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
  subtype?: string;  // Подтип одежды (свитер, джинсы, кроссовки)
  color?: string;
  material?: string;
  style?: string;
  fit?: string;
  season?: string;  // Сезон (spring, summer, autumn, winter, all-season)
  pattern?: string;  // Узор (solid, striped, checkered, etc.)
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
  subtype?: string;  // Подтип одежды
  color?: string;
  material?: string;
  style?: string;
  fit?: string;
  season?: string;  // Сезон
  pattern?: string;  // Узор
  description?: string;
  embedding?: number[];  // FashionCLIP embedding вектор (только для внутреннего использования)
}

/**
 * Результат классификации одежды
 */
export interface ClassificationResult {
  category: ClothingCategory;
  subtype?: string;  // Подтип одежды (свитер, джинсы, кроссовки)
  color: string;
  material: string;
  style: string;
  fit: string;
  season?: string;  // Сезон
  pattern?: string;  // Узор
  description: string;
  embedding?: number[];  // FashionCLIP embedding вектор 512 измерений (только внутренне)
}
