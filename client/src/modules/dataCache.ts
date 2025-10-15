/**
 * Модуль для кэширования данных гардероба и капсул
 * Предзагружает данные из БД и кэширует изображения для быстрого доступа
 */

import { logger } from './logger';
import { historyManager } from './history';
import type { HistoryItem } from '@/types/api';

/**
 * Интерфейс для элемента гардероба
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
 * Интерфейс для капсулы
 */
export interface Capsule {
  id: number;
  name: string;
  description?: string;
  thumbnailUrl?: string;
  items: Array<{
    id: number;
    wardrobeItemId: number;
    wardrobeItem: WardrobeItem;
  }>;
  createdAt: string;
}

/**
 * Класс для управления кэшем данных
 */
class DataCacheManager {
  private wardrobeItems: WardrobeItem[] = [];
  private capsules: Capsule[] = [];
  private isLoading = false;
  private isLoaded = false;

  constructor() {
  }

  /**
   * Предзагрузка всех данных из БД
   */
  async preloadData(): Promise<void> {
    if (this.isLoading || this.isLoaded) {
      return;
    }

    this.isLoading = true;
    const startTime = Date.now();

    try {
      logger.info('Starting data preload');

      // Загружаем данные параллельно
      const [wardrobeResponse, capsulesResponse] = await Promise.allSettled([
        this.loadWardrobeItems(),
        this.loadCapsules()
      ]);

      // Обрабатываем результаты
      if (wardrobeResponse.status === 'fulfilled') {
        this.wardrobeItems = wardrobeResponse.value;
        logger.info('Wardrobe items loaded', { count: this.wardrobeItems.length });
      } else {
        logger.error('Failed to load wardrobe items', wardrobeResponse.reason);
      }

      if (capsulesResponse.status === 'fulfilled') {
        this.capsules = capsulesResponse.value;
        logger.info('Capsules loaded', { count: this.capsules.length });
      } else {
        logger.error('Failed to load capsules', capsulesResponse.reason);
      }

      // Собираем все URL изображений для кэширования
      const imageUrls = this.collectImageUrls();

      // Кэшируем изображения в фоне (не блокируем)
      this.cacheImages(imageUrls).catch(error => {
        logger.error('Error caching images', error);
      });

      this.isLoaded = true;
      const loadTime = Date.now() - startTime;
      logger.info('Data preload completed', {
        wardrobeCount: this.wardrobeItems.length,
        capsulesCount: this.capsules.length,
        imageUrlsCount: imageUrls.length,
        loadTime: loadTime + 'ms'
      });

    } catch (error) {
      logger.error('Error during data preload', error);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Загрузка элементов гардероба из API
   */
  private async loadWardrobeItems(): Promise<WardrobeItem[]> {
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
        throw new Error(result.error || 'Failed to load wardrobe items');
      }

      return result.items || [];
    } catch (error) {
      logger.error('Error loading wardrobe items', error);
      return [];
    }
  }

