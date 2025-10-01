/**
 * Главный менеджер UI - координирует все UI модули
 * Инициализирует и управляет всеми компонентами интерфейса
 */

import type { TelegramWebApp } from '@/types/index';
import { logger } from './logger';
import { uiMenuManager } from './uiMenu';
import { uiAnalysisManager } from './uiAnalysis';
import { uiCoreManager } from './uiCore';

// Объявляем глобальную переменную Telegram
declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

/**
 * Главный класс для управления всем UI
 */
export class UIManager {
  constructor() {
    this.initializeAll();
  }

  /**
   * Инициализация всех UI модулей
   */
  private initializeAll(): void {
    logger.info('Initializing main UI Manager');

    try {
      // Инициализируем все модули
      uiMenuManager.init();
      uiAnalysisManager.init();
      uiCoreManager.init();

      // Настраиваем глобальные обработчики событий
      this.setupGlobalEventListeners();

      logger.info('All UI modules initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize UI modules', error);
      throw error;
    }
  }

  /**
   * Настройка глобальных обработчиков событий
   */
  private setupGlobalEventListeners(): void {
    // Обработчик изменения состояния анализа
    window.addEventListener('analysisStateChange', this.handleAnalysisStateChange.bind(this) as EventListener);
    window.addEventListener('showAnalysisScreen', this.handleShowAnalysisScreen.bind(this) as EventListener);
    window.addEventListener('photo:captured', this.handlePhotoCaptured.bind(this) as EventListener);

    // Обработчик видимости страницы (для очистки состояния при сворачивании)
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));

    logger.info('Global UI event listeners setup');
  }

  /**
   * Обработчик изменения видимости страницы
   */
  private handleVisibilityChange(): void {
    if (document.hidden && uiMenuManager.getStats().longPressActive) {
      // Если страница свернута и активен режим удаления, выходим из него
      uiMenuManager.exitDeleteModePublic();
    }
  }

  /**
   * Обработчик изменения состояния анализа
   */
  private handleAnalysisStateChange(event: CustomEvent): void {
    const state = event.detail;
    logger.info('Analysis state changed', state);

    // Можно добавить обновление UI в зависимости от состояния
    // Например, показать прогресс-бар или спиннер
  }

  /**
   * Обработчик показа экрана анализа
   */
  private handleShowAnalysisScreen(event: CustomEvent): void {
    const { imageBase64, analysis } = event.detail;
    logger.info('Showing analysis screen from event', { hasImage: !!imageBase64, hasAnalysis: !!analysis });

    // Показываем экран анализа
    uiAnalysisManager.showFullscreenPreview(imageBase64);

    // Показываем результат анализа
    if (analysis) {
      uiAnalysisManager.showAnalysisResult(analysis);
    }
  }

  /**
   * Обработчик захвата фото
   */
  private handlePhotoCaptured(event: CustomEvent): void {
    uiAnalysisManager.handlePhotoCaptured(event);
  }

  /**
   * Показать модальное окно подписки
   */
  showSubscriptionModal(): void {
    uiCoreManager.showSubscriptionModal();
  }

  /**
   * Показать shared анализ
   */
  async showSharedAnalysis(photoBase64: string, analysisText: string, timestamp: string): Promise<void> {
    await uiCoreManager.showSharedAnalysis(photoBase64, analysisText, timestamp);
  }

  /**
   * Показать toast уведомление
   */
  showToast(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    uiCoreManager.showToast(message, type);
  }

  /**
   * Обновить отображение истории
   */
  updateHistoryDisplay(): void {
    uiMenuManager.updateHistoryDisplay();
  }


  /**
   * Показать результат анализа
   */
  showAnalysisResult(result: string): void {
    uiAnalysisManager.showAnalysisResult(result);
  }

  /**
   * Получить статистику всех UI модулей
   */
  getStats() {
    return {
      menuManager: uiMenuManager.getStats(),
      analysisManager: {
        hasCurrentImage: !!uiAnalysisManager.getCurrentThemeImage?.(),
        hasAnalysisData: !!uiAnalysisManager.getCurrentAnalysisData?.(),
        hasLamodaUrl: !!uiAnalysisManager.getCurrentLamodaUrl?.()
      }
    };
  }

  /**
   * Инициализация UI после загрузки
   */
  init(): void {
    // Обновляем отображение истории
    this.updateHistoryDisplay();
  }

  /**
   * Очистка всех ресурсов
   */
  destroy(): void {
    logger.info('Destroying main UI Manager');

    try {
      // Очищаем все модули
      uiMenuManager.destroy();
      uiAnalysisManager.destroy();
      uiCoreManager.destroy();

      logger.info('All UI modules destroyed successfully');
    } catch (error) {
      logger.error('Failed to destroy UI modules', error);
    }
  }
}

// Создаем глобальный экземпляр главного менеджера UI
export const uiManager = new UIManager();

// Тип UIManager экспортируется через объявление class выше

// Экспортируем отдельные менеджеры для прямого доступа при необходимости
export { uiMenuManager, uiAnalysisManager, uiCoreManager };

// Импортируем типы для обратной совместимости

// Глобальные переменные для обратной совместимости (постепенно уберем)
declare global {
  var currentPreview: HTMLElement | null;
  var currentAnalysisData: any;
  var currentLamodaUrl: string | null;
}

// Инициализируем глобальные переменные для обратной совместимости
globalThis.currentPreview = null;
globalThis.currentAnalysisData = uiAnalysisManager.getCurrentAnalysisData?.() || {};
globalThis.currentLamodaUrl = uiAnalysisManager.getCurrentLamodaUrl?.() || null;
