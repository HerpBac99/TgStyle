/**
 * Менеджер выбора вещей для капсул
 * Управляет модальным окном выбора вещей из гардероба
 * Переиспользуется для создания новых капсул и редактирования существующих
 */

import { logger } from '../logger';
import { WardrobeItem } from '@/types/wardrobe';
import { wardrobeService } from '../wardrobe/WardrobeService';
import { CapsuleErrorHandler } from './CapsuleErrorHandler';

/**
 * Конфигурация для CapsuleSelectionManager
 */
export interface CapsuleSelectionConfig {
  modalId?: string;
  gridId?: string;
  filtersId?: string;
  addBtnId?: string;
  closeBtnId?: string;
  nextBtnId?: string;
  onConfirm?: (selectedItems: WardrobeItem[]) => void;
  onCancel?: () => void;
  onAddItem?: () => void;
}

/**
 * Менеджер выбора вещей для капсул
 */
export class CapsuleSelectionManager {
  // Конфигурация
  private config: CapsuleSelectionConfig;
  
  // Состояние
  private selectedItems: WardrobeItem[] = [];
  private wardrobeItems: WardrobeItem[] = [];
  private isVisible: boolean = false;
  
  // Cleanup функции
  private cleanupFunctions: (() => void)[] = [];

  constructor(config: CapsuleSelectionConfig = {}) {
    this.config = {
      modalId: config.modalId || 'capsules-modal',
      gridId: config.gridId || 'capsules-modal-clothes-grid',
      filtersId: config.filtersId || 'capsules-modal-filters',
      addBtnId: config.addBtnId || 'capsules-modal-add-item-btn',
      closeBtnId: config.closeBtnId || 'capsules-modal-close',
      nextBtnId: config.nextBtnId || 'capsules-next-btn',
      ...(config.onConfirm && { onConfirm: config.onConfirm }),
      ...(config.onCancel && { onCancel: config.onCancel })
    };

    logger.info('CapsuleSelectionManager initialized', { config: this.config });
  }

  /**
   * Показать модальное окно выбора вещей
   * @param preselectedIds - ID предварительно выбранных вещей (для редактирования)
   * @returns Promise с выбранными вещами
   */
  async show(preselectedIds?: number[]): Promise<WardrobeItem[]> {
    return new Promise(async (resolve) => {
      await CapsuleErrorHandler.handleWithFallback(
        async () => {
          logger.info('Showing capsule selection modal', { preselectedIds });

          // Сбрасываем состояние
          this.selectedItems = [];
          this.isVisible = true;

          // Показываем модальное окно
          const modal = document.getElementById(this.config.modalId!);
          if (!modal) {
            throw new Error(`Modal not found: ${this.config.modalId}`);
          }
          modal.classList.remove('hidden');

          // ОПТИМИЗАЦИЯ: Загружаем гардероб через общий сервис вместо прямого вызова WardrobeManager
          this.wardrobeItems = await wardrobeService.loadWardrobe();
          
          // Отправляем событие для рендеринга грида
          window.dispatchEvent(new CustomEvent('wardrobe:render-requested', {
            detail: {
              gridId: this.config.gridId,
              filtersId: this.config.filtersId,
              items: this.wardrobeItems,
              mode: 'selection' // Режим выбора для капсул
            }
          }));

          // Слушаем событие завершения рендеринга для применения предвыбора
          if (preselectedIds && preselectedIds.length > 0) {
            const handleGridRendered = () => {
              this.selectedItems.forEach(item => {
                const cardElement = document.querySelector(
                  `#${this.config.gridId} [data-item-id="${item.id}"]`
                );
                if (cardElement) {
                  cardElement.classList.add('selected');
                }
              });
              window.removeEventListener('wardrobe:grid-rendered', handleGridRendered);
            };
            window.addEventListener('wardrobe:grid-rendered', handleGridRendered);
          }

          logger.info('Wardrobe loaded for selection', {
            itemsCount: this.wardrobeItems.length
          });

          // Устанавливаем предварительно выбранные вещи (если есть)
          if (preselectedIds && preselectedIds.length > 0) {
            this.selectedItems = this.wardrobeItems.filter(item => 
              preselectedIds.includes(item.id)
            );

            // Отмечаем выбранные карточки визуально после рендеринга грида
            // Используем setTimeout чтобы дождаться завершения рендеринга DOM
            setTimeout(() => {
              this.selectedItems.forEach(item => {
                const cardElement = document.querySelector(
                  `#${this.config.gridId} [data-item-id="${item.id}"]`
                );
                if (cardElement) {
                  cardElement.classList.add('selected');
                }
              });
            }, 100);

            logger.info('Preselected items set', {
              count: this.selectedItems.length,
              ids: this.selectedItems.map(item => item.id)
            });
          }

          // Обновляем состояние кнопки "Далее"
          this.updateNextButtonState();

          // Настраиваем обработчики
          this.setupEventHandlers(resolve);

          logger.info('Capsule selection modal shown', {
            itemsCount: this.wardrobeItems.length,
            selectedCount: this.selectedItems.length
          });
        },
        () => {
          // Fallback: скрываем модальное окно и возвращаем пустой массив
          this.isVisible = false;
          this.hide();
          resolve([]);
        },
        CapsuleErrorHandler.createContext('Показ модального окна выбора вещей', {
          additionalData: { preselectedCount: preselectedIds?.length || 0 }
        })
      );
    });
  }

