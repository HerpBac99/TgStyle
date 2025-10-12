/**
 * Типы для капсул
 */

import { WardrobeItem } from './wardrobe';

/**
 * Элемент в капсуле
 */
export interface CapsuleItem {
  id: number;
  wardrobeItemId: number;
  wardrobeItem: WardrobeItem;
}

/**
 * Капсула
 */
export interface Capsule {
  id: number;
  name: string;
  description?: string;
  thumbnailUrl?: string;
  items: CapsuleItem[];
  createdAt: string;
}

/**
 * Упрощенная капсула для грида (без полных данных элементов)
 */
export interface StyleCapsule {
  id: number;
  name: string;
  thumbnailUrl?: string;
  createdAt: string;
}

/**
 * Данные для создания капсулы
 */
export interface CreateCapsuleDto {
  name: string;
  canvasData: any;
  thumbnailImage: string;
  itemIds: number[];
}

/**
 * Данные для обновления капсулы
 */
export interface UpdateCapsuleDto {
  canvasData: any;
  thumbnailImage: string;
  itemIds: number[];
}

/**
 * Элемент на canvas
 */
export interface CanvasItem {
  item: WardrobeItem;
  position?: { x: number; y: number };
  scale?: number;
  angle?: number;
}

/**
 * Состояние canvas
 */
export interface CanvasState {
  canvasData: any;
  thumbnailImage: string;
}
