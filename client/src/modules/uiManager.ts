/**
 * Главный менеджер UI - координирует все UI модули
 * Инициализирует и управляет всеми компонентами интерфейса
 */

import type { TelegramWebApp } from '@/types/index';
import { logger } from './logger';
import { uiMenuManager } from './uiMenu';
import { uiAnalysisManager } from './uiAnalysis';
import { uiCoreManager } from './uiCore';
import { wardrobeManager as uiWardrobeManager } from './wardrobe/WardrobeManager';
import { capsulesManager as uiCapsulesManager } from './capsules/CapsulesManager';
import { publicFeedManager } from './publicFeed/PublicFeedManager';

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
    // Инициализация перемещена в init() для избежания дублирования при импорте
  }

  /**
   * Основная инициализация всех UI модулей
   * Вызывается один раз из main.ts после загрузки страницы
   */
  private initializeAll(): void {
    try {
      // Инициализируем все модули
      uiMenuManager.init();
      uiAnalysisManager.init();
      uiCoreManager.init();
      // uiWardrobeManager не требует инициализации

      // Настраиваем обработчики закладок
      this.setupTabsListeners();

      // Настраиваем глобальные обработчики событий (только события, не инициализация)
      this.setupUIEventListeners();

    } catch (error) {
      logger.error('Failed to initialize UI modules', error);
      throw error;
    }
  }

  /**
   * Настройка обработчиков событий (не инициализация модулей)
   * ВАЖНО: slushatel для 'history:updated' находится в main.ts для избежания дублирования
   */
  private setupUIEventListeners(): void {
    // Обработчик изменения состояния анализа
    window.addEventListener('analysisStateChange', this.handleAnalysisStateChange.bind(this) as EventListener);
    window.addEventListener('photo:captured', this.handlePhotoCaptured.bind(this) as EventListener);

    // ПРИМЕЧАНИЕ: Обработчик visibilitychange находится в uiMenu.ts
    // для избежания дублирования логики
  }

  /**
   * Настраивает обработчики закладок
   */
  private setupTabsListeners(): void {
    // Находим все кнопки закладок
    const tabButtons = document.querySelectorAll('.tab-button');


    tabButtons.forEach(button => {
      button.addEventListener('click', this.handleTabClick.bind(this));
    });
  }

  /**
   * Обработчик клика по закладке
   */
  private handleTabClick(event: Event): void {
    const button = event.target as HTMLElement;
    const tabButton = button.closest('.tab-button') as HTMLElement;

    if (!tabButton) return;

    const tabName = tabButton.dataset['tab'];
    if (!tabName) return;

    logger.info('Tab clicked', { tab: tabName });

    // Убираем активный класс у всех закладок
    document.querySelectorAll('.tab-button').forEach(btn => {
      btn.classList.remove('active');
    });

    // Добавляем активный класс к нажатой закладке
    tabButton.classList.add('active');

    // Обработка переключения закладок
    this.handleTabSwitch(tabName);
  }

  /**
   * Скрыть все закладки
   */
  private hideAllTabs(): void {
    const mainContent = document.querySelector('.main-content') as HTMLElement;
    const wardrobeContent = document.querySelector('.wardrobe-content') as HTMLElement;
    const capsulesContent = document.querySelector('.capsules-content') as HTMLElement;
    const feedContent = document.getElementById('feed-content') as HTMLElement;
    const clothesContainerMain = document.getElementById('wardrobe-clothes-container') as HTMLElement;

    if (mainContent) mainContent.classList.add('hidden');
    if (wardrobeContent) wardrobeContent.classList.add('hidden');
    if (capsulesContent) capsulesContent.classList.add('hidden');
    if (feedContent) feedContent.classList.add('hidden');
    if (clothesContainerMain) clothesContainerMain.classList.add('hidden');
  }

  /**
   * Обработка переключения закладок
   */
  private handleTabSwitch(tabName: string): void {
    // Сначала скрываем все закладки
    this.hideAllTabs();

    // Затем показываем нужную и вызываем соответствующий обработчик
    switch (tabName) {
      case 'main': {
        const mainContent = document.querySelector('.main-content') as HTMLElement;
        if (mainContent) mainContent.classList.remove('hidden');
        uiMenuManager.updateHistoryDisplay();
        break;
      }

      case 'feed': {
        const feedContent = document.getElementById('feed-content') as HTMLElement;
        if (feedContent) feedContent.classList.remove('hidden');
        
        publicFeedManager.open().catch((error: unknown) => {
          logger.error('Error handling feed open', error);
        });
        break;
      }

      case 'wardrobe': {
        const wardrobeContent = document.querySelector('.wardrobe-content') as HTMLElement;
        const clothesContainerMain = document.getElementById('wardrobe-clothes-container') as HTMLElement;
        if (wardrobeContent) wardrobeContent.classList.remove('hidden');
        if (clothesContainerMain) clothesContainerMain.classList.remove('hidden');

        uiWardrobeManager.handleWardrobeOpen().catch((error: unknown) => {
          logger.error('Error handling wardrobe open', error);
        });
        break;
      }

      case 'capsules': {
        const capsulesContent = document.querySelector('.capsules-content') as HTMLElement;
        if (capsulesContent) capsulesContent.classList.remove('hidden');

        uiCapsulesManager.handleCapsulesOpen().catch((error: unknown) => {
          logger.error('Error handling capsules open', error);
        });
        break;
      }

      default:
        logger.warn('Unknown tab', { tab: tabName });
        break;
    }
  }

  /**
   * Обработчик изменения состояния анализа
   */
  private handleAnalysisStateChange(event: CustomEvent): void {
    const state = event.detail;
    logger.info('Analysis state changed', state);

    // Обработка состояния ошибки теперь происходит в самом UI анализа
    // При ошибке UI анализа покажет сообщение об ошибке вместо результата
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
  async showSharedAnalysis(photoBase64: string, analysisText: string, timestamp: string, historyItemId?: number, likesCount?: number, isLiked?: boolean): Promise<void> {
    await uiCoreManager.showSharedAnalysis(photoBase64, analysisText, timestamp, historyItemId, likesCount, isLiked);
  }

  /**
   * Показать toast уведомление
   */
  showToast(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    uiCoreManager.showToast(message, type);
  }

  /**
   * @description Обновить отображение истории в главном меню
   * вызываем метод updateHistoryDisplay из uiMenuManager
   * #UPDATE-HISTORY-DISPLAY #UI-MANAGER #UI-UPDATE-HISTORY-DISPLAY
   */
  updateHistoryDisplay(options: { preservePosition?: boolean } = {}): void {
    uiMenuManager.updateHistoryDisplay(options);
  }


  /**
   * Показать результат анализа
   */
  showAnalysisResult(result: string, historyItemId?: number): void {
    uiAnalysisManager.showAnalysisResult(result, historyItemId);
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
      },
      wardrobeManager: uiWardrobeManager.getStatus(),
      capsulesManager: uiCapsulesManager.getStatus(),
    };
  }

  /**
   * @description Инициализация UI после загрузки
   * #INIT #UI-MANAGER #UI-INIT
   */
  init(): void {
    // Инициализируем все модули и устанавливаем обработчики событий
    this.initializeAll();
  }

  /**
   * Очистка всех ресурсов
   */
  destroy(): void {

    try {
      // Очищаем все модули
      uiMenuManager.destroy();
      uiAnalysisManager.destroy();
      uiCoreManager.destroy();
      uiWardrobeManager.destroy();
      uiCapsulesManager.destroy();

    } catch (error) {
      logger.error('Failed to destroy UI modules', error);
    }
  }
}

// Создаем глобальный экземпляр главного менеджера UI
export const uiManager = new UIManager();

// Тип UIManager экспортируется через объявление class выше

// Экспортируем отдельные менеджеры для прямого доступа при необходимости
export { uiMenuManager, uiAnalysisManager, uiCoreManager, uiWardrobeManager, uiCapsulesManager };
