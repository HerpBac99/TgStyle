/**
 * Сервис для работы с гардеробом
 * Вся бизнес-логика и API запросы
 */

import { logger } from '../logger';
import { WardrobeItem } from '@/types/wardrobe';
import { dataLoader } from '../shared/DataLoader';
import { dataCacheManager } from '../dataCache';

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
      const initData = (window as any).Telegram?.WebApp?.initData || '';

      const response = await fetch(`/api/wardrobe?initData=${encodeURIComponent(initData)}`, {
        method: 'GET'
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to load items');
      }

      logger.info('Wardrobe loaded from server', { count: result.items.length });
      return result.items;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error loading wardrobe from server', { error: errorMessage });
      return [];
    }
  }

  /**
   * Удалить элемент из гардероба
   */
  async deleteItem(itemId: number): Promise<void> {
    try {
      logger.info('Deleting wardrobe item', { itemId });

      const initData = (window as any).Telegram?.WebApp?.initData || '';

      const response = await fetch(`/api/wardrobe/${itemId}?initData=${encodeURIComponent(initData)}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete item');
      }

      logger.info('Item deleted successfully', { itemId });

      // Удаляем из кэша
      dataCacheManager.removeWardrobeItem(itemId);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error deleting wardrobe item', { error: errorMessage, itemId });
      throw error;
    }
  }

  /**
   * Обновить элемент гардероба
   */
  async updateItem(itemId: number, updates: Partial<WardrobeItem>): Promise<void> {
    try {
      logger.info('Updating wardrobe item', { itemId, updates });

      const initData = (window as any).Telegram?.WebApp?.initData || '';

      const response = await fetch(`/api/wardrobe/${itemId}?initData=${encodeURIComponent(initData)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to update item');
      }

      logger.info('Item updated successfully', { itemId });

      // Обновляем кэш
      dataCacheManager.updateWardrobeItem(itemId, result.item);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error updating wardrobe item', { error: errorMessage, itemId });
      throw error;
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

  /**
   * Получить статистику гардероба
   */
  getStats(items: WardrobeItem[]): {
    totalItems: number;
    byCategory: Record<string, number>;
  } {
    const stats = {
      totalItems: items.length,
      byCategory: {} as Record<string, number>
    };

    items.forEach(item => {
      const category = item.category?.toUpperCase() || 'UNKNOWN';
      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
    });

    return stats;
  }
}

// Экспортируем синглтон
export const wardrobeService = new WardrobeService();
