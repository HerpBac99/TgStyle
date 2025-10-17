/**
 * Модуль для работы с камерой и загрузкой изображений
 */

import type {
  ImageData,
  PhotoCaptureResult,
  CameraOptions,
} from '@/types/index';
import {
  IMAGE_CONSTRAINTS
} from '@/utils/constants';
import {
  validateImageData
} from '@/utils/validation';
import {
  isImageFile,
  getFileExtension
} from '@/utils/helpers';
import { logger } from './logger';

/**
 * Класс для работы с камерой и изображениями
 */
class CameraManager {
  private currentImageData: ImageData | null = null;

  /**
   * Захват фото через камеру
   */
  async capturePhoto(): Promise<PhotoCaptureResult> {
    logger.info('Starting photo capture', { 
      hasCurrentImage: !!this.currentImageData,
      timestamp: Date.now()
    });

    try {
      const file = await this.selectFile({ preferCamera: true });
      const imageData = await this.processImageFile(file);
      
      this.currentImageData = imageData;
      
      logger.info('Photo captured successfully', {
        width: imageData.width,
        height: imageData.height,
        format: imageData.format,
        originalSize: Math.round(imageData.originalSize / 1024) + 'KB',
      });

      // Отправляем событие о захвате фото для показа экрана выбора темы
      logger.info('Photo captured, dispatching event for theme selection');
      window.dispatchEvent(new CustomEvent('photo:captured', {
        detail: { imageData }
      }));

      return {
        success: true,
        image: imageData,
      };
    } catch (error) {
      logger.error('Photo capture failed', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      };
    }
  }

  /**
   * Выбор файла через input[type="file"]
   */
  private selectFile(_options: Partial<CameraOptions> = {}): Promise<File> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*'; // Telegram WebApp переопределит это и покажет свой диалог выбора
      input.style.display = 'none';

      // Telegram WebApp автоматически показывает модальное окно с выбором источника
      // (камера/галерея/файл) на всех платформах, включая iOS

      input.addEventListener('change', (event) => {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        
        if (file) {
          resolve(file);
        } else {
          reject(new Error('Файл не выбран'));
        }

        // Очистка
        document.body.removeChild(input);
      });

      input.addEventListener('cancel', () => {
        reject(new Error('Выбор файла отменен'));
        document.body.removeChild(input);
      });

