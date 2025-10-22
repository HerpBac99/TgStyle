/**
 * Сервис для работы с гардеробом
 * Вся бизнес-логика и API запросы
 */

import { logger } from '../logger';
import { api } from '../api';
import { WardrobeItem } from '@/types/wardrobe';
import { ClassificationResult } from '@/types/wardrobe';
import { dataLoader } from '../shared/DataLoader';
import { dataCacheManager } from '../dataCache';
import { handleServiceError, handleServiceErrorAndThrow } from '../shared/ErrorHandler';

/**
 * Класс-сервис для работы с гардеробом
 */
export class WardrobeService {
  /**
   * Загрузить все элементы гардероба
   * Использует кэш с fallback на сервер
   */
  async loadWardrobe(): Promise<WardrobeItem[]> {
    return dataLoader.loadWithCacheFallback<WardrobeItem>(
      () => dataCacheManager.getWardrobeItems(),
      () => this.loadFromServer()
    );
  }

  /**
   * Загрузить гардероб с сервера (без кэша)
   */
  private async loadFromServer(): Promise<WardrobeItem[]> {
    try {
      const result = await api.getWardrobe();

      if (!result.success) {
        throw new Error(result.error || 'Failed to load items');
      }

      logger.info('Wardrobe loaded from server', { count: result.items.length });
      return result.items;

    } catch (error) {
      handleServiceError(error, 'Error loading wardrobe from server');
      return [];
    }
  }

  /**
   * Удалить элемент из гардероба
   */
  async deleteItem(itemId: number): Promise<void> {
    try {
      logger.info('Deleting wardrobe item', { itemId });

      const result = await api.deleteWardrobeItem(itemId);

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete item');
      }

      logger.info('Item deleted successfully', { itemId });

      // Удаляем из кэша
      dataCacheManager.removeWardrobeItem(itemId);

    } catch (error) {
      handleServiceErrorAndThrow(error, 'Error deleting wardrobe item', { itemId });
    }
  }

  /**
   * Обновить элемент гардероба
   */
  async updateItem(itemId: number, updates: Partial<WardrobeItem>): Promise<void> {
    try {
      logger.info('Updating wardrobe item', { itemId, updates });

      const result = await api.updateWardrobeItem(itemId, updates);

      if (!result.success) {
        throw new Error(result.error || 'Failed to update item');
      }

      logger.info('Item updated successfully', { itemId });

      // Обновляем кэш если сервер вернул обновленный элемент
      if (result.item) {
        dataCacheManager.updateWardrobeItem(itemId, result.item);
      }

    } catch (error) {
      handleServiceErrorAndThrow(error, 'Error updating wardrobe item', { itemId });
    }
  }

  /**
   * Добавить новый элемент в гардероб
   */
  async addItem(imageData: string, classification: ClassificationResult): Promise<WardrobeItem> {
    try {
      logger.info('Adding new wardrobe item', {
        category: classification.category,
        color: classification.color
      });

      const result = await api.post('/wardrobe', {
        imageData,
        classification
      }) as any;

      if (!result.success) {
        throw new Error(result.error || 'Failed to add item');
      }

      logger.info('Item added successfully', { id: result.item.id });

      // Добавляем в кэш
      dataCacheManager.addWardrobeItem(result.item);

      return result.item;

    } catch (error) {
      handleServiceErrorAndThrow(error, 'Error adding wardrobe item');
    }
  }

  /**
   * Фильтровать вещи по категории
   */
  filterByCategory(items: WardrobeItem[], category: string): WardrobeItem[] {
    if (category === 'ALL') {
      return items;
    }

    return items.filter(item => item.category?.toUpperCase() === category);
  }

}

// Экспортируем синглтон
export const wardrobeService = new WardrobeService();
