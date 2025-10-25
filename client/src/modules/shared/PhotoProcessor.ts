/**
 * Обработчик фотографий
 * Классификация одежды и удаление фона
 */

import { logger } from '../logger';
import { api } from '../api';
import { WardrobeItem, ClassificationResult, CreateWardrobeItemDto } from '@/types/wardrobe';
import { fileToBase64, stringToClothingCategory } from './utils';
import { dataCacheManager } from '../dataCache';

/**
 * Класс для обработки фотографий одежды
 */
export class PhotoProcessor {
  /**
   * Классифицировать одежду и удалить фон
   */
  async classifyAndRemoveBackground(imageBase64: string): Promise<{
    processedImage: string;
    classification: ClassificationResult;
  }> {
    try {
      logger.info('Sending photo to classify and remove background...');

      // Оптимизируем изображение перед отправкой на классификацию
      // Для классификации не нужно полное разрешение
      const originalSize = Math.round((imageBase64.length * 3) / 4 / 1024);
      const optimizedForClassification = await this.optimizeForClassification(imageBase64);
      const optimizedSize = Math.round((optimizedForClassification.length * 3) / 4 / 1024);

      logger.info('Image optimized for classification', {
        originalSizeKB: originalSize,
        optimizedSizeKB: optimizedSize,
        compressionRatio: ((1 - optimizedSize / originalSize) * 100).toFixed(1) + '%'
      });

      const result = await api.classifyClothing(optimizedForClassification) as any;

      if (!result.success) {
        throw new Error(result.error || 'Classification failed');
      }

      logger.info('Photo classified successfully', {
        timing: result.timing,
        classification: result.classification
      });

      return {
        processedImage: result.processed_image_base64,
        classification: {
          category: stringToClothingCategory(result.classification.category),
          subtype: result.classification.subtype,
          color: result.classification.color,
          material: result.classification.material,
          style: result.classification.style,
          fit: result.classification.fit,
          season: result.classification.season,
          pattern: result.classification.pattern,
          description: result.classification.description
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error processing photo with background removal', {
        error: errorMessage
      });
      throw error;
    }
  }

  /**
   * Оптимизировать изображение для классификации
   * Уменьшает размер для быстрой передачи по сети
   */
  private async optimizeForClassification(base64Image: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        // Для классификации достаточно 800px (FastVLM все равно ресайзит)
        let width = img.width;
        let height = img.height;
        const maxSize = 800;
        
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height * maxSize) / width;
            width = maxSize;
          } else {
            width = (width * maxSize) / height;
            height = maxSize;
          }
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        // JPEG с качеством 80% для классификации достаточно
        const optimized = canvas.toDataURL('image/jpeg', 0.80);
        resolve(optimized);
      };
      
      img.onerror = () => {
        reject(new Error('Failed to load image for optimization'));
      };
      
      img.src = base64Image;
    });
  }

  /**
   * Сохранить вещь в гардероб
   */
  async saveToWardrobe(
    imageBase64: string,
    classification: ClassificationResult
  ): Promise<WardrobeItem> {
    try {
      logger.info('Saving item to wardrobe');

      const requestData: CreateWardrobeItemDto = {
        imageBase64,
        category: classification.category,
        ...(classification.subtype && { subtype: classification.subtype }),
        color: classification.color,
        material: classification.material,
        style: classification.style,
        fit: classification.fit,
        ...(classification.season && { season: classification.season }),
        ...(classification.pattern && { pattern: classification.pattern }),
        description: classification.description
      };

      const result = await api.createWardrobeItem(requestData) as any;

      if (!result.success) {
        throw new Error(result.error || 'Failed to save item');
      }

      logger.info('Item saved successfully on server', { id: result.item.id });

      // Добавляем в кэш
      dataCacheManager.addWardrobeItem(result.item);

      return result.item;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error saving wardrobe item to server', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Полный процесс: загрузка файла -> классификация -> сохранение
   */
  async processAndSave(file: File): Promise<WardrobeItem> {
    // Конвертируем файл в base64
    const base64 = await fileToBase64(file);

    // Классифицируем и удаляем фон
    const { processedImage, classification } = await this.classifyAndRemoveBackground(base64);

    // Сохраняем в гардероб
    const item = await this.saveToWardrobe(processedImage, classification);

    return item;
  }
}

// Экспортируем синглтон
export const photoProcessor = new PhotoProcessor();