      document.body.appendChild(input);
      input.click();
    });
  }

  /**
   * Обработка файла изображения
   */
  private async processImageFile(file: File): Promise<ImageData> {
    // Валидация файла
    this.validateFile(file);

    // Чтение файла как base64
    const base64 = await this.readFileAsBase64(file);
    
    // Получение размеров изображения
    const dimensions = await this.getImageDimensions(base64);
    
    // Создание объекта ImageData
    const imageData: ImageData = {
      base64: base64.split(',')[1]!, // Убираем data: prefix
      originalSize: file.size,
      width: dimensions.width,
      height: dimensions.height,
      format: this.detectImageFormat(file),
    };

    // Валидация данных изображения
    const validation = validateImageData(imageData);
    if (!validation.isValid) {
      throw new Error(validation.errors.join('; '));
    }

    return imageData;
  }

  /**
   * Валидация файла
   */
  private validateFile(file: File): void {
    // Проверка типа файла
    if (!isImageFile(file)) {
      throw new Error('Выбранный файл не является изображением');
    }

    // Проверка размера файла
    const maxSizeBytes = IMAGE_CONSTRAINTS.MAX_SIZE_MB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      throw new Error(`Размер файла превышает ${IMAGE_CONSTRAINTS.MAX_SIZE_MB}MB`);
    }

    // Проверка типа файла
    if (!IMAGE_CONSTRAINTS.ALLOWED_FORMATS.includes(file.type as any)) {
      throw new Error(`Неподдерживаемый тип файла: ${file.type}`);
    }
  }

  /**
   * Чтение файла как base64
   */
  private readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          resolve(result);
        } else {
          reject(new Error('Не удалось прочитать файл'));
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Ошибка при чтении файла'));
      };
      
      reader.readAsDataURL(file);
    });
  }

  /**
   * Получение размеров изображения
   */
  private getImageDimensions(base64: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        resolve({
          width: img.width,
          height: img.height,
        });
      };
      
      img.onerror = () => {
        reject(new Error('Не удалось загрузить изображение'));
      };
      
      img.src = base64;
    });
  }

  /**
   * Определение формата изображения
   */
  private detectImageFormat(file: File): ImageData['format'] {
    const extension = getFileExtension(file.name);
    const mimeType = file.type;

    if (mimeType.includes('jpeg') || extension === 'jpg' || extension === 'jpeg') {
      return 'jpeg';
    }
    if (mimeType.includes('png') || extension === 'png') {
      return 'png';
    }
    if (mimeType.includes('webp') || extension === 'webp') {
      return 'webp';
    }
    if (mimeType.includes('gif') || extension === 'gif') {
      return 'gif';
    }

    return 'jpeg'; // По умолчанию
  }



  /**
   * Получение текущего изображения
   */
  getCurrentImage(): ImageData | null {
    return this.currentImageData;
  }

  /**
   * Очистка текущего изображения
   */
  clearCurrentImage(): void {
    this.currentImageData = null;
  }

  /**
   * Получение изображения для анализа (только оригинальное, без сжатия)
   */
  getImageForAnalysis(): string | null {
    if (!this.currentImageData) return null;

    return this.currentImageData.base64; // Всегда возвращаем оригинал для лучшего качества анализа
  }

  // REMOVED: resizeImageForStorage() - Server does resize through Sharp
  // Client doesn't need to resize images anymore

  /**
   * Сжатие изображения до указанного качества
   * @deprecated Используется только для sharing в ui.ts
   * TODO: Заменить на прямое использование photoUrl из сервера
   */
  async compressImage(base64Image: string, quality: number = 0.8): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        logger.info('Starting image compression', { 
          quality,
          imageLength: base64Image.length,
          hasDataPrefix: base64Image.startsWith('data:')
        });

        // Создаем изображение из base64
        const img = new Image();

        img.onload = () => {
          try {
            // Создаем canvas для сжатия
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            if (!ctx) {
              throw new Error('Canvas context not available');
            }

            // Сохраняем оригинальные пропорции
            canvas.width = img.width;
            canvas.height = img.height;

            // Рисуем изображение на canvas
            ctx.drawImage(img, 0, 0);

            // Получаем сжатое изображение в формате JPEG
            const compressedBase64 = canvas.toDataURL('image/jpeg', quality);

            // Убираем префикс data:image/jpeg;base64,
            const compressedData = compressedBase64.split(',')[1];

            if (!compressedData) {
              throw new Error('Failed to compress image');
            }



            resolve(compressedData);
          } catch (error) {
            logger.error('Error during image compression', error);
            reject(error);
          }
        };

        img.onerror = () => {
          logger.error('Failed to load image for compression');
          reject(new Error('Failed to load image for compression'));
        };

        // Проверяем и устанавливаем правильный data URL
        if (base64Image.startsWith('data:')) {
          img.src = base64Image;
        } else {
          img.src = `data:image/jpeg;base64,${base64Image}`;
        }

      } catch (error) {
        logger.error('Error starting image compression', error);
        reject(error);
      }
    });
  }

  // REMOVED: calculateHistoryItemSize() - Not needed anymore
  // History items now store only photoUrl (small), not base64

  /**
   * Получение статистики менеджера камеры
   */
  getStats() {
    return {
      hasCurrentImage: !!this.currentImageData,
      currentImageInfo: this.currentImageData ? {
        format: this.currentImageData.format,
        dimensions: `${this.currentImageData.width}x${this.currentImageData.height}`,
        originalSize: Math.round(this.currentImageData.originalSize / 1024) + 'KB',
      } : null,
    };
  }
}

// Создаем глобальный экземпляр менеджера камеры
export const cameraManager = new CameraManager();

export default cameraManager;
