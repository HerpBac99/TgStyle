/**
 * Типы для капсул и генерации
 */

import type { WardrobeItem } from './wardrobe';

/**
 * Капсула (базовая модель из БД)
 */
export interface Capsule {
  id: number;
  name: string;
  description?: string;
  thumbnailPath?: string;
  canvasData?: any;
  createdAt: string;
  updatedAt?: string;
  metadata?: any;
}

/**
 * Капсула для отображения в UI
 */
export interface StyleCapsule {
  id: number;
  name: string;
  description?: string;
  thumbnailUrl: string;
  createdAt: string;
  likesCount?: number;
  viewsCount?: number;
  isLiked?: boolean;
  items?: any[];
}

/**
 * DTO для создания капсулы
 */
export interface CreateCapsuleDto {
  name: string;
  description?: string;
  canvasData: any;
  thumbnailBase64?: string;
  thumbnailImage?: string; // Альтернативное поле для thumbnail
  itemIds?: number[]; // ID вещей в капсуле
  metadata?: any;
}

/**
 * DTO для обновления капсулы
 */
export interface UpdateCapsuleDto {
  name?: string;
  description?: string;
  canvasData?: any;
  thumbnailBase64?: string;
  thumbnailImage?: string; // Альтернативное поле для thumbnail
  itemIds?: number[]; // ID вещей в капсуле
  metadata?: any;
}

/**
 * Элемент на canvas (вещь из гардероба)
 * Используется в CapsulesManager для работы с canvas
 */
export interface CanvasItem {
  item: WardrobeItem;
  position?: { x: number; y: number };
  scale?: number;
  angle?: number;
}

/**
 * Сгенерированная капсула
 */
export interface GeneratedCapsule {
  id: string; // временный ID
  name: string; // максимум 3 слова от Gemini
  description: string;
  reasoning: string; // обоснование выбора комбинации от Gemini
  recommendations: string; // рекомендации по улучшению образа
  items: WardrobeItem[]; // вещи с полными 9 полями
  itemIds: number[]; // ID вещей для создания капсулы
  previewDataUrl?: string; // превью canvas в base64
  isUnique?: boolean; // флаг уникальности (>80% отличия от существующих)
}

/**
 * Вещь гардероба с информацией об использовании
 */
export interface WardrobeItemWithUsage extends WardrobeItem {
  usageCount: number; // количество капсул, в которых используется
}

/**
 * Запрос на генерацию капсул
 */
export interface GenerationRequest {
  wardrobeItems: WardrobeItemWithUsage[]; // все 9 полей + usageCount
  existingCapsules: any[]; // существующие капсулы для проверки уникальности
  excludeCombinations?: number[][]; // для регенерации
}

/**
 * Ответ на запрос генерации
 */
export interface GenerationResponse {
  success: boolean;
  capsules?: GeneratedCapsule[];
  error?: string;
}

/**
 * Callback функции для GenerationModal
 */
export interface GenerationModalCallbacks {
  onSelect?: (capsule: GeneratedCapsule) => void;
  onRegenerate?: () => void;
  onCancel?: () => void;
}
