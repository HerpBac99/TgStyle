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

      const result = await api.classifyClothing(imageBase64) as any;

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
