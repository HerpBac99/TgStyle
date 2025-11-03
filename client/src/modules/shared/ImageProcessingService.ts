/**
 * Сервис для обработки изображений
 * Унифицированная обработка: удаление фона, оптимизация, watermark
 */

import { logger } from '../logger';
import { api } from '../api';
import { addWatermark } from '@/utils/watermarkUtils';

/**
 * Метаданные обработанного изображения
 */
export interface ImageMetadata {
  originalSize: number;
  processedSize: number;
  thumbnailSize: number;
  format: 'png' | 'jpeg';
  hasAlpha: boolean;
  dimensions: { width: number; height: number };
}

/**
 * Результат полной обработки изображения
 */
export interface ProcessedImage {
  original: string;
  processed: string;
  thumbnail: string;
  metadata: ImageMetadata;
}

/**
 * Конфигурация оптимизации изображения
 */
export interface OptimizeConfig {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'png' | 'jpeg';
}

/**
 * Сервис для обработки изображений
 */
class ImageProcessingService {
  // Кэш обработанных изображений
  private cache: Map<string, ProcessedImage> = new Map();
  
  // Кэш отдельных изображений (для watermark и других операций)
  private imageCache: Map<string, string> = new Map();
  
  // Максимальный размер кэша (количество изображений)
  private readonly MAX_CACHE_SIZE = 50;
  private readonly MAX_IMAGE_CACHE_SIZE = 100;

  /**
   * Удалить фон с изображения
   * 
   * @param imageBase64 - Base64 изображение
   * @returns Base64 изображение без фона
   */
  async removeBackground(imageBase64: string): Promise<string> {
    try {
      const result = await api.removeBackground(imageBase64) as any;

      if (!result.success) {
        throw new Error(result.error || 'Background removal failed');
      }

      logger.info('ImageProcessingService: Background removed successfully', {
        hasProcessedImage: !!result.image_base64,
        processedImageLength: result.image_base64?.length || 0
      });
      return result.image_base64 || '';

    } catch (error) {
      logger.error('ImageProcessingService: Error removing background', error);
      throw error;
    }
  }

