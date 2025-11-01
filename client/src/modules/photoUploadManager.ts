/**
 * Модуль для управления загрузкой и обработкой фотографий одежды
 * Централизует логику загрузки фото для использования в разных модулях
 */

import { logger } from './logger';
import { ClothingCategory } from '@/types/wardrobe';

// Реэкспортируем для обратной совместимости
export type { WardrobeItem } from '@/types/wardrobe';
export { ClothingCategory };

/**
 * Интерфейс для обработчика результатов загрузки
 */
export interface PhotoUploadHandler {
  showLoadingInModal(show: boolean): void;
  processPhotoWithBackgroundRemoval(file: File): Promise<void>;
  fileToBase64(file: File): Promise<string>;
}

/**
 * Класс для управления загрузкой и обработкой фотографий
 */
export class PhotoUploadManager {
  private handler: PhotoUploadHandler | null = null;

  constructor(handler?: PhotoUploadHandler) {
    this.handler = handler || null;
  }

  /**
   * Установить обработчик результатов загрузки
   */
  setHandler(handler: PhotoUploadHandler): void {
    this.handler = handler;
  }

  /**
   * Обработчик загрузки фото - основная точка входа
   */
  async handlePhotoUpload(): Promise<void> {
    try {

      // Создаем input для выбора файла
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';

      input.onchange = async (event) => {
        try {
          const target = event.target as HTMLInputElement;
          const file = target.files?.[0];

          if (file) {
            logger.info('Photo selected for upload', { fileName: file.name, size: file.size });

            // Обрабатываем фото с удалением фона (метод сам управляет модальным окном и индикатором загрузки)
            if (this.handler) {
              await this.handler.processPhotoWithBackgroundRemoval(file);
            }
          } else {
            logger.error('No file selected');
          }
        } catch (error) {
          logger.error('Error in photo upload onchange handler', error);
        }
      };

      // Добавляем input в DOM и кликаем по нему
      document.body.appendChild(input);
      logger.info('Input element added to DOM, triggering click');
      input.click();

      // Удаляем input после использования
      setTimeout(() => {
        document.body.removeChild(input);
        logger.info('Input element removed from DOM');
      }, 1000);

    } catch (error) {
      logger.error('Error in handlePhotoUpload', error);
    }
  }

  /**
   * Преобразовать категорию в enum (сервер уже вернул нормализованную)
   */
  stringToClothingCategory(category: string): ClothingCategory {
    const normalized = category.toUpperCase().trim();

    if (normalized in ClothingCategory) {
      return ClothingCategory[normalized as keyof typeof ClothingCategory];
    }

    // Fallback
    return ClothingCategory.BODYWEAR;
  }
}

// Создаем глобальный экземпляр менеджера загрузки фото
export const photoUploadManager = new PhotoUploadManager();
