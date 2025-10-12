/**
 * Универсальный сервис для sharing контента
 * Работает для анализов, капсул, любого контента
 */

import { logger } from '../logger';
import { ShareConfig, ShareOptions, ShareResult } from '@/types/sharing';
import { storageService } from './StorageService';
import { APP_CONFIG } from '@/utils/constants';

/**
 * Универсальный сервис для sharing
 */
export class SharingService {
  /**
   * Главный метод - поделиться контентом
   */
  async share(config: ShareConfig, options: ShareOptions = {}): Promise<ShareResult> {
    // Дефолтные опции
    const opts: Required<ShareOptions> = {
      includeImage: options.includeImage !== false,
      includeLink: options.includeLink !== false,
      saveToServer: options.saveToServer !== false,
      imageQuality: options.imageQuality || 0.8
    };

    try {
      logger.info('Starting share process', {
        type: config.type,
        hasImage: !!config.image,
        options: opts
      });

      // 1. Генерируем ID и ссылку
      const shareId = this.generateShareId(config.type);
      const shareLink = this.createShareLink(shareId);

      // 2. Сохраняем данные локально и на сервер
      if (opts.saveToServer) {
        await this.saveShareData(shareId, config);
      }

      // 3. Пытаемся поделиться через Web Share API
      const webShareResult = await this.tryWebShareApi(config, shareLink, opts);

      if (webShareResult.success) {
        return webShareResult;
      }

      // 4. Fallback на Telegram sharing
      const telegramResult = await this.tryTelegramShare(config, shareLink);

      if (telegramResult.success) {
        return telegramResult;
      }

      // 5. Последний fallback - копирование в буфер обмена
      await this.fallbackToClipboard(config, shareLink);

      return {
        success: true,
        shareId,
        shareLink,
        method: 'clipboard'
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Share process failed', { error: errorMessage });

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Попытка sharing через Web Share API
   */
  private async tryWebShareApi(
    config: ShareConfig,
    shareLink: string,
    options: Required<ShareOptions>
  ): Promise<ShareResult> {
    if (!navigator.share) {
      logger.info('Web Share API not available');
      return { success: false };
    }

    try {
      const shareData: ShareData = {
        title: config.title,
        text: this.formatShareText(config, shareLink)
      };

      // Добавляем изображение если нужно
      if (options.includeImage && config.image) {
        try {
          const blob = await this.dataUrlToBlob(config.image);
          const file = new File([blob], `tgstyle-${config.type}.jpg`, {
            type: 'image/jpeg'
          });
          shareData.files = [file];
          
          logger.info('Image added to Web Share', {
            fileSize: Math.round(blob.size / 1024) + 'KB'
          });
        } catch (imageError) {
          logger.warn('Failed to add image to Web Share, sharing without image', imageError);
        }
      }

      await navigator.share(shareData);

      logger.info('Successfully shared via Web Share API');

      return {
        success: true,
        shareId: '',
        shareLink,
        method: 'web-share'
      };

    } catch (error) {
      // AbortError означает что пользователь отменил - это не ошибка
      if (error instanceof Error && error.name === 'AbortError') {
        logger.info('Web Share cancelled by user');
        return { success: false };
      }

      logger.warn('Web Share API failed', error);
      return { success: false };
    }
  }

  /**
   * Попытка sharing через Telegram
   */
  private async tryTelegramShare(
    config: ShareConfig,
    shareLink: string
  ): Promise<ShareResult> {
    if (!window.Telegram?.WebApp?.openTelegramLink) {
      logger.info('Telegram WebApp API not available');
      return { success: false };
    }

    try {
      const text = this.formatShareText(config, shareLink);
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(shareLink)}&text=${encodeURIComponent(text)}`;

      window.Telegram.WebApp.openTelegramLink(shareUrl);

      logger.info('Successfully opened Telegram share');

      return {
        success: true,
        shareId: '',
        shareLink,
        method: 'telegram'
      };

    } catch (error) {
      logger.warn('Telegram share failed', error);
      return { success: false };
    }
  }

  /**
   * Fallback - копирование в буфер обмена
   */
  private async fallbackToClipboard(config: ShareConfig, shareLink: string): Promise<void> {
    const text = `${config.title}\n\n${config.text}\n\n${shareLink}`;

    try {
      await navigator.clipboard.writeText(text);
      logger.info('Share text copied to clipboard');
    } catch (error) {
      logger.error('Failed to copy to clipboard', error);
      throw new Error('All sharing methods failed');
    }
  }

  /**
   * Генерация уникального ID для sharing
   */
  private generateShareId(type: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return `${type}_${timestamp}_${random}`;
  }

  /**
   * Создание ссылки для sharing
   */
  private createShareLink(shareId: string): string {
    const botName = APP_CONFIG.telegramBotName || 'TgStyleBot';
    return `https://t.me/${botName}?startapp=${shareId}`;
  }

  /**
   * Форматирование текста для sharing
   */
  private formatShareText(config: ShareConfig, shareLink: string): string {
    const emoji = config.type === 'analysis' ? '🤖👗' : '👔✨';
    const truncatedText = config.text.length > 150
      ? config.text.substring(0, 150) + '...'
      : config.text;

    return `${config.title} ${emoji}\n\n${truncatedText}\n\n${shareLink}`;
  }

  /**
   * Сохранение данных для sharing
   */
  private async saveShareData(shareId: string, config: ShareConfig): Promise<void> {
    try {
      // 1. Сохраняем в localStorage
      await storageService.saveShareData(shareId, {
        type: config.type,
        image: config.image,
        text: config.text,
        metadata: config.metadata || {},
        timestamp: new Date().toISOString(),
        sharedAt: new Date().toISOString()
      });

      logger.info('Share data saved to localStorage', { shareId });

      // 2. Отправка на сервер (опционально, пока не реализовано)
      // TODO: Использовать api.fetch вместо прямого fetch
      // await this.sendToServer(shareId, config);

    } catch (error) {
      logger.error('Failed to save share data', { shareId, error });
      // Не бросаем ошибку - sharing может продолжиться без сохранения
    }
  }

  /**
   * TODO: Отправка на сервер (реализовать позже)
   * Пока закомментировано, так как не используется
   */
  /*
  private async sendToServer(shareId: string, config: ShareConfig): Promise<void> {
    try {
      // TODO: использовать api.fetch() после интеграции
      const response = await fetch('/api/shared-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          shareId,
          type: config.type,
          image: config.image,
          text: config.text,
          metadata: config.metadata,
          timestamp: new Date().toISOString()
        })
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        logger.info('Share data sent to server', { shareId });
      }

    } catch (error) {
      logger.warn('Server save failed, data saved locally only', {
        shareId,
        error
      });
      // Не бросаем ошибку - localStorage уже сохранен
    }
  }
  */

  /**
   * Конвертация data URL в Blob
   */
  private async dataUrlToBlob(dataUrl: string): Promise<Blob> {
    const response = await fetch(dataUrl);
    return response.blob();
  }

  /**
   * Получить информацию о хранилище
   */
  getStorageInfo() {
    return storageService.checkAvailableSpace();
  }

  /**
   * Получить все shared элементы
   */
  getAllSharedItems() {
    return storageService.getAllSharedItems();
  }

  /**
   * Удалить shared элемент
   */
  removeSharedItem(shareId: string): void {
    storageService.removeShareData(shareId);
  }
}

// Экспортируем синглтон
export const sharingService = new SharingService();
