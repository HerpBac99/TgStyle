/**
 * Модуль для управления загрузкой и обработкой фотографий одежды
 * Централизует логику загрузки фото для использования в разных модулях
 */

import { logger } from './logger';

/**
 * Интерфейс для элемента гардероба
 */
interface WardrobeItem {
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
 * Enum категорий одежды
 */
enum ClothingCategory {
  OUTERWEAR = 'OUTERWEAR',
  INNERWEAR = 'INNERWEAR',
  BODYWEAR = 'BODYWEAR',
  FULLBODY = 'FULLBODY',
  LEGWEAR = 'LEGWEAR',
  FOOTWEAR = 'FOOTWEAR',
  HEADWEAR = 'HEADWEAR',
  ACCESSORIES = 'ACCESSORIES'
}

/**
 * Интерфейс для обработчика результатов загрузки
 */
interface PhotoUploadHandler {
  showPreviewModal(): void;
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
      logger.info('Starting photo upload process');

      // Создаем input для выбора файла
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';

      input.onchange = async (event) => {
        try {
          logger.info('Input onchange triggered');
          const target = event.target as HTMLInputElement;
          const file = target.files?.[0];

          if (file) {
            logger.info('Photo selected for upload', { fileName: file.name, size: file.size });

            // Показываем модальное окно с индикатором загрузки
            if (this.handler) {
              this.handler.showPreviewModal();
              this.handler.showLoadingInModal(true);
            }

            // Обрабатываем фото с удалением фона
            if (this.handler) {
              await this.handler.processPhotoWithBackgroundRemoval(file);
            }
          } else {
            logger.warn('No file selected');
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

  /**
   * Получить русское название категории
   */
  getCategoryNameRu(category: ClothingCategory): string {
    const names: Record<ClothingCategory, string> = {
      [ClothingCategory.OUTERWEAR]: 'Верхняя одежда',
      [ClothingCategory.INNERWEAR]: 'Кофты',
      [ClothingCategory.BODYWEAR]: 'Футболки и рубашки',
      [ClothingCategory.FULLBODY]: 'Платья и костюмы',
      [ClothingCategory.LEGWEAR]: 'Брюки',
      [ClothingCategory.FOOTWEAR]: 'Обувь',
      [ClothingCategory.HEADWEAR]: 'Головные уборы',
      [ClothingCategory.ACCESSORIES]: 'Аксессуары'
    };
    return names[category] || category;
  }
}

// Создаем глобальный экземпляр менеджера загрузки фото
export const photoUploadManager = new PhotoUploadManager();

// Экспортируем типы и значения для использования в других модулях
export type { WardrobeItem, PhotoUploadHandler };
export { ClothingCategory };
