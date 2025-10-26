/**
 * Модуль для sharing капсул
 * Использует универсальные сервисы (SharingService, ImageRenderService)
 * ДЕЛЕГИРОВАНИЕ: ImageProcessingService для обработки изображений
 */

import { logger } from '../logger';
import { sharingService } from '../shared/SharingService';
import { imageProcessingService } from '../shared/ImageProcessingService';
import type { ShareConfig } from '@/types/sharing';
import { UICanvasEditor } from '../uiCanvasEditor';

/**
 * Сервис для sharing капсул
 */
export class CapsulesSharing {
  /**
   * Поделиться капсулой
   * 
   * @param canvasEditor - Canvas editor с капсулой
   * @param capsuleName - Название капсулы
   * @param capsuleId - ID капсулы
   * @param thumbnailImage - Опционально: готовое изображение thumbnail (с правильными пропорциями)
   */
  async shareCapsule(
    canvasEditor: UICanvasEditor,
    capsuleName: string,
    capsuleId?: number,
    thumbnailImage?: string
  ): Promise<boolean> {
    try {
      logger.info('Starting capsule share', { capsuleName, capsuleId });

      // 1. Получаем изображение - используем thumbnail если есть, иначе берем с canvas
      let canvasImage: string;
      
      if (thumbnailImage) {
        canvasImage = thumbnailImage;
        logger.info('Using saved thumbnail image');
      } else {
        const image = await this.getCanvasImage(canvasEditor);
        if (!image) {
          logger.error('Failed to get canvas image');
          return false;
        }
        canvasImage = image;
        logger.info('Using canvas snapshot');
      }

      // 2. Используем изображение напрямую (уже с правильными пропорциями и удаленным фоном)
      // canvasImage уже обработан через canvasToImage() - это PNG с удаленным фоном
      
      // 3. Конфигурация для sharing
      const shareConfig: ShareConfig = {
        type: 'capsule',
        image: canvasImage,  // Используем напрямую без дополнительного рендеринга!
        text: `Моя капсула "${capsuleName}"`,
        title: '👔 Моя капсула гардероба',
        metadata: {
          capsuleId,
          capsuleName
        }
      };

      // 4. Делимся через универсальный SharingService
      const result = await sharingService.share(shareConfig, {
        includeImage: true,
        includeLink: true,
        saveToServer: true
      });

      if (result.success) {
        logger.info('Capsule shared successfully', {
          capsuleName,
          method: result.method,
          shareId: result.shareId
        });
        return true;
      } else {
        logger.error('Failed to share capsule', {
          error: result.error
        });
        return false;
      }

    } catch (error) {
      logger.error('Share capsule error', error);
      return false;
    }
  }

  /**
   * Получить изображение canvas
   * ДЕЛЕГИРОВАНИЕ: используем ImageProcessingService
   * 
   * @param canvasEditor - Canvas editor
   * @returns Base64 изображение canvas
   */
  private async getCanvasImage(canvasEditor: UICanvasEditor): Promise<string | null> {
    try {
      // Получаем fabric canvas
      const fabricCanvas = canvasEditor.getCanvas();
      
      if (!fabricCanvas) {
        logger.error('Canvas not initialized');
        return null;
      }

      // ДЕЛЕГИРОВАНИЕ: используем ImageProcessingService для конвертации
      const canvasImage = await imageProcessingService.canvasToBase64(
        fabricCanvas.getElement() as HTMLCanvasElement,
        { format: 'png', quality: 1.0 }
      );

      logger.info('Canvas image captured via ImageProcessingService');

      return canvasImage;

    } catch (error) {
      logger.error('Failed to get canvas image', error);
      return null;
    }
  }
}

// Экспортируем синглтон
export const capsulesSharing = new CapsulesSharing();