  /**
   * Загрузка капсул из API
   */
  private async loadCapsules(): Promise<Capsule[]> {
    try {
      const initData = (window as any).Telegram?.WebApp?.initData || '';
      
      const response = await fetch(`/api/capsules?initData=${encodeURIComponent(initData)}`, {
        method: 'GET'
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to load capsules');
      }

      return result.capsules || [];
    } catch (error) {
      logger.error('Error loading capsules', error);
      return [];
    }
  }

  /**
   * Собрать все URL изображений из wardrobeItems, capsules и history
   */
  private collectImageUrls(): string[] {
    const urls = new Set<string>();

    // Изображения из гардероба
    this.wardrobeItems.forEach(item => {
      if (item.imageUrl) {
        urls.add(item.imageUrl);
      }
    });

    // Миниатюры капсул
    this.capsules.forEach(capsule => {
      if (capsule.thumbnailUrl) {
        urls.add(capsule.thumbnailUrl);
      }
      // Изображения элементов капсулы
      capsule.items?.forEach(capsuleItem => {
        if (capsuleItem.wardrobeItem?.imageUrl) {
          urls.add(capsuleItem.wardrobeItem.imageUrl);
        }
      });
    });

    // NEW: Изображения из истории анализов
    const historyItems = historyManager.getAllItems();
    historyItems.forEach((item: HistoryItem) => {
      if (!item.isEmpty && item.photoUrl) {
        urls.add(item.photoUrl);
      }
    });

    return Array.from(urls);
  }

  /**
   * Конвертировать относительный URL в абсолютный
   */
  private makeAbsoluteUrl(url: string): string {
    // Нормализуем путь: заменяем обратные слеши на прямые (Windows -> Unix)
    let normalizedUrl = url.replace(/\\/g, '/');

    // Если URL уже абсолютный - возвращаем нормализованный
    if (normalizedUrl.startsWith('http://') || normalizedUrl.startsWith('https://')) {
      return normalizedUrl;
    }

    // Если относительный - добавляем origin
    if (normalizedUrl.startsWith('/')) {
      return window.location.origin + normalizedUrl;
    }

    // Если base64 или blob - возвращаем как есть
    if (normalizedUrl.startsWith('data:') || normalizedUrl.startsWith('blob:')) {
      return normalizedUrl;
    }

    // Иначе добавляем origin и /
    return window.location.origin + '/' + normalizedUrl;
  }

  /**
   * Кэширование изображений через встроенное кэширование браузера (Image objects)
   */
  private async cacheImages(imageUrls: string[]): Promise<void> {
    if (imageUrls.length === 0) {
      return;
    }

    try {
      let cachedCount = 0;
      let failedCount = 0;


      // Кэшируем изображения порциями по 5 для контроля нагрузки
      const batchSize = 5;
      for (let i = 0; i < imageUrls.length; i += batchSize) {
        const batch = imageUrls.slice(i, i + batchSize);
        
        const results = await Promise.allSettled(
          batch.map(async (relativeUrl) => {
            return new Promise<{ url: string; success: boolean }>((resolve, reject) => {
              try {
                // Конвертируем в абсолютный URL
                const absoluteUrl = this.makeAbsoluteUrl(relativeUrl);
                
                // Создаем Image объект для предзагрузки
                const img = new Image();
                
                img.onload = () => {
                  logger.debug('Image preloaded successfully', { url: absoluteUrl });
                  resolve({ url: absoluteUrl, success: true });
                };
                
                img.onerror = (error) => {
                  logger.warn('Failed to preload image', { url: absoluteUrl, error });
                  reject(new Error(`Failed to load: ${absoluteUrl}`));
                };
                
                // Начинаем загрузку
                img.src = absoluteUrl;
                
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.warn('Failed to cache image', { url: relativeUrl, error: errorMessage });
                reject(error);
              }
            });
          })
        );

        results.forEach((result) => {
          if (result.status === 'fulfilled') {
            cachedCount++;
          } else {
            failedCount++;
          }
        });

        // Небольшая задержка между батчами
        if (i + batchSize < imageUrls.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }


    } catch (error) {
      logger.error('Error caching images', error);
    }
  }

  /**
   * Получить элементы гардероба из кэша
   */
  getWardrobeItems(): WardrobeItem[] {
    return [...this.wardrobeItems];
  }

  /**
   * Получить капсулы из кэша
   */
  getCapsules(): Capsule[] {
    return [...this.capsules];
  }

  /**
   * Добавить новый элемент в кэш гардероба
   */
  addWardrobeItem(item: WardrobeItem): void {
    this.wardrobeItems.push(item);

    // Кэшируем изображение нового элемента
    if (item.imageUrl) {
      this.cacheImages([item.imageUrl]).catch(error => {
        logger.error('Error caching new item image', error);
      });
    }
  }

  /**
   * Обновить элемент в кэше гардероба
   */
  updateWardrobeItem(itemId: number, updatedItem: WardrobeItem): void {
    const index = this.wardrobeItems.findIndex(item => item.id === itemId);
    if (index !== -1) {
      this.wardrobeItems[index] = updatedItem;
    }
  }

  /**
   * Удалить элемент из кэша гардероба
   */
  removeWardrobeItem(itemId: number): void {
    const index = this.wardrobeItems.findIndex(item => item.id === itemId);
    if (index !== -1) {
      this.wardrobeItems.splice(index, 1);
    }
  }

  /**
   * Добавить капсулу в кэш
   */
  addCapsule(capsule: Capsule): void {
    this.capsules.push(capsule);

    // Кэшируем миниатюру
    if (capsule.thumbnailUrl) {
      this.cacheImages([capsule.thumbnailUrl]).catch(error => {
        logger.error('Error caching capsule thumbnail', error);
      });
    }
  }

  /**
   * Обновить капсулу в кэше
   */
  updateCapsule(capsuleId: number, updatedCapsule: Capsule): void {
    const index = this.capsules.findIndex(c => c.id === capsuleId);
    if (index !== -1) {
      this.capsules[index] = updatedCapsule;

      // Кэшируем новую миниатюру если изменилась
      if (updatedCapsule.thumbnailUrl) {
        this.cacheImages([updatedCapsule.thumbnailUrl]).catch(error => {
          logger.error('Error caching updated capsule thumbnail', error);
        });
      }
    }
  }

  /**
   * Удалить капсулу из кэша
   */
  removeCapsule(capsuleId: number): void {
    const index = this.capsules.findIndex(c => c.id === capsuleId);
    if (index !== -1) {
      this.capsules.splice(index, 1);
    }
  }

  /**
   * Проверить, загружены ли данные
   */
  isDataLoaded(): boolean {
    return this.isLoaded;
  }

  /**
   * Проверить, идет ли загрузка данных
   */
  isDataLoading(): boolean {
    return this.isLoading;
  }

  /**
   * Полностью очистить весь кэш
   */
  clearAllCache(): void {
    this.wardrobeItems = [];
    this.capsules = [];
    this.isLoaded = false;
    logger.info('All cache cleared');
  }

  /**
   * Получить статистику кэша
   */
  getStats() {
    return {
      isLoaded: this.isLoaded,
      isLoading: this.isLoading,
      wardrobeItemsCount: this.wardrobeItems.length,
      capsulesCount: this.capsules.length
    };
  }
}

// Создаем глобальный экземпляр менеджера кэша
export const dataCacheManager = new DataCacheManager();

export default dataCacheManager;
