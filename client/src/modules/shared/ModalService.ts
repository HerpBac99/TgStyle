/**
 * Унифицированный сервис для работы с модальными окнами
 * Предоставляет единый API для всех типов модальных окон в приложении
 */

import { logger } from '../logger';

/**
 * Конфигурация для loading модального окна
 */
export interface LoadingConfig {
  /** Текст сообщения для показа */
  message: string;
  /** Можно ли отменить операцию */
  cancellable?: boolean;
  /** Callback при отмене */
  onCancel?: () => void;
}

/**
 * Конфигурация для обычного модального окна
 */
export interface ModalConfig {
  /** Уникальный ID модального окна */
  id: string;
  /** Контент модального окна (HTML элемент или строка) */
  content: HTMLElement | string;
  /** Callback при закрытии */
  onClose?: () => void;
  /** Закрывать ли при клике на overlay */
  closeOnOverlay?: boolean;
}

/**
 * Типы loading модальных окон
 */
export type LoadingModalType = 'wardrobe' | 'canvas' | 'generic';

/**
 * Внутреннее состояние активного loading модального окна
 */
interface ActiveLoadingModal {
  type: LoadingModalType;
  config: LoadingConfig;
  element: HTMLElement;
}

/**
 * Унифицированный сервис модальных окон
 */
export class ModalService {
  private activeLoadingModal: ActiveLoadingModal | null = null;
  private activeModals: Map<string, HTMLElement> = new Map();

  // ============================================
  // LOADING МОДАЛЬНЫЕ ОКНА
  // ============================================

  /**
   * Показать loading модальное окно
   * 
   * @param config - Конфигурация loading окна
   * @param type - Тип модального окна (wardrobe, canvas, generic)
   */
  showLoading(config: LoadingConfig, type: LoadingModalType = 'generic'): void {
    logger.info('Showing loading modal', { type, message: config.message });

    // Скрываем предыдущее loading окно если есть
    if (this.activeLoadingModal) {
      this.hideLoading();
    }

    // Определяем элемент в зависимости от типа
    let element: HTMLElement | null = null;
    let textElement: HTMLElement | null = null;

    if (type === 'wardrobe') {
      // Используем существующий wardrobe loading в preview modal
      element = document.getElementById('wardrobe-preview-loading');
      textElement = element?.querySelector('.wardrobe-preview-loading-text') as HTMLElement;
      
      // Скрываем actions
      const actionsElement = document.getElementById('wardrobe-preview-actions');
      if (actionsElement) {
        actionsElement.style.display = 'none';
      }
    } else if (type === 'canvas') {
      // Используем существующий canvas loading modal
      element = document.getElementById('canvas-loading-modal');
      textElement = element?.querySelector('.canvas-loading-text') as HTMLElement;
    } else {
      // Generic - создаем временное модальное окно
      element = this.createGenericLoadingModal();
      textElement = element.querySelector('.generic-loading-text') as HTMLElement;
      document.body.appendChild(element);
    }

    if (!element) {
      logger.error('Loading modal element not found', { type });
      return;
    }

    // Устанавливаем текст
    if (textElement) {
      textElement.textContent = config.message;
    }

    // Показываем модальное окно
    element.classList.remove('hidden');

    // Сохраняем состояние
    this.activeLoadingModal = {
      type,
      config,
      element
    };

    logger.info('Loading modal shown', { type });
  }

  /**
   * Скрыть loading модальное окно
   */
  hideLoading(): void {
    if (!this.activeLoadingModal) {
      logger.warn('No active loading modal to hide');
      return;
    }

    const { type, element } = this.activeLoadingModal;

    logger.info('Hiding loading modal', { type });

    // Скрываем элемент
    element.classList.add('hidden');

    // Для wardrobe - показываем actions обратно
    if (type === 'wardrobe') {
      const actionsElement = document.getElementById('wardrobe-preview-actions');
      if (actionsElement) {
        actionsElement.style.display = 'flex';
      }
    }

    // Для generic - удаляем из DOM
    if (type === 'generic' && element.parentElement) {
      element.parentElement.removeChild(element);
    }

    // Очищаем состояние
    this.activeLoadingModal = null;

    logger.info('Loading modal hidden', { type });
  }

  /**
   * Выполнить асинхронную операцию с показом loading модального окна
   * 
   * @param operation - Асинхронная функция для выполнения
   * @param config - Конфигурация loading окна
   * @param type - Тип модального окна
   * @returns Promise с результатом операции
   */
  async executeWithLoading<T>(
    operation: () => Promise<T>,
    config: LoadingConfig,
    type: LoadingModalType = 'generic'
  ): Promise<T> {
    try {
      // Показываем loading
      this.showLoading(config, type);

      // Выполняем операцию
      const result = await operation();

      return result;
    } catch (error) {
      logger.error('Operation failed during executeWithLoading', {
        error: error instanceof Error ? error.message : String(error),
        type
      });
      throw error;
    } finally {
      // Всегда скрываем loading
      this.hideLoading();
    }
  }

