/**
 * Универсальный сервис для sharing контента
 * Работает для анализов, капсул, любого контента
 */

import { logger } from '../logger';
import { api } from '../api';
import { ShareConfig, ShareOptions, ShareResult } from '@/types/sharing';
import { APP_CONFIG } from '@/utils/constants';
import { createElement } from '@/utils/helpers';

/**
 * Универсальный сервис для sharing
 */
export class SharingService {
  /**
   * Создает и управляет кнопкой sharing.
   * @param parentElement - DOM-элемент, куда будет встроена кнопка.
   * @param shareConfig - Конфигурация для sharing.
   * @param componentClass - Класс для специфичных стилей (напр. 'carousel' или 'result').
   */
  public createShareButton(
    parentElement: HTMLElement,
    shareConfig: ShareConfig,
    componentClass: string = ''
  ): void {
    const container = createElement('div', { class: `share-container` });
    const shareBtnClass = componentClass ? `share-btn ${componentClass}-share-btn` : 'share-btn';
    const shareBtn = createElement('button', { class: shareBtnClass, 'aria-label': 'Поделиться анализом' });
    
    shareBtn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 90 90">
        <path d="M 31.121 43.543 c -0.852 0 -1.689 -0.362 -2.275 -1.042 L 0.727 9.836 C -0.051 8.934 -0.22 7.656 0.295 6.581 c 0.516 -1.074 1.607 -1.748 2.81 -1.7 l 84 2.952 c 1.356 0.047 2.513 1 2.817 2.324 c 0.306 1.323 -0.315 2.686 -1.515 3.323 l -55.88 29.712 C 32.083 43.429 31.6 43.543 31.121 43.543 z M 9.747 11.118 l 22.082 25.65 L 75.71 13.436 L 9.747 11.118 z"/>
        <path d="M 42.475 85.121 c -0.145 0 -0.291 -0.011 -0.437 -0.032 c -1.179 -0.173 -2.144 -1.027 -2.458 -2.178 L 28.226 41.333 c -0.37 -1.353 0.248 -2.781 1.486 -3.439 l 55.88 -29.712 c 1.196 -0.637 2.676 -0.39 3.602 0.603 c 0.927 0.993 1.07 2.484 0.352 3.636 L 45.019 83.71 C 44.466 84.596 43.5 85.121 42.475 85.121 z M 34.646 42.066 l 8.917 32.651 l 34.965 -55.983 L 34.646 42.066 z"/>
      </svg>
    `;

    container.appendChild(shareBtn);

    // Добавление в DOM ПОСЛЕ like-контейнера
    const likeContainer = parentElement.querySelector('.like-container');
    if (likeContainer && likeContainer.nextElementSibling) {
      // Если есть элемент после like-контейнера, вставляем перед ним
      parentElement.insertBefore(container, likeContainer.nextElementSibling);
    } else if (likeContainer) {
      // Если like-контейнер последний, добавляем после него
      likeContainer.after(container);
    } else {
      // Если like-контейнера нет, добавляем в конец
      parentElement.appendChild(container);
    }

    // Обработчик клика
    shareBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();

      try {
        logger.info('Share button clicked', { componentClass });
        
        // Выполняем sharing с дефолтными опциями
        const result = await this.share(shareConfig, {
          includeImage: true,
          includeLink: true,
          saveToServer: true
        });

        if (result.success) {
          logger.info('Sharing completed successfully', { method: result.method });
          // Добавляем визуальную обратную связь (например, изменение иконки)
          shareBtn.classList.add('shared');
          setTimeout(() => {
            shareBtn.classList.remove('shared');
          }, 2000);
        } else {
          logger.warn('Sharing failed', { error: result.error });
        }
      } catch (error) {
        logger.error('Error in share button click handler', error);
      }
    });
  }

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

      // 2. Отправляем на сервер
      if (opts.saveToServer && config.type === 'analysis') {
        await this.sendAnalysisToServer(shareId, config);
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
   * Отправка анализа на сервер
   * Теперь передаем только shareId и historyItemId, сервер загрузит данные из БД
   */
  private async sendAnalysisToServer(shareId: string, config: ShareConfig): Promise<void> {
    try {
      const historyItemId = config.metadata?.['historyItemId'];

      if (!historyItemId) {
        logger.warn('No historyItemId for sharing, skipping server save', { shareId });
        return;
      }

      // Удаляем префикс "analysis_" для хранения в БД
      // В БД храним чистый ID, префикс только для Telegram ссылок
      const cleanShareId = shareId.startsWith('analysis_') 
        ? shareId.replace('analysis_', '') 
        : shareId;

      const requestBody = {
        analysisId: cleanShareId,  // Отправляем БЕЗ префикса
        historyItemId: historyItemId
      };

      logger.info('Sending analysis to server', { 
        originalShareId: shareId, 
        cleanShareId, 
        historyItemId 
      });

      const response = await api.post('/shared-analysis', requestBody) as any;

      if (response.success) {
        logger.info('Analysis shared successfully (DB mapping created)', { 
          cleanShareId, 
          historyItemId 
        });
      } else {
        logger.warn('Server save failed', { error: response.error });
      }

    } catch (error) {
      logger.warn('Failed to send analysis to server', {
        shareId,
        error
      });
      throw error; // Пробрасываем ошибку наверх
    }
  }

  /**
   * Конвертация data URL в Blob
   */
  private async dataUrlToBlob(dataUrl: string): Promise<Blob> {
    const response = await fetch(dataUrl);
    return response.blob();
  }
}

// Экспортируем синглтон
export const sharingService = new SharingService();
