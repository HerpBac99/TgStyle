/**
 * UI экран результата капсулы
 * Отображает финальное изображение с watermark и кнопками действий
 */

import { logger } from './logger';

/**
 * Конфигурация экрана результата
 */
export interface CanvasResultScreenConfig {
  screenId: string;       // ID контейнера экрана
  onSave?: () => void;    // Callback для кнопки "Сохранить в галерею"
  onShare?: () => void;   // Callback для кнопки "Поделиться"
  onDone?: () => void;    // Callback для кнопки "Готово"
}

/**
 * UI экран результата капсулы
 */
export class UICanvasResultScreen {
  private config: CanvasResultScreenConfig;
  private cleanupFunctions: (() => void)[] = [];
  private isVisible: boolean = false;
  private currentImage: string | null = null;

  constructor(config: CanvasResultScreenConfig) {
    this.config = config;
  }

  // ============================================
  // ПУБЛИЧНЫЕ МЕТОДЫ - УПРАВЛЕНИЕ ВИДИМОСТЬЮ
  // ============================================

  /**
   * Показать экран результата с изображением
   * 
   * @param imageBase64 - Base64 изображение с watermark
   */
  show(imageBase64: string): void {
    const screen = document.getElementById(this.config.screenId);
    if (!screen) {
      logger.error('Result screen not found', { screenId: this.config.screenId });
      throw new Error(`Result screen not found: ${this.config.screenId}`);
    }

    // Сохраняем изображение
    this.currentImage = imageBase64;

    // Устанавливаем изображение
    const imageElement = document.getElementById('capsule-result-image') as HTMLImageElement;
    if (imageElement) {
      imageElement.src = imageBase64;
    } else {
      logger.error('Result image element not found');
    }

    // Показываем экран
    screen.classList.remove('hidden');
    this.isVisible = true;

    // Настраиваем кнопки
    this.setupButtons();

    logger.info('Result screen shown');
  }

  /**
   * Скрыть экран результата
   */
  hide(): void {
    const screen = document.getElementById(this.config.screenId);
    if (screen) {
      screen.classList.add('hidden');
      this.isVisible = false;
    }

    // Очищаем обработчики
    this.cleanup();

    logger.info('Result screen hidden');
  }

  // ============================================
  // ПУБЛИЧНЫЕ МЕТОДЫ - ДАННЫЕ
  // ============================================

  /**
   * Получить текущее изображение
   */
  getCurrentImage(): string | null {
    return this.currentImage;
  }

  /**
   * Получить статус экрана
   */
  getStatus() {
    return {
      isVisible: this.isVisible,
      hasImage: !!this.currentImage
    };
  }

  // ============================================
  // ПРИВАТНЫЕ МЕТОДЫ - НАСТРОЙКА
  // ============================================

  /**
   * Настроить кнопки экрана результата
   */
  private setupButtons(): void {
    // Очищаем старые обработчики
    this.cleanup();

    // Кнопка "Сохранить в галерею"
    const saveBtn = document.getElementById('capsule-result-save-btn') as HTMLElement;
    if (saveBtn && this.config.onSave) {
      const handleSave = () => {
        logger.info('Result save button clicked');
        this.config.onSave!();
      };

      saveBtn.addEventListener('click', handleSave);
      this.cleanupFunctions.push(() => {
        saveBtn.removeEventListener('click', handleSave);
      });
    }

    // Кнопка "Поделиться в Telegram"
    const shareBtn = document.getElementById('capsule-result-share-btn') as HTMLElement;
    if (shareBtn && this.config.onShare) {
      const handleShare = () => {
        logger.info('Result share button clicked');
        this.config.onShare!();
      };

      shareBtn.addEventListener('click', handleShare);
      this.cleanupFunctions.push(() => {
        shareBtn.removeEventListener('click', handleShare);
      });
    }

    // Кнопка "Готово"
    const doneBtn = document.getElementById('capsule-result-done-btn') as HTMLElement;
    if (doneBtn && this.config.onDone) {
      const handleDone = () => {
        logger.info('Result done button clicked');
        this.config.onDone!();
      };

      doneBtn.addEventListener('click', handleDone);
      this.cleanupFunctions.push(() => {
        doneBtn.removeEventListener('click', handleDone);
      });
    }

    logger.info('Result screen buttons configured');
  }

  /**
   * Очистить обработчики событий
   */
  private cleanup(): void {
    this.cleanupFunctions.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        logger.error('Error during cleanup', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });
    this.cleanupFunctions = [];
  }

  // ============================================
  // ПУБЛИЧНЫЕ МЕТОДЫ - ОЧИСТКА
  // ============================================

  /**
   * Уничтожить экран результата
   */
  destroy(): void {
    logger.info('Destroying UICanvasResultScreen');
    this.cleanup();
    this.currentImage = null;
    this.isVisible = false;
  }
}
