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

    // Очищаем грид, сохраняем только кнопку добавления
    const addBtn = document.getElementById('add-capsule-btn');
    grid.innerHTML = '';
    if (addBtn) {
      grid.appendChild(addBtn);
    }

    // Добавляем карточки капсул
    capsules.forEach(capsule => {
      const card = this.createCapsuleCard(capsule);
      grid.insertBefore(card, addBtn); // Вставляем перед кнопкой добавления
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

    // Обработчик клика для просмотра капсулы (исключаем лайки и sharing)
    const handleClick = (e: Event) => {
      const target = e.target as HTMLElement;
      // Проверяем что клик НЕ на кнопку лайка, share или их содержимое
      if (!target.closest('.like-container') && !target.closest('.share-container')) {
        logger.info('Capsule card clicked', { capsuleId: capsule.id });
        this.config.onView(capsule.id);
      }
    };

    card.addEventListener('click', handleClick);

    // Обработчик удаления капсулы (долгое нажатие)
    let longPressTimer: number;

    const startLongPress = () => {
      longPressTimer = window.setTimeout(() => {
        if (confirm('Удалить эту капсулу?')) {
          logger.info('Capsule delete confirmed', { capsuleId: capsule.id });
          this.config.onDelete(capsule.id);
        }
      }, 800); // 800ms для долгого нажатия
    };

    const cancelLongPress = () => {
      clearTimeout(longPressTimer);
    };

    card.addEventListener('mousedown', startLongPress);
    card.addEventListener('mouseup', cancelLongPress);
    card.addEventListener('mouseleave', cancelLongPress);
    card.addEventListener('touchstart', startLongPress);
    card.addEventListener('touchend', cancelLongPress);

    // Добавляем в cleanup функции
    this.cleanupFunctions.push(() => {
      card.removeEventListener('click', handleClick);
      card.removeEventListener('mousedown', startLongPress);
      card.removeEventListener('mouseup', cancelLongPress);
      card.removeEventListener('mouseleave', cancelLongPress);
      card.removeEventListener('touchstart', startLongPress);
      card.removeEventListener('touchend', cancelLongPress);
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
