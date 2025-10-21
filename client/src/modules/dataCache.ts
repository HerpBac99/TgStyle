/**
 * Модуль для кэширования данных гардероба и капсул
 * Предзагружает данные из БД и кэширует изображения для быстрого доступа
 */

import { logger } from './logger';
import { historyManager } from './history';
import { api } from './api';
import type { HistoryItem } from '@/types/api';
import { STORAGE_KEYS, WARDROBE_CONSTRAINTS, IMAGE_CACHE_CONFIG } from '@/utils/constants';
import { safeJsonParse, safeJsonStringify } from '@/utils/helpers';

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
    // Загружаем кэш гардероба из localStorage при инициализации
    this.loadWardrobeCacheFromStorage();
    
    // Загружаем кэш капсул из localStorage
    this.loadCapsulesCacheFromStorage();
    
    // Предзагружаем изображения из кэша
    this.preloadCachedImages();
  }

  /**
   * Загрузка кэша гардероба из localStorage
   * Вызывается при инициализации для мгновенного отображения
   */
  private loadWardrobeCacheFromStorage(): void {
    try {
      const cached = localStorage.getItem(STORAGE_KEYS.WARDROBE_CACHE);
      if (!cached) {
        logger.info('No wardrobe cache in localStorage');
        return;
      }

      const parsed = safeJsonParse<WardrobeItem[]>(cached, []);
      if (Array.isArray(parsed) && parsed.length > 0) {
        this.wardrobeItems = parsed;
        logger.info('Wardrobe cache loaded from localStorage', { 
          count: this.wardrobeItems.length 
        });
      }
    } catch (error) {
      logger.error('Error loading wardrobe cache from storage', error);
      this.wardrobeItems = [];
    }
  }

  /**
   * Загрузка кэша капсул из localStorage
   * Вызывается при инициализации для мгновенного отображения
   */
  private loadCapsulesCacheFromStorage(): void {
    try {
      const cached = localStorage.getItem(STORAGE_KEYS.CAPSULES_CACHE);
      if (!cached) {
        logger.info('No capsules cache in localStorage');
        return;
      }

      const parsed = safeJsonParse<Capsule[]>(cached, []);
      if (Array.isArray(parsed) && parsed.length > 0) {
        this.capsules = parsed;
        logger.info('Capsules cache loaded from localStorage', { 
          count: this.capsules.length 
        });
      }
    } catch (error) {
      logger.error('Error loading capsules cache from storage', error);
      this.capsules = [];
    }
  }

  /**
   * Предзагрузка изображений из кэша при старте приложения
   * Кэширует изображения гардероба и капсул в браузере для мгновенного отображения
   */
  private preloadCachedImages(): void {
    const imageUrls: string[] = [];

    // Собираем изображения гардероба
    if (this.wardrobeItems.length > 0) {
      const wardrobeUrls = this.wardrobeItems
        .map(item => item.imageUrl)
        .filter(url => url);
      imageUrls.push(...wardrobeUrls);
      logger.info('Preloading wardrobe images from cache', { count: wardrobeUrls.length });
    }

    // Собираем изображения капсул
    if (this.capsules.length > 0) {
      const capsuleUrls: string[] = [];
      
      // Миниатюры капсул
      this.capsules.forEach(capsule => {
        if (capsule.thumbnailUrl) {
          capsuleUrls.push(capsule.thumbnailUrl);
        }
        // Изображения элементов капсулы
        capsule.items?.forEach(item => {
          if (item.wardrobeItem?.imageUrl) {
            capsuleUrls.push(item.wardrobeItem.imageUrl);
          }
        });
      });
      
      imageUrls.push(...capsuleUrls);
      logger.info('Preloading capsules images from cache', { count: capsuleUrls.length });
    }

    if (imageUrls.length === 0) {
      return;
    }

    // Кэшируем изображения ПРИОРИТЕТНО - все параллельно без задержек
    this.cachePriorityImages(imageUrls).catch(error => {
      logger.error('Error preloading cached images', error);
    });
  }

  /**
   * Приоритетное кэширование изображений (все параллельно, без батчей)
   * Используется для критически важных изображений (гардероб и капсулы из кэша)
   */
  private async cachePriorityImages(imageUrls: string[]): Promise<void> {
    if (imageUrls.length === 0) {
      return;
    }

    try {
      const startTime = Date.now();
      
      // Загружаем ВСЕ изображения параллельно
      const results = await Promise.allSettled(
        imageUrls.map(relativeUrl => {
          return new Promise<void>((resolve, reject) => {
            try {
              const absoluteUrl = this.makeAbsoluteUrl(relativeUrl);
              const img = new Image();
              
              img.onload = () => resolve();
              img.onerror = () => reject(new Error(`Failed to load: ${absoluteUrl}`));
              
              img.src = absoluteUrl;
            } catch (error) {
              reject(error);
            }
          });
        })
      );

      const cachedCount = results.filter(r => r.status === 'fulfilled').length;
      const failedCount = results.filter(r => r.status === 'rejected').length;
      const loadTime = Date.now() - startTime;

      logger.info('✅ Priority images cached (wardrobe + capsules)', { 
        cached: cachedCount,
        failed: failedCount,
        total: imageUrls.length,
        loadTime: `${loadTime}ms`
      });
    } catch (error) {
      logger.error('Error caching priority images', error);
    }
  }

  /**
   * Сохранение первых N элементов гардероба в localStorage
   */
  private saveWardrobeCacheToStorage(): void {
    try {
      // Сохраняем только первые 30 элементов
      const itemsToCache = this.wardrobeItems.slice(0, WARDROBE_CONSTRAINTS.CACHE_ITEMS);
      const json = safeJsonStringify(itemsToCache);
      localStorage.setItem(STORAGE_KEYS.WARDROBE_CACHE, json);
      
      logger.info('Wardrobe cache saved to localStorage', { 
        count: itemsToCache.length,
        sizeKB: (json.length / 1024).toFixed(2)
      });
    } catch (error) {
      logger.error('Error saving wardrobe cache to storage', error);
    }
  }

  /**
   * Сохранение всех капсул в localStorage
   */
  private saveCapsulesCacheToStorage(): void {
    try {
      const json = safeJsonStringify(this.capsules);
      localStorage.setItem(STORAGE_KEYS.CAPSULES_CACHE, json);
      
      logger.info('Capsules cache saved to localStorage', { 
        count: this.capsules.length,
        sizeKB: (json.length / 1024).toFixed(2)
      });
    } catch (error) {
      logger.error('Error saving capsules cache to storage', error);
    }
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
        
        // Всегда сохраняем в localStorage при успешной загрузке
        // (могли измениться данные элементов, не только количество)
        this.saveWardrobeCacheToStorage();
      } else {
        logger.error('Failed to load wardrobe items', wardrobeResponse.reason);
      }

      if (capsulesResponse.status === 'fulfilled') {
        this.capsules = capsulesResponse.value;
        logger.info('Capsules loaded', { count: this.capsules.length });
        
        // Всегда сохраняем в localStorage при успешной загрузке
        // (могли измениться данные капсул, не только количество)
        this.saveCapsulesCacheToStorage();
      } else {
        logger.error('Failed to load capsules', capsulesResponse.reason);
      }

      // Собираем URL изображений для кэширования (история + капсулы, БЕЗ гардероба)
      const imageUrls = this.collectImageUrls();
      
      // Фильтруем изображения гардероба (они уже закэшированы в preloadCachedImages)
      const wardrobeUrls = new Set(this.wardrobeItems.map(item => item.imageUrl));
      const remainingUrls = imageUrls.filter(url => !wardrobeUrls.has(url));

      // Кэшируем только оставшиеся изображения (история + капсулы)
      if (remainingUrls.length > 0) {
        this.cacheImages(remainingUrls).catch(error => {
          logger.error('Error caching images', error);
        });
      }

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
   * REFACTORED: используем api клиент вместо fetch
   */
  private async loadWardrobeItems(): Promise<WardrobeItem[]> {
    try {
      const loadStart = Date.now();
      const result = await api.getWardrobe();

      const loadTime = Date.now() - loadStart;
      logger.info('Wardrobe items loaded from server', {
        itemsCount: result.items.length,
        loadTime: `${loadTime}ms`
      });

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
   * REFACTORED: используем api клиент вместо fetch
   */
  private async loadCapsules(): Promise<Capsule[]> {
    try {
      const result = await api.getCapsules();

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

    // Изображения из истории анализов
    // FIXED: используем telegramId вместо userId для построения правильного пути
    const historyItems = historyManager.getAllItems();
    historyItems.forEach((item: HistoryItem) => {
      if (item.photoPath) {
        // Используем telegramId если есть, иначе пытаемся получить из альтернативного источника
        const tgId = item.telegramId || '';
        if (tgId) {
          urls.add(`/uploads/analysis/${tgId}/${item.photoPath}`);
        }
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

      logger.info('Starting image cache', { totalImages: imageUrls.length });

      // Кэшируем изображения порциями для фоновой загрузки
      const batchSize = IMAGE_CACHE_CONFIG.BATCH_SIZE;
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
                  resolve({ url: absoluteUrl, success: true });
                };
                
                img.onerror = () => {
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

        // Минимальная задержка между батчами
        if (i + batchSize < imageUrls.length) {
          await new Promise(resolve => setTimeout(resolve, IMAGE_CACHE_CONFIG.BATCH_DELAY_MS));
        }
      }

      logger.info('Image cache completed', { 
        cached: cachedCount, 
        failed: failedCount,
        total: imageUrls.length 
      });

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

    // Обновляем localStorage кэш
    this.saveWardrobeCacheToStorage();

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
      
      // Обновляем localStorage кэш если элемент в первых 30
      if (index < WARDROBE_CONSTRAINTS.CACHE_ITEMS) {
        this.saveWardrobeCacheToStorage();
      }
    }
  }

  /**
   * Удалить элемент из кэша гардероба
   */
  removeWardrobeItem(itemId: number): void {
    const index = this.wardrobeItems.findIndex(item => item.id === itemId);
    if (index !== -1) {
      this.wardrobeItems.splice(index, 1);
      
      // Обновляем localStorage кэш
      this.saveWardrobeCacheToStorage();
    }
  }

  /**
   * Добавить капсулу в кэш
   */
  addCapsule(capsule: Capsule): void {
    this.capsules.push(capsule);

    // Обновляем localStorage кэш
    this.saveCapsulesCacheToStorage();

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

      // Обновляем localStorage кэш
      this.saveCapsulesCacheToStorage();

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
      
      // Обновляем localStorage кэш
      this.saveCapsulesCacheToStorage();
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
