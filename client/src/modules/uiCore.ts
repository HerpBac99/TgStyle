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

          // Импортируем analysisLikesService
          const { analysisLikesService } = await import('./analysis/AnalysisLikesService');
          
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