  // ============================================
  // ОБЫЧНЫЕ МОДАЛЬНЫЕ ОКНА
  // ============================================

  /**
   * Показать модальное окно с контентом
   * 
   * @param config - Конфигурация модального окна
   */
  showModal(config: ModalConfig): void {
    logger.info('Showing modal', { id: config.id });

    // Проверяем, не показано ли уже это модальное окно
    if (this.activeModals.has(config.id)) {
      logger.warn('Modal already shown', { id: config.id });
      return;
    }

    // Ищем существующий элемент
    let modalElement = document.getElementById(config.id);

    if (modalElement) {
      // Используем существующий элемент
      modalElement.classList.remove('hidden');
    } else {
      // Создаем новый элемент
      modalElement = this.createModalElement(config);
      document.body.appendChild(modalElement);
    }

    // Сохраняем в активные
    this.activeModals.set(config.id, modalElement);

    // Настраиваем обработчики
    this.setupModalHandlers(modalElement, config);

    logger.info('Modal shown', { id: config.id });
  }

  /**
   * Скрыть модальное окно
   * 
   * @param modalId - ID модального окна
   */
  hideModal(modalId: string): void {
    logger.info('Hiding modal', { id: modalId });

    const modalElement = this.activeModals.get(modalId);

    if (!modalElement) {
      logger.warn('Modal not found in active modals', { id: modalId });
      
      // Попробуем найти в DOM
      const element = document.getElementById(modalId);
      if (element) {
        element.classList.add('hidden');
      }
      return;
    }

    // Скрываем элемент
    modalElement.classList.add('hidden');

    // Удаляем из активных
    this.activeModals.delete(modalId);

    logger.info('Modal hidden', { id: modalId });
  }

  // ============================================
  // ALERT И CONFIRM ДИАЛОГИ
  // ============================================

  /**
   * Показать alert диалог
   * 
   * @param message - Сообщение для показа
   * @returns Promise, который резолвится при закрытии
   */
  async showAlert(message: string): Promise<void> {
    logger.info('Showing alert', { message });

    return new Promise((resolve) => {
      const alertId = `alert-${Date.now()}`;
      
      const alertElement = this.createAlertElement(alertId, message, () => {
        this.hideModal(alertId);
        resolve();
      });

      document.body.appendChild(alertElement);
      this.activeModals.set(alertId, alertElement);

      // Показываем с небольшой задержкой для анимации
      setTimeout(() => {
        alertElement.classList.remove('hidden');
      }, 10);
    });
  }

  /**
   * Показать confirm диалог
   * 
   * @param message - Сообщение для показа
   * @returns Promise<boolean> - true если подтверждено, false если отменено
   */
  async showConfirm(message: string): Promise<boolean> {
    logger.info('Showing confirm', { message });

    return new Promise((resolve) => {
      const confirmId = `confirm-${Date.now()}`;
      
      const confirmElement = this.createConfirmElement(
        confirmId,
        message,
        () => {
          this.hideModal(confirmId);
          resolve(true);
        },
        () => {
          this.hideModal(confirmId);
          resolve(false);
        }
      );

      document.body.appendChild(confirmElement);
      this.activeModals.set(confirmId, confirmElement);

      // Показываем с небольшой задержкой для анимации
      setTimeout(() => {
        confirmElement.classList.remove('hidden');
      }, 10);
    });
  }

  // ============================================
  // ПРИВАТНЫЕ МЕТОДЫ
  // ============================================

  /**
   * Создать generic loading модальное окно
   */
  private createGenericLoadingModal(): HTMLElement {
    const modal = document.createElement('div');
    modal.className = 'generic-loading-modal';
    modal.innerHTML = `
      <div class="generic-loading-overlay"></div>
      <div class="generic-loading-content">
        <div class="generic-loading-spinner"></div>
        <p class="generic-loading-text">Загрузка...</p>
      </div>
    `;

    // Добавляем базовые стили если их нет
    this.ensureGenericLoadingStyles();

    return modal;
  }

  /**
   * Создать элемент модального окна
   */
  private createModalElement(config: ModalConfig): HTMLElement {
    const modal = document.createElement('div');
    modal.id = config.id;
    modal.className = 'modal-service-modal';

    const overlay = document.createElement('div');
    overlay.className = 'modal-service-overlay';

    const content = document.createElement('div');
    content.className = 'modal-service-content';

    if (typeof config.content === 'string') {
      content.innerHTML = config.content;
    } else {
      content.appendChild(config.content);
    }

    modal.appendChild(overlay);
    modal.appendChild(content);

    return modal;
  }

