/**
 * Сервис для работы с localStorage
 * Обработка квот, автоматическая очистка, сжатие данных
 */

import { logger } from '../logger';
import { ShareData } from '@/types/sharing';

/**
 * Информация о доступном месте
 */
export interface StorageSpaceInfo {
  /** Доступно ли место */
  available: boolean;
  /** Использовано KB */
  usedKB: number;
  /** Всего KB */
  totalKB: number;
  /** Процент использования */
  usedPercent: number;
}

/**
 * Сервис для работы с localStorage
 */
export class StorageService {
  /** Максимальный размер одного элемента в KB */
  private readonly MAX_SIZE_KB = 3000;
  
  /** Максимальное количество shared элементов */
  private readonly MAX_ITEMS = 50;
  
  /** Префикс для ключей */
  private readonly PREFIX = 'tgstyle_shared_';
  
  /** Типичный лимит localStorage в KB */
  private readonly TOTAL_LIMIT_KB = 5120; // ~5MB

  /**
   * Сохранить shared данные
   */
  async saveShareData(shareId: string, data: ShareData): Promise<void> {
    try {
      // Очистка старых данных если нужно
      this.cleanupOldItems();

      const jsonString = JSON.stringify(data);
      const sizeKB = this.calculateSize(jsonString);

      logger.info('Saving share data to localStorage', {
        shareId,
        sizeKB: Math.round(sizeKB),
        hasImage: !!data.image
      });

      if (sizeKB > this.MAX_SIZE_KB) {
        // Создаем минимальную версию без изображения
        const minimalData = this.createMinimalVersion(data);
        this.setItem(`${this.PREFIX}${shareId}`, minimalData);
        logger.warn('Saved minimal version (too large)', {
          shareId,
          originalSizeKB: Math.round(sizeKB)
        });
      } else {
        // Сохраняем полную версию
        this.setItem(`${this.PREFIX}${shareId}`, data);
        logger.info('Saved full version to localStorage', { shareId });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to save to localStorage', {
        shareId,
        error: errorMessage
      });

      // Пытаемся сохранить хотя бы текстовую версию
      try {
        const textOnlyData = this.createTextOnlyVersion(data);
        this.setItem(`${this.PREFIX}${shareId}`, textOnlyData);
        logger.info('Saved text-only version as fallback', { shareId });
      } catch (finalError) {
        logger.error('All localStorage save attempts failed', {
          shareId,
          error: finalError
        });
        throw new Error('Failed to save data to localStorage');
      }
    }
  }

  /**
   * Получить shared данные
   */
  getShareData(shareId: string): ShareData | null {
    try {
      const key = `${this.PREFIX}${shareId}`;
      const data = this.getItem<ShareData>(key);

      if (data) {
        logger.info('Retrieved share data from localStorage', {
          shareId,
          hasImage: !!data.image
        });
      }

      return data;
    } catch (error) {
      logger.error('Failed to retrieve share data', { shareId, error });
      return null;
    }
  }

  /**
   * Удалить shared данные
   */
  removeShareData(shareId: string): void {
    try {
      const key = `${this.PREFIX}${shareId}`;
      localStorage.removeItem(key);
      logger.info('Removed share data from localStorage', { shareId });
    } catch (error) {
      logger.error('Failed to remove share data', { shareId, error });
    }
  }

  /**
   * Очистка старых элементов
   */
  private cleanupOldItems(): void {
    try {
      const items = this.getAllSharedItemsWithKeys();

      if (items.length > this.MAX_ITEMS) {
        // Сортируем по времени (старые первыми)
        items.sort((a, b) => a.timestamp - b.timestamp);

        // Удаляем старые элементы
        const toRemove = items.slice(0, items.length - this.MAX_ITEMS);
        toRemove.forEach(item => {
          localStorage.removeItem(item.key);
        });

        logger.info('Cleaned up old shared items', {
          removed: toRemove.length,
          remaining: this.MAX_ITEMS
        });
      }
    } catch (error) {
      logger.error('Failed to cleanup old items', error);
    }
  }

  /**
   * Проверка доступного места
   */
  checkAvailableSpace(): StorageSpaceInfo {
    let usedKB = 0;

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(this.PREFIX)) {
          const value = localStorage.getItem(key);
          if (value) {
            usedKB += this.calculateSize(value);
          }
        }
      }
    } catch (error) {
      logger.error('Failed to check available space', error);
    }

    const usedPercent = (usedKB / this.TOTAL_LIMIT_KB) * 100;
    const available = usedPercent < 90; // 90% threshold

    return {
      available,
      usedKB: Math.round(usedKB),
      totalKB: this.TOTAL_LIMIT_KB,
      usedPercent: Math.round(usedPercent)
    };
  }

  /**
   * Получить все shared элементы
   */
  getAllSharedItems(): Array<{
    shareId: string;
    type: string;
    timestamp: number;
  }> {
    const items: Array<{ shareId: string; type: string; timestamp: number }> = [];

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(this.PREFIX)) {
          const data = this.getItem<ShareData>(key);
          if (data?.timestamp) {
            items.push({
              shareId: key.replace(this.PREFIX, ''),
              type: data.type,
              timestamp: new Date(data.timestamp).getTime()
            });
          }
        }
      }
    } catch (error) {
      logger.error('Failed to get all shared items', error);
    }

    return items;
  }

  /**
   * Сохранить элемент в localStorage
   */
  private setItem<T>(key: string, data: T): void {
    const jsonString = JSON.stringify(data);
    localStorage.setItem(key, jsonString);
  }

  /**
   * Получить элемент из localStorage
   */
  private getItem<T>(key: string): T | null {
    const item = localStorage.getItem(key);
    if (!item) return null;

    try {
      return JSON.parse(item) as T;
    } catch (error) {
      logger.error('Failed to parse localStorage item', { key, error });
      return null;
    }
  }

  /**
   * Рассчитать размер строки в KB
   */
  private calculateSize(str: string): number {
    // Каждый символ = 2 байта в UTF-16
    return (str.length * 2) / 1024;
  }

  /**
   * Создать минимальную версию данных (без изображения)
   */
  private createMinimalVersion(data: ShareData): ShareData {
    return {
      ...data,
      image: null,
      metadata: {
        ...data.metadata,
        _minimal: true,
        _originalHadImage: !!data.image
      }
    };
  }

  /**
   * Создать текстовую версию данных
   */
  private createTextOnlyVersion(data: ShareData): ShareData {
    return {
      type: data.type,
      image: null,
      text: data.text.substring(0, 500), // Только первые 500 символов
      timestamp: data.timestamp,
      sharedAt: data.sharedAt,
      metadata: {
        _textOnly: true
      }
    };
  }

  /**
   * Получить все shared элементы с ключами (для cleanup)
   */
  private getAllSharedItemsWithKeys(): Array<{ key: string; timestamp: number }> {
    const items: Array<{ key: string; timestamp: number }> = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.PREFIX)) {
        const data = this.getItem<ShareData>(key);
        if (data?.timestamp) {
          items.push({
            key,
            timestamp: new Date(data.timestamp).getTime()
          });
        }
      }
    }

    return items;
  }
}

// Экспортируем синглтон
export const storageService = new StorageService();
