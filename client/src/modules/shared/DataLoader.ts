/**
 * Универсальный загрузчик данных с поддержкой кэша
 */

import { logger } from '../logger';
import { dataCacheManager } from '../dataCache';

/**
 * Класс для загрузки данных с умным fallback на кэш
 */
export class DataLoader {
  /**
   * Загрузить данные с fallback на кэш
   * 
   * @param cacheGetter - Функция получения данных из кэша
   * @param serverLoader - Функция загрузки данных с сервера
   * @param maxWaitMs - Максимальное время ожидания загрузки кэша
   */
  async loadWithCacheFallback<T>(
    cacheGetter: () => T[],
    serverLoader: () => Promise<T[]>,
    maxWaitMs: number = 5000 // Увеличим время ожидания до 5 сек
  ): Promise<T[]> {
    try {
      // СНАЧАЛА проверяем есть ли данные в памяти (из localStorage)
      const cachedData = cacheGetter();
      if (cachedData.length > 0) {
        logger.info('DataLoader: Using cached data from memory', { count: cachedData.length });
        return cachedData;
      }

      // Если данных нет, но кэш загружается - ждем
      if (dataCacheManager.isDataLoading()) {
        logger.info('DataLoader: Waiting for cache to complete...');
        await this.waitForCache(maxWaitMs);
        
        const loadedData = cacheGetter();
        if (loadedData.length > 0) {
          logger.info('DataLoader: Cache ready, using cached data', { count: loadedData.length });
          return loadedData;
        }
      }

      // Если кэш загружен но пустой
      if (dataCacheManager.isDataLoaded()) {
        const loadedData = cacheGetter();
        if (loadedData.length > 0) {
          logger.info('DataLoader: Using loaded cache', { count: loadedData.length });
          return loadedData;
        }
      }

      // Fallback на сервер
      logger.info('DataLoader: Fallback to server fetch');
      return await serverLoader();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error loading data', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Ждать загрузки кэша
   */
  private async waitForCache(maxWaitMs: number): Promise<void> {
    const startTime = Date.now();
    
    while (dataCacheManager.isDataLoading() && (Date.now() - startTime) < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

// Экспортируем синглтон
export const dataLoader = new DataLoader();
