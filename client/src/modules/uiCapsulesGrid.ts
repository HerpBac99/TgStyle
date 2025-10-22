/**
 * Грид с капсулами стиля
 * Отображение сохраненных образов
 */

import { logger } from './logger';
import { capsuleLikesService } from './capsules/CapsuleLikesService';
import { sharingService } from './shared/SharingService';

/**
 * Интерфейс для капсулы стиля
 */
export interface StyleCapsule {
  id: number;
  name: string;
  description?: string;
  thumbnailUrl: string;
  createdAt: string;
  likesCount?: number;
  viewsCount?: number;
  isLiked?: boolean;
  items?: any[]; // Элементы одежды в капсуле (опционально для грида)
}

/**
 * Конфигурация для грида капсул
 */
export interface CapsulesGridConfig {
  onAdd: () => void;           // Callback при клике на "Добавить капсулу"
  onView: (capsuleId: number) => void;  // Callback при клике на капсулу
  onDelete: (capsuleId: number) => void; // Callback при удалении капсулы
}

/**
 * Класс для управления гридом капсул
 */
export class UICapsulesGrid {
  private config: CapsulesGridConfig;
  private cleanupFunctions: (() => void)[] = [];
  private capsules: StyleCapsule[] = [];

  constructor(config: CapsulesGridConfig) {
    this.config = config;
  }

  /**
   * Показать грид капсул
   */
  show(): void {
    const container = document.getElementById('capsules-clothes-container');
    if (container) {
      container.classList.remove('hidden');
      logger.info('Capsules grid container shown');
    } else {
      logger.error('Capsules grid container not found');
    }
  }

  /**
   * Скрыть грид капсул
   */
  hide(): void {
    const container = document.getElementById('capsules-clothes-container');
    if (container) {
      container.classList.add('hidden');
      logger.info('Capsules grid container hidden');
    }
  }

  /**
   * Отрисовать грид с капсулами
   * 
   * @param capsules - Массив капсул для отображения
   */
  render(capsules: StyleCapsule[]): void {
    this.capsules = capsules;

    const grid = document.getElementById('capsules-clothes-grid');
    if (!grid) {
      logger.error('Capsules grid element not found');
      return;
    }

    // Очищаем обработчики перед перерисовкой
    this.cleanup();

    // Сохраняем кнопку "Создать" из HTML
    const addBtn = document.getElementById('add-capsule-btn');

    // Очищаем грид
    grid.innerHTML = '';

    // Возвращаем кнопку "Создать" обратно первой
    if (addBtn) {
      grid.appendChild(addBtn);
    }

    // Добавляем карточки капсул после кнопки
    capsules.forEach(capsule => {
      const card = this.createCapsuleCard(capsule);
      grid.appendChild(card);
    });

    // Настраиваем обработчик кнопки добавления
    this.setupAddButton();

    logger.info(`Capsules grid rendered with ${capsules.length} capsules`);
  }