  /**
   * Создать alert элемент
   */
  private createAlertElement(id: string, message: string, onClose: () => void): HTMLElement {
    const alert = document.createElement('div');
    alert.id = id;
    alert.className = 'modal-service-alert hidden';
    alert.innerHTML = `
      <div class="modal-service-overlay"></div>
      <div class="modal-service-alert-content">
        <p class="modal-service-alert-message">${this.escapeHtml(message)}</p>
        <button class="modal-service-alert-btn">OK</button>
      </div>
    `;

    const button = alert.querySelector('.modal-service-alert-btn') as HTMLButtonElement;
    button.addEventListener('click', onClose);

    return alert;
  }

  /**
   * Создать confirm элемент
   */
  private createConfirmElement(
    id: string,
    message: string,
    onConfirm: () => void,
    onCancel: () => void
  ): HTMLElement {
    const confirm = document.createElement('div');
    confirm.id = id;
    confirm.className = 'modal-service-confirm hidden';
    confirm.innerHTML = `
      <div class="modal-service-overlay"></div>
      <div class="modal-service-confirm-content">
        <p class="modal-service-confirm-message">${this.escapeHtml(message)}</p>
        <div class="modal-service-confirm-actions">
          <button class="modal-service-confirm-btn cancel">Отмена</button>
          <button class="modal-service-confirm-btn confirm">OK</button>
        </div>
      </div>
    `;

    const cancelBtn = confirm.querySelector('.modal-service-confirm-btn.cancel') as HTMLButtonElement;
    const confirmBtn = confirm.querySelector('.modal-service-confirm-btn.confirm') as HTMLButtonElement;

    cancelBtn.addEventListener('click', onCancel);
    confirmBtn.addEventListener('click', onConfirm);

    return confirm;
  }

  /**
   * Настроить обработчики для модального окна
   */
  private setupModalHandlers(modalElement: HTMLElement, config: ModalConfig): void {
    if (config.closeOnOverlay) {
      const overlay = modalElement.querySelector('.modal-service-overlay');
      if (overlay) {
        overlay.addEventListener('click', () => {
          this.hideModal(config.id);
          if (config.onClose) {
            config.onClose();
          }
        });
      }
    }
  }

  /**
   * Убедиться что базовые стили для generic loading есть
   */
  private ensureGenericLoadingStyles(): void {
    if (document.getElementById('modal-service-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'modal-service-styles';
    style.textContent = `
      .generic-loading-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .generic-loading-modal.hidden {
        display: none;
      }

      .generic-loading-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
      }

      .generic-loading-content {
        position: relative;
        background: white;
        border-radius: 12px;
        padding: 24px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        z-index: 1;
      }

      .generic-loading-spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #f3f3f3;
        border-top: 4px solid #3498db;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }

      .generic-loading-text {
        margin: 0;
        font-size: 16px;
        color: #333;
      }

      .modal-service-alert,
      .modal-service-confirm {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .modal-service-alert.hidden,
      .modal-service-confirm.hidden {
        display: none;
      }

      .modal-service-alert-content,
      .modal-service-confirm-content {
        position: relative;
        background: white;
        border-radius: 12px;
        padding: 24px;
        max-width: 400px;
        width: 90%;
        z-index: 1;
      }

      .modal-service-alert-message,
      .modal-service-confirm-message {
        margin: 0 0 20px 0;
        font-size: 16px;
        color: #333;
        text-align: center;
      }

      .modal-service-alert-btn {
        width: 100%;
        padding: 12px;
        background: #3498db;
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 16px;
        cursor: pointer;
      }

      .modal-service-confirm-actions {
        display: flex;
        gap: 12px;
      }

      .modal-service-confirm-btn {
        flex: 1;
        padding: 12px;
        border: none;
        border-radius: 8px;
        font-size: 16px;
        cursor: pointer;
      }

      .modal-service-confirm-btn.cancel {
        background: #e0e0e0;
        color: #333;
      }

      .modal-service-confirm-btn.confirm {
        background: #3498db;
        color: white;
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Экранировать HTML для безопасности
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Получить статус сервиса (для отладки)
   */
  getStatus() {
    return {
      hasActiveLoadingModal: !!this.activeLoadingModal,
      activeLoadingModalType: this.activeLoadingModal?.type || null,
      activeModalsCount: this.activeModals.size,
      activeModalIds: Array.from(this.activeModals.keys())
    };
  }
}

// Создаем и экспортируем singleton экземпляр
export const modalService = new ModalService();
