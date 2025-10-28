/**
 * Базовые UI компоненты и общие утилиты
 * Модальные окна, тосты, диалоги, общие интерфейсы
 */

import type { TelegramWebApp } from '@/types/index';
import {
  getElement,
  createElement,
} from '@/utils/helpers';
import { logger } from './logger';
import { authManager } from './auth';
import { uiAnalysisManager } from './uiAnalysis';
import { analysisLikesService } from './analysis/AnalysisLikesService';

// Объявляем глобальную переменную Telegram
declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

/**
 * Класс для управления общими UI компонентами
 */
export class UICoreManager {
  private cleanupFunctions: (() => void)[] = [];

  constructor() { }

  /**
   * Показать модальное окно покупки подписки
   */
  showSubscriptionModal(): void {
    logger.info('Showing subscription modal');

    const modal = getElement('#subscription-modal');
    if (!modal) {
      logger.error('Subscription modal not found');
      return;
    }

    // Обновляем дату сброса лимитов
    this.updateWeeklyResetDate();

    // Показываем модальное окно
    modal.classList.remove('hidden');

    // Настраиваем обработчики событий
    this.setupSubscriptionModalHandlers();

    // Вибрация при открытии модального окна
    authManager.vibrate('medium');

    logger.info('Subscription modal shown');
  }

  /**
   * Скрыть модальное окно покупки подписки
   */
  hideSubscriptionModal(): void {
    logger.info('Hiding subscription modal');

    const modal = getElement('#subscription-modal');
    if (!modal) return;

    // Скрываем модальное окно
    modal.classList.add('hidden');

    // Очищаем обработчики событий (если они были установлены)
    this.cleanupSubscriptionModalHandlers();

    logger.info('Subscription modal hidden');
  }

