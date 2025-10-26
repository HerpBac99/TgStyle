/**
 * Менеджер состояния canvas
 * Управление сохранением, восстановлением и кэшированием состояния canvas
 */

import { logger } from '../logger';
import type { UICanvasEditor } from '../uiCanvasEditor';
import { CapsuleErrorHandler } from './CapsuleErrorHandler';

/**
 * Состояние canvas для сохранения
 */
export interface CanvasState {
  canvasData: any;           // Данные canvas (объекты, позиции)
  thumbnailImage: string;    // base64 thumbnail с удаленным фоном
  itemIds: number[];         // ID вещей на canvas
  timestamp: number;         // Timestamp для инвалидации кэша
  isDirty: boolean;          // Флаг изменений
}

/**
 * Менеджер состояния canvas
 */
export class CanvasStateManager {
  private cache: Map<string, CanvasState> = new Map();
  private thumbnailCache: Map<string, string> = new Map();

  /**
   * Сохранить состояние canvas с кэшированием
   * 
   * @param canvasEditor - Экземпляр canvas editor
   * @param cacheKey - Ключ для кэширования (опционально)
   * @param removeBackground - Удалять ли фон с изображения (по умолчанию false)
   * @returns Состояние canvas
   */
  async saveState(canvasEditor: UICanvasEditor, cacheKey?: string, removeBackground: boolean = false): Promise<CanvasState> {
    return await CapsuleErrorHandler.handleWithFallback(
      async () => {
        logger.info('Saving canvas state', { cacheKey, removeBackground });

        // Получаем состояние из canvas editor
        const editorState = await canvasEditor.getState(removeBackground);
        
        // Получаем ID элементов на canvas
        const itemIds = canvasEditor.getItemIds();

        // Создаем полное состояние
        const state: CanvasState = {
          canvasData: editorState.canvasData,
          thumbnailImage: editorState.thumbnailImage,
          itemIds,
          timestamp: Date.now(),
          isDirty: false
        };

        // Кэшируем состояние если указан ключ
        if (cacheKey) {
          this.cache.set(cacheKey, state);
          this.thumbnailCache.set(cacheKey, state.thumbnailImage);
          
          logger.debug('Canvas state cached', {
            cacheKey,
            itemsCount: itemIds.length,
            thumbnailSize: state.thumbnailImage?.length || 0
          });
        }

        logger.info('Canvas state saved successfully', {
          itemsCount: itemIds.length,
          objectsCount: editorState.canvasData?.canvas?.objects?.length || 0
        });

        return state;
      },
      () => {
        // Fallback: возвращаем пустое состояние
        logger.warn('Failed to save canvas state, returning empty state');
        return {
          canvasData: {},
          thumbnailImage: '',
          itemIds: [],
          timestamp: Date.now(),
          isDirty: false
        };
      },
      CapsuleErrorHandler.createContext('Сохранение состояния canvas', {
        additionalData: { cacheKey }
      })
    );
  }

  /**
   * Восстановить состояние canvas
   * 
   * @param canvasEditor - Экземпляр canvas editor
   * @param state - Сохраненное состояние
   */
  async restoreState(canvasEditor: UICanvasEditor, state: CanvasState): Promise<void> {
    await CapsuleErrorHandler.handleWithFallback(
      async () => {
        logger.info('Restoring canvas state', {
          itemsCount: state.itemIds.length,
          timestamp: state.timestamp
        });

        // Восстанавливаем состояние через canvas editor
        await canvasEditor.restoreState(state.canvasData);

        logger.info('Canvas state restored successfully');
      },
      () => {
        // Fallback: ничего не делаем, canvas останется в текущем состоянии
        logger.warn('Failed to restore canvas state, canvas remains in current state');
      },
      CapsuleErrorHandler.createContext('Восстановление состояния canvas', {
        itemIds: state.itemIds
      })
    );
  }

  /**
   * Получить thumbnail с поддержкой кэша
   * 
   * @param canvasEditor - Экземпляр canvas editor
   * @param cacheKey - Ключ для кэширования (опционально)
   * @param useCache - Использовать кэш (по умолчанию true)
   * @returns base64 изображение thumbnail
   */
  async getThumbnail(
    canvasEditor: UICanvasEditor,
    cacheKey?: string,
    useCache: boolean = true
  ): Promise<string> {
    return await CapsuleErrorHandler.handleWithFallback(
      async () => {
        // Проверяем кэш если разрешено
        if (useCache && cacheKey) {
          const cached = this.thumbnailCache.get(cacheKey);
          if (cached) {
            logger.debug('Thumbnail loaded from cache', { cacheKey });
            return cached;
          }
        }

        logger.info('Generating thumbnail from canvas', { cacheKey });

        // Генерируем новый thumbnail
        const state = await canvasEditor.getState();
        const thumbnail = state.thumbnailImage;

        // Кэшируем если указан ключ
        if (cacheKey) {
          this.thumbnailCache.set(cacheKey, thumbnail);
          logger.debug('Thumbnail cached', {
            cacheKey,
            size: thumbnail.length
          });
        }

        return thumbnail;
      },
      () => {
        // Fallback: возвращаем пустую строку
        logger.warn('Failed to get thumbnail, returning empty string');
        return '';
      },
      CapsuleErrorHandler.createContext('Получение thumbnail', {
        additionalData: { cacheKey, useCache }
      })
    );
  }