  /**
   * Создать карточку капсулы
   */
  private createCapsuleCard(capsule: StyleCapsule): HTMLElement {
    const card = document.createElement('div');
    card.className = 'capsules-item-card';
    card.dataset['capsuleId'] = capsule.id.toString();

    const content = document.createElement('div');
    content.className = 'capsules-item-card-content';

    const image = document.createElement('img');
    image.className = 'capsules-item-image';
    image.src = capsule.thumbnailUrl;
    image.alt = capsule.name;

    content.appendChild(image);

    // Создаем footer с лайками и sharing
    const footer = document.createElement('div');
    footer.className = 'capsules-item-footer';

    // Добавляем лайки через сервис
    capsuleLikesService.createLikeComponent(
      footer,
      capsule.id,
      {
        isLiked: !!capsule.isLiked,
        likesCount: capsule.likesCount || 0
      },
      'capsule'
    );

    // Добавляем sharing через сервис
    sharingService.createShareButton(
      footer,
      {
        type: 'capsule',
        image: capsule.thumbnailUrl,
        text: capsule.description || capsule.name || 'Моя капсула стиля',
        title: '👗 Капсула стиля',
        metadata: {
          capsuleId: capsule.id
        }
      },
      'capsule'
    );

    content.appendChild(footer);
    card.appendChild(content);

    // Обработчики кликов с разной длительностью
    let pressStartTime = 0;
    let longPressTimer: number | null = null;
    let longPressTriggered = false;
    let startPos: { x: number; y: number } | null = null;
    const SCROLL_THRESHOLD = 10;

    const startPress = (e: MouseEvent | TouchEvent) => {
      // Не сбрасываем longPressTriggered сразу, чтобы избежать ложных срабатываний
      // после закрытия confirm диалога
      if (!longPressTriggered) {
        pressStartTime = Date.now();
      }

      if (e instanceof TouchEvent && e.touches[0]) {
        startPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e instanceof MouseEvent) {
        startPos = { x: e.clientX, y: e.clientY };
      }

      longPressTimer = window.setTimeout(() => {
        longPressTriggered = true;

        // Тактильная обратная связь
        if (window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('warning');
        }

        if (confirm('Удалить эту капсулу?')) {
          logger.info('Capsule delete confirmed', { capsuleId: capsule.id });
          this.config.onDelete(capsule.id);
        }
      }, 800);
    };

    const endPress = (e: MouseEvent | TouchEvent) => {
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }

      if (!startPos) return;

      const pressDuration = Date.now() - pressStartTime;

      let endPos: { x: number; y: number } | null = null;
      if (e instanceof TouchEvent && e.changedTouches[0]) {
        endPos = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      } else if (e instanceof MouseEvent) {
        endPos = { x: e.clientX, y: e.clientY };
      }

      if (!endPos) return;

      const deltaX = Math.abs(endPos.x - startPos.x);
      const deltaY = Math.abs(endPos.y - startPos.y);
      const hasMoved = deltaX > SCROLL_THRESHOLD || deltaY > SCROLL_THRESHOLD;

      const target = e.target as HTMLElement;
      // Проверяем что клик НЕ на кнопку лайка, share или их содержимое
      const isInteractiveElement = target.closest('.like-container') || target.closest('.share-container');

      // Открываем превью только если: короткое нажатие, не было долгого нажатия, не было движения, не интерактивный элемент
      if (!longPressTriggered && !hasMoved && pressDuration < 500 && !isInteractiveElement) {
        // Легкая вибрация при открытии превью
        if (window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
        }
        logger.info('Capsule card clicked', { capsuleId: capsule.id });
        this.config.onView(capsule.id);
      }

      // Сбрасываем флаг долгого нажатия с задержкой, чтобы избежать ложных срабатываний
      if (longPressTriggered) {
        setTimeout(() => {
          longPressTriggered = false;
        }, 100);
      }
    };

    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!startPos) return;

      let currentPos: { x: number; y: number } | null = null;
      if (e instanceof TouchEvent && e.touches[0]) {
        currentPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e instanceof MouseEvent) {
        currentPos = { x: e.clientX, y: e.clientY };
      }

      if (!currentPos) return;

      const deltaX = Math.abs(currentPos.x - startPos.x);
      const deltaY = Math.abs(currentPos.y - startPos.y);

      if (deltaX > SCROLL_THRESHOLD || deltaY > SCROLL_THRESHOLD) {
        if (longPressTimer !== null) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      }
    };

    const cancelPress = () => {
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      longPressTriggered = false;
    };

    card.addEventListener('mousedown', startPress);
    card.addEventListener('mouseup', endPress);
    card.addEventListener('mouseleave', cancelPress);
    card.addEventListener('touchstart', startPress);
    card.addEventListener('touchend', endPress);
    card.addEventListener('touchmove', handleMove);
    card.addEventListener('mousemove', handleMove);

    // Добавляем в cleanup функции
    this.cleanupFunctions.push(() => {
      card.removeEventListener('mousedown', startPress);
      card.removeEventListener('mouseup', endPress);
      card.removeEventListener('mouseleave', cancelPress);
      card.removeEventListener('touchstart', startPress);
      card.removeEventListener('touchend', endPress);
      card.removeEventListener('touchmove', handleMove);
      card.removeEventListener('mousemove', handleMove);
    });

    return card;
  }

  /**
   * Настроить обработчик кнопки добавления
   */
  private setupAddButton(): void {
    const addBtn = document.getElementById('add-capsule-btn');

    if (!addBtn) {
      logger.warn('Add capsule button not found');
      return;
    }

    const handleAdd = () => {
      logger.info('Add capsule button clicked');
      this.config.onAdd();
    };

    addBtn.addEventListener('click', handleAdd);

    this.cleanupFunctions.push(() => {
      addBtn.removeEventListener('click', handleAdd);
    });
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
   * Получить статус грида (для отладки)
   */
  getStatus() {
    return {
      capsulesCount: this.capsules.length,
      cleanupFunctionsCount: this.cleanupFunctions.length,
      isVisible: !document.getElementById('capsules-clothes-container')?.classList.contains('hidden')
    };
  }

  /**
   * Очистка ресурсов
   */
  destroy(): void {
    logger.info('Destroying UICapsulesGrid');
    this.cleanup();
    this.capsules = [];
  }
}
