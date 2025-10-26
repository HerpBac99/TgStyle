/**
 * Менеджер flow создания и редактирования капсул
 * 
 * Управляет переходами между этапами и состоянием flow.
 * Обеспечивает единый flow для создания новых и редактирования существующих капсул.
 * 
 * Основные возможности:
 * - Управление переходами между этапами (selection → canvas → result)
 * - Сохранение состояния при навигации назад
 * - Интеграция с navigationManager для кнопки "Назад"
 * - Единое управление состоянием для создания и редактирования
 * 
 * Этапы flow:
 * 1. selection - выбор вещей из гардероба (только для создания)
 * 2. canvas - редактирование на canvas
 * 3. result - просмотр результата с watermark
 * 
 * Режимы работы:
 * - create: selection → canvas → result
 * - edit: canvas → result (пропускаем selection)
 * 
 * @example
 * // Создание новой капсулы
 * capsuleFlowManager.setCallbacks({
 *   onMoveToSelection: () => showSelectionModal(),
 *   onMoveToCanvas: () => showCanvas(),
 *   onComplete: () => saveCapsule()
 * });
 * await capsuleFlowManager.startNewCapsule();
 * 
 * @example
 * // Редактирование существующей капсулы
 * await capsuleFlowManager.editCapsule(capsuleId);
 * 
 * Требования: 1.1, 2.2, 2.3, 2.4
 */

import { logger } from '../logger';
import { navigationManager } from '../navigationManager';
import { WardrobeItem } from '@/types/wardrobe';
import { CanvasState } from '@/types/capsules';
import { CapsuleErrorHandler } from './CapsuleErrorHandler';

/**
 * Режим работы flow
 */
export type CapsuleFlowMode = 'create' | 'edit';

/**
 * Текущий этап flow
 */
export type CapsuleFlowStep = 'selection' | 'canvas' | 'result';

/**
 * Metadata для AI-generated капсул
 */
export interface CapsuleMetadata {
  isGenerated?: boolean;
  generatedAt?: string;
  prompt?: string;
  [key: string]: any;
}

/**
 * Состояние flow создания/редактирования капсулы
 */
export interface CapsuleFlowState {
  /** Режим работы (создание или редактирование) */
  mode: CapsuleFlowMode;
  
  /** Текущий этап flow */
  currentStep: CapsuleFlowStep;
  
  /** ID капсулы (для редактирования) */
  capsuleId: number | null;
  
  /** Выбранные вещи */
  selectedItems: WardrobeItem[];
  
  /** Состояние canvas */
  canvasState: CanvasState | null;
  
  /** Результат (изображение с watermark) */
  resultImage: string | null;
  
  /** Metadata (для AI-generated) */
  metadata?: CapsuleMetadata;
}

/**
 * Callback для событий flow
 */
export interface CapsuleFlowCallbacks {
  /** Вызывается при переходе на этап выбора вещей */
  onMoveToSelection?: () => void;
  
  /** Вызывается при переходе на canvas */
  onMoveToCanvas?: () => void;
  
  /** Вызывается при переходе на результат */
  onMoveToResult?: () => void;
  
  /** Вызывается при возврате назад (для сохранения состояния) */
  onGoBack?: () => Promise<void>;
  
  /** Вызывается при завершении flow */
  onComplete?: () => void;
  
  /** Вызывается при отмене flow */
  onCancel?: () => void;
}

/**
 * Менеджер flow создания и редактирования капсул
 * 
 * Управляет:
 * - Переходами между этапами (selection → canvas → result)
 * - Состоянием flow (режим, выбранные вещи, canvas state)
 * - Навигацией назад через navigationManager
 * - Единым flow для создания и редактирования
 */
export class CapsuleFlowManager {
  private state: CapsuleFlowState;
  private callbacks: CapsuleFlowCallbacks;

  constructor(callbacks: CapsuleFlowCallbacks = {}) {
    this.callbacks = callbacks;
    
    // Инициализируем пустое состояние
    this.state = {
      mode: 'create',
      currentStep: 'selection',
      capsuleId: null,
      selectedItems: [],
      canvasState: null,
      resultImage: null
    };

    logger.info('CapsuleFlowManager initialized');
  }

  // ============================================
  // ПУБЛИЧНЫЕ МЕТОДЫ - УПРАВЛЕНИЕ FLOW
  // ============================================

  /**
   * Начать создание новой капсулы
   */
  async startNewCapsule(): Promise<void> {
    await CapsuleErrorHandler.handleWithFallback(
      async () => {
        logger.info('Starting new capsule flow');

        // Сбрасываем состояние
        this.state = {
          mode: 'create',
          currentStep: 'selection',
          capsuleId: null,
          selectedItems: [],
          canvasState: null,
          resultImage: null
        };

        // Переходим на этап выбора вещей
        this.moveToSelection();
      },
      () => {
        // Fallback: отменяем flow
        logger.warn('Failed to start new capsule flow');
        this.cancel();
      },
      CapsuleErrorHandler.createContext('Начало создания новой капсулы')
    );
  }