  /**
   * Скрыть модальное окно
   */
  hide(): void {
    logger.info('Hiding capsule selection modal');

    const modal = document.getElementById(this.config.modalId!);
    if (modal) {
      modal.classList.add('hidden');
    }

    // Очищаем обработчики
    this.cleanupFunctions.forEach(cleanup => cleanup());
    this.cleanupFunctions = [];

    this.isVisible = false;
    this.selectedItems = [];

    logger.info('Capsule selection modal hidden');
  }

  /**
   * Получить выбранные вещи
   */
  getSelectedItems(): WardrobeItem[] {
    return [...this.selectedItems];
  }

  /**
   * Проверить видимость модального окна
   */
  isModalVisible(): boolean {
    return this.isVisible;
  }

  /**
   * Настроить обработчики событий
   */
  private setupEventHandlers(
    resolve: (items: WardrobeItem[]) => void
  ): void {
    const modal = document.getElementById(this.config.modalId!);
    if (!modal) return;

    // Обработчик закрытия по клику на overlay
    const overlay = modal.querySelector('.capsules-modal-overlay') as HTMLElement;
    if (overlay) {
      const handleOverlayClick = () => {
        this.onCancel();
        this.hide();
        resolve([]); // Возвращаем пустой массив при отмене
      };
      overlay.addEventListener('click', handleOverlayClick);
      this.cleanupFunctions.push(() => 
        overlay.removeEventListener('click', handleOverlayClick)
      );
    }

    // Обработчик кнопки закрытия
    const closeBtn = document.getElementById(this.config.closeBtnId!);
    if (closeBtn) {
      const handleClose = () => {
        this.onCancel();
        this.hide();
        resolve([]); // Возвращаем пустой массив при отмене
      };
      closeBtn.addEventListener('click', handleClose);
      this.cleanupFunctions.push(() => 
        closeBtn.removeEventListener('click', handleClose)
      );
    }

    // Обработчик кнопки "Далее"
    const nextBtn = document.getElementById(this.config.nextBtnId!);
    if (nextBtn) {
      const handleNext = () => {
        // Сохраняем выбранные элементы перед вызовом onConfirm
        const selectedItemsCopy = [...this.selectedItems];
        this.onConfirm();
        // Скрываем модальное окно после подтверждения
        this.hide();
        resolve(selectedItemsCopy); // Возвращаем копию выбранных вещей
      };
      nextBtn.addEventListener('click', handleNext);
      this.cleanupFunctions.push(() => 
        nextBtn.removeEventListener('click', handleNext)
      );
    }

    // Обработчик кнопки "Добавить вещь"
    const addBtn = document.getElementById(this.config.addBtnId!);
    if (addBtn) {
      const handleAddItem = () => {
        if (this.config.onAddItem) {
          this.config.onAddItem();
        }
      };
      addBtn.addEventListener('click', handleAddItem);
      this.cleanupFunctions.push(() => 
        addBtn.removeEventListener('click', handleAddItem)
      );
    }

    // Подписываемся на событие выделения вещи
    const handleSelectionToggle = (event: CustomEvent) => {
      this.onItemToggle(event.detail.item);
    };
    window.addEventListener(
      'wardrobe:item-selection-toggle', 
      handleSelectionToggle as EventListener
    );
    this.cleanupFunctions.push(() => 
      window.removeEventListener(
        'wardrobe:item-selection-toggle', 
        handleSelectionToggle as EventListener
      )
    );

    // Подписываемся на событие добавления новой вещи для восстановления выделения
    const handleItemAdded = () => {
      // Восстанавливаем визуальное выделение после добавления новой вещи
      setTimeout(() => {
        this.restoreVisualSelection();
      }, 100);
    };
    window.addEventListener('wardrobe:item-added', handleItemAdded);
    this.cleanupFunctions.push(() => 
      window.removeEventListener('wardrobe:item-added', handleItemAdded)
    );

    logger.info('Event handlers set up for capsule selection modal');
  }

