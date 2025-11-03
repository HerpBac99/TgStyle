/**
 * Менеджер модального окна выбора пола пользователя
 */

import { logger } from './logger';
import { api } from './api';
import { authManager } from './auth';

/**
 * Класс для управления модальным окном выбора пола
 */
class GenderSelectionManager {
  private isShown = false;
  private cleanupFunctions: (() => void)[] = [];

  /**
   * Показать модальное окно выбора пола
   */
  show(): Promise<'male' | 'female'> {
    return new Promise((resolve, reject) => {
      if (this.isShown) {
        logger.warn('Gender selection modal is already shown');
        return;
      }

      this.isShown = true;

      // Показываем модальное окно
      const modal = document.getElementById('gender-selection-modal');
      if (!modal) {
        logger.error('Gender selection modal not found in DOM');
        reject(new Error('Modal not found'));
        return;
      }

      modal.classList.remove('hidden');

      // Настраиваем обработчики событий
      this.setupEventHandlers(resolve, reject);

      logger.info('Gender selection modal shown');
    });
  }

  /**
   * Скрыть модальное окно
   */
  hide(): void {
    if (!this.isShown) {
      return;
    }

    const modal = document.getElementById('gender-selection-modal');
    if (modal) {
      modal.classList.add('hidden');
    }

    // Очищаем обработчики
    this.cleanup();
    this.isShown = false;

    logger.info('Gender selection modal hidden');
  }

  /**
   * Настроить обработчики событий
   */
  private setupEventHandlers(
    resolve: (gender: 'male' | 'female') => void,
    _reject: (error: Error) => void
  ): void {
    // Обработчик для кнопки "Женский"
    const femaleBtn = document.getElementById('gender-female-btn');
    if (femaleBtn) {
      const handleFemaleClick = async () => {
        await this.handleGenderSelection('female', resolve, _reject);
      };

      femaleBtn.addEventListener('click', handleFemaleClick);
      this.cleanupFunctions.push(() => {
        femaleBtn.removeEventListener('click', handleFemaleClick);
      });
    }

    // Обработчик для кнопки "Мужской"
    const maleBtn = document.getElementById('gender-male-btn');
    if (maleBtn) {
      const handleMaleClick = async () => {
        await this.handleGenderSelection('male', resolve, _reject);
      };

      maleBtn.addEventListener('click', handleMaleClick);
      this.cleanupFunctions.push(() => {
        maleBtn.removeEventListener('click', handleMaleClick);
      });
    }

    // Предотвращаем закрытие по клику на overlay (пользователь должен выбрать пол)
    const overlay = document.querySelector('.gender-selection-overlay');
    if (overlay) {
      const handleOverlayClick = (event: Event) => {
        event.stopPropagation();
        // Не закрываем модальное окно - пользователь должен выбрать пол
      };

      overlay.addEventListener('click', handleOverlayClick);
      this.cleanupFunctions.push(() => {
        overlay.removeEventListener('click', handleOverlayClick);
      });
    }
  }

  /**
   * Обработать выбор пола
   */
  private async handleGenderSelection(
    gender: 'male' | 'female',
    resolve: (gender: 'male' | 'female') => void,
    _reject: (error: Error) => void
  ): Promise<void> {
    try {
      logger.info('Gender selected', { gender });

      // Добавляем визуальную обратную связь
      this.showLoadingState();

      // Отправляем запрос на сервер
      const response = await api.updateGender(gender);

      if (response.success) {
        // Обновляем данные пользователя в authManager
        if (response.user) {
          authManager.updateUserLimits({
            analysesLeft: response.user.analysesLeft,
            totalAnalyses: response.user.totalAnalyses
          });
        }

        // Скрываем модальное окно
        this.hide();

        // Возвращаем результат
        resolve(gender);

        logger.info('Gender updated successfully', { gender });
      } else {
        throw new Error(response.error || 'Failed to update gender');
      }
    } catch (error) {
      logger.error('Failed to update gender', { gender, error });
      
      // Скрываем состояние загрузки
      this.hideLoadingState();
      
      // Показываем ошибку пользователю
      this.showError('Не удалось сохранить выбор. Попробуйте еще раз.');
      
      // Не закрываем модальное окно, позволяем пользователю попробовать снова
    }
  }

  /**
   * Показать состояние загрузки
   */
  private showLoadingState(): void {
    const femaleBtn = document.getElementById('gender-female-btn');
    const maleBtn = document.getElementById('gender-male-btn');

    if (femaleBtn) {
      femaleBtn.style.opacity = '0.6';
      (femaleBtn as HTMLButtonElement).disabled = true;
    }

    if (maleBtn) {
      maleBtn.style.opacity = '0.6';
      (maleBtn as HTMLButtonElement).disabled = true;
    }
  }

  /**
   * Скрыть состояние загрузки
   */
  private hideLoadingState(): void {
    const femaleBtn = document.getElementById('gender-female-btn');
    const maleBtn = document.getElementById('gender-male-btn');

    if (femaleBtn) {
      femaleBtn.style.opacity = '1';
      (femaleBtn as HTMLButtonElement).disabled = false;
    }

    if (maleBtn) {
      maleBtn.style.opacity = '1';
      (maleBtn as HTMLButtonElement).disabled = false;
    }
  }

  /**
   * Показать ошибку пользователю
   */
  private showError(message: string): void {
    // Простое уведомление через alert (можно заменить на более красивое)
    alert(message);
  }

  /**
   * Очистить обработчики событий
   */
  private cleanup(): void {
    this.cleanupFunctions.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        logger.error('Error during gender selection cleanup', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });
    this.cleanupFunctions = [];
  }

  /**
   * Проверить, показано ли модальное окно
   */
  isModalShown(): boolean {
    return this.isShown;
  }

  /**
   * Уничтожить менеджер
   */
  destroy(): void {
    this.hide();
    this.cleanup();
    logger.info('GenderSelectionManager destroyed');
  }

  /**
   * Получить статус менеджера (для отладки)
   */
  getStatus() {
    return {
      isShown: this.isShown,
      cleanupFunctionsCount: this.cleanupFunctions.length
    };
  }
}

// Создаем глобальный экземпляр менеджера
export const genderSelectionManager = new GenderSelectionManager();

export default genderSelectionManager;