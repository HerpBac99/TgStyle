/**
 * UI экран результата капсулы
 * Отображает финальное изображение с watermark и кнопками действий
 */

import { logger } from './logger';
import { capsuleLikesService } from './capsules/CapsuleLikesService';
import { SharingService } from './shared/SharingService';

/**
 * Конфигурация экрана результата
 */
export interface CanvasResultScreenConfig {
  screenId: string;       // ID контейнера экрана
  onSave?: () => void;    // Callback для кнопки "Сохранить в галерею"
  onShare?: () => void;   // Callback для кнопки "Поделиться"
  onDone?: () => void;    // Callback для кнопки "Готово"
  onClose?: () => void;   // Callback для кнопки "Закрыть"
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
   * @param capsuleId - ID капсулы (для кнопок like и share)
   * @param showButtons - Показывать ли кнопки действий (по умолчанию true)
   */
  show(imageBase64: string, capsuleId?: number, showButtons: boolean = true): void {
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
      this.addDynamicButtons(capsuleId, imageBase64);
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
   * Добавить динамические кнопки like и share
   */
  private addDynamicButtons(capsuleId?: number, imageBase64?: string): void {
    const actionsContainer = document.querySelector('.capsule-result-actions') as HTMLElement;
    if (!actionsContainer) {
      logger.error('Actions container not found');
      return;
    }

    // Удаляем существующие динамические кнопки (как в анализе)
    const existingLikeComponent = actionsContainer.querySelector('.capsule-result-like-btn');
    if (existingLikeComponent) {
      existingLikeComponent.parentElement?.remove();
    }

    const existingShareComponent = actionsContainer.querySelector('.capsule-result-share-btn');
    if (existingShareComponent) {
      existingShareComponent.parentElement?.remove();
    }

    // Добавляем кнопку like (только для сохраненных капсул)
    if (capsuleId) {
      try {
        // Получаем начальные данные для кнопки like
        const initialLikeData = { isLiked: false, likesCount: 0 }; // По умолчанию
        
        // Используем сервис для создания компонента like прямо в actionsContainer
        capsuleLikesService.createLikeComponent(
          actionsContainer,
          capsuleId,
          initialLikeData,
          'capsule-result' // componentClass для специфичных стилей
        );

        logger.info('Like button added to result screen', { capsuleId });
      } catch (error) {
        logger.error('Failed to add like button', { error, capsuleId });
      }
    } else {
      logger.info('Like button not added - no capsuleId (unsaved capsule)');
    }

    // Добавляем кнопку share (если есть изображение)
    if (imageBase64) {
      try {
        // Конфигурация для sharing
        const shareConfig = {
          type: 'capsule' as const,
          title: 'Мой образ',
          text: 'Посмотри на мой новый образ!',
          image: imageBase64,
          metadata: {
            capsuleId: capsuleId
          }
        };

        // Используем сервис для создания кнопки share прямо в actionsContainer
        const sharingService = new SharingService();
        sharingService.createShareButton(
          actionsContainer,
          shareConfig,
          'capsule-result' // componentClass для специфичных стилей
        );

        logger.info('Share button added to result screen', { hasCapsuleId: !!capsuleId });
      } catch (error) {
        logger.error('Failed to add share button', { error });
      }
    }
  }

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

    // Кнопка закрытия (статичная)
    const closeBtn = document.getElementById('close-capsule-btn') as HTMLElement;
    if (closeBtn) {
      const handleClose = () => {
        logger.info('Result close button clicked');
        if (this.config.onClose) {
          this.config.onClose();
        } else {
          this.hide();
        }
      };

      closeBtn.addEventListener('click', handleClose);
      this.cleanupFunctions.push(() => {
        closeBtn.removeEventListener('click', handleClose);
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