  /**
   * Обработчик переключения выбора вещи
   * Вызывается через событие 'wardrobe:item-selection-toggle' из WardrobeManager
   */
  onItemToggle(item: WardrobeItem): void {
    const index = this.selectedItems.findIndex(
      selected => selected.id === item.id
    );
    const cardElement = document.querySelector(
      `#${this.config.gridId} [data-item-id="${item.id}"]`
    );

    if (index === -1) {
      // Добавляем в выбранные
      this.selectedItems.push(item);
      if (cardElement) {
        cardElement.classList.add('selected');
      }
      logger.info('Item selected', { 
        itemId: item.id, 
        totalSelected: this.selectedItems.length 
      });
    } else {
      // Убираем из выбранных
      this.selectedItems.splice(index, 1);
      if (cardElement) {
        cardElement.classList.remove('selected');
      }
      logger.info('Item deselected', { 
        itemId: item.id, 
        totalSelected: this.selectedItems.length 
      });
    }

    // Обновляем состояние кнопки "Далее"
    this.updateNextButtonState();
  }

  /**
   * Обработчик подтверждения выбора
   */
  onConfirm(): void {
    logger.info('Selection confirmed', {
      selectedCount: this.selectedItems.length,
      items: this.selectedItems.map(item => ({ 
        id: item.id, 
        category: item.category 
      }))
    });

    // Вызываем callback если есть
    if (this.config.onConfirm) {
      this.config.onConfirm(this.selectedItems);
    }

    // ВАЖНО: НЕ вызываем hide() здесь, так как это очистит selectedItems
    // hide() будет вызван в resolve() после возврата результата
  }

  /**
   * Обработчик отмены выбора
   */
  onCancel(): void {
    logger.info('Selection cancelled');

    // Вызываем callback если есть
    if (this.config.onCancel) {
      this.config.onCancel();
    }

    // ВАЖНО: НЕ вызываем hide() здесь, это будет сделано в обработчиках событий
  }

  /**
   * Обновить состояние кнопки "Далее"
   */
  private updateNextButtonState(): void {
    const nextBtn = document.getElementById(this.config.nextBtnId!) as HTMLButtonElement;
    if (nextBtn) {
      const hasSelection = this.selectedItems.length > 0;
      nextBtn.disabled = !hasSelection;
      
      logger.debug('Next button state updated', { 
        disabled: !hasSelection,
        selectedCount: this.selectedItems.length 
      });
    }
  }

  /**
   * Очистить выбранные вещи
   */
  clearSelection(): void {
    // Убираем визуальное выделение
    this.selectedItems.forEach(item => {
      const cardElement = document.querySelector(
        `#${this.config.gridId} [data-item-id="${item.id}"]`
      );
      if (cardElement) {
        cardElement.classList.remove('selected');
      }
    });

    this.selectedItems = [];
    this.updateNextButtonState();

    logger.info('Selection cleared');
  }

  /**
   * Установить выбранные вещи программно
   * @param items - вещи для выбора
   */
  setSelectedItems(items: WardrobeItem[]): void {
    // Очищаем текущий выбор
    this.clearSelection();

    // Устанавливаем новый выбор
    this.selectedItems = [...items];

    // Отмечаем выбранные карточки визуально
    this.selectedItems.forEach(item => {
      const cardElement = document.querySelector(
        `#${this.config.gridId} [data-item-id="${item.id}"]`
      );
      if (cardElement) {
        cardElement.classList.add('selected');
      }
    });

    // Обновляем состояние кнопки
    this.updateNextButtonState();

    logger.info('Selected items set programmatically', {
      count: this.selectedItems.length,
      ids: this.selectedItems.map(item => item.id)
    });
  }

  /**
   * Обновить заголовок модального окна
   * @param title - новый заголовок
   */
  setModalTitle(title: string): void {
    const modalHeader = document.querySelector(
      `#${this.config.modalId} .capsules-modal-header h2`
    );
    if (modalHeader) {
      modalHeader.textContent = title;
      logger.info('Modal title updated', { title });
    }
  }

  /**
   * Обновить конфигурацию (для настройки callbacks)
   */
  updateConfig(newConfig: Partial<CapsuleSelectionConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('CapsuleSelectionManager config updated');
  }

  /**
   * Восстановить визуальное выделение выбранных вещей
   * Используется после перерендера грида (например, при добавлении новой вещи)
   */
  private restoreVisualSelection(): void {
    if (this.selectedItems.length === 0) return;

    logger.info('Restoring visual selection after grid re-render', {
      selectedCount: this.selectedItems.length,
      selectedIds: this.selectedItems.map(item => item.id)
    });

    this.selectedItems.forEach(item => {
      const cardElement = document.querySelector(
        `#${this.config.gridId} [data-item-id="${item.id}"]`
      );
      if (cardElement) {
        cardElement.classList.add('selected');
        logger.debug('Visual selection restored for item', { itemId: item.id });
      } else {
        logger.warn('Could not find card element to restore selection', { itemId: item.id });
      }
    });
  }

  /**
   * Уничтожить менеджер и очистить ресурсы
   */
  destroy(): void {
    logger.info('Destroying CapsuleSelectionManager');
    
    this.hide();
    this.selectedItems = [];
    this.wardrobeItems = [];
    
    logger.info('CapsuleSelectionManager destroyed');
  }
}

// Экспортируем singleton экземпляр
export const capsuleSelectionManager = new CapsuleSelectionManager();
