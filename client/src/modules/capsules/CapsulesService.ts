/**
 * Сервис для работы с капсулами
 * Вся бизнес-логика и API запросы
 */

import { logger } from '../logger';
import { api } from '../api';
import { Capsule, StyleCapsule, CreateCapsuleDto, UpdateCapsuleDto } from '@/types/capsules';
import { WardrobeItem } from '@/types/wardrobe';
import { dataLoader } from '../shared/DataLoader';
import { dataCacheManager } from '../dataCache';
import { handleServiceError, handleServiceErrorAndThrow } from '../shared/ErrorHandler';

/**
 * Класс-сервис для работы с капсулами
 */
export class CapsulesService {
  /**
   * Загрузить все капсулы
   * Использует кэш с fallback на сервер
   */
  async loadCapsules(): Promise<StyleCapsule[]> {
    return dataLoader.loadWithCacheFallback<StyleCapsule>(
      () => dataCacheManager.getCapsules() as StyleCapsule[],
      () => this.loadCapsulesFromServer()
    );
  }

  /**
   * Загрузить капсулы с сервера (без кэша)
   */
  private async loadCapsulesFromServer(): Promise<StyleCapsule[]> {
    try {
      const result = await api.getCapsules();

      if (!result.success) {
        throw new Error(result.error || 'Failed to load capsules');
      }

      logger.info('Capsules loaded from server', { count: result.capsules.length });
      return result.capsules;

    } catch (error) {
      handleServiceError(error, 'Error loading capsules from server');
      return [];
    }
  }

  /**
   * Загрузить конкретную капсулу с полными данными
   */
  async loadCapsule(capsuleId: number): Promise<Capsule> {
    try {
      logger.info('Loading capsule data from server', { capsuleId });

      const response = await api.get(`/capsules/${capsuleId}`) as any;

      if (!response.success) {
        throw new Error(response.error || 'Failed to load capsule data');
      }

      logger.info('Capsule data loaded successfully', { capsuleId });
      return response.capsule;

    } catch (error) {
      handleServiceErrorAndThrow(error, 'Error loading capsule data', { capsuleId });
    }
  }

  /**
   * Создать новую капсулу
   */
  async createCapsule(data: CreateCapsuleDto): Promise<Capsule> {
    try {
      logger.info('Creating new capsule on server');

      const result = await api.createCapsule(data) as any;

      if (!result.success) {
        throw new Error(result.error || 'Failed to save capsule');
      }

      logger.info('Capsule saved successfully on server', { id: result.capsule.id });

      // Добавляем в кэш
      dataCacheManager.addCapsule(result.capsule);

      return result.capsule;
    } catch (error) {
      handleServiceErrorAndThrow(error, 'Error saving capsule to server');
    }
  }

  /**
   * Обновить капсулу
   */
  async updateCapsule(capsuleId: number, data: UpdateCapsuleDto): Promise<Capsule> {
    try {
      logger.info('Updating capsule on server', { capsuleId });

      const result = await api.updateCapsule(capsuleId, data) as any;

      if (!result.success) {
        throw new Error(result.error || 'Failed to update capsule');
      }

      logger.info('Capsule updated successfully on server', { capsuleId });

      // Обновляем в кэше
      dataCacheManager.updateCapsule(capsuleId, result.capsule);

      return result.capsule;
    } catch (error) {
      handleServiceErrorAndThrow(error, 'Error updating capsule on server', { capsuleId });
    }
  }

  /**
   * Удалить капсулу
   */
  async deleteCapsule(capsuleId: number): Promise<void> {
    try {
      logger.info('Deleting capsule', { capsuleId });

      const result = await api.deleteCapsule(capsuleId) as any;

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete capsule');
      }

      logger.info('Capsule deleted successfully', { capsuleId });

      // Удаляем из кэша
      dataCacheManager.removeCapsule(capsuleId);

    } catch (error) {
      handleServiceErrorAndThrow(error, 'Error removing capsule', { capsuleId });
    }
  }

  /**
   * Сортировать вещи по слоям одежды (от нижнего к верхнему)
   */
  sortItemsByLayer(items: WardrobeItem[]): WardrobeItem[] {
    const layerOrder: Record<string, number> = {
      'LEGWEAR': 1,
      'BODYWEAR': 2,
      'INNERWEAR': 3,
      'FULLBODY': 4,
      'FOOTWEAR': 5,
      'OUTERWEAR': 6,
      'HEADWEAR': 7,
      'ACCESSORIES': 8
    };

    return items.sort((a, b) => {
      const aLayer = layerOrder[a.category?.toUpperCase() || ''] || 99;
      const bLayer = layerOrder[b.category?.toUpperCase() || ''] || 99;
      return aLayer - bLayer;
    });
  }
}

// Экспортируем синглтон
export const capsulesService = new CapsulesService();
