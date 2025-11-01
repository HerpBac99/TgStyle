/**
 * Модальное окно для отображения сгенерированных капсул
 * Показывает 3 варианта капсул с превью, описаниями и рекомендациями
 */

import { logger } from '../logger';
import type { GeneratedCapsule, GenerationModalCallbacks } from '@/types/capsules';

/**
 * Класс для управления модальным окном генерации капсул
 */
export class GenerationModal {
  private modal: HTMLElement | null = null;
  private callbacks: GenerationModalCallbacks = {};
  private currentCapsules: GeneratedCapsule[] = [];
  private cleanupFunctions: (() => void)[] = [];

  constructor() {
    this.modal = document.getElementById('generation-modal');
    if (!this.modal) {
      logger.error('Generation modal element not found');
    }
  }

  /**
   * Показать модальное окно с вариантами капсул
   */
  show(capsules: GeneratedCapsule[]): void {
    if (!this.modal) {
      logger.error('Cannot show modal: element not found');
      return;
    }

    if (!capsules || capsules.length === 0) {
      logger.error('Cannot show modal: no capsules provided');
      return;
    }

    this.currentCapsules = capsules;
    this.renderCapsules(capsules);
    this.setupEventListeners();
    
    this.modal.classList.remove('hidden');
    logger.info('Generation modal shown', { capsulesCount: capsules.length });

    // Тактильная обратная связь
    if (window.Telegram?.WebApp?.HapticFeedback) {
      window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
  }

  /**
   * Скрыть модальное окно
   */
  hide(): void {
    if (!this.modal) return;

    this.modal.classList.add('hidden');
    this.cleanup();
    logger.info('Generation modal hidden');
  }

  /**
   * Установить callback для выбора капсулы
   */
  onSelect(callback: (capsule: GeneratedCapsule) => void): void {
    this.callbacks.onSelect = callback;
  }

  /**
   * Установить callback для регенерации
   */
  onRegenerate(callback: () => void): void {
    this.callbacks.onRegenerate = callback;
  }

  /**
   * Установить callback для отмены
   */
  onCancel(callback: () => void): void {
    this.callbacks.onCancel = callback;
  }

  /**
   * Отрисовать карточки капсул
   */
  private renderCapsules(capsules: GeneratedCapsule[]): void {
    const container = this.modal?.querySelector('.generation-variants');
    if (!container) {
      logger.error('Generation variants container not found');
      return;
    }

    // Очищаем контейнер
    container.innerHTML = '';

    // Создаем карточки для каждой капсулы
    capsules.forEach((capsule, index) => {
      const card = this.createCapsuleCard(capsule, index);
      container.appendChild(card);
    });

    logger.info('Capsules rendered', { count: capsules.length });
  }

  /**
   * Создать карточку капсулы
   */
  private createCapsuleCard(capsule: GeneratedCapsule, index: number): HTMLElement {
    const card = document.createElement('div');
    card.className = 'generation-card';
    card.dataset['capsuleIndex'] = index.toString();

    // Превью изображение
    const preview = document.createElement('div');
    preview.className = 'generation-preview';

    if (capsule.previewDataUrl) {
      const img = document.createElement('img');
      img.src = capsule.previewDataUrl;
      img.alt = capsule.name;
      img.className = 'generation-preview-image';
      preview.appendChild(img);
    } else {
      // Показываем плейсхолдер с вещами
      const placeholder = this.createItemsPlaceholder(capsule.items);
      preview.appendChild(placeholder);
    }

    card.appendChild(preview);

    // Информация о капсуле
    const info = document.createElement('div');
    info.className = 'generation-info';

    // Название
    const title = document.createElement('h3');
    title.className = 'generation-title';
    title.textContent = capsule.name;
    info.appendChild(title);

    // Описание
    const description = document.createElement('p');
    description.className = 'generation-description';
    description.textContent = capsule.description;
    info.appendChild(description);

    // Обоснование выбора
    if (capsule.reasoning) {
      const reasoning = document.createElement('p');
      reasoning.className = 'generation-reasoning';
      reasoning.textContent = `💡 ${capsule.reasoning}`;
      info.appendChild(reasoning);
    }

    // Рекомендации
    if (capsule.recommendations) {
      const recommendations = document.createElement('p');
      recommendations.className = 'generation-recommendations';
      recommendations.textContent = `✨ ${capsule.recommendations}`;
      info.appendChild(recommendations);
    }

    // Предупреждение о схожести
    if (capsule.isUnique === false) {
      const warning = document.createElement('p');
      warning.className = 'generation-warning';
      warning.textContent = '⚠️ Похожая капсула уже существует';
      info.appendChild(warning);
    }

    card.appendChild(info);

    return card;
  }

  /**
   * Создать плейсхолдер с миниатюрами вещей
   */
  private createItemsPlaceholder(items: any[]): HTMLElement {
    const placeholder = document.createElement('div');
    placeholder.className = 'generation-items-placeholder';

    // Показываем до 4 вещей
    const displayItems = items.slice(0, 4);
    displayItems.forEach(item => {
      const itemImg = document.createElement('img');
      itemImg.src = item.imageUrl;
      itemImg.alt = item.name || 'Вещь';
      itemImg.className = 'generation-item-thumb';
      placeholder.appendChild(itemImg);
    });

    // Если вещей больше 4, показываем счетчик
    if (items.length > 4) {
      const more = document.createElement('div');
      more.className = 'generation-items-more';
      more.textContent = `+${items.length - 4}`;
      placeholder.appendChild(more);
    }

    return placeholder;
  }

  /**
   * Настроить обработчики событий
   */
  private setupEventListeners(): void {
    if (!this.modal) return;

    // Клик по карточке капсулы
    const cards = this.modal.querySelectorAll('.generation-card');
    cards.forEach(card => {
      const handleCardClick = () => {
        const index = parseInt(card.getAttribute('data-capsule-index') || '0');
        const capsule = this.currentCapsules[index];
        
        if (capsule) {
          logger.info('Capsule selected', { index, name: capsule.name });
          
          // Тактильная обратная связь
          if (window.Telegram?.WebApp?.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
          }

          if (this.callbacks.onSelect) {
            this.callbacks.onSelect(capsule);
          }
          this.hide();
        }
      };

      card.addEventListener('click', handleCardClick);
      this.cleanupFunctions.push(() => {
        card.removeEventListener('click', handleCardClick);
      });
    });

    // Кнопка регенерации
    const regenerateBtn = this.modal.querySelector('#regenerate-btn');
    if (regenerateBtn) {
      const handleRegenerate = () => {
        logger.info('Regenerate button clicked');
        
        // Тактильная обратная связь
        if (window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
        }

        if (this.callbacks.onRegenerate) {
          this.callbacks.onRegenerate();
        }
        this.hide();
      };

      regenerateBtn.addEventListener('click', handleRegenerate);
      this.cleanupFunctions.push(() => {
        regenerateBtn.removeEventListener('click', handleRegenerate);
      });
    }

    // Кнопка отмены
    const cancelBtn = this.modal.querySelector('#cancel-generation-btn');
    if (cancelBtn) {
      const handleCancel = () => {
        logger.info('Cancel button clicked');
        
        if (this.callbacks.onCancel) {
          this.callbacks.onCancel();
        }
        this.hide();
      };

      cancelBtn.addEventListener('click', handleCancel);
      this.cleanupFunctions.push(() => {
        cancelBtn.removeEventListener('click', handleCancel);
      });
    }

    const closebth = this.modal.querySelector('#generation-modal-close');
    if (closebth) {
      const handleCancel = () => {
        logger.info('Cancel button clicked');
        
        if (this.callbacks.onCancel) {
          this.callbacks.onCancel();
        }
        this.hide();
      };

      closebth.addEventListener('click', handleCancel);
      this.cleanupFunctions.push(() => {
        closebth.removeEventListener('click', handleCancel);
      });
    }

    // Клик по overlay для закрытия
    const overlay = this.modal.querySelector('.modal-overlay');
    if (overlay) {
      const handleOverlayClick = () => {
        logger.info('Modal overlay clicked');
        
        if (this.callbacks.onCancel) {
          this.callbacks.onCancel();
        }
        this.hide();
      };

      overlay.addEventListener('click', handleOverlayClick);
      this.cleanupFunctions.push(() => {
        overlay.removeEventListener('click', handleOverlayClick);
      });
    }
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

  /**
   * Уничтожить модальное окно
   */
  destroy(): void {
    this.cleanup();
    this.currentCapsules = [];
    this.callbacks = {};
  }
}

// Экспортируем singleton экземпляр
export const generationModal = new GenerationModal();
