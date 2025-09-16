/**
 * Модуль для работы с камерой и загрузкой изображений
 */

import type {
  ImageData,
  PhotoCaptureResult,
  CompressionOptions,
  CameraOptions,
} from '@/types/index.js';
import { 
  IMAGE_CONSTRAINTS,
  IMAGE_COMPRESSION 
} from '@/utils/constants.js';
import { 
  validateImageData
} from '@/utils/validation.js';
import { 
  isImageFile,
  getFileExtension 
} from '@/utils/helpers.js';
import { logger } from './logger';
import { analysisManager } from './analysis';

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
        compressedSize: imageData.compressedSize ? Math.round(imageData.compressedSize / 1024) + 'KB' : 'N/A',
      });

      // Автоматически запускаем анализ фото
      logger.info('Starting automatic photo analysis');
      try {
        // Запускаем анализ в фоне, не ждем результата
        analysisManager.analyzeImage(imageData.base64).catch(error => {
          logger.error('Auto-analysis failed', error);
        });
      } catch (error) {
        logger.error('Error starting auto-analysis', error);
      }

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
  private selectFile(options: Partial<CameraOptions> = {}): Promise<File> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';

      // Настройка для камеры на мобильных устройствах
      if (options.preferCamera) {
        input.setAttribute('capture', 'camera');
      }

      input.addEventListener('change', (event) => {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        
        if (file) {
          logger.info('File selected', {
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified,
          });
          
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

    // Сжатие если необходимо
    if (this.needsCompression(imageData)) {
      logger.info('Сжимаю изображение для отправки');
      imageData.compressed = await this.compressImage(imageData);
      imageData.compressedSize = Math.ceil((imageData.compressed.length - imageData.compressed.indexOf(',') - 1) * 0.75);
    } else {
      logger.info('Изображение не требует сжатия');
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
   * Проверка необходимости сжатия
   */
  private needsCompression(imageData: ImageData): boolean {
    const sizeInMB = imageData.originalSize / (1024 * 1024);
    return (
      sizeInMB > IMAGE_COMPRESSION.MAX_SIZE_MB ||
      imageData.width > IMAGE_COMPRESSION.MAX_WIDTH ||
      imageData.height > IMAGE_COMPRESSION.MAX_WIDTH
    );
  }

  /**
   * Сжатие изображения
   */
  private async compressImage(
    imageData: ImageData, 
    options: Partial<CompressionOptions> = {}
  ): Promise<string> {
    const {
      maxSizeMB = IMAGE_COMPRESSION.MAX_SIZE_MB,
      maxWidth = IMAGE_COMPRESSION.MAX_WIDTH,
      quality = IMAGE_COMPRESSION.QUALITY,
    } = options;

    return new Promise((resolve, reject) => {
      try {
        const img = new Image();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Canvas не поддерживается'));
          return;
        }

        img.onload = () => {
          let { width, height } = img;

          // Вычисляем новые размеры с сохранением пропорций
          if (width > maxWidth || height > maxWidth) {
            const ratio = Math.min(maxWidth / width, maxWidth / height);
            width = Math.floor(width * ratio);
            height = Math.floor(height * ratio);
          }

          // Устанавливаем размеры canvas
          canvas.width = width;
          canvas.height = height;

          // Отрисовываем изображение
          ctx.drawImage(img, 0, 0, width, height);

          // Получаем сжатое изображение
          let compressedBase64 = canvas.toDataURL('image/jpeg', quality);

          logger.info(`Сжатие: ${img.naturalWidth}x${img.naturalHeight} → ${width}x${height}, качество: ${quality}, размер: ${(this.getBase64Size(compressedBase64) / 1024 / 1024).toFixed(2)}MB`);

          // Проверяем размер и при необходимости уменьшаем качество
          let currentQuality = quality;
          const maxSizeBytes = maxSizeMB * 1024 * 1024;
          
          while (this.getBase64Size(compressedBase64) > maxSizeBytes && currentQuality > 0.1) {
            currentQuality -= 0.05;
            compressedBase64 = canvas.toDataURL('image/jpeg', currentQuality);
          }

          logger.info('Image compressed', {
            originalSize: Math.round(imageData.originalSize / 1024) + 'KB',
            compressedSize: Math.round(this.getBase64Size(compressedBase64) / 1024) + 'KB',
            originalDimensions: `${imageData.width}x${imageData.height}`,
            compressedDimensions: `${width}x${height}`,
            quality: currentQuality.toFixed(2),
          });

          const result = compressedBase64.split(',')[1];
          if (!result) {
            reject(new Error('Не удалось получить сжатые данные'));
            return;
          }
          resolve(result); // Убираем data: prefix
        };

        img.onerror = () => {
          reject(new Error('Не удалось загрузить изображение для сжатия'));
        };

        img.src = `data:image/${imageData.format};base64,${imageData.base64}`;
      } catch (error) {
        logger.error('Image compression failed', error);
        reject(new Error('Ошибка при сжатии изображения'));
      }
    });
  }

  /**
   * Вычисление размера base64 строки в байтах
   */
  private getBase64Size(base64: string): number {
    const padding = (base64.match(/=/g) || []).length;
    return Math.ceil((base64.length - padding) * 0.75);
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
   * Получение изображения для анализа (сжатое если доступно)
   */
  getImageForAnalysis(): string | null {
    if (!this.currentImageData) return null;
    
    return this.currentImageData.compressed || this.currentImageData.base64;
  }

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
        compressedSize: this.currentImageData.compressedSize ? 
          Math.round(this.currentImageData.compressedSize / 1024) + 'KB' : null,
      } : null,
    };
  }
}

// Создаем глобальный экземпляр менеджера камеры
export const cameraManager = new CameraManager();

export default cameraManager;
