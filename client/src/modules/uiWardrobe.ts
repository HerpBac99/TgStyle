/**
 * Модуль для управления UI гардероба
 * Выбор пола, отображение силуэта, управление гардеробом
 */

import type {
  TelegramWebApp,
} from '@/types/index';
import { logger } from './logger';

// Объявляем глобальную переменную Telegram
declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

/**
 * Типы для гардероба
 */
type Gender = 'male' | 'female';

/**
 * Интерфейс состояния гардероба
 */
interface WardrobeState {
  selectedGender: Gender | null;
  isInitialized: boolean;
}

/**
 * Класс для управления UI гардероба
 */
export class UIWardrobeManager {
  private state: WardrobeState = {
    selectedGender: null,
    isInitialized: false,
  };

  private cleanupFunctions: (() => void)[] = [];

  constructor() {
    this.initializeState();
  }

  /**
   * Инициализация состояния из localStorage
   */
  private initializeState(): void {
    const savedGender = localStorage.getItem('wardrobe_gender') as Gender | null;
    this.state.selectedGender = savedGender;
    this.state.isInitialized = true;

    logger.info('Wardrobe state initialized', {
      selectedGender: savedGender,
      isInitialized: true,
    });
  }

  /**
   * Настройка обработчиков событий
   */
  private setupEventListeners(): void {
    const changeBtn = document.getElementById('change-gender-btn') as HTMLButtonElement;

    logger.info('Setting up event listeners, button found:', !!changeBtn);

    if (changeBtn) {
      logger.info('Button element:', changeBtn);
      logger.info('Button visibility:', window.getComputedStyle(changeBtn).visibility);
      logger.info('Button display:', window.getComputedStyle(changeBtn).display);
      logger.info('Button z-index:', window.getComputedStyle(changeBtn).zIndex);

      // Проверяем что обработчик добавлен правильно
      logger.info('Adding click handler to button:', changeBtn);
      logger.info('Button outerHTML:', changeBtn.outerHTML);

      const handleChangeClick = async (event: Event) => {
        logger.info('=== BUTTON CLICK DETECTED ===');
        logger.info('Raw event:', event);
        logger.info('Event type:', event.type);
        logger.info('Event target:', event.target);
        logger.info('Event currentTarget:', event.currentTarget);

        event.preventDefault();
        event.stopPropagation();

        logger.info('Change gender button clicked');

        // Скрываем текущий силуэт
        const silhouetteContainer = document.getElementById('wardrobe-silhouette-container') as HTMLElement;
        if (silhouetteContainer) {
          silhouetteContainer.classList.add('hidden');
        }

        // Показываем модальное окно выбора пола
        try {
          const newGender = await this.showGenderSelectionModal();
          this.showWardrobeSilhouette(newGender);
        } catch (error) {
          logger.warn('Gender change cancelled, showing previous silhouette', error);
          // Если отменили, показываем предыдущий силуэт обратно
          if (this.state.selectedGender) {
            this.showWardrobeSilhouette(this.state.selectedGender);
          }
        }
      };

      changeBtn.addEventListener('click', handleChangeClick);
      logger.info('Event listener added to button');

      // Добавляем глобальный обработчик для отладки
      const globalClickHandler = (event: Event) => {
        const target = event.target as HTMLElement;
        if (target && (target.id === 'change-gender-btn' || target.closest('#change-gender-btn'))) {
          logger.info('=== GLOBAL CLICK DETECTED ON BUTTON ===');
          logger.info('Target element:', target);
          logger.info('Target tagName:', target.tagName);
          logger.info('Target id:', target.id);
          logger.info('Target className:', target.className);
        }
      };

      document.addEventListener('click', globalClickHandler);

      // Сохраняем функцию очистки для глобального обработчика
      this.cleanupFunctions.push(() => {
        document.removeEventListener('click', globalClickHandler);
        logger.info('Global click handler removed');
      });

      // Сохраняем функцию очистки
      this.cleanupFunctions.push(() => {
        changeBtn.removeEventListener('click', handleChangeClick);
        logger.info('Event listener removed from button');
      });

      logger.info('Change gender button event listener added');
    } else {
      logger.warn('Change gender button not found');
    }
  }

  /**
   * Проверка, первый ли раз открываем гардероб
   */
  isFirstOpen(): boolean {
    return this.state.selectedGender === null;
  }