  /**
   * Получить состояние из кэша
   * 
   * @param cacheKey - Ключ кэша
   * @returns Состояние canvas или undefined
   */
  getCachedState(cacheKey: string): CanvasState | undefined {
    const state = this.cache.get(cacheKey);
    
    if (state) {
      logger.debug('Canvas state loaded from cache', {
        cacheKey,
        age: Date.now() - state.timestamp
      });
    }
    
    return state;
  }

  /**
   * Проверить есть ли состояние в кэше
   * 
   * @param cacheKey - Ключ кэша
   * @returns true если состояние в кэше
   */
  hasCachedState(cacheKey: string): boolean {
    return this.cache.has(cacheKey);
  }

  /**
   * Пометить состояние как измененное (dirty)
   * 
   * @param cacheKey - Ключ кэша
   */
  markDirty(cacheKey: string): void {
    const state = this.cache.get(cacheKey);
    
    if (state) {
      state.isDirty = true;
      this.cache.set(cacheKey, state);
      
      logger.debug('Canvas state marked as dirty', { cacheKey });
    }
  }

  /**
   * Проверить изменено ли состояние
   * 
   * @param cacheKey - Ключ кэша
   * @returns true если состояние изменено
   */
  isDirty(cacheKey: string): boolean {
    const state = this.cache.get(cacheKey);
    return state?.isDirty || false;
  }

  /**
   * Инвалидировать кэш по времени
   * Удаляет состояния старше указанного времени
   * 
   * @param maxAge - Максимальный возраст в миллисекундах (по умолчанию 1 час)
   */
  invalidateOldCache(maxAge: number = 60 * 60 * 1000): void {
    const now = Date.now();
    let invalidatedCount = 0;

    for (const [key, state] of this.cache.entries()) {
      if (now - state.timestamp > maxAge) {
        this.cache.delete(key);
        this.thumbnailCache.delete(key);
        invalidatedCount++;
      }
    }

    if (invalidatedCount > 0) {
      logger.info('Old cache invalidated', {
        count: invalidatedCount,
        maxAge
      });
    }
  }

  /**
   * Очистить весь кэш
   */
  clearCache(): void {
    const stateCount = this.cache.size;
    const thumbnailCount = this.thumbnailCache.size;

    this.cache.clear();
    this.thumbnailCache.clear();

    logger.info('Cache cleared', {
      statesCleared: stateCount,
      thumbnailsCleared: thumbnailCount
    });
  }

  /**
   * Очистить кэш для конкретного ключа
   * 
   * @param cacheKey - Ключ кэша
   */
  clearCacheForKey(cacheKey: string): void {
    const hadState = this.cache.has(cacheKey);
    const hadThumbnail = this.thumbnailCache.has(cacheKey);

    this.cache.delete(cacheKey);
    this.thumbnailCache.delete(cacheKey);

    if (hadState || hadThumbnail) {
      logger.debug('Cache cleared for key', {
        cacheKey,
        hadState,
        hadThumbnail
      });
    }
  }

  /**
   * Получить статистику кэша
   * 
   * @returns Статистика использования кэша
   */
  getCacheStats(): {
    statesCount: number;
    thumbnailsCount: number;
    totalSize: number;
    oldestTimestamp: number | null;
  } {
    let totalSize = 0;
    let oldestTimestamp: number | null = null;

    for (const state of this.cache.values()) {
      // Приблизительный размер в байтах
      totalSize += JSON.stringify(state.canvasData).length;
      totalSize += state.thumbnailImage?.length || 0;

      if (oldestTimestamp === null || state.timestamp < oldestTimestamp) {
        oldestTimestamp = state.timestamp;
      }
    }

    return {
      statesCount: this.cache.size,
      thumbnailsCount: this.thumbnailCache.size,
      totalSize,
      oldestTimestamp
    };
  }

  /**
   * Получить статус менеджера (для отладки)
   */
  getStatus() {
    const stats = this.getCacheStats();
    
    return {
      cacheSize: this.cache.size,
      thumbnailCacheSize: this.thumbnailCache.size,
      totalCacheSize: stats.totalSize,
      oldestCacheAge: stats.oldestTimestamp 
        ? Date.now() - stats.oldestTimestamp 
        : null
    };
  }
}

// Экспортируем singleton экземпляр
export const canvasStateManager = new CanvasStateManager();