  /**
   * Начать редактирование существующей капсулы
   * 
   * @param capsuleId - ID капсулы для редактирования
   */
  async editCapsule(capsuleId: number): Promise<void> {
    await CapsuleErrorHandler.handleWithFallback(
      async () => {
        logger.info('Starting edit capsule flow', { capsuleId });

        // Устанавливаем состояние редактирования
        this.state = {
          mode: 'edit',
          currentStep: 'canvas',
          capsuleId,
          selectedItems: [],
          canvasState: null,
          resultImage: null
        };

        // Переходим сразу на canvas (для редактирования)
        this.moveToCanvas();
      },
      () => {
        // Fallback: отменяем flow
        logger.warn('Failed to start edit capsule flow', { capsuleId });
        this.cancel();
      },
      CapsuleErrorHandler.createContext('Начало редактирования капсулы', { capsuleId })
    );
  }

  /**
   * Перейти на этап выбора вещей
   */
  moveToSelection(): void {
    logger.info('Moving to selection step', {
      mode: this.state.mode,
      previousStep: this.state.currentStep
    });

    this.state.currentStep = 'selection';

    // Вызываем callback
    if (this.callbacks.onMoveToSelection) {
      this.callbacks.onMoveToSelection();
    }

    // Настраиваем навигацию назад
    this.setupNavigationForSelection();
  }

  /**
   * Перейти на этап canvas
   */
  moveToCanvas(): void {
    logger.info('Moving to canvas step', {
      mode: this.state.mode,
      previousStep: this.state.currentStep,
      selectedItemsCount: this.state.selectedItems.length
    });

    this.state.currentStep = 'canvas';

    // Вызываем callback
    if (this.callbacks.onMoveToCanvas) {
      this.callbacks.onMoveToCanvas();
    }

    // Настраиваем навигацию назад
    this.setupNavigationForCanvas();
  }

  /**
   * Перейти на этап результата
   */
  moveToResult(): void {
    logger.info('Moving to result step', {
      mode: this.state.mode,
      previousStep: this.state.currentStep
    });

    this.state.currentStep = 'result';

    // Вызываем callback
    if (this.callbacks.onMoveToResult) {
      this.callbacks.onMoveToResult();
    }

    // Настраиваем навигацию назад
    this.setupNavigationForResult();
  }

  /**
   * Вернуться на предыдущий этап
   * Сохраняет состояние для возможности продолжения
   */
  async goBack(): Promise<void> {
    logger.info('Going back', {
      currentStep: this.state.currentStep,
      mode: this.state.mode
    });

    // Вызываем callback ПЕРЕД переходом для сохранения состояния
    if (this.callbacks.onGoBack) {
      await this.callbacks.onGoBack();
    }

    // navigationManager.pop() вызывается автоматически при срабатывании обработчика

    // Определяем предыдущий этап
    switch (this.state.currentStep) {
      case 'result':
        // Результат → Canvas
        this.moveToCanvas();
        break;

      case 'canvas':
        if (this.state.mode === 'create') {
          // Canvas → Selection (только для создания)
          this.moveToSelection();
        } else {
          // Canvas → Grid (для редактирования)
          this.cancel();
        }
        break;

      case 'selection':
        // Selection → Grid (отмена)
        this.cancel();
        break;
    }
  }

  /**
   * Завершить flow (сохранить капсулу)
   */
  async complete(): Promise<void> {
    await CapsuleErrorHandler.handleWithFallback(
      async () => {
        logger.info('Completing capsule flow', {
          mode: this.state.mode,
          capsuleId: this.state.capsuleId
        });

        // Очищаем навигацию
        navigationManager.clear();

        // Вызываем callback
        if (this.callbacks.onComplete) {
          this.callbacks.onComplete();
        }

        // Сбрасываем состояние
        this.resetState();
      },
      () => {
        // Fallback: все равно сбрасываем состояние
        logger.warn('Error completing flow, resetting state anyway');
        navigationManager.clear();
        this.resetState();
      },
      CapsuleErrorHandler.createContext('Завершение flow капсулы', {
        ...(this.state.capsuleId && { capsuleId: this.state.capsuleId })
      })
    );
  }