  /**
   * Показать модальное окно выбора пола
   */
  showGenderSelectionModal(): Promise<Gender> {
    return new Promise((resolve, reject) => {
      const modal = document.getElementById('gender-selection-modal') as HTMLElement;

      if (!modal) {
        reject(new Error('Модальное окно выбора пола не найдено'));
        return;
      }

      logger.info('Showing gender selection modal');

      // Показываем модальное окно
      modal.classList.remove('hidden');

      // Функция обработки клика
      const handleClick = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();

        const target = event.target as HTMLElement;
        const genderCard = target.closest('.gender-card') as HTMLElement;

        if (genderCard) {
          const gender = genderCard.dataset['gender'] as Gender;
          logger.info('Gender selected from modal', { gender });

          // Убираем обработчик перед вызовом resolve
          modal.removeEventListener('click', handleClick);

          // Скрываем модальное окно
          modal.classList.add('hidden');

          // Обрабатываем выбор пола
          this.handleGenderSelected(gender);
          resolve(gender);
        } else if (target.classList.contains('gender-selection-overlay')) {
          logger.info('Gender selection cancelled by overlay click');

          // Убираем обработчик перед вызовом reject
          modal.removeEventListener('click', handleClick);

          // Скрываем модальное окно
          modal.classList.add('hidden');
          reject(new Error('Выбор пола отменен'));
        }
      };

      // Добавляем обработчик кликов
      modal.addEventListener('click', handleClick);

      // Сохраняем функцию очистки на случай, если Promise будет отменен извне
      this.cleanupFunctions.push(() => {
        modal.removeEventListener('click', handleClick);
        modal.classList.add('hidden');
      });
    });
  }

  /**
   * Обработка выбора пола
   */
  private handleGenderSelected(gender: Gender): void {
    // Сохраняем выбор в localStorage
    localStorage.setItem('wardrobe_gender', gender);
    this.state.selectedGender = gender;

    logger.info('Gender selected and saved', { gender });
  }

  /**
   * Показать силуэт в гардеробе
   */
  showWardrobeSilhouette(gender: Gender): void {
    const silhouetteContainer = document.getElementById('wardrobe-silhouette-container') as HTMLElement;
    const silhouetteElement = document.getElementById('wardrobe-silhouette') as HTMLElement;

    if (!silhouetteContainer || !silhouetteElement) {
      logger.error('Wardrobe silhouette elements not found');
      return;
    }

    // Показываем контейнер силуэта и скрываем placeholder если он есть
    silhouetteContainer.classList.remove('hidden');

    // Очищаем innerHTML (больше не используем SVG)
    silhouetteElement.innerHTML = '';

    // Добавляем класс для стилизации по полу (CSS сам установит background-image)
    silhouetteElement.className = `wardrobe-silhouette ${gender}-silhouette`;

    logger.info('Wardrobe silhouette displayed', { gender });
  }


  /**
   * Получить текущий выбранный пол
   */
  getSelectedGender(): Gender | null {
    return this.state.selectedGender;
  }

  /**
   * Обработать открытие гардероба
   */
  async handleWardrobeOpen(): Promise<void> {
    if (this.isFirstOpen()) {
      // Первый раз открываем гардероб - показываем выбор пола
      try {
        const gender = await this.showGenderSelectionModal();
        this.showWardrobeSilhouette(gender);
        // Настраиваем обработчики после показа силуэта
        this.setupEventListeners();
      } catch (error) {
        logger.warn('Gender selection cancelled, showing placeholder', error);
        this.showWardrobePlaceholder();
      }
    } else {
      // Гардероб уже настроен - показываем соответствующий силуэт
      this.showWardrobeSilhouette(this.state.selectedGender!);
      // Настраиваем обработчики после показа силуэта
      this.setupEventListeners();
    }
  }

  /**
   * Показать заглушку гардероба (для обратной совместимости)
   */
  private showWardrobePlaceholder(): void {
    // Скрываем контейнер силуэта
    const silhouetteContainer = document.getElementById('wardrobe-silhouette-container') as HTMLElement;
    if (silhouetteContainer) {
      silhouetteContainer.classList.add('hidden');
    }

    logger.info('Wardrobe placeholder displayed');
  }

  /**
   * Очистка ресурсов
   */
  destroy(): void {
    logger.info('Destroying wardrobe UI manager');

    // Выполняем все функции очистки
    this.cleanupFunctions.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        logger.error('Error during wardrobe cleanup', error);
      }
    });

    this.cleanupFunctions = [];
  }

  /**
   * Получить статистику менеджера гардероба
   */
  getStats() {
    return {
      selectedGender: this.state.selectedGender,
      isInitialized: this.state.isInitialized,
      isFirstOpen: this.isFirstOpen(),
      cleanupFunctionsCount: this.cleanupFunctions.length,
    };
  }
}

// Создаем глобальный экземпляр менеджера гардероба
export const uiWardrobeManager = new UIWardrobeManager();
