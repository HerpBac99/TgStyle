/**
 * Модуль для выбора вещей из гардероба
 * Управляет модальным окном выбора и взаимодействием с пользователем
 */

import { logger } from '../logger';
import { WardrobeItem } from '@/types/wardrobe';
import { uiModalManager } from '../uiModalManager';

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

  /**
   * Показать модальное окно выбора вещей
   */
  show(config: ItemSelectorConfig): void {

    this.currentConfig = config;

    const modalConfig: any = {
      type: 'clothing-selection',
      modalId: 'capsules-modal',
      wardrobeItems: config.wardrobeItems,
      onConfirm: (selectedItems: WardrobeItem[]) => this.handleConfirm(selectedItems),
      onCancel: () => this.handleCancel()
    };

    if (config.preselectedIds) {
      modalConfig.selectedItemIds = config.preselectedIds;
    }

    if (config.onAdd) {
      modalConfig.handleAdd = () => this.handleAdd();
    }

    uiModalManager.showClothingSelectionModal(modalConfig);
  }

  /**
   * Скрыть модальное окно
   */
  hide(): void {
    uiModalManager.hide();
    this.currentConfig = null;
  }

  /**
   * Обновить список вещей в модальном окне
   * Полезно когда добавляется новая вещь
   */
  update(
    newWardrobeItems: WardrobeItem[],
    preserveSelection: boolean = true
  ): void {
    if (!this.currentConfig) {
      return;
    }

    // Сохраняем текущий выбор если нужно
    let currentSelection = this.currentConfig.preselectedIds;
    if (preserveSelection) {
      currentSelection = this.getCurrentSelection();
    }

    // Обновляем конфиг
    this.currentConfig.wardrobeItems = newWardrobeItems;
    if (currentSelection) {
      this.currentConfig.preselectedIds = currentSelection;
    }

    // Перерисовываем модальное окно
    this.show(this.currentConfig);
  }

  /**
   * Получить текущий выбор из DOM
   */
  getCurrentSelection(): Set<number> {
    const selectedIds = new Set<number>();
    const modal = document.getElementById('capsules-modal');

    if (!modal) {
      return selectedIds;
    }

    const selectedCards = modal.querySelectorAll('.capsules-item-card.selected');
    selectedCards.forEach(card => {
      const itemId = parseInt((card as HTMLElement).dataset['itemId'] || '0', 10);
      if (itemId > 0) {
        selectedIds.add(itemId);
      }
    });

    return selectedIds;
  }

  /**
   * Обработчик подтверждения выбора
   */
  private handleConfirm(selectedItems: WardrobeItem[]): void {
    if (!this.currentConfig) {
      logger.warn('ItemSelector: confirm called without active config');
      return;
    }

    logger.info('ItemSelector: selection confirmed', {
      selectedCount: selectedItems.length
    });

    const callback = this.currentConfig.onConfirm;
    this.currentConfig = null;

    // Вызываем callback
    callback(selectedItems);
  }

  /**
   * Обработчик отмены выбора
   */
  private handleCancel(): void {
    if (!this.currentConfig) {
      logger.warn('ItemSelector: cancel called without active config');
      return;
    }

    logger.info('ItemSelector: selection cancelled');

    const callback = this.currentConfig.onCancel;
    this.currentConfig = null;

    // Вызываем callback
    callback();
  }

  /**
   * Обработчик клика на добавление новой вещи
   */
  private handleAdd(): void {
    if (!this.currentConfig?.onAdd) {
      logger.warn('ItemSelector: add called without callback');
      return;
    }

    logger.info('ItemSelector: add new item clicked');

    // Вызываем callback
    this.currentConfig.onAdd();
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
