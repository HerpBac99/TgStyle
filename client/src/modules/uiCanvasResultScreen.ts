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
   * @param showButtons - Показывать ли кнопки действий (по умолчанию true)
   */
  show(imageBase64: string, showButtons: boolean = true): void {
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

    // ВАЖНО: Сбрасываем inline стили на imageContainer (остаются после swipe)
    const imageContainer = screen.querySelector('.capsule-result-image-container') as HTMLElement;
    if (imageContainer) {
      imageContainer.style.transform = '';
      imageContainer.style.opacity = '';
      imageContainer.style.transition = '';
    }

    // Показываем/скрываем кнопки действий
    const actionsContainer = screen.querySelector('.capsule-result-actions') as HTMLElement;
    if (actionsContainer) {
      actionsContainer.style.display = showButtons ? 'flex' : 'none';
    }

    // Показываем экран с анимацией
    screen.classList.remove('hidden');
    // Небольшая задержка для запуска анимации
    requestAnimationFrame(() => {
      screen.classList.add('show');
    });
    this.isVisible = true;

    // Настраиваем кнопки только если нужно показывать
    if (showButtons) {
      this.setupButtons();
    } else {
      // Если кнопки не показываем, добавляем обработчик закрытия по клику на экран
      this.setupPreviewMode();
    }

    logger.info('Result screen shown', { showButtons });
  }

  /**
   * Скрыть экран результата
   */
  hide(): void {
    const screen = document.getElementById(this.config.screenId);
    if (screen) {
      // Убираем класс show для анимации исчезновения
      screen.classList.remove('show');
      
      // Сбрасываем inline стили на imageContainer перед закрытием
      const imageContainer = screen.querySelector('.capsule-result-image-container') as HTMLElement;
      if (imageContainer) {
        imageContainer.style.transform = '';
        imageContainer.style.opacity = '';
        imageContainer.style.transition = '';
      }
      
      // После завершения анимации скрываем экран
      setTimeout(() => {
        screen.classList.add('hidden');
        this.isVisible = false;
      }, 300); // Длительность transition из CSS
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
   * Настроить режим предпросмотра (без кнопок, закрытие по клику и swipe)
   */
  private setupPreviewMode(): void {
    const screen = document.getElementById(this.config.screenId);
    if (!screen) return;

    const imageContainer = screen.querySelector('.capsule-result-image-container') as HTMLElement;
    if (!imageContainer) return;

    // Обработчик закрытия по клику на экран (но не на изображение)
    const handleScreenClick = (e: MouseEvent) => {
      // Закрываем только если клик был по экрану, а не по изображению
      if (e.target === screen || (imageContainer && !imageContainer.contains(e.target as Node))) {
        logger.info('Preview screen clicked, closing');
        this.hide();
        // Вызываем onDone callback если он есть
        if (this.config.onDone) {
          this.config.onDone();
        }
      }
    };

    // Swipe-to-close gesture
    let startY = 0;
    let currentY = 0;
    let isDragging = false;

    const handleTouchStart = (e: TouchEvent) => {
      // Начинаем отслеживать только если касание на изображении
      if (e.touches[0] && imageContainer.contains(e.target as Node)) {
        startY = e.touches[0].clientY;
        currentY = startY;
        isDragging = true;
        imageContainer.style.transition = 'none';
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging || !e.touches[0]) return;

      currentY = e.touches[0].clientY;
      const deltaY = currentY - startY;

      // Разрешаем свайп только вниз
      if (deltaY > 0) {
        e.preventDefault();
        const opacity = Math.max(0, 1 - deltaY / 400);
        imageContainer.style.transform = `translateY(${deltaY}px)`;
        imageContainer.style.opacity = String(opacity);
      }
    };

    const handleTouchEnd = () => {
      if (!isDragging) return;

      const deltaY = currentY - startY;
      isDragging = false;
      imageContainer.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';

      // Если свайп больше 100px вниз - закрываем
      if (deltaY > 100) {
        logger.info('Swipe down detected, closing preview');
        this.hide();
        if (this.config.onDone) {
          this.config.onDone();
        }
      } else {
        // Возвращаем на место
        imageContainer.style.transform = 'translateY(0)';
        imageContainer.style.opacity = '1';
      }
    };

    screen.addEventListener('click', handleScreenClick);
    screen.addEventListener('touchstart', handleTouchStart, { passive: false });
    screen.addEventListener('touchmove', handleTouchMove, { passive: false });
    screen.addEventListener('touchend', handleTouchEnd);
    screen.addEventListener('touchcancel', handleTouchEnd);

    this.cleanupFunctions.push(() => {
      screen.removeEventListener('click', handleScreenClick);
      screen.removeEventListener('touchstart', handleTouchStart);
      screen.removeEventListener('touchmove', handleTouchMove);
      screen.removeEventListener('touchend', handleTouchEnd);
      screen.removeEventListener('touchcancel', handleTouchEnd);
    });

    logger.info('Preview mode configured with swipe-to-close');
  }

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
    const doneBtn = document.getElementById('capsule-result-done-btn') as HTMLButtonElement;
    if (doneBtn && this.config.onDone) {
      // ВАЖНО: Сбрасываем disabled и pressed класс при каждом показе result screen
      doneBtn.disabled = false;
      doneBtn.classList.remove('pressed');
      
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