  /**
   * Оптимизировать изображение (изменение размера и сжатие)
   * 
   * @param imageBase64 - Base64 изображение
   * @param config - Конфигурация оптимизации
   * @returns Оптимизированное base64 изображение
   */
  async optimizeImage(
    imageBase64: string,
    config: OptimizeConfig = {}
  ): Promise<string> {
    const {
      maxWidth = 1200,
      maxHeight = 1200,
      quality = 0.9,
      format = 'png'
    } = config;

    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        try {
          // Вычисляем новые размеры с сохранением пропорций
          let width = img.width;
          let height = img.height;

          if (width > maxWidth || height > maxHeight) {
            const widthRatio = maxWidth / width;
            const heightRatio = maxHeight / height;
            const ratio = Math.min(widthRatio, heightRatio);

            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          // Создаем canvas
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          // Рисуем изображение
          ctx.drawImage(img, 0, 0, width, height);

          // Конвертируем в base64
          const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
          const optimized = canvas.toDataURL(mimeType, quality);

          logger.info('ImageProcessingService: Image optimized', {
            originalSize: { width: img.width, height: img.height },
            newSize: { width, height },
            format,
            quality
          });

          resolve(optimized);
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error('Failed to load image for optimization'));
      };

      img.src = imageBase64;
    });
  }

  /**
   * Добавить watermark на изображение
   * 
   * @param imageBase64 - Base64 изображение
   * @returns Base64 изображение с watermark
   */
  async addWatermark(imageBase64: string): Promise<string> {
    try {
      const result = await addWatermark(imageBase64);
      return result;
    } catch (error) {
      logger.error('ImageProcessingService: Error adding watermark', error);
      // В случае ошибки возвращаем оригинал
      return imageBase64;
    }
  }

  /**
   * Полная обработка изображения для шеринга
   * (оптимизация + watermark + кэширование)
   * 
   * @param imageBase64 - Base64 изображение
   * @param useCache - Использовать кэш (по умолчанию true)
   * @returns Обработанное изображение с метаданными
   */
  async processForShare(imageBase64: string, useCache = true): Promise<ProcessedImage> {
    try {
      // Проверяем кэш
      const cacheKey = this.getCacheKey(imageBase64);
      if (useCache && this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey)!;
      }

      logger.info('ImageProcessingService: Processing image for share');

      // 1. Оптимизируем изображение
      const optimized = await this.optimizeImage(imageBase64, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.9,
        format: 'png'
      });

      // 2. Добавляем watermark
      const withWatermark = await this.addWatermark(optimized);

      // 3. Создаем thumbnail с watermark
      const thumbnail = await this.optimizeImage(withWatermark, {
        maxWidth: 400,
        maxHeight: 400,
        quality: 0.8,
        format: 'jpeg'
      });

      // 4. Собираем метаданные
      const metadata = await this.getImageMetadata(imageBase64, withWatermark, thumbnail);

      const result: ProcessedImage = {
        original: imageBase64,
        processed: withWatermark,
        thumbnail,
        metadata
      };

      // Сохраняем в кэш
      this.addToCache(cacheKey, result);

      return result;

    } catch (error) {
      logger.error('ImageProcessingService: Error processing image for share', error);
      throw error;
    }
  }

  /**
   * Получить метаданные изображения
   */
  private async getImageMetadata(
    original: string,
    processed: string,
    thumbnail: string
  ): Promise<ImageMetadata> {
    // Получаем размеры из base64
    const originalSize = this.getBase64Size(original);
    const processedSize = this.getBase64Size(processed);
    const thumbnailSize = this.getBase64Size(thumbnail);

    // Определяем формат
    const format = processed.includes('image/png') ? 'png' : 'jpeg';
    const hasAlpha = format === 'png';

    // Получаем размеры изображения
    const dimensions = await this.getImageDimensions(processed);

    return {
      originalSize,
      processedSize,
      thumbnailSize,
      format,
      hasAlpha,
      dimensions
    };
  }

  /**
   * Получить размер base64 строки в байтах
   */
  private getBase64Size(base64: string): number {
    // Убираем data:image/...;base64, префикс
    const base64Data = base64.split(',')[1] || base64;
    // Размер в байтах = (длина base64 * 3) / 4
    return Math.round((base64Data.length * 3) / 4);
  }

  /**
   * Получить размеры изображения
   */
  private async getImageDimensions(base64: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      img.onerror = () => {
        reject(new Error('Failed to load image for dimensions'));
      };
      img.src = base64;
    });
  }

  /**
   * Получить ключ кэша для изображения
   */
  private getCacheKey(imageBase64: string): string {
    // Используем первые 100 символов base64 как ключ
    return imageBase64.substring(0, 100);
  }

  /**
   * Добавить в кэш с ограничением размера
   */
  private addToCache(key: string, value: ProcessedImage): void {
    // Если кэш переполнен, удаляем самый старый элемент
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, value);
  }

  /**
   * Кэшировать изображение по ключу
   * 
   * @param key - Ключ кэша
   * @param imageBase64 - Base64 изображение
   */
  cacheImage(key: string, imageBase64: string): void {
    // Если кэш переполнен, удаляем самый старый элемент
    if (this.imageCache.size >= this.MAX_IMAGE_CACHE_SIZE) {
      const firstKey = this.imageCache.keys().next().value;
      if (firstKey !== undefined) {
        this.imageCache.delete(firstKey);
      }
    }

    this.imageCache.set(key, imageBase64);
  }

  /**
   * Получить кэшированное изображение
   * 
   * @param key - Ключ кэша
   * @returns Base64 изображение или undefined
   */
  getCachedImage(key: string): string | undefined {
    const cached = this.imageCache.get(key);
    return cached;
  }

  /**
   * Удалить изображение из кэша
   * 
   * @param key - Ключ кэша
   */
  clearCachedImage(key: string): void {
    this.imageCache.delete(key);
  }

  /**
   * Очистить кэш
   */
  clearCache(): void {
    this.cache.clear();
    this.imageCache.clear();
  }

  /**
   * Получить статистику кэша
   */
  getCacheStats(): { 
    processedSize: number; 
    processedMaxSize: number;
    imageSize: number;
    imageMaxSize: number;
  } {
    return {
      processedSize: this.cache.size,
      processedMaxSize: this.MAX_CACHE_SIZE,
      imageSize: this.imageCache.size,
      imageMaxSize: this.MAX_IMAGE_CACHE_SIZE
    };
  }

  /**
   * Конвертировать canvas в base64 с оптимизацией
   * 
   * @param canvas - HTML Canvas элемент
   * @param config - Конфигурация оптимизации
   * @returns Base64 изображение
   */
  async canvasToBase64(
    canvas: HTMLCanvasElement,
    config: OptimizeConfig = {}
  ): Promise<string> {
    try {
      const {
        quality = 0.9,
        format = 'png'
      } = config;

      // Конвертируем canvas в base64
      const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
      const base64 = canvas.toDataURL(mimeType, quality);

      logger.info('ImageProcessingService: Canvas converted to base64', {
        sizeKB: Math.round(this.getBase64Size(base64) / 1024)
      });

      return base64;

    } catch (error) {
      logger.error('ImageProcessingService: Error converting canvas to base64', error);
      throw error;
    }
  }

  /**
   * Конвертировать Fabric canvas в base64 с удалением фона
   * 
   * @param fabricCanvas - Fabric.js Canvas
   * @returns Base64 изображение без фона
   */
  async fabricCanvasToImage(fabricCanvas: any): Promise<string> {
    try {

      // Получаем canvas element
      const canvasElement = fabricCanvas.getElement() as HTMLCanvasElement;
      
      // Конвертируем в base64
      const canvasBase64 = await this.canvasToBase64(canvasElement, {
        format: 'png',
        quality: 1.0
      });

      // Удаляем фон
      const processedImage = await this.removeBackground(canvasBase64);

      logger.info('ImageProcessingService: Fabric canvas converted and background removed');

      return processedImage;

    } catch (error) {
      logger.error('ImageProcessingService: Error converting Fabric canvas', error);
      throw error;
    }
  }
}

// Экспортируем singleton
export const imageProcessingService = new ImageProcessingService();