  /**
   * Обновить дату еженедельного сброса лимитов
   */
  private updateWeeklyResetDate(): void {
    const resetDateElement = getElement('#weekly-reset-date');
    if (!resetDateElement) return;

    // Вычисляем следующий понедельник
    const now = new Date();
    const nextMonday = new Date(now);
    const daysUntilMonday = (8 - now.getDay()) % 7 || 7; // Если сегодня понедельник, то через 7 дней
    nextMonday.setDate(now.getDate() + daysUntilMonday);
    nextMonday.setHours(0, 0, 0, 0); // Устанавливаем начало дня

    // Форматируем дату
    const formattedDate = nextMonday.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long'
    });

    resetDateElement.textContent = formattedDate;
  }

  /**
   * Настроить обработчики событий для модального окна подписки
   */
  private setupSubscriptionModalHandlers(): void {
    // Обработчик закрытия модального окна
    const closeBtn = getElement('#close-subscription-modal');
    if (closeBtn) {
      const closeHandler = () => this.hideSubscriptionModal();
      closeBtn.addEventListener('click', closeHandler);

      // Сохраняем обработчик для очистки
      this.cleanupFunctions.push(() => {
        closeBtn.removeEventListener('click', closeHandler);
      });
    }

    // Обработчик клика по оверлею для закрытия
    const modal = getElement('#subscription-modal');
    if (modal) {
      const overlayHandler = (event: Event) => {
        if (event.target === modal || (event.target as HTMLElement).classList.contains('subscription-modal-overlay')) {
          this.hideSubscriptionModal();
        }
      };
      modal.addEventListener('click', overlayHandler);

      // Сохраняем обработчик для очистки
      this.cleanupFunctions.push(() => {
        modal.removeEventListener('click', overlayHandler);
      });
    }

    // Обработчик кнопки "Оформить Premium"
    const upgradeBtn = getElement('#upgrade-premium-btn');
    if (upgradeBtn) {
      const upgradeHandler = () => this.handleUpgradePremium();
      upgradeBtn.addEventListener('click', upgradeHandler);

      // Сохраняем обработчик для очистки
      this.cleanupFunctions.push(() => {
        upgradeBtn.removeEventListener('click', upgradeHandler);
      });
    }
  }

  /**
   * Очистить обработчики событий модального окна подписки
   */
  private cleanupSubscriptionModalHandlers(): void {
    // Обработчики очищаются автоматически через cleanupFunctions
    // Этот метод оставлен для потенциального расширения
  }

  /**
   * Обработчик кнопки "Оформить Premium"
   */
  private handleUpgradePremium(): void {
    logger.info('Upgrade Premium button clicked');

    // Здесь будет логика покупки подписки
    // Пока показываем уведомление

    // Скрываем модальное окно
    this.hideSubscriptionModal();

    // Показываем уведомление о том, что функция в разработке
    this.showToast('Функция покупки подписки скоро будет доступна!', 'info');

    // Вибрация
    authManager.vibrate('light');
  }

  /**
   * Показать toast уведомление
   */
  showToast(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    // Создаем toast элемент
    const toast = createElement('div', {
      class: `toast toast-${type}`,
    });

    toast.textContent = message;

    // Стили для toast
    Object.assign(toast.style, {
      position: 'fixed',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: type === 'success' ? '#4CAF50' : type === 'error' ? '#F44336' : '#2196F3',
      color: 'white',
      padding: '12px 24px',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
      zIndex: '10001',
      fontSize: '14px',
      fontWeight: '500',
      fontFamily: "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      opacity: '0',
      transition: 'opacity 0.3s ease',
    });

    // Добавляем в body
    document.body.appendChild(toast);

    // Показываем с анимацией
    setTimeout(() => {
      toast.style.opacity = '1';
    }, 100);

    // Скрываем через 3 секунды
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 3000);

    logger.info('Toast shown', { message, type });
  }

  /**
   * Показать shared анализ другого пользователя
   * @param photoBase64 - Base64 изображения
   * @param analysisText - Текст анализа
   * @param timestamp - Временная метка
   * @param historyItemId - ID элемента истории
   * @param likesCount - Количество лайков
   * @param isLiked - Лайкнул ли текущий пользователь
   */
  async showSharedAnalysis(photoBase64: string, analysisText: string, timestamp: string, historyItemId?: number, likesCount?: number, isLiked?: boolean): Promise<void> {
    logger.info('Showing shared analysis', { historyItemId, hasPhoto: !!photoBase64, likesCount, isLiked });

    try {
      // ОПТИМИЗАЦИЯ: Убрана искусственная задержка для ускорения загрузки

      // Показываем экран анализа с фото
      const analysisScreen = getElement('#analysis-screen');
      const analysisPhoto = getElement('#analysis-photo') as HTMLImageElement;
      const loadingIndicator = getElement('#analysis-loading');
      const resultContainer = getElement('#analysis-result-container');

      if (!analysisScreen || !analysisPhoto || !loadingIndicator || !resultContainer) {
        logger.error('Analysis screen elements not found');
        return;
      }

      // Устанавливаем фото (проверяем есть ли уже data URL префикс)
      if (photoBase64.startsWith('data:image')) {
        analysisPhoto.src = photoBase64;
      } else {
        analysisPhoto.src = `data:image/jpeg;base64,${photoBase64}`;
      }

      logger.info('Photo src set for shared analysis', {
        hasPrefix: photoBase64.startsWith('data:image'),
        srcLength: analysisPhoto.src.length
      });

      // Скрываем результат, показываем загрузку
      resultContainer.classList.add('hidden');
      loadingIndicator.classList.remove('hidden');

      // Показываем экран анализа
      analysisScreen.classList.remove('hidden');

      // Используем uiAnalysisManager для показа результата анализа
      uiAnalysisManager.showAnalysisResult(analysisText, historyItemId);

      // Добавляем кнопку лайка для shared анализа (если есть historyItemId)
      if (historyItemId) {
        const resultActions = getElement('.result-actions');
        if (resultActions) {
          // Удаляем старые компоненты, чтобы избежать дублирования при повторном вызове
          const existingLikeComponent = resultActions.querySelector('.result-like-btn');
          if (existingLikeComponent) {
            existingLikeComponent.parentElement?.remove();
          }

          const existingShareComponent = resultActions.querySelector('.result-share-btn');
          if (existingShareComponent) {
            existingShareComponent.parentElement?.remove();
          }

          // Создаем компонент лайков с данными с сервера
          analysisLikesService.createLikeComponent(
            resultActions,
            historyItemId,
            { 
              isLiked: isLiked || false, 
              likesCount: likesCount || 0 
            },
            'result' // Добавляем класс для экрана результата
          );

          logger.info('Like button added for shared analysis', { historyItemId, likesCount, isLiked });
        }
      }

      // Добавляем индикацию что это shared анализ
      const resultHeader = getElement('.result-header h3');
      if (resultHeader) {
        resultHeader.textContent = `Анализ от ${new Date(timestamp).toLocaleDateString()}`;
      }

      logger.info('Shared analysis displayed successfully');
    } catch (error) {
      logger.error('Failed to show shared analysis', error);
    }
  }

  /**
   * Показать shared капсулу точно как обычный результат капсулы
   * @param thumbnailUrl - URL изображения капсулы
   * @param name - Название капсулы
   * @param canvasData - Данные canvas
   * @param items - Вещи в капсуле
   * @param capsuleId - ID капсулы
   * @param likesCount - Количество лайков
   * @param isLiked - Лайкнул ли текущий пользователь
   * @param author - Автор капсулы
   */
  async showSharedCapsule(
    thumbnailUrl: string,
    name: string,
    canvasData: any,
    items: any[],
    capsuleId: number,
    likesCount: number,
    isLiked: boolean,
    author: any
  ): Promise<void> {
    logger.info('Showing shared capsule', { 
      capsuleId, 
      name, 
      itemsCount: items.length, 
      likesCount, 
      isLiked,
      author: author.firstName 
    });

    try {
      // Показываем экран результата капсулы
      const resultScreen = getElement('#capsule-result-screen');
      const resultImage = getElement('#capsule-result-image') as HTMLImageElement;
      const resultActions = getElement('.capsule-result-actions');

      if (!resultScreen || !resultImage || !resultActions) {
        logger.error('Capsule result screen elements not found');
        return;
      }

      // Устанавливаем изображение
      resultImage.src = thumbnailUrl;
      resultImage.alt = name || 'Shared Capsule';

      // Показываем экран
      resultScreen.classList.remove('hidden');
      resultScreen.classList.add('show');

      // Добавляем информацию об авторе поверх изображения
      const imageContainer = resultScreen.querySelector('.capsule-result-image-container');
      if (imageContainer) {
        // Удаляем старую информацию об авторе если есть
        const existingAuthorInfo = imageContainer.querySelector('.capsule-author-overlay');
        if (existingAuthorInfo) {
          existingAuthorInfo.remove();
        }

        const authorOverlay = createElement('div', { class: 'capsule-author-overlay' });
        authorOverlay.innerHTML = `
          <span>Автор: ${author.firstName}${author.lastName ? ' ' + author.lastName : ''}</span>
        `;
        imageContainer.appendChild(authorOverlay);
      }

      // Очищаем старые кнопки
      resultActions.innerHTML = '';

      // Импортируем CapsuleLikesService
      const { capsuleLikesService } = await import('./capsules/CapsuleLikesService');

      // Создаем кнопку лайка точно как в обычном результате
      const initialLikeData = { isLiked, likesCount };
      capsuleLikesService.createLikeComponent(
        resultActions,
        capsuleId,
        initialLikeData,
        'shared-capsule' // специфичное имя для стилей
      );

      // Создаем кнопку копирования (вместо share)
      this.createCopyButton(resultActions, capsuleId, items, canvasData, name);

      // Кнопка закрытия (статичная)
      const closeBtn = createElement('button', { 
        class: 'action-btn close-btn',
        id: 'close-capsule-btn',
        'aria-label': 'Закрыть'
      });
      closeBtn.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="21" y1="3" x2="3" y2="21"></line>
          <line x1="3" y1="3" x2="21" y2="21"></line>
        </svg>
      `;
      
      closeBtn.addEventListener('click', () => {
        // Очищаем все динамические кнопки перед закрытием
        this.clearCapsuleResultButtons();
        
        resultScreen.classList.add('hidden');
        resultScreen.classList.remove('show');
        this.switchToCapsules();
      });

      resultActions.appendChild(closeBtn);

      logger.info('Shared capsule displayed successfully');
    } catch (error) {
      logger.error('Failed to show shared capsule', error);
    }
  }

  /**
   * Создает кнопку копирования в стиле кнопки share
   */
  private createCopyButton(
    parentElement: HTMLElement,
    capsuleId: number,
    items: any[],
    canvasData: any,
    name: string
  ): void {
    const container = createElement('div', { class: 'share-container' }); // Используем тот же класс что и для share
    const copyBtn = createElement('button', { 
      class: 'share-btn shared-capsule-copy-btn', // Используем тот же класс что и share-btn
      'aria-label': 'Скопировать капсулу'
    });
    
    copyBtn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    `;

    container.appendChild(copyBtn);

    // Добавление в DOM ПОСЛЕ like-контейнера (как в SharingService)
    const likeContainer = parentElement.querySelector('.like-container');
    if (likeContainer && likeContainer.nextElementSibling) {
      parentElement.insertBefore(container, likeContainer.nextElementSibling);
    } else if (likeContainer) {
      likeContainer.after(container);
    } else {
      parentElement.appendChild(container);
    }

    // Обработчик клика
    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();

      try {
        logger.info('Copy button clicked for shared capsule', { capsuleId });
        
        await this.copyCapsuleToUser(capsuleId, items, canvasData, name);

        // Добавляем визуальную обратную связь
        copyBtn.classList.add('shared');
        setTimeout(() => {
          copyBtn.classList.remove('shared');
        }, 2000);
      } catch (error) {
        logger.error('Error in copy button click handler', error);
      }
    });

    logger.info('Copy button created for shared capsule', { capsuleId });
  }

  /**
   * Очистить все динамические кнопки с экрана результата капсулы
   */
  private clearCapsuleResultButtons(): void {
    const actionsContainer = getElement('.capsule-result-actions');
    if (!actionsContainer) {
      return;
    }

    // Список всех возможных селекторов для динамических кнопок
    const buttonSelectors = [
      // Like кнопки с разными префиксами
      '.capsule-result-like-btn',
      '.shared-capsule-like-btn', 
      '.capsule-like-btn',
      '.result-like-btn',
      
      // Share кнопки с разными префиксами
      '.capsule-result-share-btn',
      '.shared-capsule-share-btn',
      '.capsule-share-btn',
      '.result-share-btn',
      
      // Copy кнопки
      '.shared-capsule-copy-btn',
      '.capsule-copy-btn',
      '.copy-btn',
      
      // Контейнеры кнопок
      '.like-container',
      '.share-container',
      '.copy-container'
    ];

    // Удаляем все найденные кнопки
    let removedCount = 0;
    buttonSelectors.forEach(selector => {
      const elements = actionsContainer.querySelectorAll(selector);
      elements.forEach(element => {
        // Удаляем родительский контейнер если он есть, иначе сам элемент
        const container = element.closest('.like-container, .share-container, .copy-container');
        if (container) {
          container.remove();
        } else {
          element.remove();
        }
        removedCount++;
      });
    });

    if (removedCount > 0) {
      logger.info('Cleared dynamic buttons from shared capsule screen', { removedCount });
    }
  }

  /**
   * Переключиться на таб капсул после закрытия shared капсулы
   */
  private switchToCapsules(): void {
    try {
      // Переключаемся на таб капсул
      const capsulesTab = getElement('#capsules-tab');
      if (capsulesTab) {
        capsulesTab.click();
        logger.info('Switched to capsules tab after closing shared capsule');
      }
    } catch (error) {
      logger.warn('Failed to switch to capsules tab', error);
    }
  }

  /**
   * Копировать капсулу другого пользователя себе
   */
  private async copyCapsuleToUser(
    originalCapsuleId: number,
    items: any[],
    canvasData: any,
    name: string
  ): Promise<void> {
    try {
      logger.info('Starting capsule copy process', { originalCapsuleId, itemsCount: items.length });

      // Показываем loading
      this.showToast('Копируем капсулу...', 'info');

      // Импортируем необходимые сервисы
      const { wardrobeService } = await import('./wardrobe/WardrobeService');
      const { capsulesService } = await import('./capsules/CapsulesService');

      // 1. Копируем вещи в гардероб пользователя
      const copiedItemIds: number[] = [];
      
      for (const item of items) {
        try {
          // Загружаем изображение вещи
          const imageResponse = await fetch(item.imageUrl);
          const imageBlob = await imageResponse.blob();
          
          // Конвертируем в base64
          const imageBase64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(imageBlob);
          });

          // Создаем классификацию из данных вещи
          const classification = {
            category: item.category,
            subtype: item.subtype,
            color: item.color,
            material: item.material,
            style: item.style,
            fit: item.fit,
            season: item.season,
            pattern: item.pattern,
            description: item.description
          };

          // Добавляем вещь в гардероб
          const newItem = await wardrobeService.addItem(imageBase64, classification);
          copiedItemIds.push(newItem.id);

          logger.info('Item copied to wardrobe', { 
            originalId: item.id, 
            newId: newItem.id,
            category: item.category 
          });

        } catch (itemError) {
          logger.error('Failed to copy item', { itemId: item.id, error: itemError });
          // Продолжаем с другими вещами
        }
      }

      if (copiedItemIds.length === 0) {
        this.showToast('Не удалось скопировать вещи', 'error');
        return;
      }

      // 2. Обновляем canvasData с новыми ID вещей
      const updatedCanvasData = this.updateCanvasDataItemIds(canvasData, items, copiedItemIds);

      // 3. Получаем thumbnail изображение из shared капсулы
      let thumbnailImage: string | undefined;
      try {
        const resultImage = getElement('#capsule-result-image') as HTMLImageElement;
        if (resultImage && resultImage.src) {
          // Конвертируем изображение в base64
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          // Создаем изображение для загрузки
          const img = new Image();
          img.crossOrigin = 'anonymous';
          
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = resultImage.src;
          });
          
          // Устанавливаем размер canvas (оптимальный для thumbnail)
          const maxSize = 800;
          const ratio = Math.min(maxSize / img.width, maxSize / img.height);
          canvas.width = img.width * ratio;
          canvas.height = img.height * ratio;
          
          // Рисуем изображение
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          // Получаем base64 в PNG для сохранения прозрачности
          thumbnailImage = canvas.toDataURL('image/png');
          
          logger.info('Thumbnail created for copied capsule', {
            originalSize: `${img.width}x${img.height}`,
            thumbnailSize: `${canvas.width}x${canvas.height}`
          });
        }
      } catch (thumbnailError) {
        logger.warn('Failed to create thumbnail for copied capsule', thumbnailError);
      }

      // 4. Создаем капсулу с скопированными вещами
      const capsuleData: any = {
        name: `${name} (копия)`,
        canvasData: updatedCanvasData,
        itemIds: copiedItemIds,
        metadata: {
          source: 'copied',
          originalCapsuleId: originalCapsuleId
        }
      };

      // Добавляем thumbnail только если он создался
      if (thumbnailImage) {
        capsuleData.thumbnailImage = thumbnailImage;
      }

      const newCapsule = await capsulesService.createCapsule(capsuleData);

      logger.info('Capsule copied successfully', { 
        originalCapsuleId, 
        newCapsuleId: newCapsule.id,
        copiedItemsCount: copiedItemIds.length 
      });

      this.showToast(`Капсула скопирована! Добавлено ${copiedItemIds.length} вещей`, 'success');

      // Обновляем кнопку копирования для показа успеха
      const copyBtn = getElement('.copy-btn');
      if (copyBtn) {
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.classList.remove('copied');
        }, 300);
      }

      // Закрываем экран и переключаемся на капсулы через небольшую задержку
      setTimeout(() => {
        // Очищаем все динамические кнопки перед закрытием
        this.clearCapsuleResultButtons();
        
        const resultScreen = getElement('#capsule-result-screen');
        if (resultScreen) {
          resultScreen.classList.add('hidden');
          resultScreen.classList.remove('show');
        }
        // Переключаемся на таб капсул чтобы показать новую капсулу
        this.switchToCapsules();
      }, 2000);

    } catch (error) {
      logger.error('Failed to copy capsule', { originalCapsuleId, error });
      this.showToast('Ошибка при копировании капсулы', 'error');
    }
  }

  /**
   * Обновляет ID вещей в canvasData при копировании
   */
  private updateCanvasDataItemIds(canvasData: any, originalItems: any[], newItemIds: number[]): any {
    try {
      const updatedCanvasData = JSON.parse(JSON.stringify(canvasData)); // Deep clone

      // Создаем маппинг старых ID на новые
      const idMapping = new Map<number, number>();
      originalItems.forEach((item, index) => {
        const newId = newItemIds[index];
        if (newId !== undefined) {
          idMapping.set(item.id, newId);
        }
      });

      // Обновляем ID в объектах canvas
      if (updatedCanvasData.objects) {
        updatedCanvasData.objects.forEach((obj: any) => {
          if (obj.wardrobeItemId && idMapping.has(obj.wardrobeItemId)) {
            obj.wardrobeItemId = idMapping.get(obj.wardrobeItemId);
          }
        });
      }

      logger.info('Canvas data updated with new item IDs', { 
        mappingsCount: idMapping.size,
        objectsCount: updatedCanvasData.objects?.length || 0
      });

      return updatedCanvasData;
    } catch (error) {
      logger.error('Failed to update canvas data item IDs', error);
      return canvasData; // Возвращаем оригинал при ошибке
    }
  }

  /**
   * Показать диалог подтверждения
   */
  async showConfirmDialog(message: string): Promise<boolean> {
    try {
      if (window.Telegram?.WebApp?.showConfirm) {
        return new Promise((resolve) => {
          window.Telegram!.WebApp.showConfirm(message, resolve);
        });
      } else {
        // Silent fallback - всегда подтверждаем
        logger.info('Silent confirm', { message });
        return true;
      }
    } catch (error) {
      logger.warn('Failed to show Telegram confirm dialog', error);
      return true; // Silent fallback
    }
  }


  /**
   * Инициализация
   * ПРИМЕЧАНИЕ: Метод оставлен для совместимости с интерфейсом UI менеджеров.
   * UICoreManager не требует инициализации, так как все компоненты создаются по требованию.
   */
  init(): void {
    // Инициализация не требуется
  }

  /**
   * Очистка ресурсов
   */
  destroy(): void {
    // Очищаем обработчики событий
    this.cleanupFunctions.forEach(cleanup => cleanup());
    this.cleanupFunctions = [];
  }
}

// Создаем глобальный экземпляр менеджера базовых компонентов
export const uiCoreManager = new UICoreManager();

// Экспортируем для обратной совместимости
export { UICoreManager as UISharedManager };
export const uiSharedManager = uiCoreManager;
