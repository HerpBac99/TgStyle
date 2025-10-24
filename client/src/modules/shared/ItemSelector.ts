/**
 * Модуль для выбора вещей из гардероба
 * Управляет модальным окном выбора и взаимодействием с пользователем
 */

import { WardrobeItem } from '@/types/wardrobe';
import { wardrobeManager } from '../wardrobe/WardrobeManager';

/**
 * Callback при подтверждении выбора
 */
export type ItemSelectionConfirmCallback = (selectedItems: WardrobeItem[]) => void;

/**
 * Callback при отмене выбора
 */
export type ItemSelectionCancelCallback = () => void;

/**
 * Callback при клике на кнопку добавления новой вещи
 */
export type ItemSelectionAddCallback = () => void;

/**
 * Конфигурация селектора вещей
 */
export interface ItemSelectorConfig {
  wardrobeItems: WardrobeItem[];
  preselectedIds?: Set<number>;
  onConfirm: ItemSelectionConfirmCallback;
  onCancel: ItemSelectionCancelCallback;
  onAdd?: ItemSelectionAddCallback;
}

/**
 * Класс для управления выбором вещей
 */
export class ItemSelector {
  private currentConfig: ItemSelectorConfig | null = null;
  private selectedItems: Set<number> = new Set();
  private cleanupFunctions: (() => void)[] = [];

  /**
   * Показать модальное окно выбора вещей
   * Теперь использует WardrobeManager для единой логики отрисовки
   */
  show(config: ItemSelectorConfig): void {
    this.currentConfig = config;

    // Показываем модальное окно
    const modal = document.getElementById('capsules-modal');
    if (modal) {
      modal.classList.remove('hidden');
    }

    // Используем WardrobeManager для отрисовки грида

    // Инициализируем выбранные элементы
    if (config.preselectedIds) {
      this.selectedItems = new Set(config.preselectedIds);
    } else {
      this.selectedItems.clear();
    }

    const renderConfig: any = {
      containerId: 'capsules-grid',
      filtersContainerId: 'capsules-filters',
      items: config.wardrobeItems,
      onItemClick: (item: WardrobeItem) => this.toggleItemSelection(item.id),
      showAddButton: !!config.onAdd
    };

    if (config.preselectedIds) {
      renderConfig.selectedIds = config.preselectedIds;
    }

    if (config.onAdd) {
      renderConfig.onAddClick = () => this.handleAdd();
    }

    (wardrobeManager as any).renderGridInContainer(renderConfig);

    // Настраиваем обработчики модального окна
    this.setupModalHandlers();
  }

  /**
   * Переключить выбор элемента
   */
  private toggleItemSelection(itemId: number): void {
    if (this.selectedItems.has(itemId)) {
      this.selectedItems.delete(itemId);
    } else {
      this.selectedItems.add(itemId);
    }

    // Обновляем визуальное состояние карточки
    const card = document.querySelector(`.wardrobe-item-card[data-item-id="${itemId}"]`) as HTMLElement;
    if (card) {
      card.classList.toggle('selected');
    }

    // Обновляем состояние кнопки "Далее"
    this.updateNextButtonState();
  }

  /**
   * Обновить состояние кнопки "Далее"
   */
  private updateNextButtonState(): void {
    const nextBtn = document.getElementById('capsules-next-btn') as HTMLButtonElement;
    if (nextBtn) {
      const hasSelection = this.selectedItems.size > 0;
      nextBtn.disabled = !hasSelection;

      if (hasSelection) {
        nextBtn.textContent = `Далее (${this.selectedItems.size})`;
      } else {
        nextBtn.textContent = 'Далее';
      }
    }
  }

  /**
   * Настроить обработчики модального окна
   */
  private setupModalHandlers(): void {
    // Кнопка закрытия
    const closeBtn = document.getElementById('capsules-modal-close');
    if (closeBtn) {
      const handleClose = () => this.handleCancel();
      closeBtn.addEventListener('click', handleClose);
      this.cleanupFunctions.push(() => closeBtn.removeEventListener('click', handleClose));
    }

    // Кнопка "Далее"
    const nextBtn = document.getElementById('capsules-next-btn');
    if (nextBtn) {
      const handleNext = () => this.handleConfirm();
      nextBtn.addEventListener('click', handleNext);
      this.cleanupFunctions.push(() => nextBtn.removeEventListener('click', handleNext));
    }

    // Overlay клик
    const overlay = document.querySelector('.capsules-modal-overlay');
    if (overlay) {
      const handleOverlay = () => this.handleCancel();
      overlay.addEventListener('click', handleOverlay);
      this.cleanupFunctions.push(() => overlay.removeEventListener('click', handleOverlay));
    }
  }

  /**
   * Обработать подтверждение выбора
   */
  private handleConfirm(): void {
    if (!this.currentConfig) return;

    const selectedItemsData = this.currentConfig.wardrobeItems.filter(
      item => this.selectedItems.has(item.id)
    );

    this.hide();
    this.currentConfig.onConfirm(selectedItemsData);
  }

  /**
   * Обработать отмену выбора
   */
  private handleCancel(): void {
    if (!this.currentConfig) return;

    this.hide();
    this.currentConfig.onCancel();
  }

  /**
   * Обработать добавление новой вещи
   */
  private handleAdd(): void {
    if (!this.currentConfig?.onAdd) return;

    this.currentConfig.onAdd();
  }

  /**
   * Обновить список вещей в модальном окне
   */
  update(config: { wardrobeItems: WardrobeItem[] }): void {
    if (!this.currentConfig) {
      return;
    }

    // Обновляем конфигурацию
    this.currentConfig.wardrobeItems = config.wardrobeItems;

    // Перерендериваем грид с новыми данными
    const renderConfig: any = {
      containerId: 'capsules-grid',
      filtersContainerId: 'capsules-filters', 
      items: config.wardrobeItems,
      onItemClick: (item: WardrobeItem) => this.toggleItemSelection(item.id),
      showAddButton: !!this.currentConfig.onAdd
    };

    if (this.selectedItems.size > 0) {
      renderConfig.selectedIds = this.selectedItems;
    }

    if (this.currentConfig.onAdd) {
      renderConfig.onAddClick = () => this.handleAdd();
    }

    (wardrobeManager as any).renderGridInContainer(renderConfig);
  }

  /**
   * Скрыть модальное окно
   */
  hide(): void {
    const modal = document.getElementById('capsules-modal');
    if (modal) {
      modal.classList.add('hidden');
    }

    // Очищаем обработчики
    this.cleanupFunctions.forEach(cleanup => cleanup());
    this.cleanupFunctions = [];

    // Сбрасываем состояние
    this.selectedItems.clear();
    this.currentConfig = null;
  }







  /**
   * Проверить активно ли модальное окно
   */
  isActive(): boolean {
    return this.currentConfig !== null;
  }

  /**
   * Получить текущую конфигурацию
   */
  getConfig(): ItemSelectorConfig | null {
    return this.currentConfig;
  }
}

// Экспортируем синглтон
export const itemSelector = new ItemSelector();