  /**
   * Отменить flow (вернуться к гриду)
   */
  cancel(): void {
    logger.info('Cancelling capsule flow', {
      mode: this.state.mode,
      currentStep: this.state.currentStep
    });

    // Очищаем навигацию
    navigationManager.clear();

    // Вызываем callback
    if (this.callbacks.onCancel) {
      this.callbacks.onCancel();
    }

    // Сбрасываем состояние
    this.resetState();
  }

  // ============================================
  // ПУБЛИЧНЫЕ МЕТОДЫ - УПРАВЛЕНИЕ СОСТОЯНИЕМ
  // ============================================

  /**
   * Получить текущее состояние flow
   */
  getState(): Readonly<CapsuleFlowState> {
    return { ...this.state };
  }

  /**
   * Установить выбранные вещи
   */
  setSelectedItems(items: WardrobeItem[]): void {
    logger.info('Setting selected items', { count: items.length });
    this.state.selectedItems = items;
  }

  /**
   * Получить выбранные вещи
   */
  getSelectedItems(): WardrobeItem[] {
    return [...this.state.selectedItems];
  }

  /**
   * Установить состояние canvas
   */
  setCanvasState(canvasState: CanvasState): void {
    logger.info('Setting canvas state');
    this.state.canvasState = canvasState;
  }

  /**
   * Получить состояние canvas
   */
  getCanvasState(): CanvasState | null {
    return this.state.canvasState;
  }

  /**
   * Установить результат (изображение)
   */
  setResultImage(image: string): void {
    logger.info('Setting result image');
    this.state.resultImage = image;
  }

  /**
   * Получить результат (изображение)
   */
  getResultImage(): string | null {
    return this.state.resultImage;
  }

  /**
   * Установить metadata
   */
  setMetadata(metadata: CapsuleMetadata): void {
    logger.info('Setting metadata', metadata);
    this.state.metadata = metadata;
  }

  /**
   * Получить metadata
   */
  getMetadata(): CapsuleMetadata | undefined {
    return this.state.metadata;
  }

  /**
   * Получить ID текущей капсулы (для редактирования)
   */
  getCapsuleId(): number | null {
    return this.state.capsuleId;
  }

  /**
   * Получить режим работы
   */
  getMode(): CapsuleFlowMode {
    return this.state.mode;
  }

  /**
   * Получить текущий этап
   */
  getCurrentStep(): CapsuleFlowStep {
    return this.state.currentStep;
  }

  /**
   * Проверить, находимся ли в режиме создания
   */
  isCreateMode(): boolean {
    return this.state.mode === 'create';
  }

  /**
   * Проверить, находимся ли в режиме редактирования
   */
  isEditMode(): boolean {
    return this.state.mode === 'edit';
  }

  // ============================================
  // ПРИВАТНЫЕ МЕТОДЫ - НАВИГАЦИЯ
  // ============================================

  /**
   * Настроить навигацию для этапа выбора вещей
   */
  private setupNavigationForSelection(): void {
    navigationManager.push(async () => {
      await this.goBack();
    }, 'Return from capsule selection');
  }

  /**
   * Настроить навигацию для этапа canvas
   */
  private setupNavigationForCanvas(): void {
    navigationManager.push(async () => {
      await this.goBack();
    }, `Return from capsule canvas (${this.state.mode})`);
  }

  /**
   * Настроить навигацию для этапа результата
   */
  private setupNavigationForResult(): void {
    navigationManager.push(async () => {
      await this.goBack();
    }, 'Return from capsule result');
  }

  /**
   * Сбросить состояние
   */
  private resetState(): void {
    this.state = {
      mode: 'create',
      currentStep: 'selection',
      capsuleId: null,
      selectedItems: [],
      canvasState: null,
      resultImage: null
    };
  }

  // ============================================
  // ОТЛАДКА
  // ============================================

  /**
   * Получить статус менеджера (для отладки)
   */
  getStatus() {
    return {
      mode: this.state.mode,
      currentStep: this.state.currentStep,
      capsuleId: this.state.capsuleId,
      selectedItemsCount: this.state.selectedItems.length,
      hasCanvasState: !!this.state.canvasState,
      hasResultImage: !!this.state.resultImage,
      hasMetadata: !!this.state.metadata,
      navigationStackSize: navigationManager.getStackSize()
    };
  }

  /**
   * Установить callbacks
   * Позволяет динамически изменять callbacks после создания экземпляра
   */
  setCallbacks(callbacks: CapsuleFlowCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
    logger.info('Callbacks updated');
  }

  /**
   * Очистка ресурсов
   */
  destroy(): void {
    logger.info('Destroying CapsuleFlowManager');
    
    // Очищаем навигацию
    navigationManager.clear();
    
    // Сбрасываем состояние
    this.resetState();
  }
}

// Экспортируем singleton экземпляр
export const capsuleFlowManager = new CapsuleFlowManager();
